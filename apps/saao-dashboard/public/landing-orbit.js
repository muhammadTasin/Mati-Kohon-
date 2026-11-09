// The circle behind Rongu on the landing page is the Earth: a globe turning slowly, its ocean, its land (Natural
// Earth, globe-land.js) raised a little off the sea with the ice white, a grid over it, Bangladesh marked when it faces
// us, and a NASA satellite on a tilted orbit around it. It reads as a ball without a single gradient (the page's flat
// style): the shade turns away from the page's top-left light in three flat steps, with a gloss and a bright rim on the
// lit side and a thin ring of air around it. On the far side of its orbit the satellite goes behind the globe and behind Rongu; on the
// near side it passes in front of him (his canvas is a fixed layer, so the near half is lifted above it, but never
// above the sticky header). Everything is plain SVG moved from one small loop that rests whenever the stage is out of
// sight; with reduced motion the globe and the satellite stand still.

import { ICE, LAND } from './globe-land.js';

const stage = document.getElementById('landingStage');
const sky = document.getElementById('landingSky');
const near = document.getElementById('landingNear');
const sat = document.getElementById('landingSat');

const TILT = -16 * Math.PI / 180; // the orbit's tilt on screen
const GLOBE_TILT = -12 * Math.PI / 180; // the Earth's axis on screen
const ELEVATION = 18 * Math.PI / 180; // we look at the globe from a little above its equator
const ORBIT_S = 13; // seconds for one orbit
const SPIN_S = 70; // seconds for one turn of the globe
const BD = [23.7, 90.35]; // Bangladesh, marked on the globe
const RAD = Math.PI / 180;

let box = null; // the stage's size and the disc's centre and radius, in stage pixels
let globePath = null, landPath = null, landEdge = null, icePath = null, iceEdge = null, bdMark = null;
const LIGHT = [-0.66, -0.75]; // towards the page's light, the top left

/** Where the disc (.landing-backdrop) sits in the stage: its centre and radius. */
function measure() {
  const disc = stage.querySelector('.landing-backdrop');
  const s = stage.getBoundingClientRect(), d = disc.getBoundingClientRect();
  if (!s.width || !d.width) return null;
  const r = d.width / 2;
  const sw = Math.round(Math.min(62, Math.max(36, s.width * 0.17))); // the satellite's width at its nearest
  return { w: s.width, h: s.height, cx: d.left - s.left + r, cy: d.top - s.top + r, r, ro: r * 1.24, sw };
}

