import type { CandidateRotation, CurrentPracticeReference, ReviewLine } from '@project-eden/contracts';
import type { PlanOptionsRequest } from './engine.ts';
import { AMAN_CATALOG, ILLUSTRATIVE_AMAN_GROSS_MARGIN_TK_PER_HA } from './data/crop_catalog.ts';
import { LOC } from './data/location.ts';
import { landRules } from './data/land.ts';
import { localReturn } from './plugins/income.ts';
import { bnDigits, bnNumber } from './bn.ts';

/** A no-winter/no-summer-crop practice is a reference, not a candidate with made-up soil/pest scores.
 * Only planted-crop irrigation and crop returns are counted; fallow's other costs/benefits are unknown. */
export function fallowReference(request: PlanOptionsRequest): CurrentPracticeReference | null {
  const cur = request.currentRotation;
  if (String(cur?.winter).toLowerCase() !== 'fallow') return null;
  if (cur?.summer && String(cur.summer).toLowerCase() !== 'fallow') return null;
  const monsoon = String(cur?.monsoon ?? 'aman').toLowerCase();
  if (!['aman', 'fallow'].includes(monsoon)) return null;
  if (monsoon === 'aman' && !landRules(request.landType).aman) return null;
  const variety = monsoon === 'aman' ? request.currentAmanCrop ?? 'BRRI dhan49' : null;
  const aman = variety ? LOC.aman[variety] : null;
  const name = variety ? AMAN_CATALOG[variety] : null;
  if (variety && (!aman || !name)) return null;
  const assumed = Boolean(variety && !request.currentAmanCrop);
  return {
    id: variety ? `reference_${variety.replace(/\s+/g, '_').toLowerCase()}_fallow` : 'reference_all_fallow',
    kind: 'unranked_fallow_reference',
    nameBangla: `${name?.varietyBangla ?? 'বর্ষায় পতিত'} → শীতে পতিত → গ্রীষ্মে পতিত`,
    nameEnglish: `${variety ?? 'Monsoon fallow'} -> winter fallow -> summer fallow`,
    amanVariety: variety, amanVarietyAssumed: assumed, cropIds: variety ? ['aman'] : [],
    irrigationExcludingAmanMm: 0, winterCropNetReturnBdtPerHa: 0,
    illustrativeAnnualNetReturnBdtPerHa: variety ? localReturn('aman', ILLUSTRATIVE_AMAN_GROSS_MARGIN_TK_PER_HA).margin : 0,
    amanRescueSeasons: aman?.rescueSeasons ?? null, replaySeasons: aman?.totalSeasons ?? null,
    note: {
      bn: `আপনার চাষের সাথে তুলনা; স্কোর দিয়ে ক্রমে রাখা হয়নি। শীত ও গ্রীষ্মে ফসল নেই, তাই ওই ফসলের সেচ ও আয় শূন্য। আমনের সম্পূরক সেচের পরিমাণ ধরা হয়নি। জমি পতিত রাখার অন্যান্য খরচ বা লাভ জানা নেই।${assumed ? ' আমনের জাত বলা হয়নি: তুলনার জন্য ব্রি ধান৪৯ ধরা হয়েছে।' : ''}`,
      en: `Your stated practice, shown without a ranking score. No winter or summer crop means zero irrigation and crop return for those crops. Aman rescue-irrigation volume is excluded. Other costs or benefits of leaving land fallow are unknown.${assumed ? ' Aman variety was not supplied: BRRI dhan49 is assumed for this reference.' : ''}`,
    },
    sources: {
      water: 'Zero winter/summer planted-crop irrigation by definition; Aman rescue frequency from the local NASA POWER + GPM IMERG replay, 2001-2025. No total annual irrigation volume is inferred.',
      income: 'The same illustrative Aman return used by the income plugin (team estimate, district BBS yield and market adjustments); zero winter/summer crop return. Farmer costs are unverified.',
    },
    comparisons: [],
  };
}

const numeric = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function compareWithFallow(reference: CurrentPracticeReference, options: CandidateRotation[]) {
  reference.comparisons = options.map(o => {
    const water = o.dimensionDetails.water?.metrics;
    const rabi = numeric(water?.rabiNetIrrigationMm);
    const income = numeric(o.dimensionDetails.income?.metrics.illustrativeTotalBdtPerHa);
    const rescue = numeric(water?.amanRescueIrrigationSeasons);
    return {
      optionId: o.id,
      addedIrrigationExcludingAmanMm: rabi === null ? null : rabi + (numeric(water?.kharif1NetIrrigationMm) ?? 0) + (numeric(water?.kharif2NetIrrigationMm) ?? 0) - reference.irrigationExcludingAmanMm,
      illustrativeNetReturnChangeBdtPerHa: income === null ? null : income - reference.illustrativeAnnualNetReturnBdtPerHa,
      amanRescueSeasonsChange: rescue === null || reference.amanRescueSeasons === null ? null : rescue - reference.amanRescueSeasons,
    };
  });
}

/** Signed trade-offs: adding a crop must never become a claim that it saves water against fallow. */
export function fallowComparisonLines(reference: CurrentPracticeReference, option: CandidateRotation): ReviewLine[] {
  const diff = reference.comparisons.find(c => c.optionId === option.id);
  if (!diff) return [];
  const out: ReviewLine[] = [];
  const water = diff.addedIrrigationExcludingAmanMm;
  if (water !== null) out.push({
    bn: `আপনার পতিত-মৌসুমের চক্রের তুলনায় আমন বাদে মডেলের সেচ-চাহিদা ${bnDigits(Math.abs(water))} মিমি ${water > 0 ? 'বেশি' : water < 0 ? 'কম' : '(একই)'}। আমনের সম্পূরক সেচ আলাদা।`,
    en: `Compared with your fallow-season practice, modeled irrigation excluding Aman is ${Math.abs(water)} mm ${water > 0 ? 'higher' : water < 0 ? 'lower' : '(unchanged)'}. Aman rescue irrigation is separate.`,
    source: reference.sources.water,
  });
  const income = diff.illustrativeNetReturnChangeBdtPerHa;
  if (income !== null) out.push({
    bn: `বার্ষিক নিট আয়ের নমুনা হিসাবে হেক্টরে ${bnNumber(Math.abs(income))} টাকা ${income > 0 ? 'বেশি' : income < 0 ? 'কম' : '(একই)'}; মাঠের প্রমাণ নয়।`,
    en: `Illustrative annual net return is ${Math.abs(income).toLocaleString('en-US')} BDT/ha ${income > 0 ? 'higher' : income < 0 ? 'lower' : '(unchanged)'}; not a measured benefit.`,
    source: reference.sources.income,
  });
  if (diff.amanRescueSeasonsChange !== null) out.push({
    bn: `${bnDigits(reference.replaySeasons!)} মৌসুমের হিসাবে আমনের সম্পূরক সেচের প্রয়োজন ${bnDigits(Math.abs(diff.amanRescueSeasonsChange))} মৌসুম ${diff.amanRescueSeasonsChange > 0 ? 'বেশি' : diff.amanRescueSeasonsChange < 0 ? 'কম' : '(একই)'}।`,
    en: `Aman rescue irrigation occurs in ${Math.abs(diff.amanRescueSeasonsChange)} ${diff.amanRescueSeasonsChange > 0 ? 'more' : diff.amanRescueSeasonsChange < 0 ? 'fewer' : 'additional (no change)'} seasons in the ${reference.replaySeasons}-season replay.`,
    source: reference.sources.water,
  });
  return out;
}
