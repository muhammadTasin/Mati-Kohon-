// Rongu, the Mati Kohon companion: one call puts him on a canvas and hands back his controls.
//   const rongu = await createRongu(canvas, { framing: 'full' });
//   rongu.gesture('wave'); rongu.say('নমস্কার!'); rongu.mood('heat'); rongu.fly(...); rongu.dive();
import * as THREE from './vendor/three-rongu.min.js';
import { createModel, MOODS } from './rongu-model.js';
import { Motion, ACTIONS, GESTURES } from './rongu-motion.js';

const MODEL_VERSION = 'rongu-22'; // skip 18-20: the reverted redesign may sit in browsers' caches under them

// ---------- meshes: from the browser's cache, else sculpted in a worker ----------
function idb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('mati-kohon-rongu', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('parts');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function cached(key) {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = db.transaction('parts').objectStore('parts').get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function store(key, parts) {
  const db = await idb();
  try { db?.transaction('parts', 'readwrite').objectStore('parts').put(parts, key); } catch { /* storage is optional */ }
}
async function buildParts(quality) {
  const key = `${MODEL_VERSION}-q${quality}`;
  const hit = await cached(key);
  if (hit) return hit;
  let parts;
  try {
    parts = await new Promise((resolve, reject) => {
      const w = new Worker(new URL('./rongu-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { resolve(e.data.parts); w.terminate(); };
      w.onerror = (e) => { reject(e); w.terminate(); };
      w.postMessage({ quality });
    });
  } catch {
    const { buildRongu } = await import('./rongu-shapes.js');
    parts = buildRongu(quality);
  }
  store(key, parts);
  return parts;
}

// ---------- small effects: confetti, dust, splashes, sleepy z's ----------
function dotTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function letterTexture(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 48px "Anek Bangla", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#FFFFFF'; g.strokeText(ch, 32, 34); g.fillStyle = '#2B4C9A'; g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const n = 140;
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.04, 0.07), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), n);
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.confetti.count = 0; this.confetti.frustumCulled = false;
    const rainbow = ['#78D270', '#40BC8A', '#3BA5D4', '#5E88DE', '#8887E6', '#F34F6A', '#F9614D', '#F79E35', '#FAD853'];
    for (let i = 0; i < n; i++) this.confetti.setColorAt(i, new THREE.Color(rainbow[i % rainbow.length]));
    scene.add(this.confetti);
    this.bits = [];
    this.textures = { soil: dotTexture('#A57C52'), water: dotTexture('#8FD3E6'), dust: dotTexture('#E8E2D2'), z: letterTexture('z') };
    this.portal = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4A3826', transparent: true, opacity: 0, depthWrite: false }));
    this.portal.position.y = 0.004; this.portal.scale.set(1, 1, 0.55);
    scene.add(this.portal);
    this.portalLife = 0;
  }
  burstConfetti(origin) {
    const n = this.confetti.count = 140;
    this.bits = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, up = 2.6 + Math.random() * 2.2, out = 0.6 + Math.random() * 1.6;
      this.bits.push({ p: new THREE.Vector3(origin.x, origin.y, origin.z), v: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out * 0.6 + 0.4), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: (Math.random() - 0.5) * 18, life: 2.4 + Math.random() * 0.8 });
    }
  }
  puff(kind, x, z, count = 14) {
    const tex = this.textures[kind] || this.textures.dust;
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
      const a = (i / count) * Math.PI * 2;
      s.position.set(x + Math.cos(a) * 0.18, 0.05, z + Math.sin(a) * 0.12);
      s.scale.setScalar(0.06 + Math.random() * 0.06);
      this.scene.add(s);
      this.items.push({ s, v: new THREE.Vector3(Math.cos(a) * (0.7 + Math.random()), kind === 'dust' ? 0.25 : 1.4 + Math.random() * 1.2, Math.sin(a) * 0.5), life: 0.9, age: 0, gravity: kind === 'dust' ? 0 : 6, grow: kind === 'dust' ? 0.25 : 0.02 });
    }
  }
  zzz(origin) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.z, transparent: true, depthWrite: false, toneMapped: false }));
    s.position.copy(origin); s.scale.setScalar(0.12);
    this.scene.add(s);
    this.items.push({ s, v: new THREE.Vector3(0.12, 0.35, 0), life: 2.2, age: 0, gravity: 0, grow: 0.06, wobble: Math.random() * 6 });
  }
  openPortal(x, z) { this.portal.position.x = x; this.portal.position.z = z; this.portalLife = 2.6; }
  update(dt, camera) {
    if (this.bits.length) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
      let alive = 0;
      this.bits.forEach((b, i) => {
        b.life -= dt;
        b.v.y -= 5.2 * dt; b.v.multiplyScalar(1 - 1.4 * dt); b.p.addScaledVector(b.v, dt);
        b.r.x += b.w * dt; b.r.y += b.w * 0.7 * dt;
        q.setFromEuler(b.r);
        m.compose(b.p, q, one.setScalar(b.life > 0 && b.p.y > 0 ? Math.min(1, b.life * 2) : 0));
        this.confetti.setMatrixAt(i, m);
        if (b.life > 0) alive++;
      });
      this.confetti.instanceMatrix.needsUpdate = true;
      if (!alive) { this.bits = []; this.confetti.count = 0; }
    }
    this.items = this.items.filter((it) => {
      it.age += dt;
      it.v.y -= it.gravity * dt;
      it.s.position.addScaledVector(it.v, dt);
      if (it.wobble !== undefined) it.s.position.x += Math.sin(it.age * 3 + it.wobble) * 0.004;
      it.s.scale.addScalar(it.grow * dt);
      it.s.material.opacity = Math.max(0, 1 - it.age / it.life);
      if (it.age >= it.life || it.s.position.y < -0.05) { this.scene.remove(it.s); it.s.material.dispose(); return false; }
      return true;
    });
    if (this.portalLife > 0) {
      this.portalLife -= dt;
      const k = Math.min(1, Math.min(2.6 - this.portalLife, this.portalLife) * 3.5);
      this.portal.material.opacity = 0.85 * k;
      const s = 0.2 + 0.8 * k; this.portal.scale.set(s, 1, s * 0.55);
    } else this.portal.material.opacity = 0;
    void camera;
  }
}

