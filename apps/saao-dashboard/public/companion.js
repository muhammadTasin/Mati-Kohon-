// Rongu on the dashboard. On the landing page he is the hero: big, in front of the harvest photo, welcoming whoever
// arrives and offering the full tour. Elsewhere he stands in a corner of the page, flies out to whatever he explains, lights it up with a
// spotlight and talks in a speech bubble, in Bangla or English. Tours are lists of steps (companion-stories.js):
// the visitor's story walks through Mati Kohon in chapters, the farmer's tour through their portal.
//
//  - He loads after the page is up, and only where WebGL works. Hidden, he is a small button and three.js is never
//    fetched.
//  - His canvas takes no clicks: a press on his body is his, a press on the empty space around him reaches the page.
//    His eyes follow the pointer anywhere on the page. Drag him to carry him somewhere else; he stays there.
//  - Idle, he renders fewer frames, sits down after a minute and dozes off after a few more.

import { STORY, FARMER_TOUR, TOUR, HERO_LINES } from './companion-stories.js';
import { authConfig } from './auth-client.js';

const KEYS = { hidden: 'mk.rongu.hidden', face: 'mk.rongu.face', home: 'mk.rongu.home', progress: 'mk.rongu.progress.', greeted: 'mk.rongu.greeted', offered: 'mk.rongu.offered' };
const store = (area) => ({
  get(k) { try { return window[area].getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? window[area].removeItem(k) : window[area].setItem(k, v); } catch { /* storage blocked */ } },
});
const local = store('localStorage');
const session = store('sessionStorage');

