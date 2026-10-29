/**
 * Field Shift's questions for every rotation compared: why it was suggested, what evidence supports it, what benefits
 * it may offer, where information gaps exist and which risks need local review by farmers or agricultural experts.
 * The answers are built from the option's own numbers (its scores, ledger, provenance and confidence) read against a
 * reference rotation: the farmer's own when they gave it, else what most farmers at the place grow, else Boro.
 *
 * Also here: when each rotation's crops meet heat, cold and heavy rain and when its soil lies bare (the place's NASA
 * season calendar laid over the rotation's field days), and a rough what-if for a drier or wetter, warmer year.
 */
import type {
  CandidateRotation,
  CropRoleId,
  OptionReview,
  ReviewLine,
  SeasonRisk,
  SeasonRiskMonth,
  WhatIfResult,
} from '@project-eden/contracts';
import { bnDecimal, bnDigits, bnMonth, enMonth } from './bn.ts';
import { calendarFile, calendarHere, greennessHere } from './data/season_calendar.ts';
import { CROP_TRAITS, DEEP_ROOT_M, LOW_WATER_MM, ROLE_TEXT, TRAITS_SOURCE } from './data/crop_traits.ts';
import { CHOICE_BY_ID } from './data/crop_choice.ts';
import { LOC } from './data/location.ts';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
/** Crop-year order: July to June. */
const YEAR_MONTHS = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];

/** A crop's days in the field, from its sowing or transplanting (season day: 0 = 1 July). */
export interface FieldSpan {
  id: string;
  bn: string;
  en: string;
  start: number;
  days: number;
  rice: boolean;
  irrigationMm: number;
  cropWaterUseMm: number | null;
}

