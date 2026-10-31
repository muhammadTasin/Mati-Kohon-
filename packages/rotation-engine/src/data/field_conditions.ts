/**
 * Field conditions from the 1 km cropland grid (research/grid/build.py -> field_conditions.json and
 * field_conditions_curves.json): for each upazila, over its cropland only (ESA WorldCover 2021),
 *   condition   how green the fields are in the latest 16 days (NOAA-20 VIIRS) against what 2001-2025 expects for
 *               these days this year (Terra MODIS, the 25-year greening trend taken out), with Terra's own reading
 *   emptyField  the summer gap after the winter harvest, in how many of the last ten years, from when to when
 *   boroThirst  green fields short of water in March-April (ECOSTRESS evaporative stress index)
 *   soil        texture and the water the top 30 cm holds (SoilGrids)
 *   amanRecord  the weak Aman seasons since 2001, judged the way the condition is judged now
 *   boroHarvest in the haor, when the Boro on land that grows only Boro is usually cut, and the springs it was lost
 * and the plain words a farmer or an officer reads about them. Context beside the replay; none of it moves a score.
 */
import fs from 'node:fs';
import { bnDate, bnDigits, bnRange, enDate } from '../bn.ts';
import { CHOICE_BY_ID, TURNAROUND_DAYS, addDays, choiceReplay, yearDay, type ChoiceCrop } from './crop_choice.ts';
import { FLASH_FLOOD_LIMIT, flashFloodRisk } from './land.ts';
import type { MonthDay } from './release_types.ts';

export type ConditionLevel = 'wellBelow' | 'below' | 'normal' | 'above' | 'wellAbove' | 'unclear' | 'noCrop';

export interface FieldConditionRow {
  cropland: { km2: number; share: number | null };
  condition?: {
    date: string; ndvi: number | null; expected: number | null; low: number | null; high: number | null;
    percentile: number; level: ConditionLevel; seen: number | null; confidence: 'high' | 'low';
    modis: { date: string; percentile: number } | null;
  };
  emptyField?: { share: number | null; years: number; of: number; from: string; to: string; days: number };
  cropsByYear?: Array<number | null>;
  boroThirst?: { share: number; esi: number; greenKm2: number; passes: string[]; years: Record<string, number> };
  soil?: { sand: number; silt: number; clay: number; texture: string; awcMm30: number; socGkg: number };
  /** weak: [year, robust z, NDVI below the trend], weakest first */
  amanRecord?: { seasons: number; weak: Array<[number, number, number]> };
  boroHarvest?: {
    km2: number; share: number; half: string; byYear: Record<string, string>;
    trend: { daysPerDecade: number; p: number };
    /** FFWC's flash-flood years: the first 100 mm burst, and how many days before its usual day the crop went */
    floods: Array<{ year: number; burst: string | null; early: number }>;
  };
}

interface RecordCheck {
  id: string; name: string; years: number[]; event: { bn: string; en: string }; z: Record<string, number>; caught: boolean;
}

interface FieldConditionsFile {
  generatedOn: string;
  method: string;
  sources: Record<string, string>;
  now: { composite: string; to: string; sensor: string; baselineYears: string; trend: string };
  cropsByYear: { years: number[]; note: string };
  emptyField: Record<string, unknown>;
  boroThirst: Record<string, unknown>;
  amanRecord?: { seasons: string; window: string; weakShareByYear: Record<string, number>; widespread: number[]; checks: RecordCheck[] };
  boroHarvest?: Record<string, unknown>;
  upazilas: Record<string, FieldConditionRow>;
}

interface CurvesFile {
  dates: string[];
  upazilas: Record<string, { ndvi: Array<number | null>; expected: Array<number | null>; low: Array<number | null>; high: Array<number | null> }>;
}

const DATA = new URL('./', import.meta.url);
let file: FieldConditionsFile | null | undefined;
let curves: CurvesFile | null | undefined;

/** The whole file, or null when research/grid/build.py has not been run. */
export function fieldConditionsData(): FieldConditionsFile | null {
  if (file === undefined) {
    try {
      file = JSON.parse(fs.readFileSync(new URL('field_conditions.json', DATA), 'utf8'));
    } catch {
      file = null;
    }
  }
  return file ?? null;
}

