/**
 * Farmer advice calls. The calls are one way: a recording plays and the farmer cannot answer back, so each call says
 * one thing to do and how to ask more, and questions come back through the farmer's SAAO, a missed call or the app.
 *
 *  1. Plan (buildPlan, once a day): for each farmer in the register who agreed to the calls, the day's candidates are
 *       - answer: the officer has approved an answer to the farmer's question;
 *       - alert: this week's field alert at the farmer's place for their land and crops (flood water on medium-low
 *         land, and on medium-high land in a high flood; a dry spell or heat at Aman flowering; cold on Boro
 *         seedbeds; heat in wheat; AWD in Boro), from the same rules as the advice (field_alerts.ts);
 *       - drain: October to January, on low and very low land, when the land will be free at the pace this year's
 *         flood water is leaving (NASA-ISRO NISAR radar and NASA OPERA, nisar_water.py) and when to sow the Boro
 *         seedbed so the seedlings are 35-45 days old then (BRRI); only when the date is known;
 *       - reminder: a registered crop's sowing window opens within a week or closes within 10 days (for Boro, its
 *         seedbed: 45 to 35 days before transplanting).
 *     The most important one goes: an emergency, then an answer, an alert, the drain date, a reminder. At most one
 *     call a day and two a week (emergencies and answers excepted), one call on a topic a week unless it is an
 *     emergency, and never the same message twice.
 *  2. Approve: the SAAO reads each script, edits or removes it, and approves (dashboard: Calls and SMS).
 *  3. Send (sendApproved): our Google bn-BD recording through SysTech (CALL_PROVIDER; VoiceBlast unless it says
 *     broadcast). A dry run unless VOICEBLAST_LIVE=1 or BROADCAST_LIVE=1 and the caller allows real calls (a signed-in
 *     officer, or the call:daily command with --live). Sample farmers are never dialled.
 *  4. Follow up (followUp): the provider's report says who answered. An unanswered call gets one retry in the
 *     evening and an SMS with the action (REVE; a dry run unless SMS_LIVE=1); a second miss marks the farmer
 *     unreached for the officer.
 *
 * The store is a JSON file (services/api/.data/farmer_calls.json, or EDEN_CALL_STORE), git-ignored like the desk.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CallAttempt, CallSlot, FarmerQuestion, FarmerRecord, PlannedCall, PlannedCallKind } from '@project-eden/contracts';
import { placeFor, withPlace, type Place } from '../../../packages/rotation-engine/src/data/location.ts';
import { cropMenu } from '../../../packages/rotation-engine/src/data/crop_choice.ts';
import { seenBy, type FieldAlert } from '../../../packages/rotation-engine/src/field_alerts.ts';
import { bnDate, bnDateOf, bnDigits, bnGenitive, enDate } from '../../../packages/rotation-engine/src/bn.ts';
import { FORBIDDEN_TERMS } from '../../../packages/narration-core/src/dual_gate_validator.ts';
import * as desk from './officer_desk.ts';
import { adviseWithNarration, planRequest, voiceAnswer } from './advice.ts';
import { speakable } from './voice.ts';
import { floodFor } from './live.ts';
import { getLocationsPayload } from './locations.ts';
import { broadcastReport, sendSystechCall, systechConfig, voiceblastHistory, type CallRoute } from './systech.ts';
import { sendSms, smsParts } from './sms.ts';
import { synthesizeSpeech, ttsStatus } from './providers/tts.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = process.env.EDEN_CALL_STORE || path.resolve(__dirname, '../.data/farmer_calls.json');

export const MAX_A_WEEK = 2;
const TOPIC_GAP_DAYS = 7;
const OPENS_AHEAD = 7, CLOSES_AHEAD = 10, CLOSES_LAST = 3;
const SEEDBED_AGE = 40; // days before the land is free: the middle of BRRI's 35-45-day-old Boro seedlings
/** The hour (Bangladesh time) each call slot starts. */
export const SLOT_HOUR: Record<CallSlot, number> = { morning: 9, afternoon: 15, evening: 19 };
const RANK: Record<string, number> = { emergency: 0, answer: 1, alert: 2, drain: 3, reminder: 4 };

const OPENING = (where: string) => `আসসালামু আলাইকুম। মাটি কহন থেকে বলছি, ${bnGenitive(where)} কৃষকদের জন্য।`;
// The helpline is read digit by digit; the SMS carries the number
const CLOSING = 'প্রশ্ন থাকলে আপনার উপসহকারী কৃষি কর্মকর্তাকে বলুন, অথবা কৃষি কল সেন্টারে এক ছয় এক দুই তিন নম্বরে ফোন করুন। এই কল আর না চাইলে কর্মকর্তাকে জানান। ধন্যবাদ।';
const SMS_TAIL = 'প্রশ্ন: আপনার SAAO বা ১৬১২৩।';

interface Store {
  calls: PlannedCall[];
  questions: FarmerQuestion[];
  /** Missed calls from numbers not in the register, for the officer to follow up (masked). */
  unknownCallers: Array<{ at: string; phoneMasked: string }>;
}