const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'bn');
const t = (text) => (typeof text === 'string' ? text : text[lang()] ?? text.bn);
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const num = (n) => (lang() === 'en' ? String(n) : String(n).replace(/\d/g, d => BN_DIGITS[d]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const role = () => document.body.dataset.role || '';
const onEntry = () => document.body.classList.contains('state-entry');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const viewW = () => document.documentElement.clientWidth;
const viewH = () => window.innerHeight;
const REST_YAW = -0.62;

const UI = {
  name: { bn: 'রঙ্গু', en: 'Rongu' },
  talk: { bn: 'রঙ্গুর সাথে কথা বলুন', en: 'Talk to Rongu' },
  bringBack: { bn: 'রঙ্গুকে ডাকুন', en: 'Bring Rongu back' },
  next: { bn: 'পরের ধাপ', en: 'Next' },
  back: { bn: 'আগে', en: 'Back' },
  finish: { bn: 'শেষ', en: 'Finish' },
  chapters: { bn: 'অধ্যায়', en: 'Chapters' },
  close: { bn: 'বন্ধ করুন', en: 'Close' },
  later: { bn: 'পরে', en: 'Later' },
  hide: { bn: 'লুকিয়ে থাকো', en: 'Hide Rongu' },
  toStart: { bn: 'শুরুর পাতায় ফিরুন', en: 'Back to the start' },
  cardsHint: { bn: 'যেকোনো কার্ডে চাপ দিন, আমি উড়ে গিয়ে দেখিয়ে দেব!', en: "Tap any card and I'll fly over and show you!" },
  restart: { bn: 'শুরু থেকে', en: 'From the start' },
  resume: { bn: 'অধ্যায় {n} থেকে চালিয়ে যান', en: 'Continue from chapter {n}' },
  offerVisitor: {
    bn: 'স্বাগতম! আমি রঙ্গু। মাটি কহন কী করে, গল্পে গল্পে দেখাব? কয়েক মিনিট লাগবে।',
    en: "Welcome! I'm Rongu. Shall I show you what Mati Kohon does, as a short story? It takes a few minutes.",
  },
  offerFarmer: {
    bn: 'আসসালামু আলাইকুম! আমি রঙ্গু। আপনার পোর্টালটা ঘুরিয়ে দেখাব?',
    en: "Assalamu alaikum! I'm Rongu. Shall I show you round your portal?",
  },
  offerOfficer: {
    bn: 'আমি রঙ্গু। দর্শনার্থীরা মাটি কহনকে যেভাবে দেখেন, সেই গল্পটা দেখতে চাইলে আমাকে বলুন।',
    en: "I'm Rongu. If you'd like to see the story visitors see of Mati Kohon, just ask.",
  },
  menu: { bn: 'কী দেখাব?', en: 'What shall I show you?' },
  okLater: { bn: 'ঠিক আছে! দরকার হলে আমাকে চাপ দেবেন।', en: "All right! Tap me whenever you need me." },
  paused: { bn: 'গল্প থামালাম। আমাকে চাপ দিলে যেখানে ছিলাম সেখান থেকে চালাব।', en: "I've paused the story. Tap me and I'll carry on from where we were." },
  hiding: { bn: 'আমি মাটির নিচে আছি। দরকার হলে নিচের বোতামে ডাকবেন!', en: "I'll be under the soil. Call me with the button below!" },
  backAgain: { bn: 'এই যে, ফিরে এসেছি!', en: "Here I am again!" },
};

// ---------------------------------------------------------------------------------------------------------------------
// the page parts: his window, the spotlight, the bubble, a keyboard button and the "bring him back" button
// ---------------------------------------------------------------------------------------------------------------------

let rongu = null, loading = null;
let dock, canvas, spot, bubble, talkBtn, pill;
let W = 208, H = 260, footOff = { x: 104, y: 224 }, headOff = { x: 0, y: -190 };
let foot = { x: 0, y: 0 }; // where his feet are on screen (client px)
let anchor = null; // () => {x, y}: a point on the page he stands on, followed as the page scrolls; null = he stays put
let anchorSmooth = false; // ease towards the anchor (it jumps when the phone sheet changes height)
let flight = null; // the window travelling across the page while he glides
let carrying = null; // the user is carrying him
let tour = null; // { def, i, token, el }
let spotState = null; // { from, to, t, d }: the hole in the dim, moving from one part of the page to another
let bubbleState = null; // { placement, timer, kind }
let lastActive = performance.now(), lastPointer = 0, idle = 'awake', lostFor = 0;
let stageOn = false, stageSlot = null, canvasScale = 1; // the landing page's hero stage, and his window's scale while he leaves it
let heroTimer = 0, heroLine = 0; // what he says on the landing page
let switchingRole = false, guestBlocked = false; // a tour entering the role a step needs

const el = (tag, cls, attrs = {}) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

function build() {
  spot = el('div', 'rongu-spot', { 'aria-hidden': 'true' });
  dock = el('div', 'rongu-dock', { 'aria-hidden': 'true' });
  canvas = el('canvas', 'rongu-canvas');
  dock.append(canvas);
  bubble = el('section', 'rongu-bubble', { role: 'dialog', 'aria-live': 'polite', 'aria-labelledby': 'ronguBubbleText' });
  bubble.hidden = true;
  bubble.innerHTML = `
    <div class="rb-in">
      <div class="rb-head"><span class="rb-kicker"></span><button type="button" class="rb-x"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></div>
      <p class="rb-text" id="ronguBubbleText"></p>
      <div class="rb-list" hidden></div>
      <div class="rb-actions"></div>
      <div class="rb-progress" aria-hidden="true"></div>
    </div>
    <span class="rb-tail" aria-hidden="true"></span>`;
  talkBtn = el('button', 'rongu-talk', { type: 'button' });
  pill = el('button', 'rongu-pill', { type: 'button' });
  pill.hidden = true;
  pill.innerHTML = '<span class="rongu-pill-face" aria-hidden="true"></span><span class="rongu-pill-name"></span>';
  document.body.append(spot, dock, bubble, talkBtn, pill);

  bubble.querySelector('.rb-x').addEventListener('click', () => (tour ? endTour(false) : hideBubble()));
  talkBtn.addEventListener('click', () => openMenu(true));
  pill.addEventListener('click', () => showRongu());
  bubble.addEventListener('pointerenter', () => { if (bubbleState) bubbleState.hover = true; });
  bubble.addEventListener('pointerleave', () => { if (bubbleState) bubbleState.hover = false; });
  refreshLabels();
}

function refreshLabels() {
  talkBtn.textContent = t(UI.talk);
  pill.querySelector('.rongu-pill-name').textContent = t(UI.name);
  pill.setAttribute('aria-label', t(UI.bringBack));
  bubble.querySelector('.rb-x').setAttribute('aria-label', t(UI.close));
}

function measure() {
  W = dock.clientWidth || W; H = dock.clientHeight || H;
  if (!rongu) return;
  // from his standing height, not his pose (he may be mid-jump when the window resizes)
  const r = canvas.getBoundingClientRect(), home = rongu.motion.home;
  const f = rongu.worldToScreen(home.x, 0, home.z), h = rongu.worldToScreen(home.x, 2.12, home.z);
  footOff = { x: f.x - r.left, y: f.y - r.top };
  headOff = { x: h.x - f.x, y: h.y - f.y };
}

function setFoot(p) {
  foot = { x: p.x, y: p.y };
  dock.style.transform = `translate3d(${(p.x - footOff.x).toFixed(1)}px, ${(p.y - footOff.y).toFixed(1)}px, 0)`;
  talkBtn.style.transform = `translate3d(${(p.x - 70).toFixed(0)}px, ${(p.y - 30).toFixed(0)}px, 0)`;
}

// he must stay whole on screen: the body is about 0.6 of his window wide and 0.76 of it tall
const DOCK_H = () => (viewW() < 640 ? 188 : 260); // his usual window (companion.css), 0.8 as wide as tall
const sizeH = () => (stageOn ? DOCK_H() : H);
const bodyW = () => sizeH() * 0.8 * 0.6;
const bodyH = () => sizeH() * 0.76;
function clampFoot(p) {
  const top = headerOffset();
  return { x: clamp(p.x, bodyW() / 2 + 4, viewW() - bodyW() / 2 - 4), y: clamp(p.y, top + bodyH() + 4, viewH() - 6) };
}
function homeFoot() {
  let saved = null;
  try { saved = JSON.parse(local.get(KEYS.home) || 'null'); } catch { /* ignore */ }
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return clampFoot({ x: saved.x * viewW(), y: saved.y * viewH() });
  return clampFoot({ x: viewW() - bodyW() / 2 - 10, y: viewH() - 12 });
}
const centerFoot = () => clampFoot({ x: viewW() / 2, y: Math.min(viewH() - 24, viewH() / 2 + bodyH() * 0.7) });

// ---------------------------------------------------------------------------------------------------------------------
// the landing page: he stands big on #landingRongu (his window grows to the slot), talks, and shrinks as he flies off
// ---------------------------------------------------------------------------------------------------------------------

function sizeStage() {
  const h = Math.max(DOCK_H(), Math.round(stageSlot.getBoundingClientRect().height));
  dock.style.width = `${Math.round(h * 0.8)}px`;
  dock.style.height = `${h}px`;
  measure();
}

/** How much of the hero's stage is on screen now, 0-1 (what its IntersectionObserver reports, measured on the spot). */
function stageShown() {
  const r = document.getElementById('landingStage')?.getBoundingClientRect();
  if (!r || r.height <= 0) return 0;
  return Math.max(0, Math.min(r.bottom, viewH()) - Math.max(r.top, 0)) / r.height;
}

/**
 * Puts him on the landing page's stage; false when there is no stage to stand on (not the landing page, hidden) or it
 * is scrolled out of sight: his canvas would go off screen with it and stop drawing, and he would never come back.
 */
function enterStage() {
  stageSlot = document.getElementById('landingRongu');
  if (!rongu || !stageSlot || !onEntry() || !visible(stageSlot) || stageShown() < 0.3) return false;
  stageOn = true;
  dock.classList.add('stage');
  stageSlot.classList.add('ready');
  flight = null;
  canvasScale = 1;
  canvas.style.transform = '';
  sizeStage();
  anchor = () => { const r = stageSlot.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 2 }; };
  anchorSmooth = false;
  rongu.motion.home.yaw = REST_YAW;
  setFoot(anchor());
  return true;
}

/** His usual window again (at the end of the flight that takes him off the stage). */
function leaveStage() {
  if (!stageOn) return;
  stageOn = false;
  clearTimeout(heroTimer);
  dock.classList.remove('stage');
  dock.style.width = '';
  dock.style.height = '';
  canvasScale = 1;
  canvas.style.transform = '';
  measure();
  setFoot(foot);
}

/** Back on the landing page (a role was left): he blinks onto the stage and waves, or to his corner if it is out of sight. */
function returnToStage() {
  if (!rongu || tour || !onEntry() || stageOn || local.get(KEYS.hidden)) return;
  dock.classList.add('blink');
  setTimeout(() => {
    const ok = enterStage();
    dock.classList.remove('blink');
    if (ok) heroTalk(0);
    else { anchor = null; travelTo(homeFoot); } // the hero's watcher brings him up when it shows
  }, 200);
}

// Scrolling down the landing page he follows to his corner (the cards are where he is needed); back up, he returns
let stageRatio = 1, hinted = false;
const inFlight = () => Boolean(flight && !flight.done);
const stageFoot = () => { const r = stageSlot.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 2 }; };

function goCorner() {
  if (!rongu || !stageOn || tour || inFlight() || carrying) return;
  anchor = null;
  clearTimeout(heroTimer);
  rongu.mood('calm');
  travelTo(homeFoot).then(() => {
    if (tour || stageOn || !onEntry()) return;
    if (!hinted) { hinted = true; showBubble({ text: t(UI.cardsHint), autoHide: 6 }); rongu.gesture('point'); }
    syncStage();
  });
}