export function fieldConditionsFor(id: string): FieldConditionRow | null {
  return fieldConditionsData()?.upazilas[id] ?? null;
}

/** The last 12 months' greenness and the band the trend expects, for one upazila's chart. */
export function fieldCurveFor(id: string) {
  if (curves === undefined) {
    try {
      curves = JSON.parse(fs.readFileSync(new URL('field_conditions_curves.json', DATA), 'utf8'));
    } catch {
      curves = null;
    }
  }
  const c = curves?.upazilas[id];
  return c && curves ? { dates: curves.dates, ...c } : null;
}

// ---------------------------------------------------------------------------
// The summer gap: which Kharif-1 crops fit into it
// ---------------------------------------------------------------------------

/** Gap fillers, legumes first (they leave nitrogen for Aman): the engine's own replayed windows and field days. */
const GAP_CROPS = ['mungbean', 'sesame', 'aus', 'jute'];

export interface GapCrop { crop: ChoiceCrop; sow: string; harvest: string; fieldDays: number }

/**
 * Crops that can be sown inside the gap's first weeks (within their own sowing window) and harvested, with the
 * week's turnaround, before the gap ends (when Aman goes in).
 */
export function cropsForGap(gap: { from: string; to: string }): GapCrop[] {
  const replay = choiceReplay();
  const out: GapCrop[] = [];
  for (const id of GAP_CROPS) {
    const crop = CHOICE_BY_ID[id];
    const facts = replay.crops[id];
    if (!crop || !facts) continue;
    const [w0, w1] = facts.window;
    const sow = yearDay(gap.from) >= yearDay(w0) ? gap.from : w0;
    if (yearDay(sow) > yearDay(w1) || yearDay(sow) < yearDay(gap.from)) continue;
    const harvest = addDays(sow, facts.fieldDays);
    if (yearDay(addDays(harvest, TURNAROUND_DAYS), sow) > yearDay(gap.to, sow) + 7) continue;
    out.push({ crop, sow, harvest, fieldDays: facts.fieldDays });
  }
  return out.sort((a, b) => Number(b.crop.isLegume) - Number(a.crop.isLegume) || a.fieldDays - b.fieldDays);
}

/** True when every gap crop's sowing window has closed before the gap opens (fields empty only after a late Boro). */
export function gapOpensTooLate(gap: { from: string }): boolean {
  const replay = choiceReplay();
  return GAP_CROPS.every(id => {
    const w = replay.crops[id]?.window;
    return !w || yearDay(w[1]) < yearDay(gap.from);
  });
}

// ---------------------------------------------------------------------------
// Plain words
// ---------------------------------------------------------------------------

export interface FieldNote {
  id: 'condition' | 'emptyField' | 'boroThirst' | 'boroFlood' | 'amanRecord' | 'soil';
  /** alert: act now; watch: look at the field; good: nothing to do; info: context */
  tone: 'alert' | 'watch' | 'good' | 'info';
  bn: string;
  en: string;
}

const TEXTURE_BN: Record<string, string> = {
  clay: 'এঁটেল', 'silty clay': 'পলি-এঁটেল', 'sandy clay': 'বেলে-এঁটেল', 'clay loam': 'এঁটেল দোআঁশ',
  'silty clay loam': 'পলি-এঁটেল দোআঁশ', 'sandy clay loam': 'বেলে-এঁটেল দোআঁশ', loam: 'দোআঁশ', 'silt loam': 'পলি দোআঁশ',
  silt: 'পলি', 'sandy loam': 'বেলে দোআঁশ', 'loamy sand': 'দোআঁশ বালু', sand: 'বালু',
};
const md = (iso: string) => iso.slice(5, 10);
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const enRange = (a: string, b: string) => (a.slice(0, 2) === b.slice(0, 2) ? `${Number(a.slice(3))}–${enDate(b)}` : `${enDate(a)} – ${enDate(b)}`);
const pct = (share: number) => Math.round(share * 100);