/** A point on the orbit at angle t (t in 0..PI is the near half, below the centre). */
function orbit(t) {
  const x = box.ro * Math.cos(t), y = box.ro * 0.3 * Math.sin(t);
  return [box.cx + x * Math.cos(TILT) - y * Math.sin(TILT), box.cy + x * Math.sin(TILT) + y * Math.cos(TILT)];
}
const arc = (from, to) => {
  let d = '';
  for (let k = 0; k <= 48; k++) {
    const [x, y] = orbit(from + (to - from) * k / 48);
    d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
};

/** The orbit's two halves: the far one hidden where the globe covers it, the near one fading where Rongu stands. */
function layout() {
  box = measure();
  if (!box) return;
  sat.style.width = `${box.sw}px`;
  for (const svg of [sky, near]) svg.setAttribute('viewBox', `0 0 ${box.w.toFixed(1)} ${box.h.toFixed(1)}`);
  const { cx, cy, r } = box;
  // three crescents of shade, each a step darker towards the edge away from the light: [offset of the circle that
  // leaves the crescent, its darkness]
  const shades = [[0.62, 0.08], [0.44, 0.08], [0.27, 0.11]];
  const gx = cx + LIGHT[0] * 0.62 * r, gy = cy + LIGHT[1] * 0.62 * r; // the gloss, on the lit side
  const rim = (from, to) => { // an arc just inside the edge, angles in degrees (0 = right, 90 = down)
    const at = (a) => [cx + r * 0.965 * Math.cos(a * RAD), cy + r * 0.965 * Math.sin(a * RAD)];
    const [x0, y0] = at(from), [x1, y1] = at(to);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${(r * 0.965).toFixed(1)} ${(r * 0.965).toFixed(1)} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  sky.innerHTML = `
    <defs><mask id="landingBehind" maskUnits="userSpaceOnUse" x="-50" y="-50" width="${box.w + 100}" height="${box.h + 100}">
      <rect x="-50" y="-50" width="${box.w + 100}" height="${box.h + 100}" fill="#fff"/>
      <circle cx="${box.cx}" cy="${box.cy}" r="${box.r * 0.99}" fill="#000"/>
    </mask>
    ${shades.map(([off], i) => `<mask id="landingShade${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${box.w}" height="${box.h}">
      <circle cx="${cx}" cy="${cy}" r="${r * 0.995}" fill="#fff"/>
      <circle cx="${cx + LIGHT[0] * off * r}" cy="${cy + LIGHT[1] * off * r}" r="${r * 1.18}" fill="#000"/>
    </mask>`).join('')}
    <clipPath id="landingDisc"><circle cx="${cx}" cy="${cy}" r="${r * 0.975}"/></clipPath></defs>
    <circle class="landing-halo" cx="${cx}" cy="${cy}" r="${r * 1.045}" style="stroke-width: ${(r * 0.05).toFixed(1)}px"/>
    <g clip-path="url(#landingDisc)">
      <path class="landing-land-edge" transform="translate(1.2 2)"/>
      <path class="landing-land"/>
      <path class="landing-ice-edge" transform="translate(1.2 2)"/>
      <path class="landing-ice"/>
      <path class="landing-globe"/>
    </g>
    ${shades.map(([, a], i) => `<circle class="landing-shade" cx="${cx}" cy="${cy}" r="${r * 0.995}" mask="url(#landingShade${i})" style="opacity: ${a}"/>`).join('')}
    <g class="landing-gloss" transform="rotate(-41 ${gx.toFixed(1)} ${gy.toFixed(1)})">
      <ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="${(r * 0.3).toFixed(1)}" ry="${(r * 0.16).toFixed(1)}" style="opacity: .16"/>
      <ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="${(r * 0.16).toFixed(1)}" ry="${(r * 0.08).toFixed(1)}" style="opacity: .28"/>
    </g>
    <path class="landing-rim" d="${rim(196, 266)}"/>
    <g class="landing-bd"><circle class="landing-bd-ring" r="${(box.r * 0.09).toFixed(1)}"/><circle class="landing-bd-dot" r="${Math.max(3, box.r * 0.035).toFixed(1)}"/></g>
    <path class="landing-ring" mask="url(#landingBehind)"/>`;
  // the near half fades out in the middle, where Rongu stands
  const stops = [[0, 1], [0.3, 1], [0.42, 0], [0.58, 0], [0.7, 1], [1, 1]]
    .map(([o, a]) => `<stop offset="${o}" style="stop-color: var(--teal-500); stop-opacity: ${a}"/>`).join('');
  near.innerHTML = `
    <defs><linearGradient id="landingNearStroke" gradientUnits="userSpaceOnUse" x1="${box.cx - box.ro}" y1="0" x2="${box.cx + box.ro}" y2="0">${stops}</linearGradient></defs>
    <path class="landing-ring" style="stroke: url(#landingNearStroke)"/>`;
  globePath = sky.querySelector('.landing-globe');
  landPath = sky.querySelector('.landing-land');
  landEdge = sky.querySelector('.landing-land-edge');
  icePath = sky.querySelector('.landing-ice');
  iceEdge = sky.querySelector('.landing-ice-edge');
  bdMark = sky.querySelector('.landing-bd');
  sky.querySelector('.landing-ring').setAttribute('d', arc(Math.PI, 2 * Math.PI));
  near.querySelector('.landing-ring').setAttribute('d', arc(0, Math.PI));
}

/**
 * Land rings on the globe: the near side as it is; where a coast goes round the back, its points are folded onto the
 * rim (the horizon), so a continent half turned away ends cleanly at the edge.
 */
function rings(list, p, R) {
  const rim = (x, y) => { const dx = x - box.cx, dy = y - box.cy, l = Math.hypot(dx, dy) || 1; return [box.cx + dx * R / l, box.cy + dy * R / l]; };
  let d = '';
  for (const ring of list) {
    const pts = [];
    for (let i = 0; i < ring.length; i += 2) pts.push(p(ring[i + 1] / 10 * RAD, ring[i] / 10 * RAD));
    if (!pts.some(q => q[2] > 0)) continue;
    let first = true;
    const put = ([x, y]) => { d += `${first ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`; first = false; };
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      put(a[2] >= 0 ? a : rim(a[0], a[1]));
      if ((a[2] >= 0) !== (b[2] >= 0)) { const t = a[2] / (a[2] - b[2]); put(rim(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)); }
    });
    d += 'Z';
  }
  return d;
}