// ---------- the controller ----------
const FRAMINGS = {
  full: { fov: 26, pos: [0, 1.2, 6.4], look: [0, 1.02, 0] },
  portrait: { fov: 24, pos: [0, 1.55, 4.0], look: [0, 1.32, 0] },
  stage: { fov: 34, pos: [0, 1.6, 7.6], look: [0, 1.0, 0] },
  dock: { fov: 30, pos: [0, 1.3, 6.4], look: [0, 1.25, 0] }, // his corner of the dashboard: room above for hops
};

export async function createRongu(canvas, opts = {}) {
  const reduced = opts.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const quality = opts.quality ?? (lowPower ? 0.75 : 1);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 0.94;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = opts.environment ?? 0.5;
  // a bright, soft studio: big pastel ambient, one soft key that casts shadows, a cool rim
  scene.add(new THREE.HemisphereLight('#EAF6FF', '#CFE6B4', 1.0));
  const key = new THREE.DirectionalLight('#FFFCF4', 2.5);
  const KEY_OFFSET = new THREE.Vector3(-2.0, 3.8, 3.2);
  key.position.copy(KEY_OFFSET); scene.add(key, key.target);
  const shadows = opts.shadows ?? !lowPower;
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 1.9, bottom: -1.4, near: 0.5, far: 12 });
    key.shadow.radius = 3; key.shadow.blurSamples = 8;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025;
  }
  const rim = new THREE.DirectionalLight('#E2F6FF', 1.35); rim.position.set(2.8, 2.6, -3.2); scene.add(rim);
  const fill = new THREE.DirectionalLight('#FFFFFF', 0.4); fill.position.set(2.6, 0.9, 2.6); scene.add(fill);
  // the floor only shows his shadow
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: '#2E5A3A', opacity: 0.16 }));
  floor.receiveShadow = true; floor.position.y = 0.001;
  if (shadows) scene.add(floor);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
  const setFraming = (name) => {
    const f = FRAMINGS[name] || FRAMINGS.full;
    camera.fov = f.fov; camera.position.set(...f.pos); camera.lookAt(...f.look); camera.updateProjectionMatrix();
    controller.framing = name;
  };

  const parts = await buildParts(quality);
  const model = createModel(parts, { envIntensity: 1 });
  scene.add(model.root, model.shadow);
  const motion = new Motion(model, { reducedMotion: reduced });
  const fx = new Effects(scene);

  const listeners = {};
  const emit = (ev, data) => { for (const fn of listeners[ev] || []) fn(data); };

  // moods ripple from his head to the tip of his tail
  const moodVec = (name) => { const [hex, a] = MOODS[name] || MOODS.calm; const c = new THREE.Color(hex); return new THREE.Vector4(c.r, c.g, c.b, a); };
  let moodName = 'calm', moodWave = null, shimmer = 0;
  const setMood = (name) => {
    if (!MOODS[name] || name === moodName) return;
    model.shared.uMoodFrom.value.copy(model.shared.uMoodTo.value);
    model.shared.uMoodTo.value.copy(moodVec(name));
    model.shared.uWave.value = -0.1;
    moodWave = { t: 0, d: reduced ? 0.01 : 1.25 };
    moodName = name;
    emit('mood', name);
  };
  model.shared.uMoodTo.value.copy(moodVec('calm'));
  model.shared.uMoodFrom.value.copy(moodVec('calm'));

  motion.on('confetti', () => {
    const p = model.root.position;
    fx.burstConfetti({ x: p.x, y: p.y + 0.9, z: p.z + 0.1 });
    shimmer = 1.6;
  });
  motion.on('dust', ({ x, z }) => fx.puff('dust', x, z, 10));
  motion.on('splash', ({ kind, x, z }) => { fx.puff(kind === 'water' ? 'water' : 'soil', x, z, 18); fx.openPortal(x, z); });
  motion.on('zzz', () => {
    const head = new THREE.Vector3(); model.head.getWorldPosition(head);
    fx.zzz(head.add(new THREE.Vector3(0.25, 0.35, 0.1)));
  });

  // ---------- size, visibility, the loop ----------
  let visible = true, running = true, raf = 0, last = performance.now(), slow = 1;
  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const io = new IntersectionObserver((entries) => { visible = entries.some(e => e.isIntersecting); if (visible) kick(); });
  io.observe(canvas);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);

  let slowFrames = 0, frameAvg = 16, minFrameMs = 0;
  const frame = (now) => {
    raf = 0;
    if (!running || !visible || document.hidden) return;
    // a frame-rate cap (an idle companion needs fewer frames); the 1.5 ms slack keeps 30 fps from dropping to 20
    if (minFrameMs && now - last < minFrameMs - 1.5) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000) * slow;
    if (!minFrameMs) frameAvg = frameAvg * 0.95 + (now - last) * 0.05;
    last = now;
    // keep it smooth: if frames run long, render fewer pixels
    if (!minFrameMs && frameAvg > 26 && renderer.getPixelRatio() > 1) { if (++slowFrames > 90) { renderer.setPixelRatio(1); resize(); slowFrames = 0; } } else slowFrames = 0;
    if (!pointerTarget) motion.lookAt(lookViewer ? camera.position : null);
    motion.update(dt);
    // the key light and its shadow follow him around
    key.target.position.set(model.root.position.x, 0.9, model.root.position.z);
    key.position.copy(key.target.position).add(KEY_OFFSET);
    if (moodWave) {
      moodWave.t += dt;
      model.shared.uWave.value = -0.1 + 1.3 * Math.min(1, moodWave.t / moodWave.d);
      if (moodWave.t >= moodWave.d) moodWave = null;
    }
    if (shimmer > 0) shimmer = Math.max(0, shimmer - dt);
    model.shared.uShimmer.value = Math.min(1, shimmer);
    fx.update(dt, camera);
    renderer.render(scene, camera);
    emit('frame', dt);
    raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && running) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  // ---------- pointer: he watches you, giggles when poked, dangles when dragged ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitTargets = [];
  model.root.traverse((o) => { if (o.isMesh && o.name !== 'face' && o.name !== 'lens') hitTargets.push(o); });
  const toNdc = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const onPlane = (z) => { ray.setFromCamera(ndc, camera); const p = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), p); return p; };
  const hits = () => { ray.setFromCamera(ndc, camera); return ray.intersectObjects(hitTargets, false); };
  let followPointer = opts.followPointer ?? true, drag = null, petStrokes = [], lastClick = 0;
  let pointerTarget = null, lookViewer = opts.lookAtViewer ?? true;
  motion.home.yaw = opts.restYaw ?? -0.62; // a three-quarter stance, like the drawing
  // passThrough: the canvas takes no pointer events, so clicks on the empty space around him reach the page;
  // the window's events are read instead, and only a press on his body is kept. His eyes follow the pointer
  // anywhere on the page. carry: a drag moves his whole window (the host listens for 'carry'), he dangles in it.
  const passThrough = !!opts.passThrough, carry = !!opts.carry;
  const setHover = (on) => {
    if (passThrough) document.documentElement.classList.toggle('rongu-hover', on);
    else canvas.style.cursor = on ? 'grab' : '';
  };
  let carryVx = 0, carryAt = 0;
  const carryRoll = () => {
    const now = performance.now();
    carryVx *= Math.exp(-(now - carryAt) / 120); carryAt = now; // eases off once the pointer stops
    return Math.max(-0.6, Math.min(0.6, -carryVx * 0.0005));
  };

  const onMove = (e) => {
    toNdc(e);
    if (drag) {
      if (carry) {
        const now = performance.now(), dtm = Math.max(8, now - (drag.lastT || now - 16));
        carryVx = carryVx * 0.6 + 0.4 * ((e.clientX - (drag.lastX ?? e.clientX)) / dtm) * 1000;
        carryAt = now; drag.lastX = e.clientX; drag.lastT = now;
        if (drag.moved) emit('carry', { x: e.clientX, y: e.clientY, dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 });
      } else drag.point = onPlane(drag.z);
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) startDrag();
      return;
    }
    if (followPointer) { pointerTarget = onPlane(2.4); motion.lookAt(pointerTarget); }
    if (passThrough) {
      const r = canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { setHover(false); return; }
    }
    // petting: quick strokes back and forth over his head
    const h = hits()[0];
    if (h && /head|lid|eye|frame|temple|bridge/.test(h.object.name)) {
      petStrokes.push({ x: e.clientX, t: performance.now() });
      petStrokes = petStrokes.filter(s => performance.now() - s.t < 900);
      let turns = 0;
      for (let i = 2; i < petStrokes.length; i++) if ((petStrokes[i].x - petStrokes[i - 1].x) * (petStrokes[i - 1].x - petStrokes[i - 2].x) < 0) turns++;
      if (turns >= 3) { petStrokes = []; pet(); }
    }
    setHover(!!h);
  };
  const onLeave = () => { if (!drag) { pointerTarget = null; setHover(false); } };
  const onDown = (e) => {
    if (passThrough) {
      const r = canvas.getBoundingClientRect();
      if (e.button > 0 || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    }
    toNdc(e);
    if (!hits().length) return;
    if (passThrough) { e.preventDefault(); e.stopPropagation(); }
    drag = { x0: e.clientX, y0: e.clientY, z: model.root.position.z, moved: false, point: onPlane(model.root.position.z) };
    if (!passThrough) canvas.setPointerCapture?.(e.pointerId);
  };
  const startDrag = () => {
    drag.moved = true;
    if (passThrough) document.documentElement.classList.add('rongu-grabbing'); else canvas.style.cursor = 'grabbing';
    motion.stopActions();
    if (carry) {
      emit('carry-start', { x: drag.x0, y: drag.y0 });
      motion.act(ACTIONS.dangle({ target: () => ({ x: motion.home.x, y: 0.14, z: motion.home.z }), roll: carryRoll, until: () => !drag }))
        .then(() => motion.act(ACTIONS.drop()));
      return;
    }
    motion.act(ACTIONS.dangle({ target: () => ({ x: drag ? drag.point.x : model.root.position.x, y: Math.max(0.05, (drag ? drag.point.y : 1.2) - 1.75), z: drag ? drag.z : 0 }), until: () => !drag }))
      .then(() => motion.act(ACTIONS.drop()));
  };
  // after a press on him the page must not see the click that follows
  const swallowClick = () => {
    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
  };
  const onUp = (e) => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    if (passThrough) { e.preventDefault?.(); e.stopPropagation?.(); swallowClick(); document.documentElement.classList.remove('rongu-grabbing'); }
    else canvas.style.cursor = '';
    if (wasDrag) { if (carry) emit('carry-end', { x: e.clientX, y: e.clientY }); return; }
    if (e.type === 'pointercancel') return;
    const now = performance.now();
    if (now - lastClick < 320) { motion.stopActions(); motion.act(ACTIONS.backflip()); lastClick = 0; emit('poke', 'backflip'); return; }
    lastClick = now;
    setTimeout(() => { if (lastClick === now && !motion.busy) poke(); }, 330);
    void e;
  };
  const poke = () => {
    const r = ['giggle', 'giggle', 'surprise', 'thumbsUp', 'spin', 'hop'][Math.floor(Math.random() * 6)];
    if (r === 'spin' || r === 'hop') motion.act(ACTIONS[r]()); else motion.gesture(r);
    emit('poke', r);
  };
  const pet = () => {
    motion.gesture('giggle'); shimmer = 1.8;
    const before = moodName; setMood('shy');
    setTimeout(() => setMood(before === 'shy' ? 'calm' : before), 2200);
    emit('poke', 'pet');
  };
  const onOut = (e) => { if (!e.relatedTarget) onLeave(); }; // the pointer left the window
  if (opts.interactive !== false && passThrough) {
    canvas.style.pointerEvents = 'none';
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointerup', onUp, { capture: true });
    window.addEventListener('pointercancel', onUp, { capture: true });
    document.addEventListener('pointerout', onOut);
  } else if (opts.interactive !== false) {
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.style.touchAction = 'none';
  }

  // where on screen his head is (for speech bubbles), and where his feet stand
  const toScreen = (p) => {
    p.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  };
  const headScreen = () => { const p = new THREE.Vector3(); model.head.getWorldPosition(p); p.y += 0.62; return toScreen(p); };
  const footScreen = () => toScreen(new THREE.Vector3(motion.home.x, 0, motion.home.z));

  const controller = {
    THREE, scene, camera, renderer, model, motion, framing: 'full',
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter(f => f !== fn); }; },
    gesture: (name, o) => motion.gesture(name, o),
    act: (name, o) => (ACTIONS[name] ? motion.act(ACTIONS[name](o)) : Promise.resolve()),
    fly: (o) => (reduced ? Promise.resolve() : motion.act(ACTIONS.fly(o))),
    dive: (o) => (reduced ? motion.gesture('nod') : motion.act(ACTIONS.dive(o))),
    sleep() { motion.stopActions(); let woke = false; this._wake = () => { woke = true; }; motion.expression('neutral'); return motion.act(ACTIONS.sleep({ until: () => woke })); },
    wake() { if (this._wake) { this._wake(); this._wake = null; motion.gesture('stretch'); } },
    expression: (name) => motion.expression(name),
    mood: setMood,
    get moodName() { return moodName; },
    lookAt: (p) => motion.lookAt(p ? new THREE.Vector3(p.x, p.y, p.z) : null),
    // look at a point on the page (client pixels), even far outside his canvas; null gives the eyes back to the pointer
    lookAtScreen(x, y) {
      if (x == null) { pointerTarget = null; return; }
      const r = canvas.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      pointerTarget = onPlane(2.4); motion.lookAt(pointerTarget);
    },
    followPointer(on) { followPointer = on; if (!on) pointerTarget = null; },
    get busy() { return motion.busy || motion.gestures.length > 0 || motion.t < motion.speakUntil; },
    // fewer frames while nothing much happens (60 = no cap)
    setFrameRate(fps) { minFrameMs = fps >= 60 ? 0 : 1000 / fps; },
    footScreen,
    worldToScreen: (x, y, z) => toScreen(new THREE.Vector3(x, y, z)),
    // a small picture of his face (for a button when he is tucked away)
    portrait(size = 96) {
      renderer.render(scene, camera);
      // headScreen() sits just above his eyes: a square around it holds the casque, the glasses and the smile
      const h = headScreen(), r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
      const side = r.width * 0.5, cx = (h.x - r.left) * k, cy = (h.y - r.top + side * 0.06) * k;
      const out = document.createElement('canvas'); out.width = out.height = size;
      out.getContext('2d').drawImage(canvas, cx - side * k / 2, cy - side * k / 2, side * k, side * k, 0, 0, size, size);
      return out.toDataURL('image/png');
    },
    lookAtViewer(on) { lookViewer = on; },
    say(text, { seconds } = {}) {
      const s = seconds ?? Math.min(9, 0.9 + text.length / 15);
      motion.speak(s);
      emit('say', { text, seconds: s });
      return new Promise(r => setTimeout(r, s * 1000));
    },
    headScreen,
    setFraming,
    setSlowMotion(f) { slow = f; },
    // advance time by hand (tests and screenshots, when the page is throttled)
    step(seconds) {
      for (let s = 0; s < seconds; s += 1 / 60) {
        if (!pointerTarget) motion.lookAt(lookViewer ? camera.position : null);
        motion.update(1 / 60);
        if (moodWave) { moodWave.t += 1 / 60; model.shared.uWave.value = -0.1 + 1.3 * Math.min(1, moodWave.t / moodWave.d); if (moodWave.t >= moodWave.d) moodWave = null; }
        fx.update(1 / 60, camera);
        emit('frame', 1 / 60); // whatever follows him (the dashboard's window, bubble, spotlight) steps too
      }
      renderer.render(scene, camera);
    },
    setTablet(mode, data) { model.tablet.userData.draw(mode, data); },
    get gestures() { return Object.keys(GESTURES); },
    get actions() { return Object.keys(ACTIONS); },
    pause() { running = false; },
    resume() { running = true; kick(); },
    destroy() {
      running = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('pointerup', onUp, { capture: true });
      window.removeEventListener('pointercancel', onUp, { capture: true });
      document.removeEventListener('pointerout', onOut);
      renderer.dispose();
    },
  };
  setFraming(opts.framing || 'full');
  resize();
  kick();
  emit('ready');
  return controller;
}
