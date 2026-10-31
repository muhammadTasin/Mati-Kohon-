// How Rongu moves. Every channel of his pose is a spring, so whatever asks him to move,
// he eases into it with a little follow-through and never snaps.
// Layers, in order: locomotion (idle, walk, fly, dive, sit…), gestures (wave, point, think…),
// the face (expressions, speech, blinks, glances), then the springs.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const rand = (a, b) => a + Math.random() * (b - a);

// [rest value, spring speed (rad/s), damping (1 = no overshoot)]
const CHANNELS = {
  rootX: [0, 7, 1], rootY: [0, 9, 1], rootZ: [0, 7, 1], rootYaw: [0, 6, 1], rootPitch: [0, 9, 1], rootRoll: [0, 6, 0.75], squash: [1, 18, 0.32],
  hipsX: [0, 7, 1], hipsY: [0, 10, 0.85], hipsZ: [0, 7, 1], hipsTilt: [0, 7, 0.9], hipsTwist: [0, 6, 1], hipsRoll: [0, 6, 0.85],
  chestX: [0, 7, 0.85], chestY: [0, 6, 0.95], chestZ: [0, 6, 0.85],
  headX: [0, 8, 0.8], headY: [0, 7, 0.9], headZ: [0, 7, 0.8],
  eyeLYaw: [0, 32, 1], eyeLPitch: [0, 32, 1], eyeRYaw: [0, 32, 1], eyeRPitch: [0, 32, 1],
  lidLUp: [0.06, 48, 1], lidLLow: [0, 48, 1], lidRUp: [0.06, 48, 1], lidRLow: [0, 48, 1],
  mouthOpen: [0, 24, 0.9], mouthSmile: [1, 10, 1], mouthWidth: [1, 14, 1], blush: [0, 4, 1],
  armLOut: [0, 9, 0.78], armLRaise: [0, 9, 0.78], armLTwist: [0, 9, 0.9], elbowL: [0.3, 10, 0.8], wristLX: [0, 12, 0.8], wristLZ: [0, 12, 0.8], wristLTwist: [0, 12, 0.9],
  armROut: [0, 9, 0.78], armRRaise: [0, 9, 0.78], armRTwist: [0, 9, 0.9], elbowR: [0.3, 10, 0.8], wristRX: [0, 12, 0.8], wristRZ: [0, 12, 0.8], wristRTwist: [0, 12, 0.9],
  legLSwing: [0, 11, 0.85], legLOut: [0, 9, 1], kneeL: [0.06, 11, 0.85], ankleL: [0, 11, 1],
  legRSwing: [0, 11, 0.85], legROut: [0, 9, 1], kneeR: [0.06, 11, 0.85], ankleR: [0, 11, 1],
  tailCurl: [1, 3.4, 0.65], tailWag: [0.06, 4, 1], tailDroop: [0, 3.4, 0.6], tailLift: [0, 3, 0.7], tailSpeed: [1.5, 3, 1],
  glassesY: [0, 16, 0.55], tablet: [1, 10, 0.55], backpack: [0, 7, 0.7], thrust: [0, 12, 1], tongue: [0, 34, 0.8], tonguePitch: [0, 20, 1], tongueYaw: [0, 20, 1], shadow: [1, 6, 1],
};

// He holds his tablet in his right hand, like in the drawing.
const HOLD_TABLET = { armROut: 0.24, armRRaise: 0.32, armRTwist: 0.35, elbowR: 1.55, wristRX: 0.15, wristRZ: -0.1, wristRTwist: 0.2 };

class Spring {
  constructor(v, w, z) { this.v = v; this.vel = 0; this.target = v; this.w = w; this.z = z; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.w * this.w * (this.target - this.v) - 2 * this.z * this.w * this.vel;
      this.vel += a * h; this.v += this.vel * h;
    }
  }
}