function loadStore(): Store {
  try {
    const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Store;
    return { calls: saved.calls ?? [], questions: saved.questions ?? [], unknownCallers: saved.unknownCallers ?? [] };
  } catch {
    return { calls: [], questions: [], unknownCallers: [] };
  }
}

const store: Store = loadStore();

function save(): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

/** Clears the plan, questions and missed calls (tests, and before a demo). */
export function resetCalls(): void {
  store.calls = [];
  store.questions = [];
  store.unknownCallers = [];
  save();
}

// ------------------------------------------------------------------ dates (Bangladesh time)
const DAY = 86_400_000;
/** Today in Bangladesh (UTC+6) as YYYY-MM-DD. */
export function dhakaToday(now = new Date()): string {
  return new Date(now.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
}
const dhakaHour = (now = new Date()) => new Date(now.getTime() + 6 * 3_600_000).getUTCHours();
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const md = (iso: string) => iso.slice(5);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// ------------------------------------------------------------------ names
let upazilaNames: Map<string, string> | null = null;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
/** The upazila's name in Bangla from the locations list, matched by its English name and district; English otherwise. */
export function upazilaNameBangla(place: Place): string {
  if (!upazilaNames) {
    upazilaNames = new Map();
    for (const d of getLocationsPayload().districts) {
      for (const u of d.upazilas) upazilaNames.set(`${norm(d.nameEn)}|${norm(u.nameEn)}`, u.nameBn);
    }
  }
  return upazilaNames.get(`${norm(place.district)}|${norm(place.upazila)}`) ?? place.upazila;
}
const upazilaBangla = (place: Place) => `${upazilaNameBangla(place)} উপজেলা`;

function placeOf(farmer: FarmerRecord): Place {
  return placeFor(farmer.placeId ?? 'talanda_tanore')!;
}

/** Where the call says it is for: the farmer's union, else the upazila. */
function whereFor(farmer: FarmerRecord, place: Place): { bn: string; en: string } {
  return farmer.unionBangla
    ? { bn: `${farmer.unionBangla} ইউনিয়ন`, en: `${farmer.unionEnglish || farmer.unionBangla} union` }
    : { bn: upazilaBangla(place), en: `${place.upazila} upazila` };
}

function cropsOf(farmer: FarmerRecord): string[] {
  return farmer.crops?.length ? farmer.crops : ['aman'];
}

const firstSentence = (text: string) => (text.split('।')[0] ?? '').trim() + '।';
/** Text to speech reads about 12 Bangla characters a second (the estimate the advice script uses). */
const seconds = (script: string) => Math.max(15, Math.round(script.length / 12));

// ------------------------------------------------------------------ candidates
interface Candidate {
  kind: PlannedCallKind;
  key: string;
  topic: string;
  level: PlannedCall['level'];
  emergency: boolean;
  titleBangla: string;
  titleEnglish: string;
  whyBangla: string;
  whyEnglish: string;
  /** What the farmer hears: why (one line), then the action, said twice. */
  reasonBangla: string;
  actionBangla: string;
  smsBangla: string;
  questionId?: string;
}

const FLOOD_LAND = ['medium_low'];
const LOW_LAND = ['low', 'very_low'];

/** This week's field alerts at the farmer's place that concern their land and crops. */
function alertCandidates(farmer: FarmerRecord, place: Place, today: string): Candidate[] {
  const crops = cropsOf(farmer);
  // The farmer's own winter crop leads the plan, so its alerts (Boro AWD, heat in wheat) are the ones computed
  const hero = crops.find(c => c !== 'aman');
  const request = planRequest({ unionId: place.id, landType: farmer.landType, ...(hero ? { heroCrop: hero } : {}) });
  const advice = adviseWithNarration({ ...request, today }, farmer.id);
  const alerts: FieldAlert[] = (advice.local_context?.fieldAlerts?.alerts ?? []) as FieldAlert[];
  const upazila = upazilaBangla(place);
  return alerts
    .filter(a => (a.level === 'high' || a.level === 'watch') && a.smsBangla)
    .filter(a => a.id === 'flood_now'
      ? FLOOD_LAND.includes(farmer.landType) || (farmer.landType === 'medium_high' && a.level === 'high')
      : crops.includes(a.crop))
    .map(a => {
      const n = a.numbers ?? {};
      const reading = typeof n.date === 'string' ? n.date : null;
      const reason = a.id === 'flood_now' && typeof n.floodSharePct === 'number'
        ? `${seenBy(n.sensor === 'nisar' ? 'nisar' : 'opera').bn}${reading ? ` ${bnDate(md(reading))}` : ''} দেখেছে, ${bnGenitive(upazila)} দেখা জমির ${bnDigits(n.floodSharePct)} ভাগ পানির নিচে, যেখানে শীতে সাধারণত পানি থাকে না।`
        : firstSentence(a.textBangla);
      return {
        kind: 'alert' as const,
        key: `alert:${a.id}:${reading ?? isoWeek(today)}`,
        topic: `alert:${a.id}`,
        level: a.level as 'high' | 'watch',
        emergency: a.level === 'high',
        titleBangla: a.titleBangla,
        titleEnglish: a.titleEnglish,
        whyBangla: `${a.titleBangla} (${a.level === 'high' ? 'জরুরি' : 'নজরে রাখুন'}): ${a.id === 'flood_now' ? 'কৃষকের জমি বন্যায় ডোবার মতো' : 'কৃষক এই ফসল করেন'}।`,
        whyEnglish: `${a.titleEnglish} (${a.level}) at ${place.upazila}: ${a.id === 'flood_now' ? `the farmer's ${farmer.landType.replace('_', '-')} land floods` : `the farmer grows ${a.crop}`}.`,
        reasonBangla: reason,
        actionBangla: a.smsBangla,
        smsBangla: a.smsBangla,
      };
    });
}

/** October to January on low land: when this year's flood water will have left, and when to sow the Boro seedbed. */
function drainCandidate(farmer: FarmerRecord, place: Place, today: string): Candidate | null {
  const m = md(today);
  if (!LOW_LAND.includes(farmer.landType) || !(m >= '10-01' || m <= '01-31')) return null;
  const d = floodFor(place.kind === 'pilot' ? 'ADM3_Tanore' : place.id)?.drain;
  if (!d?.perWeek || !d.freeBy || daysBetween(today, d.freeBy) < 0) return null;
  const by = seenBy(d.to.sensor).bn;
  const upazila = upazilaBangla(place);
  const boro = cropsOf(farmer).includes('boro');
  const seedbed = addDays(d.freeBy, -SEEDBED_AGE);
  const action = boro
    ? daysBetween(today, seedbed) > 3
      ? `বোরোর বীজতলা দিন ${bnDate(md(seedbed))} নাগাদ, যাতে জমি খালি হওয়ার দিন চারার বয়স পঁয়ত্রিশ থেকে পঁয়তাল্লিশ দিন হয়।`
      : 'বোরোর বীজতলা এখনই দিন, যাতে জমি খালি হলেই চারা রোপণ করা যায়।'
    : 'জমি খালি হলেই রস থাকতে থাকতে রবি ফসল বুনুন।';
  return {
    kind: 'drain',
    key: `drain:${d.to.date}`,
    topic: 'drain',
    level: 'watch',
    emergency: false,
    titleBangla: 'জমির পানি কবে নামবে',
    titleEnglish: 'When the land will be free',
    whyBangla: `নিচু জমি; ${by} হিসাবে ${bnGenitive(upazila)} পানি সপ্তাহে ~${bnDigits(Math.round(d.perWeek * 100))} ভাগ নামছে, জমি খালি ~${bnDate(md(d.freeBy))}।`,
    whyEnglish: `Low land; ${seenBy(d.to.sensor).en} shows ${place.upazila}'s water falling ~${Math.round(d.perWeek * 100)} points a week, free around ${enDate(md(d.freeBy))}.`,
    reasonBangla: `${by} হিসাবে ${bnGenitive(upazila)} জমির পানি সপ্তাহে প্রায় ${bnDigits(Math.round(d.perWeek * 100))} ভাগ করে নামছে; এভাবে নামলে নিচু জমি ${bnDate(md(d.freeBy))} নাগাদ খালি হবে।`,
    actionBangla: action,
    smsBangla: `জমি খালি ~${bnDate(md(d.freeBy))}। ${boro ? (daysBetween(today, seedbed) > 3 ? `বোরোর বীজতলা ${bnDate(md(seedbed))} নাগাদ দিন।` : 'বোরোর বীজতলা এখনই দিন।') : 'খালি হলেই রবি ফসল বুনুন।'}`,
  };
}

/** A registered crop's sowing window opening within a week or closing within 10 days. */
function reminderCandidates(farmer: FarmerRecord, place: Place, today: string): Candidate[] {
  const menu = withPlace(place, () => cropMenu());
  const out: Candidate[] = [];
  const year = Number(today.slice(0, 4));
  for (const crop of cropsOf(farmer)) {
    // On low land the drain call times the Boro seedbed from this year's water instead
    if (crop === 'aman' || (crop === 'boro' && LOW_LAND.includes(farmer.landType))) continue;
    const item = menu.find(c => c.id === crop);
    let window: [string, string] | null = item?.window ?? null;
    if (crop === 'boro') {
      // Boro's seedbed: 45 to 35 days before transplanting (the replay's transplanting date at the place)
      const transplant = place.rabi['BRRI dhan28']?.sowing as string | undefined;
      if (transplant) window = [md(addDays(`${year}-${transplant}`, -45)), md(addDays(`${year}-${transplant}`, -35))];
    }
    if (!item || !window) continue;
    const name = { bn: item.cropBangla, en: item.cropEnglish };
    const act = crop === 'boro'
      ? { bn: 'বোরোর বীজতলা দেওয়ার', en: 'the Boro seedbed' }
      : { bn: `${name.bn} বোনার`, en: `${name.en} sowing` };
    for (const y of [year - 1, year]) {
      const open = `${y}-${window[0]}`;
      const close = window[1] >= window[0] ? `${y}-${window[1]}` : `${y + 1}-${window[1]}`;
      const toOpen = daysBetween(today, open), toClose = daysBetween(today, close);
      const span = `${bnDate(window[0])} থেকে ${bnDate(window[1])}`;
      const base = {
        kind: 'reminder' as const, topic: `reminder:${crop}`, level: 'advice' as const, emergency: false,
        reasonBangla: `আপনার এলাকায় ${act.bn} ভালো সময় ${span}।`,
      };
      if (toOpen >= 1 && toOpen <= OPENS_AHEAD) {
        out.push({
          ...base, key: `reminder:${crop}:open:${open}`,
          titleBangla: `${act.bn} সময় আসছে`, titleEnglish: `${act.en[0].toUpperCase()}${act.en.slice(1)} opens soon`,
          whyBangla: `কৃষক ${name.bn} করেন; সময় শুরু ${bnDate(window[0])}।`, whyEnglish: `The farmer grows ${name.en.toLowerCase()}; the window opens ${enDate(window[0])}.`,
          actionBangla: 'এখনই ভালো বীজ ও সার জোগাড় করে রাখুন।',
          smsBangla: `${act.bn} সময় ${span}। এখনই বীজ ও সার জোগাড় করুন।`,
        });
      } else if (toOpen <= 0 && toClose >= CLOSES_LAST && toClose <= CLOSES_AHEAD) {
        const action = crop === 'boro'
          ? `বোরোর বীজতলা ${bnDateOf(bnDate(window[1]))} মধ্যে দিন।`
          : `${name.bn} ${bnDateOf(bnDate(window[1]))} মধ্যে বুনে ফেলুন; দেরিতে বুনলে ফলন কমে যায়।`;
        out.push({
          ...base, key: `reminder:${crop}:close:${open}`,
          titleBangla: `${act.bn} শেষ সময় কাছে`, titleEnglish: `${act.en[0].toUpperCase()}${act.en.slice(1)} closes soon`,
          whyBangla: `কৃষক ${name.bn} করেন; সময় শেষ ${bnDate(window[1])}।`, whyEnglish: `The farmer grows ${name.en.toLowerCase()}; the window closes ${enDate(window[1])}.`,
          actionBangla: action,
          smsBangla: action,
        });
      }
    }
  }
  return out;
}

function answerCandidates(farmer: FarmerRecord): Candidate[] {
  return store.questions
    .filter(q => q.farmerId === farmer.id && q.status === 'answered' && q.answerBangla)
    .map(q => ({
      kind: 'answer' as const,
      key: `answer:${q.id}`,
      topic: `answer:${q.id}`,
      level: 'advice' as const,
      emergency: false,
      titleBangla: 'কৃষকের প্রশ্নের উত্তর',
      titleEnglish: "Answer to the farmer's question",
      whyBangla: `কৃষক জানতে চেয়েছেন (${bnDate(md(q.askedAt.slice(0, 10)))}): ${q.textBangla}`,
      whyEnglish: `The farmer asked on ${enDate(md(q.askedAt.slice(0, 10)))} (${q.channel.replace('_', ' ')}).`,
      reasonBangla: q.channel === 'missed_call' ? 'আপনি মিসড কল দিয়ে পরামর্শ চেয়েছেন।' : `আপনি জানতে চেয়েছিলেন: ${q.textBangla.slice(0, 120)}${/[।?]$/.test(q.textBangla.slice(0, 120)) ? '' : '।'}`,
      actionBangla: q.answerBangla!,
      // The answer's first two sentences that say something (not the "you asked for ..." line)
      smsBangla: q.answerBangla!.split('।').map(x => x.trim()).filter(x => x && !x.endsWith('চেয়েছেন')).slice(0, 2).join('। ') + '।',
      questionId: q.id,
    }));
}

function compose(farmer: FarmerRecord, c: Candidate, where: { bn: string; en: string }) {
  const parts = c.kind === 'answer'
    ? [OPENING(where.bn), c.reasonBangla, c.actionBangla, CLOSING]
    : [OPENING(where.bn), c.reasonBangla, c.actionBangla, `আবার বলছি: ${c.actionBangla}`, CLOSING];
  let sms = `মাটি কহন: ${c.smsBangla} ${SMS_TAIL}`;
  // At most three SMS parts: the action is cut at a sentence end first
  while (smsParts(sms) > 3 && sms.includes('।')) sms = `মাটি কহন: ${c.smsBangla.split('।').slice(0, -2).join('।')}। ${SMS_TAIL}`;
  // Brackets read as a pause: 'flowering (around 26 October).' -> 'flowering, around 26 October.'
  const script = speakable(parts.join(' ').replace(/\s*\(([^)]*)\)/g, ', $1,').replace(/,\s*([।,;])/g, '$1'));
  return { scriptBangla: script, smsBangla: sms, durationSeconds: seconds(script) };
}

