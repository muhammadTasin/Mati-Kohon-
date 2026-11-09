import type { AdviceJSON } from '@project-eden/contracts';
import type { PlanOptionsRequest } from './engine.ts';
import type { Place } from './data/location.ts';
import type { ModelExperiment } from './experiments.ts';

export const INPUT_STRESSES: Array<{ id: string; label: { bn: string; en: string }; inputs: ModelExperiment }> = [
  { id: 'irrigation_cost', label: { bn: 'সেচের খরচ ঘনমিটারে ২ টাকা বাড়লে', en: 'Irrigation costs +2 BDT/m³' }, inputs: { extraIrrigationCostBdtM3: 2 } },
  { id: 'crop_cost_high', label: { bn: 'ফসলপ্রতি খরচ হেক্টরে ৫০০০ টাকা বাড়লে', en: 'Crop costs +5,000 BDT/ha per crop' }, inputs: { extraCropCostBdtHa: 5000 } },
  { id: 'crop_cost_low', label: { bn: 'ফসলপ্রতি খরচ হেক্টরে ৫০০০ টাকা কমলে', en: 'Crop costs −5,000 BDT/ha per crop' }, inputs: { extraCropCostBdtHa: -5000 } },
  { id: 'aman_late', label: { bn: 'আমন কাটতে ৭ দিন দেরি হলে', en: 'Aman maturity delayed 7 days' }, inputs: { amanDelayDays: 7 } },
  { id: 'winter_long', label: { bn: 'শীতের ফসল ১০ দিন বেশি নিলে', en: 'Winter crop duration +10 days' }, inputs: { winterDurationDays: 10 } },
  { id: 'winter_short', label: { bn: 'শীতের ফসল ১০ দিন কম নিলে', en: 'Winter crop duration −10 days' }, inputs: { winterDurationDays: -10 } },
  { id: 'soil_dry', label: { bn: 'মাটিতে শুরুর পানি ২৫ মিমি হলে', en: 'Initial soil water 25 mm instead of 50' }, inputs: { initialSoilWaterMm: 25 } },
  { id: 'soil_wet', label: { bn: 'মাটিতে শুরুর পানি ৭৫ মিমি হলে', en: 'Initial soil water 75 mm instead of 50' }, inputs: { initialSoilWaterMm: 75 } },
  { id: 'combined', label: { bn: 'খরচ, দেরি ও শুকনো মাটি একসাথে', en: 'Higher costs, delayed crops and drier soil together' }, inputs: { extraIrrigationCostBdtM3: 2, extraCropCostBdtHa: 5000, amanDelayDays: 7, winterDurationDays: 10, initialSoilWaterMm: 25 } },
];
export function inputSensitivity(advice: AdviceJSON, request: PlanOptionsRequest, place: Place, rerun: (e: ModelExperiment) => AdviceJSON): NonNullable<AdviceJSON['input_sensitivity']> {
  const nominal = advice.options[0];
  const scenarios = [...INPUT_STRESSES, ...(place.local.salinity ? [
    { id: 'salt_lower', label: { bn: 'লবণাক্ততার অনুমান ২৫% কম হলে', en: 'Assumed salinity 25% lower' }, inputs: { salinityMultiplier: .75 } },
    { id: 'salt_higher', label: { bn: 'লবণাক্ততার অনুমান ২৫% বেশি হলে', en: 'Assumed salinity 25% higher' }, inputs: { salinityMultiplier: 1.25 } },
  ] : [])].map(s => {
    const output = rerun(s.inputs);
    const o = output.options.find(o => !o.feasibility?.violations.length);
    const w = o?.dimensionDetails.water?.metrics;
    return { id: s.id, label: s.label, inputs: s.inputs as Record<string, number>, leaderId: o?.id ?? null, leaderName: o?.nameEnglish ?? null,
      nominalLeaderRetained: o?.id === nominal?.id, feasible: Boolean(o),
      irrigationMm: w ? Number(w.rabiNetIrrigationMm ?? 0) + Number(w.kharif1NetIrrigationMm ?? 0) + Number(w.kharif2NetIrrigationMm ?? 0) : null,
      netReturnBdtHa: typeof o?.dimensionDetails.income?.metrics.illustrativeTotalBdtPerHa === 'number' ? o.dimensionDetails.income.metrics.illustrativeTotalBdtPerHa as number : null };
  });
  // Old regional salinity cannot settle a field's crop choice. Explicit abstention from final advice, options remain inspectable.
  const insufficient = Boolean(place.local.salinity?.strongShare && place.local.salinity.strongShare >= .2)
    || Boolean(request.currentConditions?.flood?.drain?.dateRange)
    || !nominal || scenarios.some(s => !s.feasible);
  const changed = scenarios.some(s => !s.nominalLeaderRetained) || Boolean(nominal?.feasibility?.violations.length);
  const status = insufficient ? 'insufficient_evidence' : changed ? 'review_required' : 'stable_in_tested_ranges';
  return { status, recommendedOptionId: status === 'stable_in_tested_ranges' ? nominal.id : null,
    message: insufficient
      ? { bn: 'চূড়ান্ত ফসল বাছার মতো তথ্য নেই। জমির লবণাক্ততা, পানি ও সময় কর্মকর্তা দিয়ে যাচাই করুন; বিকল্পগুলো আলোচনার জন্য।', en: 'Insufficient evidence for a final crop choice. Verify field salinity, water and timing with an officer; these plans are discussion options.' }
      : changed ? { bn: 'খরচ বা সময়ের অনুমান বদলালে পছন্দ বদলায়। চূড়ান্ত সিদ্ধান্তের আগে সেচের খরচ ও বোনার সময় মিলিয়ে নিন।', en: 'The choice depends on cost or timing assumptions. Check actual irrigation costs and sowing dates before making a final planting decision.' }
      : { bn: 'পরীক্ষা করা সীমাগুলোর মধ্যে একই চক্র এগিয়ে থাকে। এটি সফলতার সম্ভাবনা বা নিশ্চয়তা নয়।', en: 'The same plan stays preferred across the tested ranges. This is not a probability or guarantee of success.' },
    method: 'input-stress-rerun-v1', scenarios,
    limitations: ['Farmer priorities stay fixed; candidates, calendars, constraint checks and all seven scores are recomputed.',
      'Ranges are transparent engineering stress assumptions, not measured farmer cost ranges or probability distributions.',
      'Duration changes shift calendars and scale water use by average daily demand; they do not rerun daily weather or phenology. Aman rescue frequencies and heat exposure stay at their release values.',
      'Regional salinity is from 2009; the strong-salinity abstention threshold (20% of land) is a conservative review policy, not a calibrated cutoff.'] };
}