/** The globe at turn `spin`: the land and the ice, the grid (parallels and meridians, their near side), Bangladesh. */
function globe(spin) {
  const R = box.r * 0.97, ce = Math.cos(ELEVATION), se = Math.sin(ELEVATION);
  const cg = Math.cos(GLOBE_TILT), sg = Math.sin(GLOBE_TILT);
  const p = (lat, lon) => {
    const L = lon + spin, cl = Math.cos(lat);
    const x = R * cl * Math.sin(L), y0 = R * Math.sin(lat), z0 = R * cl * Math.cos(L);
    const y = y0 * ce - z0 * se, z = y0 * se + z0 * ce;
    return [box.cx + x * cg + y * sg, box.cy + x * sg - y * cg, z]; // screen y points down
  };
  let d = '';
  const line = (pts) => {
    let on = false;
    for (const [x, y, z] of pts) {
      if (z < 0) { on = false; continue; }
      d += `${on ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      on = true;
    }
  };
  const rad = Math.PI / 180;
  for (const lat of [-60, -30, 0, 30, 60]) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 8) pts.push(p(lat * rad, lon * rad));
    line(pts);
  }
  for (let lon = 0; lon < 360; lon += 30) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 6) pts.push(p(lat * rad, lon * rad));
    line(pts);
  }
  globePath.setAttribute('d', d);
  const land = rings(LAND.filter((_, i) => !ICE[i]), p, R), ice = rings(LAND.filter((_, i) => ICE[i]), p, R);
  landPath.setAttribute('d', land);
  landEdge.setAttribute('d', land); // the same coast a little lower and darker: the land stands off the sea
  icePath.setAttribute('d', ice);
  iceEdge.setAttribute('d', ice);
  const [bx, by, bz] = p(BD[0] * RAD, BD[1] * RAD);
  bdMark.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)})`);
  bdMark.style.opacity = Math.max(0, Math.min(1, (bz / R - 0.15) / 0.25)).toFixed(2); // fades out toward the edge
}

/** The satellite at orbit angle t: bigger and in front on the near half, end-on at the sides, hidden behind the globe. */
function satellite(t) {
  const [x, y] = orbit(t);
  const s = Math.sin(t);
  const depth = 0.8 + 0.22 * s;
  const endOn = 0.38 + 0.62 * Math.abs(s); // moving toward or away from us it shows its end
  const dx = -box.ro * Math.sin(t), dy = box.ro * 0.3 * Math.cos(t);
  let a = Math.atan2(dx * Math.sin(TILT) + dy * Math.cos(TILT), dx * Math.cos(TILT) - dy * Math.sin(TILT)) * 180 / Math.PI;
  if (a > 90) a -= 180; else if (a < -90) a += 180; // never upside down
  let seen = 1;
  if (s < 0) { // the far half: behind the globe where the disc covers it
    const dist = Math.hypot(x - box.cx, y - box.cy);
    seen = Math.min(1, Math.max(0, (dist - box.r * 0.92) / (box.r * 0.16))) * 0.9;
  }
  sat.style.opacity = seen.toFixed(2);
  sat.style.transform = `translate(${(x - box.sw / 2).toFixed(1)}px, ${(y - box.sw * 0.242).toFixed(1)}px) rotate(${a.toFixed(1)}deg) scale(${(depth * endOn).toFixed(3)}, ${depth.toFixed(3)})`;
  sat.classList.toggle('near', s > 0);
}

// ---------- the loop: only while the stage is on screen and the page is shown ----------
const still = window.matchMedia('(prefers-reduced-motion: reduce)');
const header = document.querySelector('.app-header');
let raf = 0, inView = false, t0 = performance.now(), frame = 0;
/** One moment, `sec` seconds in: the globe (every other frame), the satellite, and whether its near half may rise. */
function draw(sec) {
  if (!box) layout();
  if (!box) return;
  const t = still.matches ? 0.55 * Math.PI : (sec / ORBIT_S) * 2 * Math.PI;
  if (frame % 2 === 0) globe(still.matches ? 0.5 : (sec / SPIN_S) * 2 * Math.PI);
  satellite(t % (2 * Math.PI));
  frame++;
  // the near half may cover Rongu, but not the sticky header when the stage slides under it
  const top = stage.getBoundingClientRect().top, under = header ? header.getBoundingClientRect().bottom : 0;
  stage.classList.toggle('near-ok', top >= under - 4);
}
function tick(now) {
  raf = 0;
  draw((now - t0) / 1000);
  if (box && inView && !document.hidden && !still.matches) raf = requestAnimationFrame(tick);
}
const run = () => { if (!raf && inView && !document.hidden) raf = requestAnimationFrame(tick); };

if (stage && sky && near && sat) {
  new ResizeObserver(() => { box = null; frame = 0; run(); }).observe(stage);
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; run(); }).observe(stage);
  document.addEventListener('visibilitychange', run);
  still.addEventListener?.('change', () => { frame = 0; run(); });
  window.landingOrbit = { at: (sec) => { frame = 0; draw(sec); } }; // for checks with the page in the background, where no frames come
}