/** What the satellites say about one upazila's fields, in Bangla and English. `landType` from upazila_profile. */
export function fieldNotes(id: string, opts: { landType?: string | null } = {}): FieldNote[] {
  const row = fieldConditionsFor(id);
  if (!row) return [];
  const notes: FieldNote[] = [];
  const c = row.condition;
  if (c) {
    const span = [md(c.date), md(plusDays(c.date, 15))] as const;
    const when = { bn: `নাসার উপগ্রহে ${bnRange(span[0], span[1])}`, en: `NASA satellites, ${enRange(span[0], span[1])}` };
    // the percentile as a count of the 25 seasons: "less green than in 23 of the past 25 years"
    const lessThan = Math.max(1, Math.round((100 - c.percentile) / 4));
    const moreThan = Math.max(1, Math.round(c.percentile / 4));
    const years = (n: number) => (n >= 25 ? { bn: 'গত ২৫ বছরের যেকোনো বছরের', en: 'any of the past 25 years' }
      : { bn: `গত ২৫ বছরের ${bnDigits(n)} বছরের`, en: `${n} of the past 25 years` });
    if (c.level === 'noCrop') {
      notes.push({ id: 'condition', tone: 'info',
        bn: `${when.bn}: এ সময় এখানকার বেশিরভাগ জমি সাধারণত খালি বা পানির নিচে থাকে; তুলনার মতো ফসল নেই।`,
        en: `${when.en}: most fields here are usually bare or under water on these days, so there is no crop to compare.` });
    } else if (c.level === 'unclear') {
      notes.push({ id: 'condition', tone: 'info',
        bn: `${when.bn}: দুই উপগ্রহ এবার আলাদা কথা বলছে; খেতের সবুজ নিয়ে এখন কিছু বলা যাচ্ছে না।`,
        en: `${when.en}: the two satellites disagree this time, so no call on how green the fields are.` });
    } else if (c.level === 'wellBelow' || c.level === 'below') {
      const sure = c.confidence === 'high';
      notes.push({ id: 'condition', tone: sure && c.level === 'wellBelow' ? 'alert' : 'watch',
        bn: `${when.bn}: এই উপজেলার খেত ${sure ? '' : 'সম্ভবত '}${years(lessThan).bn} চেয়ে কম সবুজ (২৫ বছরে সবুজ বাড়ার ধারা বাদ দিয়ে)। খেতে গিয়ে পানি, পোকা ও রোগ দেখুন।${sure ? '' : ' মেঘ বা দুই উপগ্রহের অমিলে এবার নিশ্চিত নয়।'}`,
        en: `${when.en}: the fields here are ${sure ? '' : 'probably '}less green than in ${years(lessThan).en} (allowing for 25 years of greening). Walk the fields and check water, pests and disease.${sure ? '' : ' Clouds or the two satellites differing make this less certain.'}` });
    } else if (c.level === 'above' || c.level === 'wellAbove') {
      notes.push({ id: 'condition', tone: 'good',
        bn: `${when.bn}: এই উপজেলার খেত ${years(moreThan).bn} চেয়ে বেশি সবুজ।`,
        en: `${when.en}: the fields here are greener than in ${years(moreThan).en}.` });
    } else {
      notes.push({ id: 'condition', tone: 'good',
        bn: `${when.bn}: এই উপজেলার খেত এ সময়ের মতোই সবুজ।`,
        en: `${when.en}: the fields here are as green as usual for these days.` });
    }
  }
  const g = row.emptyField;
  if (g) {
    const share = g.share != null ? pct(g.share) : null;
    const lead = {
      bn: `গত ${bnDigits(g.of)} বছরের ${bnDigits(g.years)} বছরে${share != null ? ` প্রায় ${bnDigits(share)}% জমি` : ' অনেক জমি'} ${bnRange(g.from, g.to)} প্রায় ${bnDigits(g.days)} দিন খালি পড়ে ছিল।`,
      en: `In ${g.years} of the last ${g.of} years${share != null ? ` about ${share}% of the fields` : ' many fields'} stood empty about ${g.days} days, ${enRange(g.from, g.to)}.`,
    };
    if (opts.landType === 'low' || opts.landType === 'very_low') {
      notes.push({ id: 'emptyField', tone: 'info',
        bn: `${lead.bn} নিচু জমিতে এ সময় আগাম বন্যার পানি আসে, তাই গ্রীষ্মের ফসল ঝুঁকির।`,
        en: `${lead.en} On low land the early floods come in this time, so a summer crop is risky.` });
    } else {
      const fits = cropsForGap(g).slice(0, 2);
      if (fits.length) {
        const bnList = fits.map(f => `${f.crop.cropBangla} (${f.crop.varietyBangla}, ${bnDigits(f.fieldDays)} দিন, ${bnDate(f.sow)} বুনে)`).join(' বা ');
        const enList = fits.map(f => `${f.crop.crop.toLowerCase()} (${f.fieldDays} days, sown ${enDate(f.sow)})`).join(' or ');
        const legume = fits[0].crop.isLegume;
        notes.push({ id: 'emptyField', tone: 'info',
          bn: `${lead.bn} এই ফাঁকে একটি ছোট ফসল হয়: ${bnList}।${legume ? ' ডাল ফসল মাটিতে নাইট্রোজেনও রেখে যায়।' : ''}`,
          en: `${lead.en} A short crop fits the gap: ${enList}.${legume ? ' A pulse also leaves nitrogen for the next crop.' : ''}` });
      } else if (gapOpensTooLate(g)) {
        notes.push({ id: 'emptyField', tone: 'info',
          bn: `${lead.bn} জমি খালি হয় মুগ, তিল, আউশ ও পাট বোনার সময় পেরিয়ে গেলে; আগে কাটা যায় এমন শীতের ফসল (যেমন ব্রি ধান৮৮ বা সরিষার পর বোরো) এই ফাঁকে একটি ডাল ফসলের জায়গা করে দেয়। ফসল পরিকল্পনায় দেখুন।`,
          en: `${lead.en} The fields empty only after the sowing windows of mungbean, sesame, Aus and jute have closed; an earlier-harvested winter crop (such as BRRI dhan88, or Boro after mustard) would make room for a pulse in this gap. See the rotation planner.` });
      } else {
        notes.push({ id: 'emptyField', tone: 'info',
          bn: `${lead.bn} ফাঁকটি আমাদের তালিকার কোনো গ্রীষ্মের ফসলের জন্য যথেষ্ট লম্বা নয়।`,
          en: `${lead.en} The gap is too short for any summer crop on our list.` });
      }
    }
  }
  const t = row.boroThirst;
  if (t) {
    const share = pct(t.share);
    const bnPass = t.passes.map(d => `${bnDate(md(d))} ${bnDigits(d.slice(0, 4))}`).join(', ');
    const enPass = t.passes.map(d => `${enDate(md(d))} ${d.slice(0, 4)}`).join(', ');
    const seen = { bn: `ইকোস্ট্রেসের ${bnDigits(t.passes.length)}টি পরিষ্কার দিনের ছবিতে (${bnPass})`, en: `On ECOSTRESS's ${t.passes.length} clear daytime pass${t.passes.length > 1 ? 'es' : ''} (${enPass})` };
    if (t.share >= 0.25) {
      notes.push({ id: 'boroThirst', tone: 'watch',
        bn: `${seen.bn} মার্চ–এপ্রিলে প্রায় ${bnDigits(share)}% সবুজ খেতে পানির টান ছিল। আগামী বোরোতে সময়মতো সেচ দিন: পাইপে পানি মাটির ১৫ সেমি নিচে নামলে (AWD), এবং পাম্পের পালা আগে ঠিক করুন।`,
        en: `${seen.en} in March-April, about ${share}% of the green fields were short of water. Next Boro, irrigate on time (AWD: when the water in the pipe drops 15 cm below the soil) and agree the pump's turns early.` });
    } else if (t.share >= 0.1) {
      notes.push({ id: 'boroThirst', tone: 'info',
        bn: `${seen.bn} মার্চ–এপ্রিলে প্রায় ${bnDigits(share)}% সবুজ খেতে পানির টান ছিল।`,
        en: `${seen.en} in March-April, about ${share}% of the green fields were short of water.` });
    } else {
      notes.push({ id: 'boroThirst', tone: 'good',
        bn: `${seen.bn} মার্চ–এপ্রিলে প্রায় সব সবুজ খেতে পানি ছিল।`,
        en: `${seen.en} in March-April, nearly all green fields had water.` });
    }
  }
  const b = row.boroHarvest;
  if (b) {
    // springs whose first upstream burst came before the day half the Boro is usually cut (the engine's own series)
    const risk = flashFloodRisk(b.half as MonthDay);
    const lost = b.floods.filter(f => f.early >= 10).sort((x, y) => y.early - x.early)[0];
    const sooner = b.trend.p < 0.05 && b.trend.daysPerDecade <= -3 ? Math.round(-b.trend.daysPerDecade) : null;
    notes.push({ id: 'boroFlood', tone: risk && risk.caught / risk.seasons >= FLASH_FLOOD_LIMIT ? 'alert' : 'watch',
      bn: [
        `শুধু বোরো হয় এমন হাওরের জমিতে (প্রায় ${bnDigits(b.km2)} বর্গকিমি) সাধারণত ${bnDate(b.half)} নাগাদ অর্ধেক বোরো কাটা হয় (নাসার MODIS, ২০০১–২০২৫-এর আগাম বন্যাহীন বছর)।`,
        risk ? `${bnDigits(risk.seasons)} বছরের ${bnDigits(risk.caught)} বছরে ওই দিনের আগেই মেঘালয় পাহাড়ে ৩ দিনে ${bnDigits(risk.burstMm)} মিমি বা বেশি বৃষ্টি হয়েছে (নাসার GPM IMERG)।` : '',
        lost ? `${bnDigits(lost.year)} সালে উপগ্রহে ফসল স্বাভাবিকের চেয়ে প্রায় ${bnDigits(lost.early)} দিন আগে মাঠ থেকে হারিয়ে যেতে দেখা গেছে: আগাম বন্যা নিয়ে গেছে।` : '',
        sooner ? `২০০১ থেকে এখানে কাটা প্রতি দশকে প্রায় ${bnDigits(sooner)} দিন এগিয়েছে।` : '',
        'ব্রি-র হাওর পরামর্শ: বোরোর বীজতলা ২৫ অক্টোবর–৭ নভেম্বরে দিন (ব্রি ধান১০২, ১১৮), যাতে এপ্রিলের শুরুতে কাটা যায়।',
      ].filter(Boolean).join(' '),
      en: [
        `On the haor land here that grows only Boro (about ${b.km2} km²), half the Boro is usually cut by about ${enDate(b.half)} (NASA MODIS, the springs of 2001-2025 without a flash flood).`,
        risk ? `In ${risk.caught} of ${risk.seasons} springs, ${risk.burstMm} mm or more of rain fell in 3 days over the Meghalaya hills before that day (NASA GPM IMERG).` : '',
        lost ? `In ${lost.year} the satellite saw the crop gone about ${lost.early} days earlier than usual: the flash flood took it.` : '',
        sooner ? `The harvest here has come about ${sooner} days earlier each decade since 2001.` : '',
        "BRRI's haor guidance: sow the Boro seedbed on 25 October-7 November (BRRI dhan102, dhan118) so the crop is cut in early April.",
      ].filter(Boolean).join(' ') });
  }
  const a = row.amanRecord;
  if (a) {
    const worst = a.weak.slice(0, 3).map(w => w[0]);
    if (worst.length) {
      notes.push({ id: 'amanRecord', tone: 'info',
        bn: `২০০১ থেকে এখানে সবচেয়ে দুর্বল আমন মৌসুম: ${worst.map(y => bnDigits(y)).join(', ')} (নাসার MODIS, মধ্য-সেপ্টেম্বর থেকে অক্টোবর, এই উপজেলার নিজের ধারার তুলনায়)। কারণ পানি হলে ব্রি-র জলমগ্নতা সহনশীল আমন (ব্রি ধান৫১, ৫২, ৭৯; ধান৭৯ প্রায় তিন সপ্তাহ ডুবে টেকে), আর বন্যার পর দেরির বীজতলা (ব্রি ধান৪৬ ১০ আগস্টের মধ্যে; বিআর২২, ২৩ ১৫ আগস্টের মধ্যে) ফসল রক্ষা করে।`,
        en: `The weakest Aman seasons here since 2001: ${worst.join(', ')} (NASA MODIS, mid-September to October, against this upazila's own trend). If water was the cause, BRRI's submergence-tolerant Aman (BRRI dhan51, dhan52, dhan79; dhan79 survives about three weeks under water) and, after a flood, a late seedbed (BRRI dhan46 by 10 August; BR22, BR23 by 15 August) save a crop.` });
    } else {
      notes.push({ id: 'amanRecord', tone: 'good',
        bn: '২০০১ থেকে কোনো আমন মৌসুম এই উপজেলার নিজের ধারার চেয়ে অনেক দুর্বল হয়নি (নাসার MODIS)।',
        en: "No Aman season since 2001 came up much weaker than this upazila's own trend (NASA MODIS)." });
    }
  }
  const s = row.soil;
  if (s) {
    const days = Math.round(s.awcMm30 / 3);    // a winter crop uses about 3 mm a day in November-December
    notes.push({ id: 'soil', tone: 'info',
      bn: `মাটি মূলত ${TEXTURE_BN[s.texture] ?? s.texture} (SoilGrids)। ওপরের ৩০ সেমি প্রায় ${bnDigits(s.awcMm30)} মিমি পানি ধরে রাখে: আমনের পর বোনা রবি ফসল বৃষ্টি ছাড়া প্রায় ${bnDigits(days)} দিন চলে।`,
      en: `The soil is mostly ${s.texture} (SoilGrids). The top 30 cm holds about ${s.awcMm30} mm of water for a crop: a winter crop sown after Aman lasts about ${days} days on it without rain.` });
  }
  // today's greenness first, then what to act on (the haor's flash floods), then what to look at, then context
  const rank = (n: FieldNote) => (n.id === 'condition' ? 0 : n.tone === 'alert' ? 1 : n.tone === 'watch' ? 2 : 3);
  return notes.sort((a, b) => rank(a) - rank(b));
}