/** Calendar month (0 = January) of a season day (0 = 1 July). */
function monthOf(seasonDay: number): number {
  const doy = (((seasonDay % 365) + 365) % 365 + 181) % 365;
  let m = 11;
  while (MONTH_START[m] > doy) m--;
  return m;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// Month flags: a hazard counts when the month's average reaches these (days a year in that month)
const FLAG = { heat: 3, cold: 5, frost: 0.5, heavy: 1, bareRain: 1, dry: 15 };

/**
 * The place's season calendar laid over a rotation's field days: per month, how much of it holds a crop and the
 * hazards that matter for what is there; per crop, the hazard days it meets; and the erosive rain on bare soil.
 */
export function seasonRisk(spans: FieldSpan[]): SeasonRisk | null {
  const cal = calendarHere();
  if (!cal) return null;
  const m = cal.months;
  const owner: Array<FieldSpan | null> = new Array(365).fill(null);
  for (const s of spans) {
    for (let d = 0; d < s.days; d++) {
      const day = (s.start + d) % 365;
      owner[day] ??= s;
    }
  }
  const perDay = (arr: number[], month: number) => arr[month] / DAYS_IN_MONTH[month];
  const ndvi = greennessHere()?.recent ?? null;

  const crops = spans.map(s => {
    let hot = 0, cold = 0, heavy = 0, rain = 0;
    const flagged = new Set<number>();
    for (let d = 0; d < s.days; d++) {
      const mo = monthOf(s.start + d);
      hot += perDay(m.hotDays, mo);
      cold += perDay(m.coldNights, mo);
      heavy += perDay(m.heavyRainDays, mo);
      rain += perDay(m.rainMm, mo);
    }
    return { span: s, id: s.id, cropBangla: s.bn, cropEnglish: s.en, hotDays: round1(hot), coldNights: round1(cold), heavyRainDays: round1(heavy), flagged, rainMm: Math.round(rain) };
  });

  let bareDays = 0, bareErosive = 0, bareHeavy = 0;
  for (let day = 0; day < 365; day++) {
    if (owner[day]) continue;
    const mo = monthOf(day);
    bareDays += 1;
    bareErosive += perDay(m.erosiveRainDays, mo);
    bareHeavy += perDay(m.heavyRainDays, mo);
  }

  const months: SeasonRiskMonth[] = YEAR_MONTHS.map(month => {
    const first = (MONTH_START[month] - 181 + 365) % 365;
    const held = new Map<FieldSpan, number>();
    for (let d = 0; d < DAYS_IN_MONTH[month]; d++) {
      const o = owner[(first + d) % 365];
      if (o) held.set(o, (held.get(o) ?? 0) + 1);
    }
    const heldDays = [...held.values()].reduce((a, b) => a + b, 0);
    const main = [...held.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const cropShare = heldDays / DAYS_IN_MONTH[month];
    const flags: string[] = [];
    if (main && cropShare >= 0.5) {
      if (m.hotDays[month] >= FLAG.heat) flags.push('heat');
      if (main.rice && m.coldNights[month] >= FLAG.cold) flags.push('cold');
      if (m.nearFrostNights[month] >= FLAG.frost) flags.push('frost');
      if (!main.rice && m.heavyRainDays[month] >= FLAG.heavy) flags.push('heavy_rain');
      if (main.id === 'aman' && m.dryDays[month] >= FLAG.dry) flags.push('dry');
      if (flags.length) crops.find(c => c.span === main)?.flagged.add(month);
    } else if (m.erosiveRainDays[month] >= FLAG.bareRain) {
      flags.push('bare_rain');
    }
    return {
      month,
      cropShare: Math.round(cropShare * 100) / 100,
      cropId: main?.id ?? null,
      hotDays: m.hotDays[month],
      coldNights: m.coldNights[month],
      heavyRainDays: m.heavyRainDays[month],
      erosiveRainDays: m.erosiveRainDays[month],
      dryDays: m.dryDays[month],
      rootWet: m.rootWet[month],
      ndvi: ndvi ? ndvi[month] : null,
      flags,
    };
  });

  return {
    months,
    bareDays,
    bareErosiveRainDays: round1(bareErosive),
    bareHeavyRainDays: round1(bareHeavy),
    crops: crops.map(c => ({
      id: c.id, cropBangla: c.cropBangla, cropEnglish: c.cropEnglish, hotDays: c.hotDays, coldNights: c.coldNights,
      heavyRainDays: c.heavyRainDays, months: [...c.flagged], irrigationMm: c.span.irrigationMm,
      cropWaterUseMm: c.span.cropWaterUseMm, rainMm: c.rainMm,
    })),
    source: `NASA POWER (station-corrected) and GPM IMERG Final, ${calendarFile().seasons}, ${LOC.kind === 'pilot' ? 'Talanda pilot point' : `${LOC.district} district point`}; research/explore/season_calendar.py`,
  };
}

// ---------------------------------------------------------------------------
// Crop roles
// ---------------------------------------------------------------------------

/** Which roles the rotation's crops play: nitrogen-fixing, deep-rooting, needing little water here, cover, fodder. */
export function cropRoles(option: CandidateRotation): OptionReview['roles'] {
  const ids = option.cropIds ?? [];
  const risk = option.seasonRisk;
  const roles = new Map<CropRoleId, string[]>();
  const add = (role: CropRoleId, id: string) => roles.set(role, [...(roles.get(role) ?? []), id]);
  for (const id of ids) {
    const crop = CHOICE_BY_ID[id];
    const traits = CROP_TRAITS[id];
    if (crop?.isLegume) add('nitrogen', id);
    if (traits?.rootDepthM && traits.rootDepthM[1] >= DEEP_ROOT_M) add('deep_root', id);
    const irr = risk?.crops.find(c => c.id === id)?.irrigationMm;
    if (id !== 'aman' && !crop?.isRice && irr !== undefined && irr < LOW_WATER_MM) add('drought', id);
    if (traits?.coversPreMonsoon) add('cover', id);
    if (crop?.fodderValue === 'high' || id === 'aman') add('fodder', id);
  }
  return [...roles.entries()].map(([id, cropIds]) => ({ id, cropIds }));
}

// ---------------------------------------------------------------------------
// The review
// ---------------------------------------------------------------------------

export interface ReviewContext {
  priorities: Record<string, number | undefined>;
  constraints?: { machinery?: 'hand' | 'hire' | 'own'; market?: 'village' | 'town' };
  landTypeAssumed: boolean;
  soilCard: boolean;
  defaultPriorities: boolean;
  groundwaterFalling: boolean;
}

const DIM: Record<string, [string, string]> = {
  water: ['পানি', 'Water'], heat: ['তাপ', 'Heat'], flood: ['বন্যা', 'Flood'], soil: ['মাটি', 'Soil'],
  fodder: ['গোখাদ্য', 'Fodder'], income: ['আয়', 'Income'], pest: ['বালাই', 'Pests'],
};
const KIND: Record<string, [string, string]> = { measured: ['মাপা', 'measured'], modeled: ['মডেল', 'modelled'], assumed: ['অনুমান', 'assumed'] };
const CONF: Record<string, [string, string]> = { high: ['আস্থা বেশি', 'high confidence'], medium: ['আস্থা মাঝারি', 'medium confidence'], low: ['আস্থা কম', 'low confidence'], uncertain: ['অনিশ্চিত', 'uncertain'] };
const MAX_LINES = 6;

const cropBn = (id: string) => (id === 'aman' ? 'আমন ধান' : CHOICE_BY_ID[id]?.cropBangla ?? id);
const cropEn = (id: string) => (id === 'aman' ? 'Aman rice' : CHOICE_BY_ID[id]?.crop ?? id);
const pct = (x: number) => Math.round(x * 100);
const line = (bn: string, en: string, source?: string): ReviewLine => (source ? { bn, en, source } : { bn, en });
const monthsBn = (ms: number[]) => ms.map(m => bnMonth(m)).join(', ');
const monthsEn = (ms: number[]) => ms.map(m => enMonth(m)).join(', ');

/** The option every other one is read against: the farmer's own rotation, else the usual one here, else Boro. */
export function referenceOf(options: CandidateRotation[]): CandidateRotation | null {
  return options.find(o => o.farmerCurrent) ?? options.find(o => o.currentPractice) ?? options.find(o => o.isBaseline) ?? null;
}

function whyLines(o: CandidateRotation, ref: CandidateRotation | null, n: number, ctx: ReviewContext, roles: OptionReview['roles']): ReviewLine[] {
  const out: ReviewLine[] = [];
  if (o.farmerCurrent) out.push(line('এটি আপনার এখনকার চক্র: অন্য সব বিকল্প এর সাথে তুলনা করা হয়েছে।', 'This is the rotation you grow now: every other option is read against it.'));
  else if (o.currentPractice) out.push(line('এখানে বেশিরভাগ কৃষক এখন এটাই করেন (BRRI ২০১৪-১৫ জরিপ)।', 'Most farmers here grow this now (BRRI 2014-15 survey).'));
  else if (o.isBaseline) out.push(line('প্রচলিত বোরো চক্র: পানির হিসাবের তুলনার জন্য রাখা।', 'The usual Boro rotation, kept to compare water use.'));
  out.push(line(
    `আপনার অগ্রাধিকারে ${bnDigits(n)}টির মধ্যে ${bnDigits(o.rank)} নম্বরে (মোট স্কোর ${bnDigits(pct(o.totalWeightedScore))}%)।`,
    `Ranked ${o.rank} of ${n} on the farmer's priorities (total score ${pct(o.totalWeightedScore)}%).`,
  ));
  const weight = (d: string) => ctx.priorities[d] ?? 0.05;
  const dims = Object.keys(o.scores).sort((a, b) => weight(b) * o.scores[b] - weight(a) * o.scores[a]);
  if (ref && ref.id !== o.id) {
    const ahead = dims.filter(d => o.scores[d] - (ref.scores[d] ?? 0) >= 0.05).slice(0, 2);
    const behind = dims.filter(d => (ref.scores[d] ?? 0) - o.scores[d] >= 0.05).sort((a, b) => weight(b) - weight(a)).slice(0, 1);
    const refBn = ref.farmerCurrent ? 'আপনার চক্রের' : 'প্রচলিত চক্রের';
    const refEn = ref.farmerCurrent ? 'your rotation' : 'the usual rotation';
    if (ahead.length) out.push(line(
      `এগিয়ে: ${ahead.map(d => `${DIM[d]?.[0] ?? d} ${bnDigits(pct(o.scores[d]))} (${refBn} ${bnDigits(pct(ref.scores[d] ?? 0))})`).join('; ')}।`,
      `Ahead on ${ahead.map(d => `${(DIM[d]?.[1] ?? d).toLowerCase()} ${pct(o.scores[d])} (${refEn} ${pct(ref.scores[d] ?? 0)})`).join('; ')}.`,
    ));
    if (behind.length) out.push(line(
      `পিছিয়ে: ${behind.map(d => `${DIM[d]?.[0] ?? d} ${bnDigits(pct(o.scores[d]))} (${refBn} ${bnDigits(pct(ref.scores[d] ?? 0))})`).join('; ')}।`,
      `Behind on ${behind.map(d => `${(DIM[d]?.[1] ?? d).toLowerCase()} ${pct(o.scores[d])} (${refEn} ${pct(ref.scores[d] ?? 0)})`).join('; ')}.`,
    ));
  } else {
    const best = dims.slice(0, 2);
    out.push(line(`সবচেয়ে ভালো দিক: ${best.map(d => `${DIM[d]?.[0] ?? d} ${bnDigits(pct(o.scores[d]))}`).join(', ')}।`, `Strongest on ${best.map(d => `${(DIM[d]?.[1] ?? d).toLowerCase()} ${pct(o.scores[d])}`).join(', ')}.`));
  }
  for (const r of roles.filter(r => r.id !== 'fodder').slice(0, 2)) {
    out.push(line(`${r.cropIds.map(cropBn).join(', ')}: ${ROLE_TEXT[r.id].bn}।`, `${r.cropIds.map(cropEn).join(', ')}: ${ROLE_TEXT[r.id].en.toLowerCase()}.`, r.id === 'deep_root' ? TRAITS_SOURCE : undefined));
  }
  return out.slice(0, MAX_LINES);
}

function evidenceLines(o: CandidateRotation, ctx: ReviewContext): ReviewLine[] {
  const weight = (d: string) => ctx.priorities[d] ?? 0.05;
  const seen = new Set<string>();
  const out: ReviewLine[] = [];
  for (const d of Object.keys(o.dimensionDetails).sort((a, b) => weight(b) - weight(a))) {
    const p = o.dimensionDetails[d]?.provenance;
    if (!p || seen.has(p.source)) continue;
    seen.add(p.source);
    const kind = KIND[p.measuredOrModeled] ?? [p.measuredOrModeled, p.measuredOrModeled];
    const conf = CONF[o.dimensionDetails[d].confidence] ?? ['', ''];
    out.push(line(`${DIM[d]?.[0] ?? d}: ${p.source} (${p.timePeriod}; ${kind[0]}, ${conf[0]})`, `${DIM[d]?.[1] ?? d}: ${p.source} (${p.timePeriod}; ${kind[1]}, ${conf[1]})`, p.source));
  }
  const top = out.slice(0, MAX_LINES - 2);
  const risk = o.seasonRisk;
  if (risk) {
    top.push(line(
      `মাসভিত্তিক ঝুঁকি: ফসল জমিতে থাকার দিনে গরম, শীত ও ভারী বৃষ্টি; জমি খালি থাকে বছরে ${bnDigits(risk.bareDays)} দিন, তাতে গড়ে ${bnDecimal(risk.bareErosiveRainDays)} দিন মাটি-ধোয়া বৃষ্টি।`,
      `Month by month: heat, cold and heavy rain on the crops' field days; the field is bare ${risk.bareDays} days a year and meets ${risk.bareErosiveRainDays} days of soil-moving rain on them.`,
      risk.source,
    ));
  }
  if (greennessHere()) {
    top.push(line('নাসা MODIS NDVI (২০২১–২৫): উপজেলার কেন্দ্রের জমি কোন মাসে সবুজ, কোন মাসে খালি, তা সময়রেখায় দেখানো আছে।', 'NASA MODIS NDVI (2021-25): the months the land at the upazila centre is green or bare are on the timeline.', 'NASA MODIS MOD13Q1 v061 via AppEEARS'));
  }
  return top;
}

function benefitLines(o: CandidateRotation, ref: CandidateRotation | null, roles: OptionReview['roles']): ReviewLine[] {
  const out: ReviewLine[] = [];
  if (!ref || ref.id === o.id) {
    out.push(line('চেনা ফসল: নতুন বীজ, যন্ত্র বা ক্রেতা লাগে না।', 'Familiar crops: no new seed, tools or buyers needed.'));
    const fields = roles.filter(r => r.id !== 'fodder').map(r => `${r.cropIds.map(cropBn).join(', ')} ${ROLE_TEXT[r.id].bn}`);
    if (fields.length) out.push(line(`${fields.join('; ')}।`, `${roles.filter(r => r.id !== 'fodder').map(r => `${r.cropIds.map(cropEn).join(', ')}: ${ROLE_TEXT[r.id].en.toLowerCase()}`).join('; ')}.`));
    return out;
  }
  const a = o.ledger, b = ref.ledger;
  if (a && b) {
    const water = b.groundwaterPumpedM3PerHa - a.groundwaterPumpedM3PerHa;
    if (water >= 200) out.push(line(`বছরে হেক্টরে প্রায় ${bnDigits(Math.round(water / 100) * 100)} ঘনমিটার কম ভূগর্ভস্থ পানি তোলা লাগে।`, `About ${Math.round(water / 100) * 100} m³/ha less groundwater pumped a year.`, 'replay net irrigation (NASA POWER ET0, GPM IMERG)'));
    if (a.ureaKgHa !== null && b.ureaKgHa !== null && b.ureaKgHa - a.ureaKgHa >= 20) out.push(line(`পুরো চক্রে হেক্টরে প্রায় ${bnDigits(b.ureaKgHa - a.ureaKgHa)} কেজি কম ইউরিয়া।`, `About ${b.ureaKgHa - a.ureaKgHa} kg/ha less urea over the rotation.`, 'SRDI soil card'));
    if (a.legume && !b.legume) out.push(line('ডাল ফসল মাটিতে নাইট্রোজেন যোগ করে, পরের ফসলে সার কম লাগে।', 'A legume adds nitrogen, so the next crop needs less fertilizer.'));
    if (b.floodedRiceDays - a.floodedRiceDays >= 30) out.push(line(`জলাবদ্ধ ধানের দিন ${bnDigits(b.floodedRiceDays - a.floodedRiceDays)}টি কম: মিথেন কম, মাটির গঠন ভালো থাকে।`, `${b.floodedRiceDays - a.floodedRiceDays} fewer days of flooded rice: less methane, better soil structure.`));
  }
  const ra = o.seasonRisk, rb = ref.seasonRisk;
  if (ra && rb && rb.bareErosiveRainDays - ra.bareErosiveRainDays >= 0.5) {
    out.push(line(`খালি মাটিতে মাটি-ধোয়া বৃষ্টি বছরে ${bnDecimal(rb.bareErosiveRainDays - ra.bareErosiveRainDays)} দিন কম: ক্ষয় কম।`, `${round1(rb.bareErosiveRainDays - ra.bareErosiveRainDays)} fewer days of soil-moving rain on bare soil a year: less erosion.`, ra.source));
  }
  const crops = (o.cropIds ?? []).length - (ref.cropIds ?? []).length;
  if (crops > 0) out.push(line('বছরে একটি ফসল বেশি: বাড়তি আয়ের সুযোগ।', 'One more crop a year: a chance of extra income.'));
  for (const [d, bn, en] of [['income', 'আয়ের স্কোর বেশি (নমুনা হিসাব)', 'higher income score (an estimate)'], ['pest', 'বালাই চাপ কম: ভিন্ন পরিবারের ফসল পোকার চক্র ভাঙে', 'lower pest pressure: a crop of another family breaks pest cycles'], ['heat', 'ফুল আসার সময় গরম কম', 'less heat at flowering'], ['fodder', 'গোখাদ্য বেশি', 'more fodder']] as const) {
    const diff = (o.scores[d] ?? 0) - (ref.scores[d] ?? 0);
    if (diff >= 0.1) out.push(line(`${bn} (${bnDigits(pct(o.scores[d]))} বনাম ${bnDigits(pct(ref.scores[d] ?? 0))})।`, `${en[0].toUpperCase()}${en.slice(1)} (${pct(o.scores[d])} vs ${pct(ref.scores[d] ?? 0)}).`));
  }
  if (!out.length) out.push(line('আপনার চক্রের চেয়ে বড় কোনো লাভ নেই; অগ্রাধিকার বদলালে ক্রম বদলাতে পারে।', 'No large gain over the reference; other priorities may change the order.'));
  return out.slice(0, MAX_LINES);
}

/** What is missing behind a weak dimension, in English (the Bangla is the plugin's own provenance note). */
function gapEnglish(d: string, metrics: Record<string, unknown>): string {
  switch (d) {
    case 'flood': return metrics.floodModelled ? 'flash-flood risk from upstream rain only; check it against FFWC river levels' : 'river floods are not modelled; only the land-type class is used';
    case 'fodder': return 'cattle density is measured (FAO GLW4, 2015); the residue classes are team estimates';
    case 'pest': return `${metrics.partial ? 'partial (no soil card, no nitrogen term); ' : ''}IPM rules, not pest counts: officers' field observations will replace them`;
    case 'income': return 'prices and costs are estimates (BBS and team), not verified market prices; farmer cost interviews pending';
    case 'soil': return 'no SRDI soil card here, so no fertilizer amounts';
    default: return 'low confidence';
  }
}

function gapLines(o: CandidateRotation, ctx: ReviewContext): ReviewLine[] {
  const out: ReviewLine[] = [];
  for (const id of o.cropIds ?? []) {
    const crop = CHOICE_BY_ID[id];
    if (crop && /no price/.test(crop.incomeSource)) out.push(line(`${crop.cropBangla}-এর দাম ও খরচের তথ্য নেই: আয়ের স্কোর মাঝামাঝি ধরা।`, `No price and cost data for ${crop.crop.toLowerCase()}: its income score is held neutral.`));
  }
  // Weakest first, the farmer's priorities breaking ties
  const weight = (d: string) => ctx.priorities[d] ?? 0.05;
  const weakness = (c: string) => ({ uncertain: 0, low: 1, medium: 2, high: 3 }[c] ?? 2);
  const dims = Object.entries(o.dimensionDetails).sort(([a, x], [b, y]) => weakness(x.confidence) - weakness(y.confidence) || weight(b) - weight(a));
  for (const [d, detail] of dims) {
    const partial = Boolean(detail.metrics?.partial);
    const weak = detail.confidence === 'low' || detail.confidence === 'uncertain';
    if (!(partial || weak || detail.staleOrMissing || detail.provenance.measuredOrModeled === 'assumed')) continue;
    const bn = detail.provenance.notesBangla ?? (partial ? 'মাটির কার্ড নেই, তাই আংশিক' : 'অনুমিত মান');
    out.push(line(`${DIM[d]?.[0] ?? d}: ${bn.replace(/।$/, '')}।`, `${DIM[d]?.[1] ?? d}: ${gapEnglish(d, detail.metrics)}.`, detail.provenance.source));
  }
  if (ctx.landTypeAssumed) {
    out.push(ctx.soilCard
      ? line('জমির ধরন ইউনিয়নের SRDI কার্ডের সাধারণ জমি ধরা; আপনার জমি আলাদা হতে পারে।', 'Land type is the union\'s usual land on the SRDI card; this field may differ.')
      : line('জমির ধরন উপজেলার সাধারণ জমি ধরা (NASADEM ও ল্যান্ডস্যাট); আপনার জমি আলাদা হতে পারে।', 'Land type is the upazila\'s usual land (NASADEM and Landsat); this field may differ.'));
  }
  if (!ctx.soilCard) out.push(line('এই এলাকার SRDI মাটির কার্ড নেই: সারের পরিমাণ দেওয়া হয়নি।', 'No SRDI soil card here: no fertilizer amounts are given.'));
  if (ctx.defaultPriorities) out.push(line('অগ্রাধিকার এখনো ডিফল্ট: কৃষক নিজের অগ্রাধিকার দিলে ক্রম বদলাতে পারে।', 'Priorities are still the defaults: the farmer\'s own may change the order.'));
  out.push(line('নাসার তথ্য একটি গ্রিড বা পিক্সেলের, একটি জমির নয়।', 'NASA data describe a grid cell or pixel, not this one field.'));
  return out.slice(0, MAX_LINES + 2);
}

function checkLines(o: CandidateRotation, ref: CandidateRotation | null, ctx: ReviewContext): ReviewLine[] {
  const out: ReviewLine[] = [];
  const known = new Set(ref && ref.id !== o.id ? ref.cropIds ?? [] : []);
  const ids = [...(o.cropIds ?? [])].sort((a, b) => Number(known.has(a)) - Number(known.has(b)));
  for (const id of ids) {
    const t = CROP_TRAITS[id];
    if (!t) continue;
    for (const need of [t.water, t.machine, t.townMarket, t.storage, t.seed, t.risk, t.labour]) {
      if (need) out.push(line(`${cropBn(id)}: ${need[0]}।`, `${cropEn(id)}: ${need[1]}.`, TRAITS_SOURCE));
    }
  }
  const risk = o.seasonRisk;
  for (const c of risk?.crops ?? []) {
    const hot = risk!.months.filter(mo => c.months.includes(mo.month) && mo.flags.includes('heat')).map(mo => mo.month);
    if (hot.length) out.unshift(line(`${c.cropBangla}: ${monthsBn(hot)}-এ গরম (৩৬°সে+), জমিতে থাকার দিনে গড়ে ${bnDecimal(c.hotDays)} দিন।`, `${c.cropEnglish}: heat (36 °C+) in ${monthsEn(hot)}, ${c.hotDays} days on average while in the field.`, risk!.source));
    const cold = risk!.months.filter(mo => c.months.includes(mo.month) && mo.flags.includes('cold')).map(mo => mo.month);
    if (cold.length) out.unshift(line(`${c.cropBangla}: ${monthsBn(cold)}-এ শীত (১০°সে বা কম), গড়ে ${bnDecimal(c.coldNights)} রাত।`, `${c.cropEnglish}: cold (10 °C or less) in ${monthsEn(cold)}, ${c.coldNights} nights on average.`, risk!.source));
  }
  if (risk && risk.bareErosiveRainDays >= 2) {
    const bare = risk.months.filter(mo => mo.flags.includes('bare_rain')).map(mo => mo.month);
    out.push(line(
      `${monthsBn(bare)}-এ জমি খালি, বছরে গড়ে ${bnDecimal(risk.bareErosiveRainDays)} দিন মাটি-ধোয়া বৃষ্টি: ধৈঞ্চা বা মুগ দিয়ে মাটি ঢাকা যায় কি না দেখুন।`,
      `Field bare in ${monthsEn(bare)} with ${risk.bareErosiveRainDays} days of soil-moving rain a year: see whether dhaincha or mungbean can cover it.`,
      risk.source,
    ));
  }
  if ((o.scores.heat ?? 1) < 0.5) out.push(line('ফুল আসার সময় গরমের ঝুঁকি: সময়মতো বোনা যাবে কি না কৃষি কর্মকর্তার সাথে দেখুন।', 'Heat risk at flowering: check with the officer that it can be sown on time.'));
  if ((o.scores.flood ?? 1) < 0.6) out.push(line('বন্যা বা জলাবদ্ধতার ঝুঁকি: জমির উচ্চতা ও পানি নামার পথ নিজে দেখুন।', 'Flood or waterlogging risk: check the field\'s height and drainage yourself.'));
  if (ctx.groundwaterFalling && (o.cropIds ?? []).some(id => id === 'boro' || id === 'boro_early')) {
    out.push(line('এখানে ভূগর্ভস্থ পানি নামছে (নাসা GRACE/GLDAS): নলকূপের নিয়ম ও সেচের খরচ যাচাই করুন।', 'Groundwater is falling here (NASA GRACE/GLDAS): check tube-well rules and irrigation costs.', 'NASA GLDAS-2.2 (GRACE-assimilated)'));
  }
  return out.slice(0, MAX_LINES);
}

function constraintLines(o: CandidateRotation, ctx: ReviewContext): ReviewLine[] {
  const out: ReviewLine[] = [];
  for (const id of o.cropIds ?? []) {
    const t = CROP_TRAITS[id];
    if (!t) continue;
    if (ctx.constraints?.machinery === 'hand' && t.machine) out.push(line(`${cropBn(id)}-এ ${t.machine[0]} লাগে, আপনার যন্ত্র নেই বলেছেন।`, `${cropEn(id)} needs ${t.machine[1]}; the farmer has no machines.`));
    if (ctx.constraints?.market === 'village' && t.townMarket) out.push(line(`${cropBn(id)}: ${t.townMarket[0]}; আপনি গ্রামের হাটে বিক্রি করেন বলেছেন।`, `${cropEn(id)}: ${t.townMarket[1]}; the farmer sells at the village market.`));
  }
  return out;
}

/** Fills each option's review, read against the reference (see referenceOf). */
export function reviewOptions(options: CandidateRotation[], ctx: ReviewContext): CandidateRotation | null {
  const ref = referenceOf(options);
  for (const o of options) {
    const roles = cropRoles(o);
    o.review = {
      referenceId: ref?.id ?? null,
      why: whyLines(o, ref, options.length, ctx, roles),
      evidence: evidenceLines(o, ctx),
      benefits: benefitLines(o, ref, roles),
      gaps: gapLines(o, ctx),
      checks: checkLines(o, ref, ctx),
      roles,
      constraintFlags: constraintLines(o, ctx),
    };
  }
  return ref;
}

// ---------------------------------------------------------------------------
// What-if
// ---------------------------------------------------------------------------

/** Evapotranspiration rises about 3 per cent per degree of warming (FAO-56 Penman-Monteith sensitivity, humid tropics). */
const ET_PER_C = 0.03;
/** Share of a change in rain that the crop can use (the rest runs off or drains). */
const RAIN_USED = 0.8;
const RAIN_STEPS = [-20, -10, 0, 10, 20];

/**
 * The same rotations in a drier or wetter, warmer year, from the place's calendar: irrigation moves with crop water
 * use (about 3% per degree) and with the rain that falls while each crop stands (80% of it usable); hot days come
 * from the calendar's own counts at 1-3 C warmer; erosive rain from its counts with 10-20% lighter or heavier rain.
 * A rough guide only: the 25-season daily replay is not re-run, and Aman's rescue water is not in it.
 */
export function whatIf(options: CandidateRotation[], rainPct: number, warmingC: number): WhatIfResult | null {
  const cal = calendarHere();
  if (!cal) return null;
  const rain = Math.max(-20, Math.min(20, Math.round(rainPct / 10) * 10));
  const warm = Math.max(0, Math.min(3, Math.round(warmingC)));
  const hotBy = warm ? cal.warmer[`+${warm}`] : cal.months.hotDays;
  const erosiveBy = rain ? cal.erosiveRainScaled[`${rain > 0 ? '+' : ''}${rain}`] : cal.months.erosiveRainDays;
  return {
    rainPct: rain,
    warmingC: warm,
    method: 'Irrigation: replay net irrigation + 3%/°C of crop water use - 80% of the change in rain while the crop stands; hot days (36 °C+) and erosive rain (23 mm+) from the calendar\'s counts at the shifted thresholds. Not a re-run of the 25-season replay; Aman rescue water excluded.',
    options: options.map(o => {
      const r = o.seasonRisk;
      const crops = (r?.crops ?? []).filter(c => c.id !== 'aman');
      const irrigationMm = crops.reduce((s, c) => s + c.irrigationMm, 0);
      const scenario = crops.reduce((s, c) => s + Math.max(0, c.irrigationMm + (c.cropWaterUseMm ?? 0) * ET_PER_C * warm - RAIN_USED * c.rainMm * rain / 100), 0);
      let hot = 0, hotScen = 0, bare = 0, bareScen = 0;
      for (const mo of r?.months ?? []) {
        const share = mo.cropShare;
        hot += share * cal.months.hotDays[mo.month];
        hotScen += share * hotBy[mo.month];
        bare += (1 - share) * cal.months.erosiveRainDays[mo.month];
        bareScen += (1 - share) * erosiveBy[mo.month];
      }
      return {
        id: o.id,
        irrigationMm: Math.round(irrigationMm),
        irrigationMmScenario: Math.round(scenario),
        hotDaysInField: round1(hot),
        hotDaysInFieldScenario: round1(hotScen),
        bareErosiveRainDays: round1(bare),
        bareErosiveRainDaysScenario: round1(bareScen),
      };
    }),
  };
}

export const WHAT_IF_STEPS = { rainPct: RAIN_STEPS, warmingC: [0, 1, 2, 3] };

export const DISCLAIMER = {
  bn: 'এই সরঞ্জাম কৃষকের সিদ্ধান্তে সাহায্য করে, বদলে দেয় না: নাসার তথ্য একটি এলাকার গড়, আপনার জমির খবর আপনি ও আপনার উপসহকারী কৃষি কর্মকর্তাই সবচেয়ে ভালো জানেন। নতুন ফসলে যাওয়ার আগে তাঁর সাথে কথা বলুন।',
  en: 'This tool supports, and does not replace, the farmer\'s judgment: NASA data describe an area, and the farmer and their Sub-Assistant Agriculture Officer know the field best. Talk to the officer before switching crops.',
};
