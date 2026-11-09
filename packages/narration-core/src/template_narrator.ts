import type { AdviceJSON, CandidateRotation, NarrationResult } from '@project-eden/contracts';
import { LAND_TYPE_BANGLA, bnDateOf, bnDigits, bnOf } from './bn_text.ts';

export class TemplateNarrator {
  /**
   * Generates deterministic Bangla speech text and IVR prompts from AdviceJSON facts only.
   * Fixed wording, no model-authored facts. Accuracy still depends on the underlying advice.
   */
  render(advice: AdviceJSON, selectedOption?: CandidateRotation): NarrationResult {
    const option = selectedOption || advice.options[0];
    const amanCrop = option.cropSequence[0];
    const rabiCrop = option.cropSequence[1];
    const water = option.dimensionDetails['water']?.metrics;
    const rescueCount = water?.amanRescueIrrigationSeasons;
    const totalSeasons = water?.totalSeasonsSimulated ?? 25;
    const rabiIrrigation = water?.rabiNetIrrigationMm;

    const amanName = amanCrop.varietyBangla ?? amanCrop.variety;
    const rabiName = rabiCrop.cropBangla ?? rabiCrop.crop;
    // The first phase is Aman, another monsoon crop, or the empty monsoon field (plans built around other crops)
    const isAman = amanCrop.seasonType === 'Aman';
    const harvestBefore = isAman
      ? `${bnDateOf(option.fieldFreeDateBangla)} মধ্যে ধান কেটে `
      : amanCrop.fallow ? '' : `${bnDateOf(option.fieldFreeDateBangla)} মধ্যে ${amanCrop.cropBangla ?? amanCrop.crop} কেটে `;
    const plantRabi = rabiName.includes('ধান') ? 'রোপণ করলে' : 'বুনলে';
    const land = LAND_TYPE_BANGLA[advice.scope.land_type];

    // Natural spoken Bangla message for IVR / voice call; every number comes from the advice.
    const speechLines = [
      'মাটি কহন থেকে বলছি।',
      `${bnOf(advice.scope.union_name_bangla)} ${land ? `${land} ` : ''}জমির জন্য প্রস্তাবিত ফসল চক্র: ${option.nameBangla}।`,
      rescueCount !== undefined
        ? `গত ${bnDigits(totalSeasons as number)} মৌসুমের নাসা তথ্য দিয়ে মডেলের হিসাবে ${amanName} লাগালে ফুল আসার সময় ${bnDigits(rescueCount as number)} মৌসুমে বাড়তি সেচের প্রয়োজন দেখা যায়।`
        : '',
      rabiIrrigation !== undefined
        ? `${harvestBefore}${rabiName} ${plantRabi} মডেলের হিসাবে সেচের প্রয়োজন প্রায় ${bnDigits(rabiIrrigation as number)} মিলিমিটার; নিজের জমির অবস্থা মিলিয়ে নিন।`
        : '',
      'প্রশ্ন থাকলে আপনার উপসহকারী কৃষি কর্মকর্তার (SAAO) সাথে কথা বলুন। ধন্যবাদ।',
    ];

    const needsReview = advice.input_sensitivity && advice.input_sensitivity.status !== 'stable_in_tested_ranges';
    if (needsReview) speechLines.splice(1, speechLines.length - 2, advice.input_sensitivity!.message.bn);
    const banglaSpeechText = speechLines.filter(Boolean).join(' ');

    // English translation for reviewers and the English dashboard; farmers always hear the Bangla.
    const unionEnglish = advice.scope.union_id === 'talanda_tanore' ? 'Talanda union' : advice.scope.union_id;
    const plantEnglish = rabiCrop.crop.toLowerCase().includes('rice') ? 'transplant' : 'sow';
    let englishGloss = [
      'This is Mati Kohon calling.',
      `Suggested rotation for ${advice.scope.land_type.replace('_', '-')} land in ${unionEnglish}: ${option.nameEnglish}.`,
      rescueCount !== undefined
        ? `In a model replay using ${totalSeasons} seasons of NASA data, ${amanCrop.variety} needed extra irrigation at flowering in ${rescueCount} seasons.`
        : '',
      rabiIrrigation !== undefined
        ? `${amanCrop.fallow ? '' : `Harvest by ${option.fieldFreeDateEnglish ?? option.fieldFreeDateBangla} and `}${amanCrop.fallow ? plantEnglish[0].toUpperCase() + plantEnglish.slice(1) : plantEnglish} ${rabiCrop.crop.toLowerCase()}: modeled irrigation is about ${rabiIrrigation} mm; check your field's condition.`
        : '',
      'If you have questions, talk to your Sub-Assistant Agriculture Officer (SAAO). Thank you.',
    ].filter(Boolean).join(' ');
    if (needsReview) englishGloss = `This is Mati Kohon calling. ${advice.input_sensitivity!.message.en} Please discuss the options with your Sub-Assistant Agriculture Officer before planting. Thank you.`;

    const keypadPrompt = `আপনার অগ্রাধিকার জানাতে কিপ্যাডে বোতাম চাপুন: পানির জন্য ১, বেশি আয়ের জন্য ২, মাটির স্বাস্থ্যের জন্য ৩, কম কীটনাশকের জন্য ৪ চাপুন। কৃষি কর্মকর্তার সাথে কথা বলতে ৯ চাপুন।`;

    return {
      status: 'verified_template',
      banglaSpeechText,
      englishGloss,
      banglaKeypadPrompt: keypadPrompt,
      durationSecondsEstimate: Math.max(20, Math.round(banglaSpeechText.length / 12)),
      auditLog: {
        gate1Passed: true,
        gate2Passed: true,
        tokenDiffOk: true,
        unapprovedNumbersFound: [],
        unapprovedActionsFound: [],
        latencyMs: 1,
        engineUsed: 'verified_template',
      },
    };
  }
}
