/** Frozen three-way comparison. No network, real farmers, tuned thresholds, or success claims. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { RotationEngine, type PlanOptionsRequest } from '../packages/rotation-engine/src/engine.ts';
import { placeFor } from '../packages/rotation-engine/src/data/location.ts';
import { TemplateNarrator } from '../packages/narration-core/src/template_narrator.ts';
import type { ModelExperiment } from '../packages/rotation-engine/src/experiments.ts';
import type { CandidateRotation } from '../packages/contracts/src/types.ts';

export const cases = [
  { id: 'tanore', place: 'talanda_tanore', land: 'medium_high', title: 'Tanore: irrigation demand', current: { monsoon: 'aman', winter: 'boro' } },
  { id: 'haor', place: 'ADM3_Khaliajuri', land: 'low', title: 'Khaliajuri: harvest timing and flood exposure', current: { monsoon: 'fallow', winter: 'boro' } },
  { id: 'coast', place: 'ADM3_Shyamnagar', land: 'medium_high', title: 'Shyamnagar: salinity and winter fallow', current: { monsoon: 'aman', winter: 'fallow' } },
] as const;
const engine = new RotationEngine();
const narrator = new TemplateNarrator();
const compact = (o: CandidateRotation | undefined) => o ? {
  id: o.id, name: o.nameEnglish, nameBangla: o.nameBangla,
  irrigationMm: ['rabiNetIrrigationMm', 'kharif1NetIrrigationMm', 'kharif2NetIrrigationMm'].reduce((n, k) => n + Number(o.dimensionDetails.water?.metrics[k] ?? 0), 0),
  netReturnBdtHa: o.dimensionDetails.income?.metrics.illustrativeTotalBdtPerHa ?? null,
  constraints: o.feasibility, score: o.totalWeightedScore, cropSequence: o.cropSequence,
} : null;
const inputs: Array<{ id: NonNullable<ModelExperiment['without']>; source: string; intervention: string }> = [
  { id: 'gldas', source: 'NASA GLDAS groundwater trend', intervention: 'Remove the local groundwater trend; irrigation-stress multiplier returns to one.' },
  { id: 'smap', source: 'NASA SMAP/POWER current soil moisture', intervention: 'Remove the current soil-moisture classification and dry-start increment. No effect is expected without a fresh current reading.' },
  { id: 'imerg_flood', source: 'NASA GPM IMERG historical upstream rainfall', intervention: 'Remove historical rainfall-burst exposure from harvest constraints and scores; this does not remove the rainfall used by the water replay.' },
  { id: 'opera', source: 'NASA OPERA water recession', intervention: 'Remove historical and current recession inputs; land readiness falls back to its calendar default.' },
  { id: 'srdi_salinity', source: 'SRDI soil salinity (not NASA)', intervention: 'Remove regional salinity penalties and exclusions. Report separately; this cannot be attributed to NASA.' },
];
const drainage = JSON.parse(fs.readFileSync('research/evaluation/drainage_evaluation.json', 'utf8'));
const results = cases.map(c => {
  const place = placeFor(c.place)!;
  const request: PlanOptionsRequest = { unionId: c.place, unionNameBangla: place.nameBangla, district: place.district, upazila: place.upazila,
    landType: c.land, season: '2026-aman', today: '2026-11-06', farmerPriorities: { water: .5, income: .3, soil: .2 },
    currentAmanCrop: 'BRRI dhan49', currentRotation: c.current, includeInputSensitivity: true };
  const full = engine.generateAdvice(request);
  const calendar = engine.generateAdvice(request, { calendarOnly: true, skipAnalysis: true });
  const calendarMeasured = engine.measureOption(request, calendar.options[0]);
  // The stated conventional Boro comparator must not silently become the early Boro alternative.
  const conventional = c.id === 'haor' ? engine.generateAdvice(request, { without: 'imerg_flood', skipAnalysis: true }).options.find(o => o.id === 'rot_fallow_boro') : undefined;
  const current = conventional ? engine.measureOption(request, conventional) : full.options.find(o => o.farmerCurrent);
  if (!current && !full.current_practice_reference) throw new Error(`${c.id}: current practice not represented`);
  const interventions = inputs.map(input => {
    const changed = engine.generateAdvice(request, { without: input.id, skipAnalysis: true });
    const measured = engine.measureOption(request, changed.options[0]);
    return { ...input, chosen: compact(measured), choiceChanged: changed.options[0].id !== full.options[0].id,
      candidateIds: changed.options.map(o => o.id), nominalChoiceStillOffered: changed.options.some(o => o.id === full.options[0].id) };
  });
  const message = narrator.render(full);
  const recommendation = compact(full.options[0])!;
  return { id: c.id, title: c.title, request,
    current: current ? compact(current) : { id: full.current_practice_reference!.id, name: full.current_practice_reference!.nameEnglish,
      nameBangla: full.current_practice_reference!.nameBangla, irrigationMm: 0,
      netReturnBdtHa: full.current_practice_reference!.illustrativeAnnualNetReturnBdtPerHa, constraints: null, score: null },
    calendar: compact(calendarMeasured), full: recommendation,
    finalRecommendationId: full.input_sensitivity!.recommendedOptionId,
    comparison: { choiceChangedVsCalendar: calendarMeasured.id !== recommendation.id,
      modeledIrrigationDifferenceVsCalendarMm: recommendation.irrigationMm - compact(calendarMeasured)!.irrigationMm,
      calendarConstraintViolations: calendarMeasured.feasibility!.violations.length,
      fullConstraintViolations: full.options[0].feasibility!.violations.length },
    interventions, uncertainty: full.input_sensitivity, alternatives: c.id === 'haor' ? [compact(full.options[0]), compact(current), {
      id: 'unplanted_reference', name: 'Leave the year unplanted (unranked reference)', nameBangla: 'সারা বছর খালি রাখা (স্কোরবিহীন তুলনা)',
      irrigationMm: 0, netReturnBdtHa: 0, score: null, constraints: null, cropSequence: [],
      note: 'Zero crop irrigation and crop return only; land costs, livelihoods and non-crop benefits are unknown. Not a recommendation.',
    }] : full.options.slice(0, 3).map(compact),
    narration: { bangla: message.banglaSpeechText, english: message.englishGloss },
    officerReview: ['Confirm the field is accessible and ready for sowing.', 'Check actual irrigation access, price and crop costs.',
      ...(c.id === 'coast' ? ['Measure field salinity; the 2009 regional survey does not settle this field.'] : []),
      ...(c.id === 'haor' ? ['Confirm river levels and field drainage; rainfall bursts are not flood-arrival dates.'] : []),
      'Explain the trade-off to the farmer and record their choice before sending advice.'],
  };
});
const files = [...new Set(['packages/rotation-engine/src/engine.ts', 'packages/rotation-engine/src/experiments.ts', 'packages/rotation-engine/src/input_sensitivity.ts',
  'packages/rotation-engine/src/data/crop_choice.ts', 'packages/rotation-engine/src/data/land.ts', 'packages/rotation-engine/src/data/salinity.ts',
  'packages/rotation-engine/src/data/national_replay.json', 'packages/rotation-engine/src/data/crop_choice_replay.json', 'packages/rotation-engine/src/data/upazila_profile.json',
  'packages/rotation-engine/src/data/tanore_replay_data.ts', 'packages/rotation-engine/src/plugins/water.ts', 'packages/rotation-engine/src/plugins/income.ts',
  'packages/narration-core/src/template_narrator.ts', 'packages/rotation-engine/src/freshness.ts',
  'research/evaluation/drainage_evaluation.json', 'scripts/evaluate_full_system.ts',
  ...['packages/rotation-engine/src', 'packages/narration-core/src', 'packages/contracts/src'].flatMap(dir =>
    fs.readdirSync(dir, { recursive: true }).filter(p => /\.(ts|json)$/.test(String(p))).map(p => `${dir}/${String(p).replaceAll('\\', '/')}`)),
])].sort();
const report = { schema: 'full-system-comparison-v1', asOf: '2026-11-06', dataRelease: 'tanore-2026.09.30',
  drainageEvaluation: { historyMade: drainage.historyMade, pilotSummary: drainage.summary,
    exploratorySites: drainage.exploratoryAllLocations.sites,
    commonEvaluableCases: drainage.exploratoryAllLocations.commonEvaluableCases,
    commonMeanAbsoluteIntervalErrorDays: drainage.exploratoryAllLocations.commonMeanAbsoluteIntervalErrorDays,
    limitations: drainage.protocol },
  protocol: { calendar: 'Same crop catalog and explicit land type. Remove salinity, groundwater, current moisture, OPERA readiness and IMERG harvest-risk inputs; choose shortest winter crop occupancy, then earlier Aman field release. Weather/income scores do not select the calendar plan. Evaluate the selected plan again with full inputs.',
    priorities: 'Water 0.5, income 0.3, soil 0.2; unchanged in every run.',
    interpretation: ['Scenario practices are stated examples, not farmer interviews.', 'Differences are model outputs, not measured water savings or validated crop benefits.',
      'Calendar candidates still come from the project catalog, calendars and available replay sowing dates; this is not a reconstruction of officer advice.',
      'No current observation is fabricated. Current-moisture removal can correctly have no effect in these dated release-only examples.',
      'The full system includes local non-NASA evidence. Coastal salinity effects must be attributed to SRDI, not to NASA.',
      'All interventions are shown, including no change and unfavorable results. No case was tuned to force a NASA advantage.',
      'A null final recommendation means an officer must resolve missing or decision-sensitive inputs; ranked alternatives remain discussion material.'] },
  inputAndCodeSha256: Object.fromEntries(files.map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])), cases: results };
fs.writeFileSync('research/evaluation/full_system_comparison.json', JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync('apps/saao-dashboard/public/judge-demo.json', JSON.stringify(report) + '\n');
for (const r of results) console.log(`${r.id}: calendar=${r.calendar?.id}; full=${r.full.id}; ${r.uncertainty?.status}; ${r.interventions.filter(i => i.choiceChanged).map(i => i.id).join(', ') || 'no single-input choice change'}`);
