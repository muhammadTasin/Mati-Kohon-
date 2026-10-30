// The Rongu lab: every move, gesture, mood and view on buttons, for review and tuning.
import { createRongu } from './rongu.js';
import { MOODS } from './rongu-model.js';
import { CHANNEL_NAMES } from './rongu-motion.js';

const $ = (id) => document.getElementById(id);
const canvas = $('rongu');
const params = new URLSearchParams(location.search);
if (params.has('solo')) document.body.classList.add('solo'); // just Rongu, for screenshots
const rongu = await createRongu(canvas, { framing: params.get('framing') || 'stage' });
$('loading').remove();
window.rongu = rongu; // handy in the console

const button = (parent, label, fn) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', fn);
  $(parent).append(b);
  return b;
};

// speech bubble that follows his head
const bubble = $('bubble');
let bubbleUntil = 0;
rongu.on('say', ({ text, seconds }) => { bubble.textContent = text; bubble.classList.add('on'); bubbleUntil = performance.now() + seconds * 1000 + 600; });
rongu.on('frame', () => {
  if (!bubble.classList.contains('on')) return;
  if (performance.now() > bubbleUntil) { bubble.classList.remove('on'); return; }
  const p = rongu.headScreen(), r = $('stage').getBoundingClientRect();
  bubble.style.left = `${Math.min(r.width - 150, Math.max(150, p.x - r.left))}px`;
  bubble.style.top = `${Math.max(90, p.y - r.top)}px`;
});

const circle = (u) => ({ x: Math.sin(u * Math.PI * 2) * 1.6, y: 0.75 + 0.25 * Math.sin(u * Math.PI * 4), z: 0.9 - Math.cos(u * Math.PI * 2) * 1.1 });
const MOVES = {
  'Hello': async () => { rongu.gesture('wave'); await rongu.say('নমস্কার! আমি রঙ্গু।'); },
  'Hop': () => rongu.act('hop'),
  'Walk': async () => { await rongu.act('walkTo', { x: 1.2, z: 0.3 }); await rongu.act('walkTo', { x: 0, z: 0 }); },
  'Fly': () => rongu.fly({ path: (u) => { const p = circle(u); const k = Math.min(1, u * 6, (1 - u) * 6); return { x: p.x * k, y: p.y, z: p.z * k }; }, duration: 5.5 }),
  'Dive into soil': () => rongu.dive({ splash: 'soil' }),
  'Dive into water': () => rongu.dive({ splash: 'water' }),
  'Backflip': () => rongu.act('backflip'),
  'Spin': () => rongu.act('spin'),
  'Celebrate': () => { rongu.mood('happy'); rongu.act('celebrate').then(() => setTimeout(() => rongu.mood('calm'), 800)); },
  'Sit': () => rongu.act('sit', { until: (t) => t > 6 }),
  'Sleep': () => rongu.sleep(),
  'Wake up': () => rongu.wake(),
};
for (const [label, fn] of Object.entries(MOVES)) button('moves', label, fn);

const GESTURE_LABELS = { wave: 'Wave', salam: 'Salam', point: 'Point', think: 'Think', shrug: 'Shrug', nod: 'Nod', shake: 'Shake head', adjustGlasses: 'Adjust glasses', thumbsUp: 'Thumbs up', clap: 'Clap', cheer: 'Cheer', readTablet: 'Read tablet', showTablet: 'Show tablet', giggle: 'Giggle', surprise: 'Surprise', oops: 'Oops', skySoil: 'Sky and soil eyes', stretch: 'Stretch' };
for (const g of rongu.gestures) button('gestures', GESTURE_LABELS[g] || g, () => {
  if (g === 'showTablet') rongu.setTablet('chart', { title: 'Groundwater' });
  rongu.gesture(g);
});

for (const f of ['neutral', 'happy', 'surprised', 'worried', 'sleepy', 'hot']) button('faces', f[0].toUpperCase() + f.slice(1), () => rongu.expression(f));
button('faces', 'Tongue', async () => {
  const m = rongu.motion;
  for (let i = 0; i <= 10; i++) { m.overrides.tongue = Math.sin(Math.PI * i / 10) * 0.9; m.overrides.mouthOpen = 0.3; await new Promise(r => setTimeout(r, 30)); }
  delete m.overrides.tongue; delete m.overrides.mouthOpen;
});

const swatches = [];
for (const [name, [hex]] of Object.entries(MOODS)) {
  const b = button('moods', '', () => { rongu.mood(name); swatches.forEach(s => s.classList.toggle('on', s === b)); });
  b.className = 'swatch' + (name === 'calm' ? ' on' : '');
  b.style.background = name === 'calm' ? '#96C85C' : hex;
  b.title = b.ariaLabel = name;
  swatches.push(b);
}

const VIEWS = { 'Three-quarter': -0.5, Front: 0, Side: -Math.PI / 2, Back: Math.PI };
for (const [label, yaw] of Object.entries(VIEWS)) button('views', label, () => {
  rongu.motion.home.yaw = yaw;
  const facing = Math.abs(yaw) < 0.5;
  $('follow').checked = facing; rongu.followPointer(facing); rongu.lookAtViewer(facing);
});

$('sayBtn').addEventListener('click', () => rongu.say($('sayText').value));
$('follow').addEventListener('change', (e) => rongu.followPointer(e.target.checked));
$('fidget').addEventListener('change', (e) => { rongu.motion.autoFidget = e.target.checked; });
$('slow').addEventListener('change', (e) => rongu.setSlowMotion(e.target.checked ? 0.25 : 1));

// pose channels: drag a slider to hold a channel at a value; double-click its name to let go
const pose = $('pose');
for (const k of CHANNEL_NAMES) {
  const name = document.createElement('span'); name.textContent = k; name.title = 'Double-click to release';
  const input = Object.assign(document.createElement('input'), { type: 'range', min: -3.2, max: 3.2, step: 0.01, value: 0 });
  const out = document.createElement('span');
  input.addEventListener('input', () => { rongu.motion.overrides[k] = Number(input.value); out.textContent = Number(input.value).toFixed(2); });
  name.addEventListener('dblclick', () => { delete rongu.motion.overrides[k]; out.textContent = ''; });
  pose.append(name, input, out);
}

setTimeout(() => MOVES.Hello(), 600);