// ---------- gestures: functions of time that return targets (and hand shapes) ----------
// "+key" adds to whatever the lower layers asked for instead of replacing it.
export const GESTURES = {
  wave: { d: 2.4, fn: (t) => {
    const o = Math.sin(t * TAU * 2.1);
    return { armLOut: 1.32, armLRaise: 0.18, armLTwist: 1.5, elbowL: 1.45 + 0.38 * o, wristLX: 0.1, wristLTwist: 0.2, handL: 'open', '+headZ': -0.12, '+headY': 0.08, mouthSmile: 1.6, mouthOpen: 0.22, lidLLow: 0.28, lidRLow: 0.28, blush: 0.5, '+tailWag': 0.12 };
  } },
  salam: { d: 2.6, fn: (t, d) => {
    const bow = smooth(0.4, 0.9, t) * smooth(d - 0.3, d - 0.9, t);
    return { armROut: -0.12, armRRaise: 0.8, armRTwist: -0.8, elbowR: 1.5, wristRX: 0.15, handR: 'open', tablet: 0, '+chestX': 0.14 * bow, '+headX': 0.3 * bow, lidLUp: 0.75 * bow + 0.06, lidRUp: 0.75 * bow + 0.06, mouthSmile: 1.4 };
  } },
  point: { d: 1.8, fn: () => ({ armLOut: 0.55, armLRaise: 1.35, armLTwist: 0.2, elbowL: 0.15, wristLX: -0.1, handL: 'point', mouthSmile: 1.2, '+headZ': -0.05 }) },
  // hand on his cheek, head resting on it, eyes up
  think: { d: 3.2, fn: (t) => ({ armLOut: 0.6, armLRaise: 1.0, armLTwist: 1.2, elbowL: 1.8, wristLX: 0.1, handL: 'relaxed', '+headZ': -0.15, '+headX': -0.06, eyeLPitch: 0.38, eyeRPitch: 0.38, eyeLYaw: 0.22, eyeRYaw: 0.22, mouthSmile: 0.2, mouthWidth: 0.6, tailCurl: 1.18, '+chestZ': 0.03 * Math.sin(t * 3) }) },
  shrug: { d: 1.5, fn: () => ({ armLOut: 0.45, armLRaise: 0.35, armLTwist: 1.3, elbowL: 1.25, armROut: 0.45, armRRaise: 0.35, armRTwist: 1.3, elbowR: 1.25, handL: 'open', handR: 'open', tablet: 0, '+headZ': 0.18, mouthSmile: -0.3, mouthWidth: 0.7, '+chestX': -0.04, '+hipsY': 0.01 }) },
  nod: { d: 1.0, fn: (t) => ({ '+headX': 0.22 * Math.sin(t * TAU * 2) * smooth(0, 0.15, t), mouthSmile: 1.3 }) },
  shake: { d: 1.1, fn: (t) => ({ '+headY': 0.32 * Math.sin(t * TAU * 2.2), mouthSmile: 0.1 }) },
  // his glasses slip, and he flicks them back up with his tongue
  adjustGlasses: { d: 1.9, fn: (t) => {
    const slip = smooth(0.1, 0.45, t), lick = Math.sin(Math.PI * clamp((t - 0.6) / 0.45, 0, 1));
    const push = smooth(0.75, 0.9, t);
    return { glassesY: -0.03 * slip * (1 - push) + 0.012 * push * smooth(1.6, 1.2, t), tongue: 0.3 * lick, tonguePitch: 1.16, mouthOpen: 0.28 * Math.min(1, lick * 3), mouthWidth: 0.55, '+headX': -0.06, lidLUp: 0.35 * slip * (1 - push) + 0.06, lidRUp: 0.35 * slip * (1 - push) + 0.06, eyeLPitch: 0.25 * lick, eyeRPitch: 0.25 * lick, mouthSmile: 1.2 };
  } },
  thumbsUp: { d: 1.8, fn: () => ({ armLOut: 0.1, armLRaise: 0.55, armLTwist: 0.0, elbowL: 1.35, wristLX: 0.0, handL: 'thumbsUp', lidLUp: 0.95, mouthSmile: 1.7, mouthOpen: 0.12, blush: 0.6, '+headZ': -0.12 }) },
  clap: { d: 1.7, fn: (t) => {
    const o = Math.max(0, Math.sin(t * TAU * 3.2));
    return { armLOut: -0.05, armLRaise: 0.95, armLTwist: -0.9, elbowL: 1.0 + 0.35 * o, armROut: -0.05, armRRaise: 0.95, armRTwist: -0.9, elbowR: 1.0 + 0.35 * o, handL: 'open', handR: 'open', tablet: 0, mouthSmile: 1.7, mouthOpen: 0.3, lidLLow: 0.3, lidRLow: 0.3 };
  } },
  cheer: { d: 1.6, fn: (t) => {
    const o = Math.sin(t * TAU * 1.6);
    return { armLOut: 2.45 + 0.12 * o, armLRaise: 0.2, elbowL: 0.35, armROut: 2.45 - 0.12 * o, armRRaise: 0.2, elbowR: 0.35, handL: 'open', handR: 'open', tablet: 0, mouthSmile: 1.8, mouthOpen: 0.45, lidLLow: 0.35, lidRLow: 0.35, blush: 0.8, tailWag: 0.35, tailSpeed: 6 };
  } },
  readTablet: { d: 3.5, fn: (t) => ({ ...HOLD_TABLET, armRRaise: 0.62, armRTwist: -0.25, elbowR: 1.9, wristRTwist: 0.9, armLOut: -0.1, armLRaise: 0.62, armLTwist: -0.6, elbowL: 1.85 + 0.08 * Math.max(0, Math.sin(t * TAU * 1.6)), handL: 'point', '+headX': 0.28, '+headZ': -0.08, eyeLPitch: -0.3, eyeRPitch: -0.3, eyeLYaw: -0.15, eyeRYaw: -0.15, mouthWidth: 0.75 }) },
  showTablet: { d: 2.6, fn: () => ({ armROut: 0.08, armRRaise: 1.05, armRTwist: -1.35, elbowR: 0.85, wristRX: -0.2, wristRTwist: 0.0, mouthSmile: 1.5, mouthOpen: 0.15, '+headY': 0.1, '+headZ': 0.08 }) },
  giggle: { d: 1.1, fn: (t) => ({ '+chestZ': 0.06 * Math.sin(t * TAU * 9), '+headZ': 0.05 * Math.sin(t * TAU * 9 + 1), lidLLow: 0.5, lidRLow: 0.5, lidLUp: 0.35, lidRUp: 0.35, mouthOpen: 0.25 + 0.15 * Math.abs(Math.sin(t * TAU * 6)), mouthSmile: 1.9, blush: 1, '+squash': 0.02 * Math.sin(t * TAU * 9) }) },
  surprise: { d: 1.1, fn: () => ({ lidLUp: -0.05, lidRUp: -0.05, mouthOpen: 0.55, mouthWidth: 0.42, mouthSmile: 0, armLOut: 0.5, armROut: 0.5, elbowL: 0.9, elbowR: 1.6, handL: 'open', '+headX': -0.12, '+chestX': -0.06 }) },
  oops: { d: 1.8, fn: () => ({ '+headX': 0.25, '+headZ': 0.12, mouthSmile: -0.8, mouthWidth: 0.6, tailCurl: 0.75, tailDroop: -0.35, '+chestX': 0.08, armLOut: -0.05, elbowL: 0.4 }) },
  skySoil: { d: 2.8, fn: (t, d) => {
    const k = smooth(0.15, 0.5, t) * smooth(d, d - 0.4, t);
    return { eyeLPitch: 0.62 * k, eyeLYaw: 0.2 * k, eyeRPitch: -0.55 * k, eyeRYaw: -0.15 * k, '+headZ': 0.06 * k, mouthSmile: 1.3 };
  } },
  stretch: { d: 2.4, fn: (t) => {
    const k = Math.sin(Math.PI * clamp(t / 2.4, 0, 1));
    return { armLOut: 2.6 * k, armROut: 2.6 * k, elbowL: 0.2, elbowR: 0.2, handL: 'open', handR: 'open', tablet: 0, '+chestX': -0.12 * k, '+headX': -0.25 * k, mouthOpen: 0.85 * k, mouthWidth: 0.65, lidLUp: 0.85 * k, lidRUp: 0.85 * k, '+squash': 0.05 * k };
  } },
};

