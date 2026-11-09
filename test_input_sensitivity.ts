import assert from 'node:assert/strict';
import { RotationEngine, type PlanOptionsRequest } from './packages/rotation-engine/src/engine.ts';
import { TemplateNarrator } from './packages/narration-core/src/template_narrator.ts';
import { screenConditions } from './packages/rotation-engine/src/freshness.ts';
import { placeFor, withPlace } from './packages/rotation-engine/src/data/location.ts';
import { currentDrainReady, radarReady, landRules } from './packages/rotation-engine/src/data/land.ts';
import { recordFor } from './packages/rotation-engine/src/data/crop_choice.ts';
import { experimentalPlace } from './packages/rotation-engine/src/experiments.ts';
import { replyFor } from './services/api/src/voice.ts';
const engine = new RotationEngine();
const request: PlanOptionsRequest = { unionId: 'talanda_tanore', unionNameBangla: 'তালন্দ', district: 'Rajshahi', upazila: 'Tanore', landType: 'medium_high', season: '2026-aman', today: '2026-11-06', farmerPriorities: { water: .5, income: .3, soil: .2 } };
const base = engine.generateAdvice(request);
const dry = engine.generateAdvice(request, { initialSoilWaterMm: 25 });
const b = base.options.find(o => o.id === 'rot_dhan71_lentil')!;
const d = dry.options.find(o => o.id === b.id)!;
assert.equal(Number(d.dimensionDetails.water.metrics.rabiNetIrrigationMm) - Number(b.dimensionDetails.water.metrics.rabiNetIrrigationMm), 25);
const costly = engine.generateAdvice(request, { extraIrrigationCostBdtM3: 2 }).options.find(o => o.id === b.id)!;
assert.equal(Number(b.dimensionDetails.income.metrics.illustrativeTotalBdtPerHa) - Number(costly.dimensionDetails.income.metrics.illustrativeTotalBdtPerHa), Number(b.dimensionDetails.water.metrics.rabiNetIrrigationMm) * 20);
const delayed = engine.generateAdvice(request, { amanDelayDays: 7 }).options.find(o => o.id === b.id)!;
assert.ok(delayed.feasibility!.violations.includes('planting_window_or_field_overlap'));
const analyzed = engine.generateAdvice({ ...request, includeInputSensitivity: true });
assert.equal(analyzed.input_sensitivity!.scenarios.length, 9);
assert.deepEqual(analyzed.farmer_priorities, base.farmer_priorities);
assert.deepEqual(engine.generateAdvice(request).options.map(o => o.scores), base.options.map(o => o.scores), 'Experiments cannot leak into subsequent requests');
const coast = engine.generateAdvice({ ...request, unionId: 'ADM3_Shyamnagar', district: 'Satkhira', upazila: 'Shyamnagar', includeInputSensitivity: true });
assert.equal(coast.input_sensitivity!.status, 'insufficient_evidence');
assert.equal(coast.input_sensitivity!.recommendedOptionId, null);
const narration = new TemplateNarrator().render(coast);
assert.ok(narration.englishGloss.includes('Insufficient evidence'));
assert.ok(!narration.englishGloss.includes('Harvest by'));
const voice = replyFor(coast);
assert.equal(voice.recommendationWithheld, true);
assert.equal(voice.recommendedOptionId, null);
assert.ok(voice.speechBangla.includes(coast.input_sensitivity!.message.bn));
assert.ok(!voice.smsBangla.includes('জন্য ভালো ফসলচক্র'));
const calendar = engine.generateAdvice(request, { calendarOnly: true });
assert.equal(calendar.options[0].id, 'rot_dhan71_mustard');
assert.ok(engine.measureOption(request, calendar.options[0]).feasibility);
const place = placeFor('ADM3_Khaliajuri')!;
const conditions: any = { date: '2026-11-06', soilStatus: 'normal', sensor: 'SMAP', flood: { date: '2026-11-05', drain: { to: { date: '2026-11-05' }, dateRange: ['2026-11-20', '2026-12-15'] } } };
const screened = screenConditions(conditions, request.today!).conditions;
const historical = withPlace(place, () => radarReady('low'));
withPlace({ ...place, conditions: { ...place.conditions, current: screened } }, () => {
  assert.equal(currentDrainReady('low'), '12-15');
  assert.equal(landRules('low').ready, '12-15');
  assert.equal(radarReady('low'), historical, 'Current ranges cannot be relabeled as historical OPERA');
});
for (const range of [['2026-11-30', '2026-11-20'], ['2026-02-30', '2026-11-20'], ['2026-11-05', '2026-11-20'], ['2026-11-20', '2027-01-31']]) {
  assert.equal(screenConditions({ ...conditions, flood: { ...conditions.flood, drain: { ...conditions.flood.drain, dateRange: range } } }, request.today!).conditions!.flood!.drain!.dateRange, null);
}
assert.deepEqual(conditions.flood.drain.dateRange, ['2026-11-20', '2026-12-15'], 'Screening must not mutate stored inputs');
const pilot = placeFor(request.unionId)!;
const spring = withPlace(pilot, () => recordFor('mungbean@03-05'));
assert.ok(spring, 'Spring crop fixture exists');
assert.deepEqual(withPlace(experimentalPlace(pilot, { winterDurationDays: 10, initialSoilWaterMm: 25 }), () => recordFor('mungbean@03-05')), spring, 'Winter perturbations must not change summer crop records');
const moistRequest = { ...request, currentConditions: { date: request.today!, soilStatus: 'dry' as const, sensor: 'SMAP' as const } };
const moistOption = engine.generateAdvice(moistRequest).options[0];
assert.equal(engine.measureOption(moistRequest, moistOption).dimensionDetails.water.metrics.rabiNetIrrigationMm, moistOption.dimensionDetails.water.metrics.rabiNetIrrigationMm);
const drainageRequest: PlanOptionsRequest = { ...request, unionId: 'ADM3_Khaliajuri', district: 'Netrakona', upazila: 'Khaliajuri',
  landType: 'low', today: '2026-12-01', includeInputSensitivity: true,
  currentConditions: { date: '2026-12-01', soilStatus: 'normal', source: 'synthetic regression fixture', flood: {
    date: '2026-12-01', sensor: 'nisar', seenShare: .9, floodShare: .3, waterNow: .4, waterDry: .1,
    drain: { from: { date: '2026-11-10', floodShare: .5, sensor: 'nisar' }, to: { date: '2026-12-01', floodShare: .3, sensor: 'nisar' },
      perWeek: .06, freeBy: '2027-01-01', dateRange: ['2026-12-20', '2027-01-10'], fieldCheckRequired: true } } } };
const lateDrain = engine.generateAdvice(drainageRequest);
const noDrain = engine.generateAdvice(drainageRequest, { without: 'opera', skipAnalysis: true });
assert.equal(lateDrain.input_sensitivity!.recommendedOptionId, null);
assert.ok(lateDrain.options.every(o => o.feasibility!.fieldReady === '01-10'));
assert.ok(noDrain.options.every(o => o.feasibility!.fieldReady !== '01-10'));
assert.notDeepEqual(lateDrain.options.map(o => [o.id, o.feasibility!.winterSowing]), noDrain.options.map(o => [o.id, o.feasibility!.winterSowing]), 'A delayed range must change crop/calendar feasibility, not only explanatory text');
console.log('Input sensitivity: water balance, costs, calendar violations, no shared-state leakage, abstention and calendar comparator passed.');
