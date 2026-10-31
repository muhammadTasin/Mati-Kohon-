// Renders Rongu's loops for the phone app frame by frame (24 fps, transparent) and posts each frame to serve.py.
// Every loop lasts LOOP seconds and starts and ends in the same idle pose, so the app can switch from one
// loop to another at a loop's end without a jump. window.capture(['wave']) renders some of them again.
import { createRongu } from '/mascot/rongu.js';

const FPS = 24, SUB = 5, LOOP = 3; // 5 motion steps of 1/120 s per frame
const logEl = document.getElementById('log');
const log = (s) => { logEl.textContent += `\n${s}`; console.log(s); };

const canvas = document.getElementById('rongu');
const rongu = await createRongu(canvas, { framing: 'full', quality: 1, shadows: true, maxPixelRatio: 1, interactive: false, reducedMotion: false });
rongu.pause();
const { motion: m, renderer, scene, camera } = rongu;
renderer.setPixelRatio(1);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
camera.aspect = canvas.clientWidth / canvas.clientHeight;
camera.updateProjectionMatrix();
// only the soft contact shadow under his feet: the long cast shadow on the floor would widen every frame
scene.children.find(o => o.material?.isShadowMaterial).visible = false;
m.autoFidget = false;
m.loop = LOOP; // every idle rhythm fits a whole number of times into a loop
m.t = 0;

// small eye darts so he looks alive, back on the viewer before the loop ends
const DARTS = [[0, 0, 0], [0.8, 0.05, 0.03], [1.9, -0.04, 0], [2.55, 0, 0]];
const darts = (tc) => { const d = DARTS.filter(x => tc >= x[0]).pop(); return { yaw: d[1], pitch: d[2] }; };
const still = () => ({ yaw: 0, pitch: 0 });

const LOOPS = {
  idle: { blink: 1.1, eyes: darts },
  wave: { start: () => m.gesture('wave', { duration: 1.9 }) },
  talk: { start: () => m.speak(2.4), blink: 1.9, eyes: darts }, // a short pause at the end lets the head settle
  point: { start: () => m.gesture('point', { duration: 2.0 }) },
};

// one frame of time; blinks and glances follow the loop's own script, never chance
const step = (tc, spec, t0) => {
  m.saccade = { at: Infinity, ...(spec.eyes || still)(tc) };
  m.blinkAt = tc < (spec.blink ?? Infinity) ? t0 + spec.blink : Infinity;
  for (let i = 0; i < SUB; i++) { m.lookAt(camera.position); m.update(1 / 120); }
};
const settle = (loops) => { for (let f = 0; f < loops * LOOP * FPS; f++) step(f / FPS, {}, m.t); };

const probe = document.createElement('canvas');
probe.width = canvas.width; probe.height = canvas.height;
const pctx = probe.getContext('2d', { willReadFrequently: true });
const pixels = () => { pctx.clearRect(0, 0, probe.width, probe.height); pctx.drawImage(canvas, 0, 0); return pctx.getImageData(0, 0, probe.width, probe.height).data; };

async function record(name) {
  const spec = LOOPS[name];
  settle(1);
  const t0 = m.t; // a whole number of loops: the same idle pose for every loop's first frame
  spec.start?.();
  const posts = [];
  let first;
  for (let f = 0; f < LOOP * FPS; f++) {
    renderer.render(scene, camera);
    if (f === 0) first = pixels();
    const url = canvas.toDataURL('image/png');
    posts.push(fetch(url).then(r => r.blob()).then(b => fetch(`/__frames/${name}/${String(f).padStart(3, '0')}.png`, { method: 'POST', body: b })));
    step(f / FPS, spec, t0);
  }
  // the seam: the frame after the last one should be the first one again
  renderer.render(scene, camera);
  const next = pixels();
  let sum = 0, max = 0;
  for (let i = 0; i < next.length; i++) { const d = Math.abs(next[i] - first[i]); sum += d; if (d > max) max = d; }
  await Promise.all(posts);
  log(`${name}: ${LOOP * FPS} frames; seam mean ${(sum / next.length).toFixed(3)}, max ${max}`);
}

window.capture = async (names = Object.keys(LOOPS)) => {
  const start = performance.now();
  settle(3);
  for (const n of names) await record(n);
  log(`done in ${((performance.now() - start) / 1000).toFixed(1)} s`);
  document.title = 'Rongu loops: done';
};
log(`Rongu ready, canvas ${canvas.width}x${canvas.height}`);
if (!new URLSearchParams(location.search).has('hold')) window.capture();
