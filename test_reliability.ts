import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CandidateRotation } from './packages/contracts/src/types.ts';
import { RotationEngine, type PlanOptionsRequest } from './packages/rotation-engine/src/engine.ts';
import { screenConditions, screenFieldWeather, recentInput } from './packages/rotation-engine/src/freshness.ts';
import { decisionCheck } from './packages/rotation-engine/src/decision_check.ts';
import { DualGateNarrationValidator } from './packages/narration-core/src/dual_gate_validator.ts';
import { TemplateNarrator } from './packages/narration-core/src/template_narrator.ts';

const request: PlanOptionsRequest = { unionId: 'talanda_tanore', unionNameBangla: 'তালন্দ ইউনিয়ন', upazila: 'Tanore', district: 'Rajshahi', landType: 'medium_high', season: '2026-aman', today: '2026-10-08', farmerPriorities: { water: 0.5, income: 0.3, soil: 0.2 } };
const engine = new RotationEngine();
const advice = engine.generateAdvice(request);
const template = new TemplateNarrator().render(advice);
const approved = new DualGateNarrationValidator().prepareGate1Slots(advice, advice.options[0]);
const audit = new DualGateNarrationValidator();
// Same approved numbers can assert a different unit, action, date or guarantee. All must be rejected.
for (const text of [
  template.banglaSpeechText.replace('মিলিমিটার', 'কেজি ইউরিয়া'),
  template.banglaSpeechText.replace('সেচের প্রয়োজন', 'সেচের প্রয়োজন নেই'),
  template.banglaSpeechText + ' ফলন নিশ্চিত, কোনো বন্যার ঝুঁকি নেই।',
  template.banglaSpeechText.replace('মসুর', 'আলু'),
  template.banglaSpeechText.replace('নভেম্বর', 'ডিসেম্বর'),
]) {
  assert.notEqual(text, template.banglaSpeechText, 'Attack must actually change the fixture');
  assert.equal(audit.auditGate2(text, approved.approvedNumbers, approved.approvedNarrations).passed, false);
  const result = await new DualGateNarrationValidator({ generate: async () => text }).narrate(advice);
  assert.equal(result.status, 'fallback_template');
  assert.equal(result.banglaSpeechText, template.banglaSpeechText);
}
for (const raw of ['{"style":"warm","advice":"guaranteed"}', '[]', 'null', '{"style":"invented"}', '```json\n{"style":"direct"}\n```']) {
  assert.equal((await new DualGateNarrationValidator({ generate: async () => raw }).narrate(advice)).status, 'fallback_template');
}
for (const style of ['direct', 'warm'] as const) {
  const result = await new DualGateNarrationValidator({ generate: async (prompt) => {
    assert.ok(!prompt.includes(request.unionNameBangla));
    return JSON.stringify({ style });
  } }).narrate(advice);
  assert.equal(result.status, 'local_model_checked');
  assert.equal(result.banglaSpeechText, approved.variants[style].banglaSpeechText);
  assert.equal(result.englishGloss, approved.variants[style].englishGloss);
}
assert.equal((await new DualGateNarrationValidator({ generate: () => new Promise(() => {}) }, { timeoutMs: 5 }).narrate(advice)).status, 'fallback_template');
assert.equal((await new DualGateNarrationValidator({ generate: async () => { throw new Error('offline'); } }).narrate(advice)).status, 'fallback_template');