/** "a, b and c" (or "a, b ও c") */
const listOf = (items: string[], and: string) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}` : items.join(''));

/**
 * How the condition's method reads the past: the same check run on every Aman season since 2001, at places where the
 * cause is on record, and the years weak seasons were widespread. For the officers' check list.
 */
export function conditionTrackRecord(): { bn: string; en: string } | null {
  const r = fieldConditionsData()?.amanRecord;
  if (!r) return null;
  const span = (ys: number[]) => (ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : `${ys[0]}`);
  const caught = r.checks.filter(c => c.caught);
  const missed = r.checks.filter(c => !c.caught);
  const n = Number(r.seasons.slice(5)) - Number(r.seasons.slice(0, 4)) + 1;
  return {
    bn: [
      `একই যাচাই গত ${bnDigits(n)}টি আমন মৌসুমে চালালে ধরা পড়ে ${caught.map(c => `${c.name} ${bnDigits(span(c.years))} (${c.event.bn})`).join('; ')}।`,
      r.widespread.length ? `দেশজুড়ে দুর্বল আমন: ${listOf(r.widespread.map(y => bnDigits(y)), 'ও')}।` : '',
      missed.length ? `ধরা পড়েনি: ${missed.map(c => `${c.name} ${bnDigits(span(c.years))} (${c.event.bn})`).join('; ')}।` : '',
    ].filter(Boolean).join(' '),
    en: [
      `The same check run on the past ${n} Aman seasons marks ${caught.map(c => `${c.name} in ${span(c.years)} (${c.event.en})`).join('; ')}.`,
      r.widespread.length ? `Weak seasons were widespread in ${listOf(r.widespread.map(String), 'and')}.` : '',
      missed.length ? `It misses ${missed.map(c => `${c.name} in ${span(c.years)} (${c.event.en})`).join('; ')}.` : '',
    ].filter(Boolean).join(' '),
  };
}

/** Everything the overview shows for one upazila: the reading's dates, the row, the plain words and the chart. */
export function fieldConditionsView(id: string, opts: { landType?: string | null } = {}) {
  const d = fieldConditionsData();
  const row = d?.upazilas[id];
  if (!d || !row) return null;
  return { id, now: d.now, row, notes: fieldNotes(id, opts), curve: fieldCurveFor(id), sources: d.sources, method: d.method };
}