function goStage() {
  if (!rongu || stageOn || tour || inFlight() || carrying || !onEntry() || local.get(KEYS.hidden)) return;
  stageSlot = document.getElementById('landingRongu');
  if (!stageSlot || !visible(stageSlot)) return;
  const was = { ...foot };
  hideBubble();
  stageOn = true;
  dock.classList.add('stage');
  stageSlot.classList.add('ready');
  sizeStage(); // the window grows to the stage...
  canvasScale = DOCK_H() / H; // ...but starts at the size he is now
  canvas.style.transformOrigin = `${footOff.x.toFixed(1)}px ${footOff.y.toFixed(1)}px`;
  canvas.style.transform = `scale(${canvasScale.toFixed(4)})`;
  setFoot(was);
  anchor = null;
  travelTo(stageFoot, { scale: { from: canvasScale, to: 1, end: 'stage' } }).then(() => {
    if (!stageOn || tour) return;
    anchor = stageFoot;
    rongu.motion.home.yaw = REST_YAW;
    heroTalk();
    syncStage();
  });
}

/** Where he should be for how much of the hero shows. */
function syncStage() {
  if (!onEntry() || tour) return;
  if (stageOn && stageRatio < 0.3) goCorner();
  else if (!stageOn && stageRatio > 0.65) goStage();
}

/**
 * The landing map (landing-map.js) has Rongu say what a layer or a place shows, his skin taking the layer's mood
 * (flood, drought, heat); his own lines come back after a while. False when he is not on the stage.
 */
window.ronguHeroSay = (text, { gesture = null, mood = null, speak = true } = {}) => {
  if (!rongu || !stageOn || tour) return false;
  clearTimeout(heroTimer);
  const say = document.getElementById('landingSay');
  if (say && say.textContent !== text) {
    say.classList.add('swap');
    setTimeout(() => { say.textContent = text; say.classList.remove('swap'); }, 200);
  }
  if (mood) rongu.mood(mood);
  if (speak && idle === 'awake' && !document.hidden) {
    rongu.say(text, { seconds: Math.min(5, 0.8 + text.length / 24) });
    if (gesture) rongu.gesture(gesture);
  }
  heroLine = Math.max(heroLine, 1); // his own lines start again from the second, later
  heroTimer = setTimeout(() => heroTalk(), 25000);
  return true;
};

/** One line on the landing page every few seconds, each with a gesture; twice through, then he just listens. */
function heroTalk(at = heroLine) {
  clearTimeout(heroTimer);
  if (!stageOn || tour || !rongu || at >= HERO_LINES.length * 2) return;
  const line = HERO_LINES[at % HERO_LINES.length];
  heroLine = at + 1;
  const say = document.getElementById('landingSay');
  if (say && at > 0) {
    say.classList.add('swap');
    setTimeout(() => { say.textContent = t(line.text); say.classList.remove('swap'); }, 220);
  }
  if (idle === 'awake' && !document.hidden) {
    if (line.tablet) rongu.setTablet(...line.tablet);
    rongu.say(t(line.text), { seconds: Math.min(4, 0.8 + t(line.text).length / 24) });
    if (!rongu.busy || at === 0) rongu.gesture(line.gesture);
  }
  heroTimer = setTimeout(() => heroTalk(), 7500);
}