assert.equal(recentInput('2026-10-01', 7, '2026-10-08'), true);
for (const date of ['2026-09-30', '2026-10-09', '2026-02-30', '', undefined]) assert.equal(recentInput(date, 7, '2026-10-08'), false);
const fresh: NonNullable<PlanOptionsRequest['currentConditions']> = { date: '2026-10-08', soilStatus: 'dry', source: 'test', sensor: 'SMAP', rainDate: '2026-09-01', rain30PctOfNormal: 10,
  disease: { date: '2026-09-01', rules: [], method: 'test' } as any,
  field: { through: '2026-10-08', observedTo: '2026-10-07', rainSource: 'test', rain7: 0, rain14: 0, et0Mm7: 30, tmax3: 30, tmin3: 20, paddyWaterMm: -12, paddyDry14: '00000001111111', paddyDryNext7: '1111111', forecast: { from: '2026-10-07', rain: [0], tmax: [30], tmin: [20], et0: [4] } },
  flood: { date: '2026-08-01', seenShare: 0.9, floodShare: 0.5, waterNow: 0.6, waterDry: 0.1 },
};
const snapshot = JSON.stringify(fresh);
const screened = screenConditions(fresh, '2026-10-08');
assert.equal(screened.conditions?.soilStatus, 'dry');
assert.equal(screened.conditions?.rain30PctOfNormal, null, 'SMAP date cannot refresh old POWER rain');
assert.equal(screened.conditions?.disease, null);
assert.equal(screened.conditions?.flood, null);
assert.equal(screened.conditions?.field?.forecast, null);
assert.equal(screened.conditions?.field?.paddyDryNext7, null);
assert.equal(screenFieldWeather(fresh.field, '2026-10-11').field, null, 'Public map rejects old field conditions too');
assert.equal(screenFieldWeather({ ...fresh.field!, through: '2026-10-09' }, '2026-10-08').field, null);
assert.equal(JSON.stringify(fresh), snapshot, 'Do not mutate the cached source');
assert.equal(screenConditions({ ...fresh, date: '2026-08-01', field: null }, '2026-10-08').conditions, undefined);
const old = engine.generateAdvice({ ...request, currentConditions: { ...fresh, date: '2026-08-01', field: { ...fresh.field!, through: '2026-08-01' } } });
assert.deepEqual(old.options.map(o => o.scores), advice.options.map(o => o.scores), 'Stale readings cannot change historical scores');
assert.ok(old.stale_or_missing_inputs.some(s => s.dataset === 'Field weather'));
assert.ok(!old.local_context?.hazards.includes('aman_dry_spell'));
const current = engine.generateAdvice({ ...request, currentConditions: fresh });
assert.ok(current.local_context?.hazards.includes('aman_dry_spell'), 'A current observation still drives a current alert');

const options = [{ id: 'income', scores: { income: 1, water: 0.2 } }, { id: 'water', scores: { income: 0.2, water: 0.9 } }] as CandidateRotation[];
const before = JSON.stringify(options);
const check = decisionCheck(options, { income: 0.7, water: 0.3 });
assert.deepEqual(check.nominalLeaderIds, ['income']);
const removedIncome = check.scenarios.find(s => s.id === 'without_income')!;
assert.deepEqual(removedIncome.leaderIds, ['water']);
assert.equal(removedIncome.nominalLeaderRetained, false);
assert.deepEqual(check.weights, { income: 0.7, water: 0.3 });
assert.equal(JSON.stringify(options), before);
assert.deepEqual(decisionCheck(options, { income: 0, water: 0 }).nominalLeaderIds, ['income', 'water']);
assert.deepEqual(decisionCheck([], {}).nominalLeaderIds, []);
assert.equal(advice.options[0].dimensionDetails.soil.provenance.measuredOrModeled, 'assumed');
assert.equal(advice.decision_check?.scope, 'displayed_options_only');

// A fresh optical observation must not inherit a stale (or future) radar drainage estimate.
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-freshness-'));
const floodFile = path.join(fixtureDir, 'optical.json');
const radarFile = path.join(fixtureDir, 'radar.json');
const previousEnv = { EDEN_FLOOD_FILE: process.env.EDEN_FLOOD_FILE, EDEN_NISAR_FILE: process.env.EDEN_NISAR_FILE };
const day = (ago: number) => new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);
try {
  process.env.EDEN_FLOOD_FILE = floodFile;
  process.env.EDEN_NISAR_FILE = radarFile;
  const reading = { date: day(1), seenShare: 0.9, floodShare: 0.3, waterNow: 0.4, waterDry: 0.1 };
  const drain = { from: { date: day(30), floodShare: 0.6, sensor: 'nisar' }, to: { date: day(3), floodShare: 0.3, sensor: 'nisar' }, perWeek: 0.1, freeBy: day(-14) };
  fs.writeFileSync(floodFile, JSON.stringify({ upazilas: { old: reading, future: reading, oldDrain: reading, fresh: reading } }));
  fs.writeFileSync(radarFile, JSON.stringify({ upazilas: {
    old: { ...reading, date: day(22), drain },
    future: { ...reading, date: day(-1), drain },
    oldDrain: { ...reading, drain: { ...drain, to: { ...drain.to, date: day(22) } } },
    fresh: { ...reading, drain },
  } }));
  const { floodFor } = await import('./services/api/src/live.ts');
  for (const id of ['old', 'future', 'oldDrain']) assert.equal(floodFor(id)?.drain, null);
  assert.ok(floodFor('fresh')?.drain);
  assert.equal(floodFor('future')?.sensor, 'opera');
} finally {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fs.unlinkSync(floodFile);
  fs.unlinkSync(radarFile);
  fs.rmdirSync(fixtureDir);
}
console.log('Reliability checks passed: narration semantics, fallbacks, per-source dates, current alerts, mixed-sensor drainage, score ablations and ties.');
