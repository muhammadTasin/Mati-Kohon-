import type { AdviceJSON, CandidateRotation, NarrationResult } from '@project-eden/contracts';
import { TemplateNarrator } from './template_narrator.ts';

/** An additional content screen; this list alone is not a factual validator. */
export const FORBIDDEN_TERMS = ['ঋণ', 'সুদ', 'কীটনাশক ব্র্যান্ড', 'টাকা দিন', 'ফ্রি সার'];
export interface ILocalLLMClient {
  generate(prompt: string, maxTokens: number): Promise<string>;
}
const normalize = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const englishDigits = (s: string) => s.replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
const numbers = (s: string) => s.match(/[0-9০-৯]+(?:[.,][0-9০-৯]+)*/g) ?? [];

/** The model can choose an approved greeting. It never authors advice, amounts, units, dates or actions. */
export class DualGateNarrationValidator {
  private templateNarrator = new TemplateNarrator();
  private llmClient?: ILocalLLMClient;
  private timeoutMs: number;

  constructor(llmClient?: ILocalLLMClient, opts: { timeoutMs?: number } = {}) {
    this.llmClient = llmClient;
    this.timeoutMs = opts.timeoutMs ?? 1500;
  }

  prepareGate1Slots(advice: AdviceJSON, option: CandidateRotation) {
    const direct = this.templateNarrator.render(advice, option);
    const warm: NarrationResult = {
      ...direct,
      banglaSpeechText: 'আপনাকে স্বাগতম। ' + direct.banglaSpeechText,
      englishGloss: 'Welcome. ' + direct.englishGloss,
      durationSecondsEstimate: direct.durationSecondsEstimate + 2,
    };
    const variants = { direct, warm };
    const approvedNarrations = new Set(Object.values(variants).map(v => normalize(v.banglaSpeechText)));
    const approvedNumbers = new Set(Object.values(variants).flatMap(v => numbers(v.banglaSpeechText).map(englishDigits)));
    return {
      variants, approvedNarrations, approvedNumbers,
      // No farmer, place or agricultural facts need to leave the server for this choice.
      prompt: 'Choose a greeting for a short Bangla agricultural phone message. Reply with exactly one JSON object: {"style":"direct"} or {"style":"warm"}. No other keys, text or instructions. The server supplies all advice.',
    };
  }

  /** Fail closed without the complete approved messages. A matching number cannot approve a different claim. */
  auditGate2(text: string, approvedNumbers: Set<string>, approvedNarrations: Set<string> = new Set()) {
    const approved = new Set([...approvedNumbers].map(englishDigits));
    const unapprovedNumbers = numbers(text).filter(n => !approved.has(englishDigits(n)));
    const unapprovedActions = FORBIDDEN_TERMS.filter(word => text.includes(word));
    if (![...approvedNarrations].some(message => normalize(message) === normalize(text))) {
      unapprovedActions.push('unapproved_narration');
    }
    return { passed: unapprovedNumbers.length === 0 && unapprovedActions.length === 0, unapprovedNumbers, unapprovedActions };
  }

  async narrate(advice: AdviceJSON, selectedOption?: CandidateRotation): Promise<NarrationResult> {
    const startTime = Date.now();
    const option = selectedOption || advice.options[0];
    const { variants, approvedNumbers, approvedNarrations, prompt } = this.prepareGate1Slots(advice, option);
    if (!this.llmClient) return variants.direct;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fallback = (raw: string, reason: string): NarrationResult => {
      const audit = this.auditGate2(raw, approvedNumbers);
      return { ...variants.direct, status: 'fallback_template', auditLog: {
        gate1Passed: true, gate2Passed: false, tokenDiffOk: false,
        unapprovedNumbersFound: audit.unapprovedNumbers,
        unapprovedActionsFound: [...new Set([...audit.unapprovedActions, reason])],
        latencyMs: Date.now() - startTime, engineUsed: 'fallback_template',
      } };
    };
    try {
      const raw = await Promise.race([
        this.llmClient.generate(prompt, 30),
        new Promise<string>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), this.timeoutMs); }),
      ]);
      let choice: unknown;
      try { choice = JSON.parse(raw); } catch { return fallback(raw, 'invalid_style_selection'); }
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)
        || Object.keys(choice).length !== 1 || !Object.hasOwn(choice, 'style')
        || !['direct', 'warm'].includes((choice as { style: string }).style)) {
        return fallback(raw, 'invalid_style_selection');
      }
      const chosen = variants[(choice as { style: 'direct' | 'warm' }).style];
      const audit = this.auditGate2(chosen.banglaSpeechText, approvedNumbers, approvedNarrations);
      if (!audit.passed) return fallback(chosen.banglaSpeechText, 'template_audit_failed');
      return { ...chosen, status: 'local_model_checked', auditLog: {
        gate1Passed: true, gate2Passed: true, tokenDiffOk: true,
        unapprovedNumbersFound: [], unapprovedActionsFound: [],
        latencyMs: Date.now() - startTime, engineUsed: 'local_model_checked',
      } };
    } catch {
      return fallback('', 'style_provider_unavailable');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