// ------------------------------------------------------------------ the day's plan
const sentOut = (c: PlannedCall) => c.attempts.length > 0;
const callId = (date: string, farmerId: string, key: string) =>
  `call_${date.replace(/-/g, '')}_${farmerId}_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 8)}`;

/** The candidates for one farmer on one day, best first, after the limits. */
export function candidatesFor(farmer: FarmerRecord, today: string): Candidate[] {
  const place = placeOf(farmer);
  const mine = store.calls.filter(c => c.farmerId === farmer.id);
  const used = new Set(mine.filter(c => c.status !== 'proposed').map(c => c.key));
  const thisWeek = mine.filter(c => sentOut(c) && daysBetween(c.date, today) >= 0 && daysBetween(c.date, today) < 7);
  const capped = thisWeek.filter(c => !c.emergency && c.kind !== 'answer').length >= MAX_A_WEEK;
  const recentTopics = new Set(mine.filter(c => sentOut(c) && daysBetween(c.date, today) >= 0 && daysBetween(c.date, today) < TOPIC_GAP_DAYS).map(c => c.topic));
  const all = [
    ...answerCandidates(farmer),
    ...alertCandidates(farmer, place, today),
    ...[drainCandidate(farmer, place, today)].filter((c): c is Candidate => Boolean(c)),
    ...reminderCandidates(farmer, place, today),
  ];
  return all
    .filter(c => !used.has(c.key))
    .filter(c => c.emergency || c.kind === 'answer' || (!capped && !recentTopics.has(c.topic)))
    .sort((a, b) => RANK[a.emergency ? 'emergency' : a.kind] - RANK[b.emergency ? 'emergency' : b.kind]);
}

