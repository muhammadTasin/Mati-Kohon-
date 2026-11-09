/** Offline, reproducible model comparison. No live data, farmer outcomes, calls or external services. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { RotationEngine, type PlanOptionsRequest } from '../packages/rotation-engine/src/engine.ts';
import { placeFor } from '../packages/rotation-engine/src/data/location.ts';
import type { CandidateRotation } from '../packages/contracts/src/types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const cases = [
  { id: 'barind', place: 'talanda_tanore', question: 'Water demand in the Barind', current: { monsoon: 'aman', winter: 'boro' } },
  { id: 'haor', place: 'ADM3_Khaliajuri', question: 'Boro and flash-flood exposure on low land', current: { monsoon: 'fallow', winter: 'boro' } },
  { id: 'coast', place: 'ADM3_Shyamnagar', question: 'A winter crop under coastal salinity assumptions', current: { monsoon: 'aman', winter: 'fallow' } },
];
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
function compact(o: CandidateRotation) {
  const water = o.dimensionDetails.water?.metrics ?? {};
  const irrigation = ['rabiNetIrrigationMm', 'kharif1NetIrrigationMm', 'kharif2NetIrrigationMm']
    .map(k => number(water[k]));
  return {
    id: o.id, name: o.nameEnglish, rank: o.rank, score: o.totalWeightedScore,
    scores: o.scores, fieldFreeDate: o.fieldFreeDateEnglish,
    // Excludes Aman rescue water: its seasonal frequency is reported separately, not silently converted to volume.
    modeledIrrigationExcludingAmanMm: irrigation[0] === null ? null : irrigation.reduce<number>((sum, v) => sum + (v ?? 0), 0),
    amanRescueSeasons: number(water.amanRescueIrrigationSeasons),
    replaySeasons: number(water.totalSeasonsSimulated),
    illustrativeNetReturnBdtPerHa: number(o.dimensionDetails.income?.metrics.illustrativeTotalBdtPerHa),
    provenance: Object.fromEntries(Object.entries(o.dimensionDetails).map(([id, d]) => [id, {
      kind: d.provenance.measuredOrModeled, source: d.provenance.source,
      timePeriod: d.provenance.timePeriod, spatialResolution: d.provenance.spatialResolution,
    }])),
  };
}
const engine = new RotationEngine();
const results = cases.map(c => {
  const place = placeFor(c.place);
  assert.ok(place, `Unknown case location: ${c.place}`);
  const request: PlanOptionsRequest = {
    unionId: c.place, unionNameBangla: place.nameBangla, upazila: place.upazila, district: place.district,
    landType: place.defaultLandType, season: '2026-aman', today: '2026-11-05',
    farmerPriorities: { water: 0.5, income: 0.3, soil: 0.2 }, defaultPriorities: true,
    currentRotation: c.current,
  };
  const advice = engine.generateAdvice(request);
  assert.ok(advice.options.length > 0, `${c.id}: no feasible rotation`);
  const baseline = advice.options.find(o => o.farmerCurrent);
  // Never silently call an engine-chosen reference the user's actual baseline.
  const recommended = compact(advice.options[0]);
  const ref = advice.current_practice_reference;
  const current = baseline ? compact(baseline) : ref ? {
    id: ref.id, name: ref.nameEnglish, rank: null, score: null, scores: null,
    modeledIrrigationExcludingAmanMm: ref.irrigationExcludingAmanMm,
    illustrativeNetReturnBdtPerHa: ref.illustrativeAnnualNetReturnBdtPerHa,
    amanRescueSeasons: ref.amanRescueSeasons, replaySeasons: ref.replaySeasons,
    amanVarietyAssumed: ref.amanVarietyAssumed, provenance: ref.sources,
  } : null;
  assert.ok(current, `${c.id}: the supplied scenario baseline must be represented, not substituted`);
  const delta = (a: number | null | undefined, b: number | null | undefined) => a == null || b == null ? null : Math.round((a - b) * 100) / 100;
  return {
    id: c.id, question: c.question, request, dataRelease: advice.data_release,
    displayedOptionCount: advice.options.length,
    baselineStatus: 'scenario_baseline_represented',
    baselineRepresentation: baseline ? 'ranked_rotation' : 'unranked_fallow_reference',
    baselineNote: advice.current_rotation_note ?? null,
    baseline: current, recommended,
    modeledDifferenceVsScenarioBaseline: {
      lessIrrigationExcludingAmanMm: delta(current?.modeledIrrigationExcludingAmanMm, recommended.modeledIrrigationExcludingAmanMm),
      addedIrrigationExcludingAmanMm: delta(recommended.modeledIrrigationExcludingAmanMm, current?.modeledIrrigationExcludingAmanMm),
      illustrativeNetReturnChangeBdtPerHa: delta(recommended.illustrativeNetReturnBdtPerHa, current?.illustrativeNetReturnBdtPerHa),
    },
    displayedOptions: advice.options.map(compact), decisionCheck: advice.decision_check,
    warnings: advice.stale_or_missing_inputs,
  };
});
const files = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
  const relative = `${dir}/${e.name}`;
  return e.isDirectory() ? files(relative) : /\.(ts|json|csv)$/.test(e.name) ? [relative] : [];
});
const hashes = Object.fromEntries([...files('packages/rotation-engine/src'), 'scripts/evaluate_decisions.ts'].sort().map(file => [file,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const report = {
  schema: 'model-comparison-v2', asOf: '2026-11-05', method: 'Offline model comparison plus displayed-score ablations',
  interpretation: [
    'Scenario baselines are specified examples, not reported practices of interviewed farmers.',
    'The coastal fallow baseline has no rank or invented soil/pest scores. Added irrigation is a demand increase, not a saving. Aman rescue volume is excluded.',
    'Differences compare outputs of the same model; they do not establish measured benefits or predictive accuracy.',
    'Score ablations keep the generated shortlist and farmer weights fixed. They cannot isolate all NASA contributions because candidate generation and other dimensions also use NASA data.',
    'No independent calendar-only baseline, held-out replay or field evaluation is implemented by this report.',
    'No uncertainty probabilities are calibrated. Income is illustrative and soil scores are heuristics.',
  ],
  inputAndCodeSha256: hashes, cases: results,
};
const destination = path.join(root, 'research/evaluation/model_comparison.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
for (const r of results) {
  const changes = r.decisionCheck!.scenarios.filter(s => !s.nominalLeaderRetained).length;
  console.log(`${r.id}: ${r.recommended.name}; ${changes} score-leader changes; ${r.baselineStatus}`);
}
console.log('Saved research/evaluation/model_comparison.json (model outputs, not validated impacts).');