export const CHANNEL_NAMES = Object.keys(CHANNELS);

export class Motion {
  constructor(model, { reducedMotion = false } = {}) {
    this.model = model;
    this.reduced = reducedMotion;
    this.springs = {};
    for (const [k, [v, w, z]] of Object.entries(CHANNELS)) this.springs[k] = new Spring(k in HOLD_TABLET ? HOLD_TABLET[k] : v, w, z);
    this.t = 0;
    this.tailPhase = 0;
    this.actions = [];
    this.gestures = [];
    this.look = null; // a THREE.Vector3-like {x, y, z} in world space
    this.face = {};
    this.speakUntil = 0;
    this.blinkAt = 1.5; this.blinkStart = -1;
    this.saccade = { at: 0.8, yaw: 0, pitch: 0 };
    this.scan = { at: rand(8, 14), until: 0, L: [0, 0], R: [0, 0] };
    this.fidgetAt = rand(7, 12);
    this.autoFidget = true;
    this.loop = 0; // seconds; when set, the idle rhythms repeat exactly (the phone app's pre-rendered loops)
    this.hands = { L: 'relaxed', R: 'grip' };
    this.home = { x: 0, z: 0, yaw: 0 };
    this.overrides = {}; // fixed values, for tuning poses in the lab // where he stands when nothing moves him
    this.listeners = {};
    model.setHand('R', 'grip');
  }

  on(event, fn) { (this.listeners[event] ||= []).push(fn); }
  emit(event, data) { for (const fn of this.listeners[event] || []) fn(data); }
  snap(channel, value) { const s = this.springs[channel]; s.v = value; s.target = value; s.vel = 0; }
  get busy() { return this.actions.length > 0; }
  value(channel) { return this.springs[channel].v; }

  // ----- public moves -----
  gesture(name, opts = {}) {
    const g = GESTURES[name];
    if (!g) return Promise.resolve();
    this.gestures = this.gestures.filter(x => x.name !== name);
    return new Promise(resolve => this.gestures.push({ name, g, t: 0, d: opts.duration || g.d, resolve }));
  }
  act(action) { return new Promise(resolve => this.actions.push({ ...action, t: 0, resolve })); }
  stopActions() { for (const a of this.actions) a.resolve?.(); this.actions = []; }
  lookAt(point) { this.look = point; }
  speak(seconds) { this.speakUntil = this.t + seconds; }
  expression(name) { this.face = EXPRESSIONS[name] || {}; }

  // ----- the frame -----
  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.t += dt;
    const t = this.t, P = {};
    for (const k in CHANNELS) P[k] = CHANNELS[k][0];
    Object.assign(P, HOLD_TABLET);
    P.handL = 'relaxed'; P.handR = 'grip';
    P.rootX = this.home.x; P.rootZ = this.home.z; P.rootYaw = this.home.yaw;

    // idle life: breathing, weight shifts, a slowly curling tail
    // (with this.loop set, each rhythm is rounded to fit a whole number of times into it: seamless pre-rendered loops)
    const per = (p) => (this.loop ? this.loop / Math.max(1, Math.round(this.loop / p)) : p);
    const br = Math.sin(t * TAU / per(3.6));
    P.chestX += 0.02 * br; P.hipsY += 0.004 * br; P.armLOut += 0.012 * br; P.armROut += 0.008 * br;
    P.hipsX = 0.014 * Math.sin(t * TAU / per(7.3)); P.hipsRoll = 0.022 * Math.sin(t * TAU / per(7.3) + 0.4);
    P.chestZ = -0.015 * Math.sin(t * TAU / per(7.3) + 0.9);
    P.headZ = 0.035 * Math.sin(t * TAU / per(5.7) + 1.1); P.headY = 0.05 * Math.sin(t * TAU / per(9.1));
    P.tailCurl = 1 + 0.05 * Math.sin(t * TAU / per(6.2));
    P.legLOut = 0.02; P.legROut = 0.02;

    // locomotion: the first queued action drives the body
    const a = this.actions[0];
    if (a) {
      a.t += dt;
      const done = a.update(a.t, P, this, dt);
      if (done) { this.actions.shift(); a.resolve?.(); }
    } else if (this.autoFidget && !this.reduced && t > this.fidgetAt && this.gestures.length === 0) {
      this.fidgetAt = t + rand(8, 15);
      this.gesture(['readTablet', 'adjustGlasses', 'skySoil', 'think'][Math.floor(Math.random() * 4)]);
    }

