import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const report = read('research/evaluation/full_system_comparison.json');
assert.deepEqual(read('apps/saao-dashboard/public/judge-demo.json'), report, 'Judge demo must use the reproducible report');
assert.deepEqual(report.cases.map(c => c.id), ['tanore', 'haor', 'coast']);
for (const c of report.cases) {
  assert.ok(c.current && c.calendar && c.full);
  assert.equal(c.alternatives.length, 3);
  assert.deepEqual(c.request.farmerPriorities, { water: .5, income: .3, soil: .2 });
  assert.deepEqual(c.interventions.map(i => i.id), ['gldas', 'smap', 'imerg_flood', 'opera', 'srdi_salinity']);
  assert.equal(c.interventions.find(i => i.id === 'smap').choiceChanged, false, 'No fabricated fresh observation');
  assert.equal(c.comparison.modeledIrrigationDifferenceVsCalendarMm, c.full.irrigationMm - c.calendar.irrigationMm);
  assert.ok(c.uncertainty.scenarios.length >= 9);
  assert.ok(c.narration.bangla && c.narration.english);
  if (c.uncertainty.status !== 'stable_in_tested_ranges') assert.equal(c.finalRecommendationId, null);
}
const haor = report.cases.find(c => c.id === 'haor');
assert.equal(haor.current.id, 'rot_fallow_boro', 'Conventional current Boro cannot silently become early Boro');
assert.ok(haor.current.constraints.violations.includes('historical_rainfall_exposure'));
assert.equal(report.cases.find(c => c.id === 'coast').finalRecommendationId, null);
const drainage = read('research/evaluation/drainage_evaluation.json');
for (const artifact of [report, drainage]) for (const [path, sha] of Object.entries(artifact.inputAndCodeSha256)) {
  // line endings ignored, so hashes made on Windows (CRLF) match the Linux CI checkout (LF)
  const lf = fs.readFileSync(path).toString('latin1').replaceAll('\r\n', '\n');
  assert.equal(crypto.createHash('sha256').update(lf, 'latin1').digest('hex'), sha, `Stale evidence: ${path}. Regenerate evaluations.`);
}
for (const c of drainage.cases.concat(drainage.exploratoryAllLocations.cases)) {
  assert.ok(c.lastObservationUsed <= c.asOf, 'No future observations in prediction');
  if (c.rightCensored) assert.ok(Object.values(c.intervalErrorDays).every(e => e === null), 'Unobserved outcomes cannot count as success');
  if (c.dateRange) assert.ok(c.dateRange[0] <= c.dateRange[1]);
}
const claims = read('docs/claims-register.json');
assert.ok(claims.claims.length >= 18);
assert.equal(new Set(claims.claims.map(c => c.id)).size, claims.claims.length);
for (const c of claims.claims) {
  for (const key of ['calculation', 'assumptions', 'allowed', 'notAllowed', 'status']) assert.ok(c[key]?.length, `${c.id} missing ${key}`);
  for (const path of c.sources) assert.ok(fs.existsSync(path), `${c.id} source missing: ${path}`);
}
console.log('Evidence checks passed: three comparisons, all interventions, review gates, source hashes, temporal integrity and 18 claims.');