/**
 * Builds (or rebuilds) the call list for a day: proposals are replaced with fresh ones; approved, sent and removed
 * calls stay. One call a farmer a day. `farmerIds` limits the rebuild to some farmers (a missed call, an answer).
 */
export function buildPlan(date = dhakaToday(), farmerIds?: string[]): { date: string; calls: PlannedCall[]; skipped: Array<{ farmerId: string; reason: string }> } {
  if (!isDate(date)) throw new Error('date must be YYYY-MM-DD');
  const skipped: Array<{ farmerId: string; reason: string }> = [];
  const only = farmerIds ? new Set(farmerIds) : null;
  store.calls = store.calls.filter(c => !(c.date === date && c.status === 'proposed' && (!only || only.has(c.farmerId))));
  for (const farmer of desk.farmers()) {
    if (only && !only.has(farmer.id)) continue;
    if (!desk.callable(farmer)) { skipped.push({ farmerId: farmer.id, reason: farmer.optedOut ? 'stopped the calls' : 'no consent' }); continue; }
    if (store.calls.some(c => c.farmerId === farmer.id && c.date === date && c.status !== 'removed')) { skipped.push({ farmerId: farmer.id, reason: 'already has a call this day' }); continue; }
    let best: Candidate | undefined;
    try {
      best = candidatesFor(farmer, date)[0];
    } catch (err: any) {
      skipped.push({ farmerId: farmer.id, reason: `no advice: ${err?.message ?? err}` });
      continue;
    }
    if (!best) { skipped.push({ farmerId: farmer.id, reason: 'nothing to say' }); continue; }
    const where = whereFor(farmer, placeOf(farmer));
    store.calls.push({
      id: callId(date, farmer.id, best.key),
      date,
      farmerId: farmer.id,
      kind: best.kind,
      key: best.key,
      topic: best.topic,
      level: best.level,
      emergency: best.emergency,
      titleBangla: best.titleBangla,
      titleEnglish: best.titleEnglish,
      whyBangla: best.whyBangla,
      whyEnglish: best.whyEnglish,
      ...compose(farmer, best, where),
      slot: farmer.callSlot ?? 'evening',
      status: 'proposed',
      edited: false,
      approvedBy: null,
      attempts: [],
      sms: null,
      questionId: best.questionId ?? null,
    });
  }
  save();
  return { date, calls: callsOn(date), skipped };
}