    // gestures blend over the body with soft in/out
    for (const g of this.gestures) {
      g.t += dt;
      const w = smooth(0, 0.28, g.t) * smooth(g.d, g.d - 0.35, g.t);
      const out = g.g.fn(g.t, g.d, this);
      for (const [k, v] of Object.entries(out)) {
        if (k === 'handL' || k === 'handR') { if (w > 0.45) P[k] = v; continue; }
        if (k[0] === '+') P[k.slice(1)] += v * w;
        else P[k] = lerp(P[k], v, w);
      }
    }
    this.gestures = this.gestures.filter(g => { if (g.t >= g.d) { g.resolve(); return false; } return true; });

    this.faceLayer(P, dt);
    Object.assign(P, this.overrides);
    const tailHz = CHANNELS.tailSpeed[0] * 0.4, tailFit = this.loop ? Math.max(1, Math.round(tailHz * this.loop)) / (tailHz * this.loop) : 1;
    this.tailPhase += dt * this.springs.tailSpeed.v * TAU * 0.4 * tailFit;

    for (const k in this.springs) { const s = this.springs[k]; s.target = P[k]; s.step(dt); }
    for (const side of ['L', 'R']) if (P['hand' + side] !== this.hands[side]) { this.hands[side] = P['hand' + side]; this.model.setHand(side, this.hands[side]); }

    const pose = {};
    for (const k in this.springs) pose[k] = this.springs[k].v;
    pose.tailPhase = this.tailPhase;
    this.model.apply(pose, t);
  }

  faceLayer(P, dt) {
    const t = this.t;
    for (const [k, v] of Object.entries(this.face)) P[k] = k[0] === '+' ? P[k.slice(1)] + v : v;

    // where he looks: eyes lead, the head follows, the chest turns a little
    if (this.look) {
      const yaw0 = this.springs.rootYaw.v;
      const hx = this.springs.rootX.v, hy = this.springs.rootY.v + 1.55, hz = this.springs.rootZ.v;
      let dx = this.look.x - hx, dy = this.look.y - hy, dz = this.look.z - hz;
      const c = Math.cos(-yaw0), s = Math.sin(-yaw0);
      [dx, dz] = [dx * c + dz * s, -dx * s + dz * c];
      const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const headYaw = clamp(yaw * 0.32, -0.8, 0.8), headPitch = clamp(pitch * 0.5, -0.45, 0.45);
      P.headY += headYaw; P.headX -= headPitch; P.chestY += yaw * 0.12;
      const ey = clamp(yaw - headYaw, -0.6, 0.6), ep = clamp(pitch - headPitch, -0.42, 0.42);
      P.eyeLYaw += ey; P.eyeRYaw += ey; P.eyeLPitch += ep; P.eyeRPitch += ep;
    }

    // tiny darting glances
    if (t > this.saccade.at) {
      this.saccade = { at: t + rand(0.5, 2.6), yaw: rand(-0.07, 0.07), pitch: rand(-0.05, 0.05) };
    }
    P.eyeLYaw += this.saccade.yaw; P.eyeRYaw += this.saccade.yaw; P.eyeLPitch += this.saccade.pitch; P.eyeRPitch += this.saccade.pitch;

    // a chameleon's trick, now and then: each eye looks its own way
    if (!this.look && !this.reduced && t > this.scan.at && this.actions.length === 0) {
      this.scan = { at: t + rand(10, 18), until: t + 1.8, L: [rand(-0.45, 0.45), rand(-0.1, 0.45)], R: [rand(-0.45, 0.45), rand(-0.45, 0.1)] };
    }
    if (t < this.scan.until) {
      P.eyeLYaw = this.scan.L[0]; P.eyeLPitch = this.scan.L[1]; P.eyeRYaw = this.scan.R[0]; P.eyeRPitch = this.scan.R[1];
    }

    // speech: a syllable rhythm on the mouth
    if (t < this.speakUntil) {
      const syl = Math.abs(Math.sin(t * 11.5) * Math.sin(t * 4.3 + 1.2));
      P.mouthOpen = Math.max(P.mouthOpen, 0.12 + 0.55 * syl);
      P.mouthWidth = 0.78 + 0.28 * Math.sin(t * 7.1);
      P.headX += 0.025 * Math.sin(t * 6.3);
    }

    // blinking
    if (t > this.blinkAt && this.blinkStart < 0) { this.blinkStart = t; }
    if (this.blinkStart >= 0) {
      const b = t - this.blinkStart;
      const k = b < 0.07 ? b / 0.07 : b < 0.19 ? 1 - (b - 0.07) / 0.12 : 0;
      for (const side of ['L', 'R']) {
        P['lid' + side + 'Up'] = Math.max(P['lid' + side + 'Up'], k);
        P['lid' + side + 'Low'] = Math.max(P['lid' + side + 'Low'], k * 0.5);
      }
      if (b > 0.19) {
        this.blinkStart = -1;
        this.blinkAt = t + (Math.random() < 0.18 ? 0.12 : rand(2.2, 5.5));
      }
    }
  }
}

export const EXPRESSIONS = {
  neutral: {},
  happy: { mouthSmile: 1.6, lidLLow: 0.3, lidRLow: 0.3, blush: 0.35 },
  surprised: { lidLUp: -0.05, lidRUp: -0.05, mouthOpen: 0.45, mouthWidth: 0.45, mouthSmile: 0.2 },
  worried: { mouthSmile: -0.5, mouthWidth: 0.7, '+headZ': 0.1, lidLUp: 0.22, lidRUp: 0.22 },
  sleepy: { lidLUp: 0.62, lidRUp: 0.62, mouthSmile: 0.6 },
  hot: { mouthOpen: 0.25, mouthWidth: 0.8, mouthSmile: 0.3, lidLUp: 0.35, lidRUp: 0.35 },
};

