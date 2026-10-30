// Rongu, the companion: his meshes build cleanly and every move runs without breaking his pose.
import { buildRongu, HAND_POSES } from './apps/saao-dashboard/public/mascot/rongu-shapes.js';
import { Motion, GESTURES, ACTIONS, CHANNEL_NAMES } from './apps/saao-dashboard/public/mascot/rongu-motion.js';

const fail = (msg) => { console.error('✗', msg); process.exit(1); };

// 1. Meshes: every part is a clean, closed-looking surface with sane normals
const t0 = performance.now();
const parts = buildRongu(0.7);
const ms = performance.now() - t0;
const expected = ['head', 'shirt', 'pelvis', 'sleeve', 'upperArm', 'forearm', 'thigh', 'shin', 'shoeUpper', 'shoeSole', 'shoeCap', 'shoeLaces', 'badge', 'face', ...Object.keys(HAND_POSES).map(p => 'hand_' + p)];
for (const name of expected) {
  const p = parts[name];
  if (!p) fail(`part ${name} is missing`);
  const n = p.positions.length / 3;
  if (n < 100) fail(`part ${name} has only ${n} vertices`);
  for (let i = 0; i < p.indices.length; i++) if (p.indices[i] >= n) fail(`part ${name} has an index out of range`);
  for (let v = 0; v < n; v += 7) {
    const l = Math.hypot(p.normals[v * 3], p.normals[v * 3 + 1], p.normals[v * 3 + 2]);
    if (!(Math.abs(l - 1) < 0.01)) fail(`part ${name} has a normal of length ${l}`);
  }
  if (p.colors) for (const c of p.colors) if (!(c >= 0 && c <= 1)) fail(`part ${name} has a colour out of range`);
}
const tris = expected.reduce((s, k) => s + parts[k].indices.length / 3, 0);
console.log(`✓ Rongu's ${expected.length} parts built in ${ms.toFixed(0)} ms (light quality, ${tris} triangles)`);

// 2. Motion: every gesture and action plays to the end and leaves a finite pose
let applied = null;
const model = { setHand() {}, apply(p) { applied = p; }, clipPlane: { constant: 1000 } };
const m = new Motion(model);
const step = (seconds) => { for (let s = 0; s < seconds; s += 1 / 60) m.update(1 / 60); };
const finite = (label) => {
  for (const k of CHANNEL_NAMES) if (!Number.isFinite(applied[k])) fail(`${label}: channel ${k} became ${applied[k]}`);
};
for (const g of Object.keys(GESTURES)) {
  let done = false;
  m.gesture(g).then(() => { done = true; });
  step(GESTURES[g].d + 0.2);
  await Promise.resolve();
  if (!done) fail(`gesture ${g} did not finish`);
  finite(`gesture ${g}`);
}
const path = (u) => ({ x: Math.sin(u * 6.28) * 1.2, y: 0.8, z: 0.5 });
const runs = {
  hop: {}, walkTo: { x: 1, z: 0.2 }, fly: { path, duration: 3 }, dive: {}, backflip: {}, spin: {}, celebrate: {},
  sit: { until: (t) => t > 1.5 }, sleep: { until: (t) => t > 2 },
};
for (const [name, opts] of Object.entries(runs)) {
  let done = false;
  m.act(ACTIONS[name](opts)).then(() => { done = true; });
  step(12);
  await Promise.resolve();
  if (!done) fail(`action ${name} did not finish`);
  finite(`action ${name}`);
}
if (model.clipPlane.constant !== 1000) fail('the dive left the ground clipped');
step(3);
if (Math.abs(applied.rootY) > 0.02 || Math.abs(applied.rootPitch) > 0.02) fail(`Rongu did not come back to his feet (y ${applied.rootY}, pitch ${applied.rootPitch})`);
console.log(`✓ ${Object.keys(GESTURES).length} gestures and ${Object.keys(runs).length} moves play through and land him back on his feet`);