export function callsOn(date: string): PlannedCall[] {
  const order = (c: PlannedCall) => (c.emergency ? 0 : 1) * 10 + RANK[c.kind];
  return store.calls.filter(c => c.date === date).sort((a, b) => order(a) - order(b) || a.farmerId.localeCompare(b.farmerId));
}

export function callById(id: string): PlannedCall | undefined {
  return store.calls.find(c => c.id === id);
}

/** The officer's decision on one call: approve, remove, put back to proposed, or edit the script and SMS. */
export function reviewCall(officerId: string, id: string, body: any): { call?: PlannedCall; error?: string } {
  const call = callById(id);
  if (!call) return { error: 'Unknown call' };
  if (sentOut(call)) return { error: 'This call has already gone out' };
  if (body.action === 'approve') { call.status = 'approved'; call.approvedBy = officerId; }
  else if (body.action === 'remove') { call.status = 'removed'; call.approvedBy = null; }
  else if (body.action === 'undo') { call.status = 'proposed'; call.approvedBy = null; }
  else if (body.action === 'edit') {
    const script = String(body.scriptBangla ?? '').trim().slice(0, 2000);
    const sms = String(body.smsBangla ?? call.smsBangla).trim().slice(0, 400);
    if (!script) return { error: 'scriptBangla is required' };
    const banned = FORBIDDEN_TERMS.filter(term => script.includes(term) || sms.includes(term));
    if (banned.length) return { error: `Contains terms not allowed in farmer messages: ${banned.join(', ')}` };
    call.scriptBangla = script;
    call.smsBangla = sms;
    call.durationSeconds = seconds(script);
    call.edited = true;
  } else return { error: 'action must be approve, remove, undo or edit' };
  save();
  return { call };
}