// ---------- locomotion actions ----------
// Each returns an object with update(t, P, motion, dt) → true when finished.
export const ACTIONS = {
  hop({ height = 0.35, dx = 0, dz = 0 } = {}) {
    let x0, z0;
    return { update(t, P, m) {
      if (x0 === undefined) { x0 = m.springs.rootX.target; z0 = m.springs.rootZ.target; }
      const crouch = smooth(0, 0.18, t) * (1 - smooth(0.18, 0.26, t));
      const air = clamp((t - 0.22) / 0.5, 0, 1);
      P.rootX = x0 + dx * smooth(0.22, 0.72, t); P.rootZ = z0 + dz * smooth(0.22, 0.72, t);
      P.rootY = height * Math.sin(Math.PI * air);
      P.squash = 1 - 0.12 * crouch + (air > 0 && air < 1 ? 0.08 : 0) - (t > 0.72 && t < 0.86 ? 0.14 : 0);
      P.hipsY -= 0.05 * crouch; P.kneeL += 0.5 * crouch; P.kneeR += 0.5 * crouch; P.legLSwing += 0.25 * crouch; P.legRSwing += 0.25 * crouch;
      if (air > 0 && air < 1) { P.kneeL += 0.35; P.kneeR += 0.35; P.armLOut += 0.5; P.armROut += 0.2; P.tailCurl = 0.7; }
      if (t > 0.72 && !this.landed) { this.landed = true; m.emit('dust', { x: P.rootX, z: P.rootZ }); }
      if (t > 1.05) { m.home.x = x0 + dx; m.home.z = z0 + dz; return true; }
      return false;
    } };
  },

  walkTo({ x = 0, z = 0, speed = 0.55 } = {}) {
    let x0, z0, dist, dur, dir;
    return { update(t, P, m) {
      if (x0 === undefined) {
        x0 = m.springs.rootX.target; z0 = m.springs.rootZ.target;
        dist = Math.hypot(x - x0, z - z0); dur = dist / speed + 0.6; dir = Math.atan2(x - x0, z - z0);
      }
      const k = smooth(0.3, dur - 0.3, t);
      P.rootX = lerp(x0, x, k); P.rootZ = lerp(z0, z, k);
      const going = smooth(0, 0.3, t) * smooth(dur, dur - 0.35, t);
      P.rootYaw = dir * going;
      const ph = t * TAU * 2.0;
      P.legLSwing += 0.42 * Math.sin(ph) * going; P.legRSwing -= 0.42 * Math.sin(ph) * going;
      P.kneeL += Math.max(0, -Math.cos(ph)) * 0.75 * going; P.kneeR += Math.max(0, Math.cos(ph)) * 0.75 * going;
      P.ankleL += 0.2 * Math.sin(ph) * going; P.ankleR -= 0.2 * Math.sin(ph) * going;
      P.hipsY += (Math.abs(Math.cos(ph)) * 0.025 - 0.02) * going;
      P.hipsTwist += 0.07 * Math.sin(ph) * going; P.chestY -= 0.09 * Math.sin(ph) * going;
      P.armLRaise -= 0.35 * Math.sin(ph) * going; P.elbowL += 0.3 * going;
      P.chestX += 0.05 * going; P.tailWag = 0.18 * going + 0.06; P.tailSpeed = 3.5;
      if (t >= dur) { m.home.x = x; m.home.z = z; return true; }
      return false;
    } };
  },

  // Fly: take off on the satellite backpack, follow a path, hover and land.
  // path(u) gives {x, y, z} for u in 0..1 (world units); duration in seconds.
  fly({ path, duration = 5, land = true } = {}) {
    let x0, z0, lastYaw = 0, prev = null;
    const T0 = 0.55, T1 = 0.75; // prepare, take off
    return { update(t, P, m, dt) {
      if (x0 === undefined) { x0 = m.springs.rootX.target; z0 = m.springs.rootZ.target; }
      P.backpack = 1; P.tablet = 0;
      const prep = smooth(0, T0, t);
      P.hipsY -= 0.05 * prep * (1 - smooth(T0, T0 + 0.2, t)); P.kneeL += 0.4 * prep; P.kneeR += 0.4 * prep;
      P.thrust = 0.35 * prep;
      if (t < T0) return false;
      const tt = t - T0;
      const end = T1 + duration + (land ? 1.1 : 0);
      const up = easeOut(clamp(tt / T1, 0, 1));
      let pos;
      if (tt < T1) pos = { x: x0, y: path(0).y * up, z: z0 };
      else if (tt < T1 + duration) {
        const p = path(clamp((tt - T1) / duration, 0, 1));
        pos = { x: p.x, y: p.y, z: p.z };
      } else {
        const p = path(1), k = smooth(T1 + duration, end - 0.15, tt);
        pos = { x: p.x, y: lerp(p.y, 0, easeIn(k)), z: p.z };
      }
      P.rootX = pos.x; P.rootY = pos.y; P.rootZ = pos.z;
      const v = prev ? { x: (pos.x - prev.x) / dt, y: (pos.y - prev.y) / dt, z: (pos.z - prev.z) / dt } : { x: 0, y: 0, z: 0 };
      prev = pos;
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0.25) lastYaw = Math.atan2(v.x, v.z);
      const cruise = smooth(T1 * 0.6, T1 + 0.4, tt) * smooth(T1 + duration + 0.2, T1 + duration - 0.4, tt);
      P.rootYaw = lastYaw * cruise;
      P.rootPitch = clamp(hs * 0.22, 0, 0.55) * cruise;
      P.rootRoll = clamp(-(m.springs.rootYaw.vel || 0) * 0.25, -0.45, 0.45) * cruise;
      P.thrust = tt > end - 0.5 ? 0.3 : 0.8 + 0.2 * Math.sin(t * 9);
      // legs trail and kick, arms steer, tail streams
      const kick = Math.sin(t * TAU * 1.4);
      P.legLSwing -= 0.22 * cruise + 0.12 * kick * cruise; P.legRSwing -= 0.22 * cruise - 0.12 * kick * cruise;
      P.kneeL += 0.45; P.kneeR += 0.45 + 0.2 * cruise;
      P.armLOut += 0.25; P.armLRaise += 2.5 * cruise; P.elbowL = 0.15; P.handL = cruise > 0.5 ? 'fist' : 'open';
      P.armROut += 0.5; P.armRRaise = 0.1; P.elbowR = 0.5; P.handR = 'open';
      P.headX -= 0.35 * cruise; P.mouthSmile = 1.7; P.mouthOpen = 0.2 * cruise;
      P.tailCurl = lerp(1, 0.25, cruise); P.tailWag = 0.25; P.tailSpeed = 5; P.tailLift = 0.6 * cruise;
      P.shadow = 1;
      if (land && tt > end - 0.16 && !this.landed) { this.landed = true; m.emit('dust', { x: pos.x, z: pos.z }); }
      if (tt > end - 0.15) P.squash = 0.84;
      if (tt >= end) {
        const y = m.springs.rootYaw.v;
        m.snap('rootYaw', Math.atan2(Math.sin(y), Math.cos(y)));
        m.home.x = pos.x; m.home.z = pos.z;
        return true;
      }
      return false;
    } };
  },

  // Glide: fly on the satellite backpack while the page carries his whole window. heading() gives the window's
  // speed on screen in px/s ({x, y}): he turns to where he goes and leans into it. until() says when to land.
  glide({ heading = () => ({ x: 0, y: 0 }), until = () => true, height = 0.26 } = {}) {
    const T0 = 0.3, T1 = 0.45; // crouch, lift off
    let landAt = null;
    return { update(t, P, m) {
      P.backpack = 1; P.tablet = 0;
      if (t < T0) {
        const k = smooth(0, T0, t);
        P.hipsY -= 0.05 * k; P.kneeL += 0.4 * k; P.kneeR += 0.4 * k; P.thrust = 0.35 * k;
        return false;
      }
      if (landAt === null && t > T0 + T1 && until()) landAt = t;
      const lift = easeOut(clamp((t - T0) / T1, 0, 1));
      const down = landAt === null ? 0 : smooth(landAt, landAt + 0.45, t);
      const cruise = smooth(T0, T0 + T1, t) * (1 - down);
      const v = heading();
      P.rootY = height * lift * (1 - easeIn(down)) + 0.03 * Math.sin(t * 5) * cruise;
      P.rootYaw = lerp(P.rootYaw, clamp(v.x / 420, -1, 1) * 1.3, cruise);
      P.rootPitch = clamp(Math.abs(v.x) / 1500, 0, 0.45) * cruise;
      P.rootRoll = clamp(-(m.springs.rootYaw.vel || 0) * 0.25, -0.45, 0.45) * cruise;
      P.thrust = down > 0.6 ? 0.3 : 0.8 + 0.2 * Math.sin(t * 9);
      const kick = Math.sin(t * TAU * 1.4);
      P.legLSwing -= 0.22 * cruise + 0.12 * kick * cruise; P.legRSwing -= 0.22 * cruise - 0.12 * kick * cruise;
      P.kneeL += 0.45 * lift; P.kneeR += (0.45 + 0.2 * cruise) * lift;
      P.armLOut += 0.25; P.armLRaise += 2.5 * cruise; P.elbowL = lerp(P.elbowL, 0.15, cruise); P.handL = cruise > 0.5 ? 'fist' : 'open';
      P.armROut += 0.5; P.armRRaise = 0.1; P.elbowR = 0.5; P.handR = 'open';
      P.headX -= 0.3 * cruise; P.mouthSmile = 1.7; P.mouthOpen = 0.2 * cruise;
      P.tailCurl = lerp(1, 0.3, cruise); P.tailWag = 0.25; P.tailSpeed = 5; P.tailLift = 0.6 * cruise;
      if (landAt !== null && t > landAt + 0.42 && !this.landed) { this.landed = true; m.emit('dust', { x: P.rootX, z: P.rootZ }); }
      if (landAt !== null && t > landAt + 0.42 && t < landAt + 0.56) P.squash = 0.86;
      return landAt !== null && t > landAt + 0.62;
    } };
  },

  // Come up out of the ground: his first appearance, or back from hiding.
  emerge({ splash = 'soil' } = {}) {
    return { update(t, P, m) {
      const plane = m.model.clipPlane;
      P.tablet = 0;
      if (t < 0.06) { m.snap('rootY', -2.4); m.snap('rootPitch', 0); plane.constant = 0; P.rootY = -2.4; P.shadow = 0; return false; }
      const k = clamp((t - 0.06) / 0.6, 0, 1);
      P.rootY = -2.4 + 2.4 * easeOut(Math.min(1, k * 1.15)) + 0.35 * Math.sin(Math.PI * k);
      P.armLOut += 1.6 * (1 - k); P.armROut += 1.6 * (1 - k); P.handL = 'open'; P.handR = 'open';
      P.mouthSmile = 1.8; P.mouthOpen = 0.35 * (1 - k); P.shadow = k;
      if (k > 0.1 && !this.popped) { this.popped = true; m.emit('splash', { kind: splash, x: m.springs.rootX.v, z: m.springs.rootZ.v }); }
      if (k >= 1) { plane.constant = 1000; P.squash = 0.86; m.emit('dust', { x: m.springs.rootX.v, z: m.springs.rootZ.v }); return true; }
      return false;
    } };
  },

  // Dive into the ground (the map, the soil) and pop back out; stay: true ends underground (to hide him).
  dive({ splash = 'soil', stay = false } = {}) {
    return { update(t, P, m) {
      const plane = m.model.clipPlane;
      P.tablet = 0;
      if (t < 0.45) { // wind up
        const k = smooth(0, 0.45, t);
        P.hipsY -= 0.08 * k; P.kneeL += 0.7 * k; P.kneeR += 0.7 * k; P.legLSwing += 0.3 * k; P.legRSwing += 0.3 * k;
        P.armLRaise -= 0.6 * k; P.armRRaise = -0.6 * k; P.elbowR = 0.2; P.headX += 0.2 * k; P.squash = 1 - 0.1 * k;
        P.mouthSmile = 1.4; P.lidLLow = 0.3; P.lidRLow = 0.3;
        return false;
      }
      if (t < 1.85) {
        const up = clamp((t - 0.45) / 0.5, 0, 1), fall = clamp((t - 0.95) / 0.9, 0, 1);
        P.rootY = 0.95 * easeOut(up) - 3.6 * easeIn(fall);
        P.rootPitch = Math.PI * smooth(0.55, 1.2, t);
        P.armLRaise = 2.95; P.armRRaise = 2.95; P.armLOut = -0.1; P.armROut = -0.1; P.elbowL = 0.05; P.elbowR = 0.05; P.handL = 'open'; P.handR = 'open';
        P.legLSwing = -0.08; P.legRSwing = -0.08; P.kneeL = 0.05; P.kneeR = 0.05; P.tailCurl = 0.12; P.tailWag = 0.15;
        P.lidLUp = 0.85; P.lidRUp = 0.85; P.mouthSmile = 1.2; P.squash = 1.08; P.shadow = 1 - fall;
        plane.constant = t > 0.95 ? 0 : 1000;
        if (t > 1.15 && !this.splashed) { this.splashed = true; m.emit('splash', { kind: splash, x: m.springs.rootX.v, z: m.springs.rootZ.v }); }
        return false;
      }
      if (t < 2.4) { // underground: turn upright where nobody sees
        P.rootY = -2.4; P.rootPitch = 0; m.snap('rootPitch', 0); m.snap('rootY', -2.4); P.shadow = 0;
        return stay && t > 1.95;
      }
      const k = clamp((t - 2.4) / 0.6, 0, 1);
      P.rootY = -2.4 + 2.4 * easeOut(Math.min(1, k * 1.15)) + 0.35 * Math.sin(Math.PI * k);
      P.armLOut += 1.6 * (1 - k); P.armROut += 1.6 * (1 - k); P.handL = 'open'; P.handR = 'open';
      P.mouthSmile = 1.8; P.mouthOpen = 0.35 * (1 - k); P.shadow = k;
      if (k > 0.1 && !this.popped) { this.popped = true; m.emit('splash', { kind: splash, x: m.springs.rootX.v, z: m.springs.rootZ.v }); }
      if (k >= 1) { plane.constant = 1000; P.squash = 0.86; m.emit('dust', { x: m.springs.rootX.v, z: m.springs.rootZ.v }); return true; }
      return false;
    } };
  },

  backflip() {
    return { update(t, P, m) {
      const crouch = smooth(0, 0.22, t) * (1 - smooth(0.22, 0.3, t));
      P.hipsY -= 0.07 * crouch; P.kneeL += 0.7 * crouch; P.kneeR += 0.7 * crouch; P.squash = 1 - 0.12 * crouch;
      const air = clamp((t - 0.28) / 0.85, 0, 1);
      if (air > 0 && air < 1) {
        P.rootY = 0.85 * Math.sin(Math.PI * air);
        P.rootPitch = -TAU * smooth(0.05, 0.92, air);
        P.kneeL = 1.3; P.kneeR = 1.3; P.legLSwing = 0.9; P.legRSwing = 0.9; P.armLOut = 0.9; P.armROut = 0.9; P.tablet = 0;
        P.tailCurl = 1.2; P.lidLUp = 0.6; P.lidRUp = 0.6; P.mouthSmile = 1.8; P.mouthOpen = 0.3;
      }
      if (air >= 1 && !this.done) { this.done = true; m.snap('rootPitch', m.springs.rootPitch.v + TAU); m.emit('dust', { x: m.springs.rootX.v, z: m.springs.rootZ.v }); }
      if (t > 1.13 && t < 1.3) P.squash = 0.84;
      return t > 1.6;
    } };
  },

  spin() {
    let y0;
    return { update(t, P, m) {
      if (y0 === undefined) y0 = m.springs.rootYaw.target;
      P.rootYaw = y0 + TAU * smooth(0.05, 0.85, t);
      P.armLOut += 1.0; P.armROut += 0.6; P.handL = 'open'; P.mouthSmile = 1.8; P.mouthOpen = 0.25; P.tailCurl = 0.6; P.tailLift = 0.5;
      if (t > 0.95) { m.snap('rootYaw', y0); return true; }
      return false;
    } };
  },

  celebrate() {
    return { update(t, P, m) {
      for (const [s, e] of [[0.1, 0.65], [0.75, 1.3]]) {
        const air = clamp((t - s) / (e - s), 0, 1);
        if (air > 0 && air < 1) { P.rootY = 0.32 * Math.sin(Math.PI * air); P.kneeL += 0.4; P.kneeR += 0.4; }
        if (air >= 1 && t - e < 0.12) P.squash = 0.88;
      }
      P.armLOut = 2.5; P.armROut = 2.5; P.elbowL = 0.3; P.elbowR = 0.3; P.handL = 'open'; P.handR = 'open'; P.tablet = 0;
      P.mouthSmile = 1.9; P.mouthOpen = 0.45; P.lidLLow = 0.4; P.lidRLow = 0.4; P.blush = 0.9; P.tailWag = 0.3; P.tailSpeed = 7;
      if (t > 0.12 && !this.burst) { this.burst = true; m.emit('confetti', {}); }
      return t > 1.8;
    } };
  },

  sit({ until = () => false } = {}) {
    return { update(t, P, m) {
      const k = smooth(0, 0.7, t);
      P.hipsY -= 0.4 * k; P.hipsTilt = -0.12 * k;
      P.legLSwing += 1.45 * k; P.legRSwing += 1.45 * k; P.kneeL += 1.35 * k; P.kneeR += 1.35 * k; P.legLOut += 0.18 * k; P.legROut += 0.18 * k;
      P.armLRaise += 0.55 * k; P.elbowL += 0.4 * k; P.tailCurl = 1.12; P.tailDroop = -0.2 * k;
      return until(t, m);
    } };
  },

  sleep({ until = () => false } = {}) {
    let next = 1.2;
    return { update(t, P, m) {
      const k = smooth(0, 1.2, t);
      P.hipsY -= 0.4 * k; P.hipsTilt = -0.12 * k;
      P.legLSwing += 1.45 * k; P.legRSwing += 1.45 * k; P.kneeL += 1.35 * k; P.kneeR += 1.35 * k; P.legLOut += 0.18 * k; P.legROut += 0.18 * k;
      const br = Math.sin(t * TAU / 4.8);
      P.headX += 0.42 * k + 0.03 * br; P.headZ += 0.18 * k; P.chestX += 0.12 * k + 0.035 * br;
      P.lidLUp = lerp(0.06, 1, k); P.lidRUp = lerp(0.06, 1, k); P.lidLLow = 0.3 * k; P.lidRLow = 0.3 * k;
      P.mouthSmile = 0.9; P.mouthOpen = 0.06 + 0.05 * (br + 1); P.tablet = 1 - k; P.tailCurl = 1.2; P.tailWag = 0.02;
      P.armLRaise += 0.4 * k; P.elbowL += 0.6 * k; P.armRRaise = 0.4 * k; P.elbowR = 0.6;
      if (t > next) { next = t + 1.7; m.emit('zzz', {}); }
      return until(t, m);
    } };
  },

  // Held by the cursor: he dangles and swings, then drops and lands.
  // roll() can set the swing directly (when the host moves his whole window, his target stays put).
  dangle({ target, until, roll = null }) {
    let vx = 0, last = null;
    return { update(t, P, m, dt) {
      const p = target();
      P.rootX = p.x; P.rootY = p.y; P.rootZ = p.z;
      if (last) vx = lerp(vx, (p.x - last.x) / Math.max(dt, 1e-3), 0.2);
      last = { ...p };
      P.rootRoll = roll ? roll() : clamp(-vx * 0.35, -0.7, 0.7);
      P.legLSwing = 0.15 * Math.sin(t * 7); P.legRSwing = -0.15 * Math.sin(t * 7 + 0.5); P.kneeL = 0.35; P.kneeR = 0.45;
      P.armLOut = 1.1; P.armROut = 1.1; P.elbowL = 0.6; P.elbowR = 0.6; P.handL = 'open'; P.handR = 'open'; P.tablet = 0;
      P.lidLUp = -0.05; P.lidRUp = -0.05; P.mouthOpen = 0.45; P.mouthWidth = 0.5; P.mouthSmile = 0.6;
      P.tailCurl = 0.45; P.tailDroop = -0.4; P.tailWag = 0.2; P.shadow = 0.6;
      if (until()) { m.home.x = p.x; m.home.z = p.z; return true; }
      return false;
    } };
  },

  drop() {
    let y0, v = 0;
    return { update(t, P, m, dt) {
      if (y0 === undefined) { y0 = m.springs.rootY.v; m.snap('rootY', y0); }
      v += 9.8 * dt; y0 = Math.max(0, y0 - v * dt);
      P.rootY = y0; m.snap('rootY', y0);
      P.armLOut = 1.0; P.armROut = 1.0; P.handL = 'open'; P.handR = 'open'; P.tablet = 0; P.lidLUp = -0.05; P.lidRUp = -0.05; P.mouthOpen = 0.4;
      if (y0 === 0 && !this.landed) { this.landed = true; this.at = t; m.emit('dust', { x: P.rootX, z: P.rootZ }); }
      if (this.landed) { P.squash = t - this.at < 0.12 ? 0.8 : 1; P.rootY = 0; }
      return this.landed && t - this.at > 0.45;
    } };
  },
};