function headerOffset() {
  const header = document.querySelector('.app-header');
  if (!header) return 0;
  const pos = getComputedStyle(header).position;
  return pos === 'sticky' || pos === 'fixed' ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

// the weather screen is the farmer screen's weather tab on its own (portals.js)
const onScreen = (id) => {
  const weatherOnly = document.body.classList.contains('weather-only');
  if (id === 'screen-weather') return weatherOnly && !!document.getElementById('screen-farmer')?.classList.contains('active');
  return !!document.getElementById(id)?.classList.contains('active') && !(id === 'screen-farmer' && weatherOnly);
};

const visible = (node) => {
  if (!node || !node.isConnected) return false;
  if (node.closest('[hidden]')) return false;
  const r = node.getBoundingClientRect();
  return r.width > 2 && r.height > 2 && getComputedStyle(node).visibility !== 'hidden';
};
async function waitVisible(selector, ms) {
  const until = performance.now() + ms;
  for (;;) {
    const node = [...document.querySelectorAll(selector)].find(visible);
    if (node) return node;
    if (performance.now() > until) return null;
    await wait(80);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// flying: the window travels on an arc while he glides in it, facing where he goes
// ---------------------------------------------------------------------------------------------------------------------

const dockShown = () => { const r = dock.getBoundingClientRect(); return r.bottom > 0 && r.top < viewH() && r.right > 0 && r.left < viewW(); };

function travelTo(target, opts = {}) {
  const from = { ...foot }, to = target();
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  // a flight off the stage shrinks his window to its usual size on the way; opts.scale can grow it back onto the stage
  const scale = opts.scale ?? (stageOn ? { from: canvasScale, to: DOCK_H() / H, end: 'leave' } : null);
  const settle = () => {
    if (scale?.end === 'leave') leaveStage();
    else if (scale?.end === 'stage') { canvasScale = 1; canvas.style.transform = ''; }
  };
  // a short hop, or a window off screen (his frames, which fly him, stop while his canvas is out of view): just there
  if (d < 18 || !dockShown()) { setFoot(to); flight = null; settle(); return Promise.resolve(); }
  if (reduced) { // no flying: a short fade to the new place
    dock.classList.add('blink');
    return wait(170).then(() => { settle(); setFoot(target()); dock.classList.remove('blink'); return wait(170); });
  }
  const inAir = flight && !flight.done;
  const next = { from, target, dur: clamp(0.42 + d / 1300, 0.6, 1.35), t: inAir ? 0 : -0.36, vel: flight?.vel || { x: 0, y: 0 }, done: false, lift: Math.min(140, 30 + d * 0.22),
    scale, settle };
  next.arrived = new Promise(r => { next.resolve = r; });
  if (flight && !flight.done) flight.resolve();
  flight = next;
  if (!inAir) {
    rongu.motion.stopActions();
    rongu.act('glide', { heading: () => (flight ? flight.vel : { x: 0, y: 0 }), until: () => !flight || flight.done });
  }
  return next.arrived;
}

function flyStep(dt) {
  const f = flight;
  f.t += dt;
  if (f.t <= 0) return;
  const u = clamp(f.t / f.dur, 0, 1), k = ease(u);
  const to = f.target();
  const c = { x: (f.from.x + to.x) / 2, y: Math.min(f.from.y, to.y) - f.lift };
  const p = {
    x: (1 - k) * (1 - k) * f.from.x + 2 * (1 - k) * k * c.x + k * k * to.x,
    y: (1 - k) * (1 - k) * f.from.y + 2 * (1 - k) * k * c.y + k * k * to.y,
  };
  const vx = (p.x - foot.x) / Math.max(dt, 1e-3), vy = (p.y - foot.y) / Math.max(dt, 1e-3);
  f.vel = { x: f.vel.x + (vx - f.vel.x) * 0.3, y: f.vel.y + (vy - f.vel.y) * 0.3 };
  setFoot(p);
  if (f.scale) { // the big window scales around his feet (down off the stage, up onto it), then becomes the right window
    canvasScale = f.scale.from + (f.scale.to - f.scale.from) * k;
    canvas.style.transformOrigin = `${footOff.x.toFixed(1)}px ${footOff.y.toFixed(1)}px`;
    canvas.style.transform = `scale(${canvasScale.toFixed(4)})`;
  }
  if (u >= 1) { f.done = true; f.vel = { x: 0, y: 0 }; f.settle(); f.resolve(); }
}

// ---------------------------------------------------------------------------------------------------------------------
// the spotlight: the page dims, one part stays lit; the lit hole moves from part to part as the page scrolls
// ---------------------------------------------------------------------------------------------------------------------

const rectOf = (node, pad) => {
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
};
let spotNow = null;
function moveSpot(node, pad = 8) {
  const prev = spotNow;
  spotState = { from: () => prev, to: () => rectOf(node, pad), t: 0, d: reduced ? 0.01 : 0.55 };
}
function spotStep(dt) {
  const s = spotState;
  s.t = Math.min(s.d, s.t + dt);
  const k = ease(s.t / s.d);
  const a = s.from(), b = s.to();
  const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: 0, h: 0 });
  const screenMid = { x: viewW() / 2, y: viewH() / 2, w: 0, h: 0 };
  const A = a || (b ? mid(b) : screenMid), B = b || (a ? mid(a) : screenMid);
  const r = { x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, w: A.w + (B.w - A.w) * k, h: A.h + (B.h - A.h) * k };
  spotNow = r.w > 1 ? r : null;
  spot.style.transform = `translate3d(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px, 0)`;
  spot.style.width = `${Math.max(0, r.w).toFixed(1)}px`;
  spot.style.height = `${Math.max(0, r.h).toFixed(1)}px`;
  spot.classList.toggle('closed', r.w < 8);
}

// ---------------------------------------------------------------------------------------------------------------------
// the speech bubble: next to his head, never over the lit part if it can help it; words appear one after another
// ---------------------------------------------------------------------------------------------------------------------

function showBubble({ kicker = '', text = '', actions = [], list = null, progress = null, autoHide = 0, kind = 'say', speak = true, focus = false }) {
  const textEl = bubble.querySelector('.rb-text');
  bubble.querySelector('.rb-kicker').textContent = kicker;
  textEl.replaceChildren();
  const words = text.split(/\s+/).filter(Boolean);
  const step = Math.min(26, 950 / Math.max(1, words.length));
  words.forEach((w, i) => {
    const span = el('span', 'w');
    span.textContent = w;
    span.style.animationDelay = `${Math.round(i * step)}ms`;
    textEl.append(span, ' ');
  });
  bubble.classList.toggle('reveal', !reduced);

  const listEl = bubble.querySelector('.rb-list');
  listEl.replaceChildren();
  listEl.hidden = !list;
  textEl.hidden = !!list;
  if (list) for (const item of list) listEl.append(item);

  const row = bubble.querySelector('.rb-actions');
  row.replaceChildren();
  for (const a of actions) {
    const b = el('button', `btn btn-sm ${a.primary ? 'btn-primary' : 'btn-secondary'}${a.quiet ? ' rb-quiet' : ''}`, { type: 'button' });
    if (a.icon && a.iconAfter) b.innerHTML = `<span></span><span class="material-symbols-outlined" aria-hidden="true">${a.icon}</span>`;
    else if (a.icon) b.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${a.icon}</span><span></span>`;
    else b.innerHTML = '<span></span>';
    b.querySelector('span:not(.material-symbols-outlined)').textContent = a.label;
    b.addEventListener('click', a.run);
    if (a.primary) b.dataset.primary = '1';
    row.append(b);
  }
  row.hidden = actions.length === 0;

  const prog = bubble.querySelector('.rb-progress');
  prog.replaceChildren();
  prog.hidden = !progress;
  if (progress) {
    for (let i = 0; i < progress.of; i++) prog.append(el('span', i < progress.at ? 'done' : i === progress.at ? 'now' : ''));
  }

  clearTimeout(bubbleState?.timer);
  bubbleState = { placement: null, kind, hover: false, timer: 0, frames: 0 };
  bubble.classList.toggle('sheet', kind === 'tour' && compact());
  bubble.hidden = false;
  bubble.classList.remove('on');
  placeBubble(true);
  void bubble.offsetWidth; // start the fade-in from here (no frame wait: a background tab may not draw frames)
  bubble.classList.add('on');
  if (speak && text && rongu) rongu.say(text, { seconds: Math.min(6, 0.8 + text.length / 22) });
  if (autoHide) {
    const tick = () => {
      if (!bubbleState || bubbleState.kind !== kind) return;
      if (bubbleState.hover || bubble.contains(document.activeElement)) { bubbleState.timer = setTimeout(tick, 1500); return; }
      hideBubble();
    };
    bubbleState.timer = setTimeout(tick, autoHide * 1000);
  }
  if (focus) (row.querySelector('[data-primary]') || row.querySelector('button'))?.focus({ preventScroll: true });
}

function hideBubble() {
  if (!bubbleState) return;
  clearTimeout(bubbleState.timer);
  bubbleState = null;
  if (bubble.contains(document.activeElement)) document.activeElement.blur();
  bubble.classList.remove('on');
  setTimeout(() => { if (!bubbleState) bubble.hidden = true; }, 220);
}

const overlap = (a, b) => (a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0);

function placeBubble(force = false) {
  if (bubble.classList.contains('sheet')) {
    bubble.style.transform = `translate3d(10px, ${(viewH() - bubble.offsetHeight - 10).toFixed(1)}px, 0)`;
    bubble.dataset.side = 'sheet';
    bubbleState.placement = 'sheet';
    return;
  }
  if (force) {
    bubble.style.width = '';
    const first = choosePlacement(true);
    // it would cover much of the lit part: if the free strip beside the lit part is wide enough, narrow it to fit
    const s = spotNow, area = bubble.offsetWidth * bubble.offsetHeight;
    if (s && first.over / area > 0.12) {
      const head = foot.x + headOff.x, m = 10;
      const strip = head < s.x ? s.x - 2 * m : viewW() - (s.x + s.w) - 2 * m;
      if (strip >= 230 && strip < bubble.offsetWidth) { bubble.style.width = `${Math.floor(strip)}px`; choosePlacement(true); }
    }
    return;
  }
  choosePlacement(false);
}

function choosePlacement(force) {
  const head = { x: foot.x + headOff.x, y: foot.y + headOff.y };
  const bw = bubble.offsetWidth, bh = bubble.offsetHeight, vw = viewW(), vh = viewH(), m = 10, gap = 16;
  const top = headerOffset() + m;
  const body = { x: foot.x - bodyW() / 2, y: foot.y - bodyH(), w: bodyW(), h: bodyH() };
  const spots = [
    ['above', head.x - bw / 2, head.y - bh - gap],
    ['left', foot.x - bodyW() / 2 - bw - gap, head.y - 18],
    ['right', foot.x + bodyW() / 2 + gap, head.y - 18],
    ['below', head.x - bw / 2, foot.y + gap],
  ];
  // sliding along his head is fine while the tail still reaches it; covering him or the lit part is not
  const PREFER = { above: 0, left: 2500, right: 2500, below: 6000 };
  const place = (name, x, y) => {
    let cx = clamp(x, m, vw - bw - m);
    const cy = clamp(y, top, vh - bh - m);
    // above or below him, slide out of the lit part if the tail can still reach his head
    const s = spotNow;
    if (s && (name === 'above' || name === 'below') && cx < s.x + s.w && cx + bw > s.x) {
      for (const nx of [s.x - m - bw, s.x + s.w + m]) {
        if (nx >= m && nx + bw <= vw - m && head.x >= nx + 14 && head.x <= nx + bw - 14) { cx = nx; break; }
      }
    }
    const r = { x: cx, y: cy, w: bw, h: bh };
    const vertical = name === 'above' || name === 'below';
    const reach = vertical ? head.x >= cx + 14 && head.x <= cx + bw - 14 && Math.abs(cy - y) < 4 : head.y >= cy + 10 && head.y <= cy + bh - 10 && Math.abs(cx - x) < 4;
    const over = overlap(r, spotNow);
    const cost = over * 1.2 + overlap(r, body) * 2.5 + (reach ? 0 : 60000) + PREFER[name];
    return { name, x: cx, y: cy, cost, over };
  };
  bubbleState.frames++;
  let chosen = null;
  if (!force && bubbleState.placement && bubbleState.frames % 20 !== 0) {
    const s = spots.find(p => p[0] === bubbleState.placement);
    chosen = place(...s);
  } else {
    const all = spots.map(s => place(...s)).sort((a, b) => a.cost - b.cost);
    const current = bubbleState.placement && all.find(p => p.name === bubbleState.placement);
    chosen = current && !force && current.cost <= all[0].cost * 1.25 + 1 ? current : all[0];
    bubbleState.placement = chosen.name;
  }
  bubble.style.transform = `translate3d(${chosen.x.toFixed(1)}px, ${chosen.y.toFixed(1)}px, 0)`;
  bubble.dataset.side = chosen.name;
  const tx = clamp(head.x - chosen.x, 18, bw - 18), ty = clamp(head.y - chosen.y + 10, 18, bh - 18);
  bubble.style.setProperty('--tx', `${tx.toFixed(0)}px`);
  bubble.style.setProperty('--ty', `${ty.toFixed(0)}px`);
  return chosen;
}

// ---------------------------------------------------------------------------------------------------------------------
// where he stands next to a part of the page: beside it if there is room, else on its top edge, under it, or inside
// ---------------------------------------------------------------------------------------------------------------------

// on a phone the bubble is a sheet along the bottom of the screen during tours, and he stands on top of it
const compact = () => viewW() < 640;
const SHEET_GUESS = 190;
const sheetH = () => (bubbleState && !bubble.hidden ? bubble.offsetHeight : SHEET_GUESS) + 10;
const sheetFoot = () => ({ x: viewW() - bodyW() / 2 - 4, y: viewH() - sheetH() + 2 });

function placeFor(node, step) {
  if (compact()) return { foot: sheetFoot, yaw: REST_YAW, side: 'sheet', smooth: true };
  if (!node) return { foot: step.place === 'center' ? centerFoot : homeFoot, yaw: REST_YAW, side: 'free' };
  const m = 8, r = node.getBoundingClientRect(), vw = viewW();
  const top = headerOffset();
  const sideY = (q) => clamp(Math.min(q.bottom, viewH() - 10), top + bodyH() + 6, viewH() - 10);
  if (r.left >= bodyW() + m * 2) return { foot: () => { const q = node.getBoundingClientRect(); return { x: q.left - m - bodyW() / 2, y: sideY(q) }; }, yaw: 0.55, side: 'left' };
  if (vw - r.right >= bodyW() + m * 2) return { foot: () => { const q = node.getBoundingClientRect(); return { x: q.right + m + bodyW() / 2, y: sideY(q) }; }, yaw: -0.55, side: 'right' };
  const x = (q) => clamp(Math.min(q.right, vw) - bodyW() * 0.62, bodyW() / 2 + 4, vw - bodyW() / 2 - 4);
  if (r.top - top >= bodyH() + 4) return { foot: () => { const q = node.getBoundingClientRect(); return { x: x(q), y: q.top + 3 }; }, yaw: -0.35, side: 'top' };
  if (viewH() - r.bottom >= bodyH() + 10) return { foot: () => { const q = node.getBoundingClientRect(); return { x: x(q), y: q.bottom + bodyH() + 6 }; }, yaw: -0.35, side: 'below' };
  return { foot: () => { const q = node.getBoundingClientRect(); return { x: x(q), y: Math.min(q.bottom, viewH()) - 8 }; }, yaw: REST_YAW, side: 'inside' };
}

// scroll so the part sits in the middle of the free space (with room above it when he must stand on its edge)
let scrollAnim = null;
function scrollToNode(node) {
  const r = node.getBoundingClientRect(), vh = viewH(), vw = viewW();
  const sideRoom = r.left >= bodyW() + 16 || vw - r.right >= bodyW() + 16;
  let top = headerOffset() + 12;
  if (!compact() && !sideRoom && r.height <= vh - top - bodyH() - 24) top += bodyH();
  // on a phone the sheet and Rongu on it take the bottom of the screen
  const room = vh - top - (compact() ? SHEET_GUESS + bodyH() * 0.75 : 16);
  let y = r.height <= room ? scrollY + r.top - top - (room - r.height) / 2 : scrollY + r.top - top;
  y = clamp(y, 0, Math.max(0, document.documentElement.scrollHeight - vh));
  if (Math.abs(y - scrollY) < 6) return Promise.resolve();
  if (reduced) { window.scrollTo({ top: y, behavior: 'instant' }); return Promise.resolve(); }
  stopScroll();
  // stepped by his frames (tick), so the scroll, the spotlight and his flight share one clock
  return new Promise(resolve => { scrollAnim = { y0: scrollY, y, t: 0, d: clamp(Math.abs(y - scrollY) / 2400, 0.32, 0.9), resolve }; });
}
function scrollStep(dt) {
  const a = scrollAnim;
  a.t += dt;
  const u = Math.min(1, a.t / a.d);
  window.scrollTo({ top: a.y0 + (a.y - a.y0) * ease(u), behavior: 'instant' });
  if (u >= 1) { scrollAnim = null; a.resolve(); }
}
const stopScroll = () => { const a = scrollAnim; scrollAnim = null; a?.resolve(); };

// ---------------------------------------------------------------------------------------------------------------------
// tours
// ---------------------------------------------------------------------------------------------------------------------

function savedProgress(def) {
  const v = local.get(KEYS.progress + def.id);
  return v === 'done' ? 'done' : Number.isFinite(Number(v)) && v !== null ? Number(v) : null;
}

async function startTour(def, from = 0) {
  await ready();
  if (!rongu) return;
  endTour(false, { quiet: true });
  hideBubble();
  wakeUp();
  clearTimeout(heroTimer);
  tour = { def, i: -1, token: 0, el: null };
  document.documentElement.classList.add('rongu-touring');
  spotNow = null;
  spotState = { from: () => null, to: () => null, t: 0, d: 0.01 };
  spot.classList.add('on');
  goStep(from, 1);
}

async function goStep(i, dir) {
  if (!tour) return;
  const { def } = tour;
  if (i < 0) i = 0;
  if (i >= def.steps.length) { endTour(true); return; }
  const token = ++tour.token;
  const live = () => tour && tour.token === token;
  const step = def.steps[i];
  tour.i = i;
  tour.el = null;
  local.set(KEYS.progress + def.id, String(i));
  hideBubble();
  stopScroll();
  anchor = null; // he keeps his place on screen while the page moves
  rongu.lookAtScreen(null);
  rongu.mood(step.mood || 'calm');

  // the full tour enters the role a step needs (the demo farmer, the guest manager); a role this server cannot open is skipped
  if (step.role && role() !== step.role) {
    const ok = await switchRole(step.role);
    if (!live()) return;
    if (!ok) {
      let j = i + dir;
      while (j >= 0 && j < def.steps.length && def.steps[j].role === step.role) j += dir;
      if (j < 0) endTour(false); else goStep(j, dir);
      return;
    }
  }

  if (step.screen && !onScreen(step.screen)) { window.switchScreen?.(step.screen); await wait(320); }
  if (step.tab && !document.getElementById(`fpanel-${step.tab}`)?.classList.contains('active')) { window.switchFarmerTab?.(step.tab); await wait(140); }
  if (!live()) return;

  let node = null;
  if (step.target) {
    node = await waitVisible(step.target, 1600);
    if (!live()) return;
    if (!node) { goStep(i + dir, dir); return; } // not on the page for this role or place
  }
  moveSpot(node, step.pad ?? 8);
  if (node) await scrollToNode(node);
  if (!live()) return;
  tour.el = node;

  const place = placeFor(node, step);
  const to = place.foot();
  const stay = Math.hypot(to.x - foot.x, to.y - foot.y) < 18;
  await travelTo(place.foot);
  if (!live()) return;
  anchor = place.foot;
  anchorSmooth = !!place.smooth;
  rongu.motion.home.yaw = place.yaw;
  if (stay && !reduced && !step.act) rongu.act('hop', { height: 0.22 }); // standing still between parts (phone): a little hop
  if (node) {
    const r = node.getBoundingClientRect();
    rongu.lookAtScreen(r.left + r.width / 2, r.top + Math.min(r.height / 2, 140));
    setTimeout(() => { if (live()) rongu.lookAtScreen(null); }, 1400);
  }
  showStepBubble(step);
  perform(step, live);
}

/** Enters a role for the tour: the visitor, the demo farmer (one click) or the guest manager (GUEST_MODE). */
async function switchRole(next) {
  switchingRole = true;
  try {
    if (next === 'officer' && guestBlocked) return false;
    if (next === 'visitor') {
      if (role()) window.signOutRole?.(); // from a demo role back to the visitor
      window.chooseRole?.('visitor');
    } else if (next === 'farmer') {
      await window.farmerDemoSignIn?.();
    } else if (next === 'officer') {
      if (!(await authConfig())?.guestMode) { guestBlocked = true; return false; }
      await window.guestManagerSignIn?.();
    }
    for (let k = 0; k < 20 && role() !== next; k++) await wait(100);
    if (next === 'officer' && role() !== next) guestBlocked = true;
    return role() === next;
  } finally {
    setTimeout(() => { switchingRole = false; }, 400);
  }
}

function showStepBubble(step) {
  const { def, i } = tour;
  const ch = step.chapter, last = i === def.steps.length - 1;
  showBubble({
    kind: 'tour',
    kicker: `${num(ch + 1)}/${num(def.chapters.length)} · ${t(def.chapters[ch])}`,
    text: t(step.text),
    progress: { at: ch, of: def.chapters.length },
    focus: true,
    actions: [
      ...(i > 0 ? [{ label: t(UI.back), icon: 'arrow_back', quiet: true, run: () => goStep(i - 1, -1) }] : []),
      { label: t(UI.chapters), icon: 'format_list_numbered', quiet: true, run: showChapters },
      ...(last && def.backToStart ? [{ label: t(UI.toStart), icon: 'home', quiet: true, run: () => { endTour(true, { quiet: true }); window.signOutRole?.(); } }] : []),
      last
        ? { label: t(UI.finish), icon: 'check', primary: true, run: () => endTour(true) }
        : { label: t(UI.next), icon: 'arrow_forward', iconAfter: true, primary: true, run: () => goStep(i + 1, 1) },
    ],
  });
}

function showChapters() {
  if (!tour) return;
  const { def } = tour, current = def.steps[tour.i]?.chapter ?? 0;
  const list = def.chapters.map((name, ci) => {
    const b = el('button', `rb-chapter${ci === current ? ' now' : ''}`, { type: 'button' });
    b.innerHTML = '<span class="rb-chapter-n"></span><span></span>';
    b.firstChild.textContent = num(ci + 1);
    b.lastChild.textContent = t(name);
    b.addEventListener('click', () => goStep(def.steps.findIndex(s => s.chapter === ci), 1));
    return b;
  });
  showBubble({
    kind: 'tour', speak: false, kicker: t(def.title), list, progress: { at: current, of: def.chapters.length },
    actions: [{ label: t(UI.back), icon: 'arrow_back', quiet: true, run: () => showStepBubble(def.steps[tour.i]) }],
  });
  bubble.querySelector('.rb-chapter.now')?.focus({ preventScroll: true });
}

async function perform(step, live) {
  if (step.tablet) rongu.setTablet(...step.tablet);
  const gestures = [].concat(step.gesture || (step.act ? [] : ['nod']));
  const act = step.act && (!reduced || step.act === 'celebrate') ? step.act : null; // no dives or flips when motion is reduced
  if (act) setTimeout(() => { if (live()) rongu.act(act, step.actOpts); }, step.actDelay ?? 800);
  await wait(180);
  for (const g of gestures) {
    if (!live()) return;
    await rongu.gesture(g);
  }
}

function endTour(finished, { quiet = false } = {}) {
  if (!tour) return;
  const { def } = tour;
  tour.token++;
  tour = null;
  stopScroll();
  if (finished) local.set(KEYS.progress + def.id, 'done');
  document.documentElement.classList.remove('rongu-touring');
  spot.classList.remove('on');
  setTimeout(() => { if (!tour) { spotState = null; spotNow = null; } }, 400);
  hideBubble();
  if (quiet) return;
  rongu.mood('calm');
  rongu.lookAtScreen(null);
  rongu.motion.home.yaw = REST_YAW;
  if (onEntry()) { // stopped before leaving the landing page: back on the stage (or, scrolled away from it, his corner)
    if (!stageOn) { returnToStage(); return; }
    if (enterStage()) { heroTalk(); return; }
  }
  anchor = null;
  travelTo(homeFoot).then(() => {
    if (tour) return;
    if (!finished) showBubble({ text: t(UI.paused), autoHide: 6 });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// talking to him: the menu, the greetings, hiding and coming back
// ---------------------------------------------------------------------------------------------------------------------

function storyActions(def, { onEnter = null } = {}) {
  const at = savedProgress(def);
  const go = (from) => async () => {
    hideBubble();
    if (onEnter) { onEnter(); await wait(450); }
    startTour(def, from);
  };
  if (typeof at === 'number' && at > 0) {
    const ch = def.steps[at]?.chapter ?? 0;
    return [
      { label: t(UI.resume).replace('{n}', num(ch + 1)), icon: 'play_arrow', primary: true, run: go(def.steps.findIndex(s => s.chapter === ch)) },
      { label: t(UI.restart), icon: 'replay', run: go(0) },
    ];
  }
  return [{ label: t(def.title), icon: 'auto_stories', primary: true, run: go(0) }];
}

function openMenu(focus = false) {
  if (tour) { showStepBubble(tour.def.steps[tour.i]); return; }
  const r = role();
  let actions;
  if (onEntry() || !r || r === 'visitor') actions = storyActions(TOUR);
  else if (r === 'farmer') actions = storyActions(FARMER_TOUR);
  else actions = storyActions(STORY);
  actions.push({ label: t(UI.hide), icon: 'visibility_off', quiet: true, run: hideRongu });
  showBubble({ kind: 'menu', kicker: t(UI.name), text: t(UI.menu), actions, autoHide: 14, focus });
}

function greet() {
  if (onEntry()) { if (stageOn) heroTalk(0); return; } // the landing page greets with his own lines
  offerForRole();
}

function offerForRole() {
  const r = role();
  if (!r || tour || switchingRole || session.get(KEYS.offered + r)) return;
  session.set(KEYS.offered + r, '1');
  const def = r === 'farmer' ? FARMER_TOUR : r === 'visitor' ? TOUR : STORY;
  if (savedProgress(def) === 'done' && r !== 'visitor') return;
  const text = t(r === 'farmer' ? UI.offerFarmer : r === 'officer' ? UI.offerOfficer : UI.offerVisitor);
  rongu.gesture(r === 'farmer' ? 'salam' : 'wave');
  showBubble({ kind: 'offer', kicker: t(UI.name), text, autoHide: 18, actions: [
    ...storyActions(def),
    { label: t(UI.later), quiet: true, run: laterLine },
  ] });
}

function laterLine() { showBubble({ text: t(UI.okLater), autoHide: 4 }); rongu.gesture('thumbsUp'); }

async function hideRongu() {
  endTour(false, { quiet: true });
  hideBubble();
  try { local.set(KEYS.face, rongu.portrait(96)); } catch { /* the picture is optional */ }
  showBubble({ text: t(UI.hiding), autoHide: 3 });
  await wait(1500);
  hideBubble();
  if (!reduced) await rongu.act('dive', { splash: 'soil', stay: true });
  dock.classList.remove('on');
  await wait(300);
  leaveStage();
  rongu.pause();
  local.set(KEYS.hidden, '1');
  document.documentElement.classList.add('rongu-off');
  showPill();
}

function showPill() {
  const face = local.get(KEYS.face);
  const faceEl = pill.querySelector('.rongu-pill-face');
  const ok = !!face && face.startsWith('data:image/png;base64,');
  faceEl.style.backgroundImage = ok ? `url("${face}")` : '';
  faceEl.classList.toggle('material-symbols-outlined', !ok); // no picture yet: a leaf instead of his face
  faceEl.textContent = ok ? '' : 'eco';
  pill.hidden = false;
  requestAnimationFrame(() => pill.classList.add('on'));
}

async function showRongu() {
  pill.classList.remove('on');
  pill.hidden = true;
  local.set(KEYS.hidden, null);
  document.documentElement.classList.remove('rongu-off');
  if (!rongu) { await load(); if (!stageOn) showBubble({ text: t(UI.backAgain), autoHide: 4 }); return; }
  rongu.resume();
  anchor = null; flight = null;
  if (!enterStage()) setFoot(homeFoot());
  rongu.motion.stopActions();
  const up = reduced ? Promise.resolve() : rongu.act('emerge', { splash: 'soil' });
  requestAnimationFrame(() => requestAnimationFrame(() => dock.classList.add('on')));
  await up;
  rongu.gesture('wave');
  if (stageOn) heroTalk(0); else showBubble({ text: t(UI.backAgain), autoHide: 4 });
}

// ---------------------------------------------------------------------------------------------------------------------
// the loop: every frame he draws, the window, the spotlight and the bubble follow
// ---------------------------------------------------------------------------------------------------------------------

function tick(dt) {
  if (scrollAnim) scrollStep(dt);
  if (flight && !flight.done) flyStep(dt);
  else if (anchor && !carrying) {
    const p = anchor();
    if (anchorSmooth) { const k = 1 - Math.exp(-dt * 14); setFoot({ x: foot.x + (p.x - foot.x) * k, y: foot.y + (p.y - foot.y) * k }); }
    else setFoot(p);
  }
  if (spotState) spotStep(dt);
  if (bubbleState && !bubble.hidden) placeBubble();

  // the lit part went away (the user switched screens): pause the story
  if (tour && tour.el) {
    lostFor = visible(tour.el) ? 0 : lostFor + dt;
    if (lostFor > 0.4) { lostFor = 0; endTour(false); }
  }

  const now = performance.now();
  const active = tour || bubbleState || flight || carrying || rongu.busy || now - lastPointer < 2500;
  rongu.setFrameRate(idle === 'asleep' ? 24 : active ? 60 : 30);
}

function wakeUp() {
  lastActive = performance.now();
  if (idle === 'asleep') rongu?.wake();
  idle = 'awake';
}

function watchIdle() {
  setInterval(() => {
    if (!rongu || !dock.classList.contains('on') || tour || bubbleState || carrying || flight) return;
    const quiet = performance.now() - lastActive;
    if (idle === 'awake' && quiet > 60000 && !rongu.busy) { idle = 'sitting'; rongu.act('sit', { until: () => idle !== 'sitting' }); }
    else if (idle === 'sitting' && quiet > 180000) { idle = 'asleep'; rongu.sleep(); }
  }, 4000);
  window.addEventListener('pointermove', () => { lastPointer = performance.now(); if (idle !== 'awake') wakeUp(); else lastActive = lastPointer; }, { passive: true });
  for (const ev of ['keydown', 'scroll', 'pointerdown']) window.addEventListener(ev, () => { lastPointer = performance.now(); if (idle !== 'awake') wakeUp(); else lastActive = lastPointer; }, { passive: true });
  // a wheel or a swipe during a tour's scroll gives the page back to the user
  for (const ev of ['wheel', 'touchmove']) window.addEventListener(ev, stopScroll, { passive: true });
}

function wire() {
  rongu.on('frame', tick);
  const stageBox = document.getElementById('landingStage');
  if (stageBox) {
    new IntersectionObserver((entries) => { stageRatio = entries[entries.length - 1].intersectionRatio; syncStage(); },
      { threshold: [0, 0.3, 0.65, 1] }).observe(stageBox);
  }
  rongu.on('poke', (kind) => {
    wakeUp();
    if (kind === 'backflip' || kind === 'pet' || tour) return;
    setTimeout(() => { if (!tour && !carrying) openMenu(); }, 500);
  });
  rongu.on('carry-start', ({ x, y }) => {
    wakeUp();
    flight?.resolve(); // whoever waited for this flight goes on; he is in the user's hand now
    flight = null; anchor = null;
    carrying = { dx: x - foot.x, dy: y - foot.y };
    if (bubbleState?.kind !== 'tour') hideBubble();
  });
  rongu.on('carry', ({ x, y }) => { if (carrying) setFoot({ x: x - carrying.dx, y: y - carrying.dy }); });
  rongu.on('carry-end', () => {
    carrying = null;
    anchor = null; // he stays where he was put, even during a tour
    const c = clampFoot(foot);
    if (Math.hypot(c.x - foot.x, c.y - foot.y) > 1) {
      const from = { ...foot }, t0 = performance.now();
      const slide = () => { const u = Math.min(1, (performance.now() - t0) / 260), k = ease(u); setFoot({ x: from.x + (c.x - from.x) * k, y: from.y + (c.y - from.y) * k }); if (u < 1) requestAnimationFrame(slide); };
      requestAnimationFrame(slide);
    }
    if (!tour) local.set(KEYS.home, JSON.stringify({ x: c.x / viewW(), y: c.y / viewH() }));
  });

  window.addEventListener('resize', () => {
    if (stageOn) sizeStage();
    measure();
    if (!anchor && !flight && !carrying) setFoot(tour ? clampFoot(foot) : homeFoot());
  });
  window.addEventListener('keydown', (e) => {
    if (!tour || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
    if (e.key === 'Escape') { e.preventDefault(); endTour(false); }
    else if (e.key === 'ArrowRight' && tour.i >= 0) { e.preventDefault(); goStep(tour.i + 1, 1); }
    else if (e.key === 'ArrowLeft' && tour.i > 0) { e.preventDefault(); goStep(tour.i - 1, -1); }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !tour && bubbleState) hideBubble(); });

  // the language and the role: re-say the bubble in the new language; greet a role once per session
  new MutationObserver(() => {
    refreshLabels();
    const say = document.getElementById('landingSay');
    if (stageOn && say && heroLine > 0) say.textContent = t(HERO_LINES[(heroLine - 1) % HERO_LINES.length].text);
    if (tour && bubbleState?.kind === 'tour' && tour.i >= 0 && !bubble.querySelector('.rb-list:not([hidden])')) showStepBubble(tour.def.steps[tour.i]);
    else if (bubbleState && bubbleState.kind !== 'tour') hideBubble();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  let lastRole = role();
  new MutationObserver(() => {
    if (role() === lastRole) return;
    lastRole = role();
    if (tour && !switchingRole) endTour(false, { quiet: true });
    if (!lastRole) { // back on the landing page
      if (bubbleState?.kind === 'offer') hideBubble();
      if (!tour) setTimeout(returnToStage, 250);
      return;
    }
    if (stageOn && !tour) { anchor = null; rongu.mood('calm'); travelTo(homeFoot); } // a role card was chosen: off the stage, to his corner
    setTimeout(offerForRole, 900);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-role'] });
}

// ---------------------------------------------------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------------------------------------------------

function webglWorks() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

const ready = () => loading || load();

function load() {
  if (loading) return loading;
  loading = (async () => {
    const { createRongu } = await import('./mascot/rongu.js');
    rongu = await createRongu(canvas, { framing: 'dock', passThrough: true, carry: true, restYaw: REST_YAW });
    window.rongu = rongu; // handy in the console, with the companion's own state and tours
    window.ronguCompanion = {
      state: () => ({ foot, headOff, footOff, W, H, stageOn, canvasScale, anchored: !!anchor, flying: !!flight && !flight.done, step: tour?.i ?? null, placement: bubbleState?.placement ?? null, idle }),
      story: (from = 0) => startTour(STORY, from), farmerTour: (from = 0) => startTour(FARMER_TOUR, from), tour: (from = 0) => startTour(TOUR, from), stop: () => endTour(false),
      heroSeen: (ratio) => { stageRatio = ratio; syncStage(); }, // what the hero's visibility watcher reports (for tests)
    };
    measure();
    if (!enterStage()) setFoot(homeFoot());
    wire();
    const up = reduced ? Promise.resolve() : rongu.act('emerge', { splash: 'soil' });
    requestAnimationFrame(() => requestAnimationFrame(() => dock.classList.add('on')));
    await up;
    greet();
  })().catch((err) => { console.warn('Rongu could not load', err); dock.remove(); rongu = null; });
  return loading;
}

/** Without 3D (or before he can come): enter the role and open the part, no flying. */
async function plainShow(step) {
  if (step.role && role() !== step.role && !(await switchRole(step.role))) { if (step.role === 'officer') window.chooseRole?.('officer'); return; }
  if (step.screen && !onScreen(step.screen)) window.switchScreen?.(step.screen);
  if (step.tab) window.switchFarmerTab?.(step.tab);
  const node = step.target ? await waitVisible(step.target, 1600) : null;
  node?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
}

/** The landing page's buttons and cards: the full tour from a chapter (0 = the start). */
function showChapter(chapter = 0) {
  const from = Math.max(0, TOUR.steps.findIndex(s => s.chapter === chapter));
  const step = TOUR.steps[from];
  if (step.role === 'officer' && guestBlocked) { window.chooseRole?.('officer'); return; } // no guest mode: the sign-in card
  if (!webglWorks()) { plainShow(step); return; }
  if (local.get(KEYS.hidden)) showRongu().then(() => startTour(TOUR, from));
  else ready().then(() => (rongu ? startTour(TOUR, from) : plainShow(step)));
}

function boot() {
  window.ronguShow = showChapter;
  // without guest mode the manager cards lead to the sign-in card instead of the tour
  authConfig().then((cfg) => {
    if (cfg && !cfg.guestMode) {
      guestBlocked = true;
      document.querySelectorAll('.feature-tile[data-role="officer"]').forEach(b => b.classList.add('locked'));
    }
  });
  if (!webglWorks()) { document.documentElement.classList.add('no-rongu'); return; }
  build();
  watchIdle();
  if (local.get(KEYS.hidden)) { document.documentElement.classList.add('rongu-off'); showPill(); return; }
  // on the landing page he is the hero: come at once; elsewhere, when the page is idle
  const go = () => load();
  if (onEntry()) go();
  else if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200);
}

if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot, { once: true });