/** Approves every proposed call on a day. */
export function approveAll(officerId: string, date: string): number {
  let n = 0;
  for (const c of store.calls) {
    if (c.date === date && c.status === 'proposed') { c.status = 'approved'; c.approvedBy = officerId; n++; }
  }
  save();
  return n;
}

// ------------------------------------------------------------------ sending
function callRoute(): CallRoute {
  return systechConfig().provider ?? 'voiceblast';
}

/**
 * Sends the day's approved calls and retries. `allowLive` is the caller's permission for real calls (a signed-in
 * officer, or --live on the command line); the provider's own switch must be on as well. `dueOnly` sends only the
 * calls whose slot has started (the scheduled run).
 */
export async function sendApproved(opts: { date?: string; allowLive: boolean; dueOnly?: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const date = opts.date ?? dhakaToday(now);
  const route = callRoute();
  const live = opts.allowLive && systechConfig()[route].live;
  const results: Array<{ id: string; farmerId: string; outcome: CallAttempt['outcome']; note: string | null }> = [];
  // The day's approved calls, and retries from that day or the day before
  const due = store.calls.filter(c => (c.status === 'approved' && c.date === date) || (c.status === 'retry' && [0, 1].includes(daysBetween(c.date, date))));
  for (const call of due) {
    if (opts.dueOnly && SLOT_HOUR[call.slot] > dhakaHour(now)) continue;
    const farmer = desk.farmerById(call.farmerId);
    if (!farmer || !desk.callable(farmer)) {
      call.status = 'removed';
      results.push({ id: call.id, farmerId: call.farmerId, outcome: 'failed', note: 'the farmer stopped the calls' });
      continue;
    }
    const attempt: CallAttempt = { at: now.toISOString(), route, dryRun: true, ref: null, outcome: 'dry_run', note: null };
    const phone = desk.phoneOf(farmer.id);
    if (farmer.sample || !phone) {
      attempt.note = farmer.sample ? 'sample farmer: never dialled' : 'no phone number';
      if (!farmer.sample) attempt.outcome = 'failed';
    } else {
      let audio: Buffer | null = null;
      if (live) {
        try {
          if (ttsStatus().provider === 'google') audio = (await synthesizeSpeech(call.scriptBangla, 'bn', process.env, 'wav8k')).audio;
        } catch (err: any) {
          attempt.note = `Google voice unavailable (${err?.details?.reason || err?.message || err})`;
        }
      }
      try {
        const sent: any = await sendSystechCall(route, { phone, audio, script: call.scriptBangla, dryRun: !live });
        attempt.dryRun = Boolean(sent.dryRun);
        attempt.ref = sent.blastId != null ? String(sent.blastId) : sent.audioId != null ? String(sent.audioId) : null;
        attempt.outcome = sent.dryRun ? 'dry_run' : sent.error || !sent.ok ? 'failed' : 'pending';
        attempt.note = sent.error ?? attempt.note;
      } catch (err: any) {
        attempt.dryRun = false;
        attempt.outcome = 'failed';
        attempt.note = String(err?.message || err);
      }
    }
    call.attempts.push(attempt);
    call.status = 'sent';
    if (call.questionId) {
      const q = store.questions.find(x => x.id === call.questionId);
      if (q) { q.status = 'called'; q.callId = call.id; }
    }
    if (attempt.outcome === 'failed' || attempt.outcome === 'unanswered') await missed(call, opts.allowLive, now);
    results.push({ id: call.id, farmerId: call.farmerId, outcome: attempt.outcome, note: attempt.note });
  }
  save();
  return { date, route, live, sent: results };
}

/** An unanswered or failed call: one retry in the evening with an SMS of the action, then the farmer is unreached. */
async function missed(call: PlannedCall, allowLive: boolean, now: Date) {
  if (call.attempts.length >= 2) { call.status = 'unreached'; return; }
  call.status = 'retry';
  call.slot = 'evening';
  if (call.sms) return;
  const farmer = desk.farmerById(call.farmerId);
  const phone = desk.phoneOf(call.farmerId);
  if (!farmer || farmer.sample || !phone) {
    call.sms = { at: now.toISOString(), dryRun: true, error: farmer?.sample ? null : 'no phone number' };
    return;
  }
  if (!allowLive) {
    call.sms = { at: now.toISOString(), dryRun: true, error: null };
    return;
  }
  const sent: any = await sendSms(phone, call.smsBangla);
  call.sms = { at: now.toISOString(), dryRun: Boolean(sent.dryRun), error: sent.error ?? null };
}

const ANSWERED = /answer|connected|success|complete/i;
const NOT_ANSWERED = /no.?answer|busy|fail|cancel|unreach|reject|congest|not.?answer|timeout|invalid/i;
/** A provider's status words -> answered, unanswered, or still pending. */
export function outcomeFrom(text: string): CallAttempt['outcome'] {
  if (NOT_ANSWERED.test(text)) return 'unanswered';
  if (ANSWERED.test(text)) return 'answered';
  return 'pending';
}

/**
 * Reads the provider's reports for calls still pending, then retries or gives up on the ones not answered.
 * Dry runs have no report: the officer can mark them (markOutcome) to try the follow-up.
 */
export async function followUp(opts: { allowLive: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const pending = store.calls.filter(c => c.status === 'sent' && c.attempts.at(-1)?.outcome === 'pending');
  let history: Array<{ phone: string; status: string; cause: string; time: string }> | null = null;
  const checked: Array<{ id: string; outcome: CallAttempt['outcome'] }> = [];
  for (const call of pending) {
    const attempt = call.attempts.at(-1)!;
    const phone = desk.phoneOf(call.farmerId);
    if (!phone) continue;
    try {
      if (attempt.route === 'voiceblast') {
        history ??= await voiceblastHistory(50);
        const row = history.find(r => r.phone.replace(/\D/g, '').endsWith(phone.slice(1)));
        if (row) attempt.outcome = outcomeFrom(`${row.status} ${row.cause}`);
      } else if (attempt.route === 'broadcast' && attempt.ref) {
        const report = await broadcastReport(attempt.ref);
        const rows: any[] = Array.isArray((report.data as any)?.data) ? (report.data as any).data : Array.isArray(report.data) ? report.data as any[] : [];
        const row = rows.find(r => JSON.stringify(r).includes(phone.slice(1)));
        if (row) attempt.outcome = outcomeFrom(JSON.stringify(row));
      }
    } catch (err: any) {
      attempt.note = `report unavailable: ${err?.message ?? err}`;
    }
    checked.push({ id: call.id, outcome: attempt.outcome });
  }
  for (const call of store.calls.filter(c => c.status === 'sent')) {
    const last = call.attempts.at(-1)?.outcome;
    if (last === 'unanswered' || last === 'failed') await missed(call, opts.allowLive, now);
  }
  save();
  return { checked, retries: store.calls.filter(c => c.status === 'retry').map(c => c.id), unreached: store.calls.filter(c => c.status === 'unreached').map(c => c.id) };
}

/** The officer's word on a call's outcome (the farmer said they missed it, or a dry run in a demo). */
export async function markOutcome(id: string, outcome: string, allowLive: boolean): Promise<{ call?: PlannedCall; error?: string }> {
  const call = callById(id);
  if (!call || !sentOut(call)) return { error: 'Unknown call, or it has not gone out yet' };
  if (outcome !== 'answered' && outcome !== 'unanswered') return { error: 'outcome must be answered or unanswered' };
  const attempt = call.attempts.at(-1)!;
  attempt.outcome = outcome;
  attempt.note = [attempt.note, 'marked by the officer'].filter(Boolean).join('; ');
  if (outcome === 'unanswered' && call.status === 'sent') await missed(call, allowLive, new Date());
  if (outcome === 'answered') call.status = 'sent';
  save();
  return { call };
}

// ------------------------------------------------------------------ questions back from the farmer
const QUESTION_CHANNELS: FarmerQuestion['channel'][] = ['in_person', 'phone', 'missed_call', 'app'];
const SPEECH_START = 'আসসালামু আলাইকুম। মাটি কহন থেকে বলছি।';
const DRAFT_CHARS = 480;
const SPEECH_ENDS = ['বিস্তারিত জানতে আপনার উপসহকারী কৃষি কর্মকর্তার সাথে কথা বলুন। ধন্যবাদ।', 'ধন্যবাদ।'];

/** The engine's answer to a sentence at the farmer's place, without the advice script's own greeting and goodbye. */
function draftFor(farmer: FarmerRecord, text: string): string {
  const answer = voiceAnswer({ text, unionId: placeOf(farmer).id, landType: farmer.landType, farmerId: farmer.id });
  const heard = answer.understood;
  const understood = heard.crops.length || heard.notModelled.length || heard.landType || heard.priorities || heard.hero;
  if (text && !understood) return '';
  let speech = answer.reply.speechBangla.replace(SPEECH_START, '').trim();
  for (const end of SPEECH_ENDS) if (speech.endsWith(end)) { speech = speech.slice(0, -end.length).trim(); break; }
  // About 40 seconds of it, whole sentences, so the call with its greeting and goodbye stays near a minute
  const kept: string[] = [];
  // The call repeats the question itself, so the engine's "you asked for ..." line goes
  for (const sentence of speech.split('।').map(x => x.trim()).filter(x => x && !x.endsWith('চেয়েছেন'))) {
    if (kept.length && [...kept, sentence].join('। ').length > DRAFT_CHARS) break;
    kept.push(sentence);
  }
  return kept.length ? `${kept.join('। ')}।` : '';
}

/** A question the officer took down (or the app sent); the engine drafts an answer when it understands the crops. */
export function addQuestion(officerId: string | null, body: any): { question?: FarmerQuestion; error?: string } {
  const farmer = desk.farmerById(String(body.farmerId ?? ''));
  if (!farmer) return { error: 'Unknown farmer' };
  const text = String(body.textBangla ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!text) return { error: 'textBangla is required' };
  const channel = QUESTION_CHANNELS.includes(body.channel) ? body.channel : 'in_person';
  const question: FarmerQuestion = {
    id: `q_${Date.now().toString(36)}_${farmer.id}`,
    farmerId: farmer.id,
    askedAt: new Date().toISOString(),
    channel,
    textBangla: text,
    draftBangla: draftFor(farmer, text),
    answerBangla: null,
    status: 'open',
    takenBy: officerId,
    callId: null,
  };
  store.questions.unshift(question);
  save();
  return { question };
}

/** The officer's answer (the draft, edited or written): it goes on today's call list for approval. */
export function answerQuestion(officerId: string, id: string, body: any): { question?: FarmerQuestion; call?: PlannedCall | null; error?: string } {
  const q = store.questions.find(x => x.id === id);
  if (!q) return { error: 'Unknown question' };
  if (q.status === 'called') return { error: 'This answer has already been called' };
  const answer = String(body.answerBangla ?? '').trim().replace(/\s+/g, ' ').slice(0, 1200);
  if (!answer) return { error: 'answerBangla is required' };
  const banned = FORBIDDEN_TERMS.filter(term => answer.includes(term));
  if (banned.length) return { error: `Contains terms not allowed in farmer messages: ${banned.join(', ')}` };
  q.answerBangla = answer;
  q.status = 'answered';
  q.takenBy ??= officerId;
  const today = dhakaToday();
  // An answer outranks the day's other proposal for this farmer
  const plan = buildPlan(today, [q.farmerId]);
  return { question: q, call: plan.calls.find(c => c.questionId === q.id) ?? null };
}

export function questions(): FarmerQuestion[] {
  return store.questions;
}

/**
 * A missed call to the project's number (a provider's webhook): a registered farmer gets this week's advice for
 * their field on the call list; an unknown number is kept (masked) for the officer to register.
 */
export function missedCall(phoneRaw: string): { registered: boolean; question?: FarmerQuestion; call?: PlannedCall | null; stopped?: boolean } {
  const farmer = desk.farmerByPhone(phoneRaw);
  if (!farmer) {
    const digits = String(phoneRaw ?? '').replace(/\D/g, '');
    store.unknownCallers.unshift({ at: new Date().toISOString(), phoneMasked: digits.length >= 4 ? `${digits.slice(0, 3)}XXXX${digits.slice(-4)}` : 'unknown' });
    store.unknownCallers.length = Math.min(store.unknownCallers.length, 50);
    save();
    return { registered: false };
  }
  if (!desk.callable(farmer)) return { registered: true, stopped: true };
  const draft = draftFor(farmer, '');
  const question: FarmerQuestion = {
    id: `q_${Date.now().toString(36)}_${farmer.id}`,
    farmerId: farmer.id,
    askedAt: new Date().toISOString(),
    channel: 'missed_call',
    textBangla: 'মিসড কল: এই সপ্তাহের পরামর্শ চেয়েছেন',
    draftBangla: draft,
    answerBangla: draft,
    status: 'answered',
    takenBy: null,
    callId: null,
  };
  store.questions.unshift(question);
  const plan = buildPlan(dhakaToday(), [farmer.id]);
  return { registered: true, question, call: plan.calls.find(c => c.questionId === question.id) ?? null };
}

export function unknownCallers() {
  return store.unknownCallers;
}

/** The screen's summary: today's list by status, the week's calls and answers, who could not be reached. */
export function callDesk(date = dhakaToday()) {
  const calls = callsOn(date);
  const count = (s: string) => calls.filter(c => c.status === s).length;
  const farmers = desk.farmers();
  return {
    date,
    route: callRoute(),
    live: systechConfig()[callRoute()].live,
    smsLive: process.env.SMS_LIVE === '1',
    slots: SLOT_HOUR,
    maxAWeek: MAX_A_WEEK,
    counts: { proposed: count('proposed'), approved: count('approved'), sent: count('sent'), retry: count('retry'), unreached: count('unreached'), removed: count('removed') },
    register: {
      farmers: farmers.length,
      callable: farmers.filter(desk.callable).length,
      stopped: farmers.filter(f => f.optedOut).length,
    },
    calls,
    questions: store.questions.slice(0, 30),
    unknownCallers: store.unknownCallers.slice(0, 10),
  };
}

/** ISO week label (2026-W44) for alerts with no reading date: one call per alert a week. */
function isoWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // the Thursday of this week names its year
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
