// Rongu's body, sculpted as signed-distance shapes and meshed by sdf.js.
// Units: Rongu stands about 2.1 tall, feet at y = 0, facing +z. "L" is his left (+x).
// World parts (head, shirt, pelvis) are modelled where they stand; limb parts are modelled
// around their own joint, pointing down -y, and the rig places them.
import {
  sphere, ellipsoid, capsule, roundBox, torusY, smin, smax, clamp, smoothstep, noise3,
  surfaceNets, occlusion, rayHit, gradient, hexToRgb, mixRgb, srgbToLinear,
} from './sdf.js';

export const RIG = {
  hips: [0, 0.58, 0],
  chest: [0, 0.8, -0.02],
  neck: [0, 1.17, -0.04],
  eye: { x: 0.212, y: 1.6, z: 0.245, r: 0.135 },
  shoulder: [0.27, 1.03, -0.02],
  upperArm: 0.235,
  forearm: 0.22,
  hip: [0.13, 0.5, 0],
  thigh: 0.2,
  shin: 0.18,
  tailRoot: [0, 0.52, -0.25],
  armRest: 0.2, // the arms hang slightly out from the body
};

export const COLORS = {
  skin: '#96C85C', skinDeep: '#6FA544', belly: '#DCE7A8', throat: '#CFE3A0',
  teal: '#45B4C6', casque: '#5EC2E2', casqueDeep: '#3BA6CF', rim: '#F2E8C6', spine: '#EE9A50',
  shirt: '#2D4EA2', shirtDeep: '#233F8A', pad: '#B7DC82',
  shoe: '#5F666F', shoeDeep: '#3E444B', sole: '#F4F1EA', lace: '#F7F7F2', soleLine: '#C9CCD0', heelTab: '#A0C477',
};
const C = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, hexToRgb(v)]));

// ---------- head ----------
const EYE_T = { x: 0.212, y: 1.6, z: 0.17, r: 0.178 }; // the eye turret
const CASQUE = { y: 1.83, z: -0.16, rx: 0.1, ry: 0.36, rz: 0.27, tilt: 0.5 };
const ca = Math.cos(CASQUE.tilt), sa = Math.sin(CASQUE.tilt);
function casqueLocal(y, z) {
  const dy = y - CASQUE.y, dz = z - CASQUE.z;
  return [dy * ca - dz * sa, dy * sa + dz * ca];
}
const SPINES = [];
for (let i = 0; i < 9; i++) {
  const phi = (100 - i * 11) * Math.PI / 180;
  const ly = CASQUE.ry * 0.94 * Math.cos(phi), lz = CASQUE.rz * 0.94 * Math.sin(phi);
  SPINES.push({ y: CASQUE.y + ly * ca + lz * sa, z: CASQUE.z - ly * sa + lz * ca, r: 0.04 - i * 0.002 });
}

export function headSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 1.64, -0.08, 0.56, 0.66, 0.6);
  if (bound > 0.08) return bound;
  const ax = Math.abs(x);
  let d = ellipsoid(x, y, z, 0, 1.56, -0.03, 0.39, 0.3, 0.34);
  d = smin(d, ellipsoid(x, y, z, 0, 1.405, 0.03, 0.425, 0.215, 0.34), 0.1);
  d = smin(d, ellipsoid(x, y, z, 0, 1.47, 0.2, 0.27, 0.17, 0.17), 0.08);
  d = smin(d, sphere(ax, y, z, EYE_T.x, EYE_T.y, EYE_T.z, EYE_T.r), 0.07);
  d = smin(d, capsule(x, y, z, 0, 1.32, -0.05, 0, 1.06, -0.05, 0.175), 0.08);
  const [ly, lz] = casqueLocal(y, z);
  d = smin(d, ellipsoid(x, ly, lz, 0, 0, 0, CASQUE.rx, CASQUE.ry, CASQUE.rz), 0.06);
  for (const s of SPINES) d = smin(d, sphere(x, y, z, 0, s.y, s.z, s.r), 0.014);
  // sockets for the eyeballs, with a soft lip
  d = smax(d, -sphere(ax, y, z, RIG.eye.x, RIG.eye.y, RIG.eye.z, RIG.eye.r + 0.004), 0.016);
  return d;
}

function headColor(x, y, z, nx, ny, nz) {
  const m = 0.94 + 0.1 * noise3(x * 9, y * 9, z * 9);
  let c = C.skin;
  // teal scales on the crown and behind the eyes
  const cap = smoothstep(1.7, 1.82, y + 0.06 * (noise3(x * 14, y * 14, z * 14) - 0.5)) * smoothstep(0.32, 0.12, z);
  c = mixRgb(c, C.teal, cap * 0.85);
  // the casque: sky-blue fan with a cream rim
  const [ly, lz] = casqueLocal(y, z);
  const q = Math.sqrt((ly / CASQUE.ry) ** 2 + (lz / CASQUE.rz) ** 2);
  const inCasque = smoothstep(0.115, 0.07, Math.abs(x)) * smoothstep(1.76, 1.84, y + 0.25 * Math.max(0, -z - 0.1));
  if (inCasque > 0) {
    const fan = mixRgb(C.casque, C.casqueDeep, smoothstep(0.2, 0.8, q));
    c = mixRgb(c, mixRgb(fan, C.rim, smoothstep(0.8, 0.88, q)), inCasque);
  }
  for (const s of SPINES) {
    const d = Math.sqrt(x * x + (y - s.y) ** 2 + (z - s.z) ** 2);
    if (d < s.r + 0.012) c = mixRgb(c, C.spine, smoothstep(s.r + 0.012, s.r + 0.002, d));
  }
  // pale throat under the jaw
  c = mixRgb(c, C.throat, smoothstep(-0.25, -0.7, ny) * smoothstep(1.46, 1.36, y));
  // a darker lip around each eye socket
  const ed = Math.sqrt((Math.abs(x) - RIG.eye.x) ** 2 + (y - RIG.eye.y) ** 2 + (z - RIG.eye.z) ** 2);
  c = mixRgb(c, C.skinDeep, smoothstep(0.17, 0.135, ed) * 0.55);
  return [c[0] * m, c[1] * m, c[2] * m];
}

// ---------- shirt ----------
export function shirtSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 0.88, -0.02, 0.46, 0.44, 0.36);
  if (bound > 0.08) return bound;
  let d = ellipsoid(x, y, z, 0, 0.88, -0.02, 0.31, 0.34, 0.25);
  d = smin(d, ellipsoid(x, y, z, 0, 0.72, 0.02, 0.325, 0.2, 0.26), 0.12);
  d = smin(d, sphere(Math.abs(x), y, z, 0.25, 1.03, -0.02, 0.108), 0.09);
  d = smax(d, 0.585 - y, 0.03);
  d = smax(d, -capsule(x, y, z, 0, 1.3, -0.04, 0, 1.04, -0.04, 0.16), 0.02);
  d = smax(d, y - 1.185, 0.025);
  d = smin(d, torusY(x, y, z, 0, 1.16, -0.04, 0.188, 0.022), 0.014);
  return d;
}
function shirtColor(x, y, z) {
  const collar = smoothstep(1.125, 1.145, y);
  const hem = smoothstep(0.625, 0.6, y) * 0.6;
  const knit = 0.97 + 0.05 * noise3(x * 40, y * 40, z * 40);
  const c = mixRgb(C.shirt, C.shirtDeep, Math.max(collar, hem));
  return [c[0] * knit, c[1] * knit, c[2] * knit];
}

// ---------- pelvis (the cream belly shows below the shirt) ----------
export function pelvisSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 0.56, -0.04, 0.36, 0.26, 0.36);
  if (bound > 0.08) return bound;
  let d = ellipsoid(x, y, z, 0, 0.585, 0, 0.275, 0.15, 0.225);
  d = smin(d, sphere(Math.abs(x), y, z, 0.13, 0.5, 0, 0.095), 0.08);
  d = smin(d, capsule(x, y, z, 0, 0.56, -0.1, 0, RIG.tailRoot[1], RIG.tailRoot[2] + 0.02, 0.09, 0.075), 0.06);
  return d;
}
function pelvisColor(x, y, z, nx, ny, nz) {
  const m = 0.95 + 0.08 * noise3(x * 9, y * 9, z * 9);
  const c = mixRgb(C.skin, C.belly, smoothstep(0.05, 0.45, nz) * smoothstep(0.42, 0.52, y));
  return [c[0] * m, c[1] * m, c[2] * m];
}

// ---------- limbs (local to their joint, pointing down) ----------
const limb = (len, r0, r1) => (x, y, z) => capsule(x, y, z, 0, 0, 0, 0, -len, 0, r0, r1);
export const upperArmSdf = limb(RIG.upperArm, 0.06, 0.055);
export const forearmSdf = limb(RIG.forearm, 0.055, 0.048);
export const thighSdf = limb(RIG.thigh, 0.088, 0.08);
export const shinSdf = limb(RIG.shin + 0.04, 0.08, 0.07);
export function sleeveSdf(x, y, z) {
  let d = capsule(x, y, z, 0, 0.01, 0, 0, -0.13, 0, 0.098, 0.092);
  d = smax(d, -(y + 0.125), 0.018);
  return d;
}
function skinColor(x, y, z) {
  const m = 0.95 + 0.08 * noise3(x * 11 + 3, y * 11, z * 11);
  return [C.skin[0] * m, C.skin[1] * m, C.skin[2] * m];
}

// Hands: the right hand (palm toward +x, thumb toward +z); the left hand is its mirror.
export const HAND_POSES = {
  relaxed: { curl: [[0.5, 0.6], [0.55, 0.65], [0.6, 0.7]], spread: 0.12, thumb: 'side' },
  open: { curl: [[0.12, 0.12], [0.1, 0.1], [0.12, 0.12]], spread: 0.3, thumb: 'out' },
  fist: { curl: [[1.45, 1.6], [1.45, 1.6], [1.45, 1.6]], spread: 0.05, thumb: 'wrap' },
  point: { curl: [[1.45, 1.6], [1.45, 1.6], [0.05, 0.05]], spread: 0.05, thumb: 'wrap' },
  thumbsUp: { curl: [[1.45, 1.6], [1.45, 1.6], [1.45, 1.6]], spread: 0.05, thumb: 'up' },
  grip: { curl: [[0.95, 0.9], [0.95, 0.9], [0.95, 0.9]], spread: 0.08, thumb: 'grip' },
};
export function handSdf(pose) {
  const p = HAND_POSES[pose];
  const fingers = p.curl.map(([a1, a2], i) => {
    const f = i - 1; // -1 back, 0 middle, +1 front (index)
    const bx = 0.004, by = -0.088, bz = f * 0.028;
    const sp = f * p.spread;
    const d1 = [Math.sin(a1), -Math.cos(a1)], d2 = [Math.sin(a1 + a2), -Math.cos(a1 + a2)];
    const mx = bx + d1[0] * 0.042, my = by + d1[1] * 0.042, mz = bz + sp * 0.042;
    const tx = mx + d2[0] * 0.036, ty = my + d2[1] * 0.036, tz = mz + sp * 0.03;
    return [bx, by, bz, mx, my, mz, tx, ty, tz];
  });
  const thumbs = {
    side: [0.012, -0.045, 0.04, 0.03, -0.08, 0.075],
    out: [0.01, -0.045, 0.042, 0.02, -0.07, 0.1],
    wrap: [0.012, -0.05, 0.04, 0.045, -0.085, 0.03],
    up: [0.01, -0.04, 0.04, 0.012, -0.03, 0.105],
    grip: [0.014, -0.05, 0.04, 0.05, -0.075, 0.05],
  }[p.thumb];
  return (x, y, z) => {
    let d = ellipsoid(x, y, z, 0, -0.05, 0, 0.028, 0.055, 0.05);
    d = smin(d, capsule(x, y, z, 0, 0.01, 0, 0, -0.03, 0, 0.038, 0.034), 0.02);
    for (const [bx, by, bz, mx, my, mz, tx, ty, tz] of fingers) {
      d = smin(d, capsule(x, y, z, bx, by, bz, mx, my, mz, 0.0185, 0.017), 0.012);
      d = smin(d, capsule(x, y, z, mx, my, mz, tx, ty, tz, 0.017, 0.0165), 0.008);
      d = smin(d, sphere(x, y, z, tx, ty, tz, 0.0205), 0.006);
    }
    d = smin(d, capsule(x, y, z, thumbs[0], thumbs[1], thumbs[2], thumbs[3], thumbs[4], thumbs[5], 0.019, 0.017), 0.014);
    d = smin(d, sphere(x, y, z, thumbs[3], thumbs[4], thumbs[5], 0.02), 0.006);
    return d;
  };
}
function handColor(x, y, z) {
  const m = 0.95 + 0.08 * noise3(x * 30, y * 30, z * 30);
  const c = mixRgb(C.skin, C.pad, smoothstep(-0.12, -0.16, y) * 0.6);
  return [c[0] * m, c[1] * m, c[2] * m];
}

// ---------- sneakers (local to the ankle; the sole sits at y = -0.12) ----------
function shoeUpper(x, y, z) {
  const toe = ellipsoid(x, y, z, 0, -0.045, 0.185, 0.112, 0.072, 0.128);
  const heel = roundBox(x, y, z, 0, -0.03, -0.035, 0.108, 0.072, 0.125, 0.065);
  let u = smin(toe, heel, 0.08);
  u = smax(u, -capsule(x, y, z, 0, 0.02, -0.055, 0, 0.2, -0.055, 0.06), 0.02);
  return u;
}
const LACES = [0.005, 0.045, 0.085].map(zl => {
  const hit = rayHit(shoeUpper, 0, 0.3, zl, 0, -1, 0);
  return [zl, hit ? hit[1] : 0.03];
});
export function shoeSdf(x, y, z) {
  const sole = roundBox(x, y, z, 0, -0.097, 0.07, 0.122, 0.024, 0.238, 0.024);
  let d = smin(sole, shoeUpper(x, y, z), 0.012);
  d = smin(d, torusY(x, y, z, 0, 0.042, -0.058, 0.068, 0.02), 0.018);
  for (const [zl, yl] of LACES) d = smin(d, capsule(x, y, z, -0.058, yl + 0.004, zl, 0.058, yl + 0.004, zl, 0.0105), 0.004);
  return d;
}
function shoeColor(x, y, z) {
  if (y < -0.072) return Math.abs(y + 0.088) < 0.004 ? C.soleLine : C.sole;
  let c = C.shoe;
  if (z > 0.235 && y < -0.01) c = C.sole; // rubber toe cap
  if (y > 0.025 && Math.sqrt(x * x + (z + 0.058) ** 2) > 0.05 && z < 0.0) c = C.shoeDeep; // padded collar
  if (z < -0.15 && y > -0.03 && Math.abs(x) < 0.03) c = C.heelTab;
  for (const [zl, yl] of LACES) if (Math.abs(z - zl) < 0.013 && y > yl - 0.012 && Math.abs(x) < 0.065) c = C.lace;
  const knit = 0.96 + 0.06 * noise3(x * 50, y * 50, z * 50);
  return [c[0] * knit, c[1] * knit, c[2] * knit];
}

// ---------- the rest-pose scene, for occlusion between parts ----------
function sceneSdf(x, y, z) {
  let d = Math.min(headSdf(x, y, z), shirtSdf(x, y, z), pelvisSdf(x, y, z));
  const ax = Math.abs(x);
  const [shx, shy, shz] = RIG.shoulder;
  const ex = shx + Math.sin(RIG.armRest) * RIG.upperArm, ey = shy - Math.cos(RIG.armRest) * RIG.upperArm;
  d = Math.min(d, capsule(ax, y, z, shx, shy, shz, ex, ey, shz, 0.07, 0.05));
  d = Math.min(d, capsule(ax, y, z, ex, ey, shz, ex + Math.sin(RIG.armRest) * RIG.forearm, ey - Math.cos(RIG.armRest) * RIG.forearm, shz, 0.045));
  d = Math.min(d, capsule(ax, y, z, RIG.hip[0], RIG.hip[1], 0, RIG.hip[0], 0.12, 0, 0.07));
  return d;
}

// ---------- decals: the shirt badge and the face patch (mouth, blush, nostrils) ----------
function badgeDecal(r = 0.108, cx = 0, cy = 0.9) {
  const rings = 14, segs = 40;
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j < (i === 0 ? 1 : segs); j++) {
    const rr = (i / rings) * r, a = (j / segs) * Math.PI * 2;
    const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
    const hit = rayHit(shirtSdf, x, y, 0.6, 0, 0, -1) || [x, y, 0.23];
    const n = gradient(shirtSdf, hit[0], hit[1], hit[2], 0.002);
    pos.push(hit[0] + n[0] * 0.002, hit[1] + n[1] * 0.002, hit[2] + n[2] * 0.002);
    nor.push(...n);
    uv.push(0.5 + (x - cx) / (2 * r), 0.5 + (y - cy) / (2 * r));
  }
  const ring = i => (i === 0 ? 0 : 1 + (i - 1) * segs);
  for (let j = 0; j < segs; j++) idx.push(0, ring(1) + j, ring(1) + ((j + 1) % segs));
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = ring(i) + j, b = ring(i) + ((j + 1) % segs), c2 = ring(i + 1) + j, d2 = ring(i + 1) + ((j + 1) % segs);
    idx.push(a, c2, d2, a, d2, b);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uv), indices: new Uint16Array(idx) };
}

export const FACE = { phi: 1.05, y0: 1.3, y1: 1.535, cz: -0.08 };
function facePatch() {
  const cols = 64, rows = 22, R = 1.2;
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const phi = (j / cols * 2 - 1) * FACE.phi, y = FACE.y0 + (i / rows) * (FACE.y1 - FACE.y0);
    const ox = R * Math.sin(phi), oz = FACE.cz + R * Math.cos(phi);
    const hit = rayHit(headSdf, ox, y, oz, -Math.sin(phi), 0, -Math.cos(phi), 2) || [ox * 0.3, y, 0.2];
    const n = gradient(headSdf, hit[0], hit[1], hit[2], 0.002);
    pos.push(hit[0] + n[0] * 0.0015, hit[1] + n[1] * 0.0015, hit[2] + n[2] * 0.0015);
    nor.push(...n);
    uv.push(phi / FACE.phi, y);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + 1, c2 = a + cols + 1, d2 = c2 + 1;
    idx.push(a, b, d2, a, d2, c2);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uv), indices: new Uint16Array(idx) };
}

// ---------- building ----------
// bodyT runs from the head (0) to the feet (0.55); the tail carries on to 1.
const bodyT = y => clamp((2.15 - y) / 2.15, 0, 1) * 0.55;

function meshPart(sdf, min, max, h, colorFn, { pivot = [0, 0, 0], worldY = null, aoScene = null, tint = 1 } = {}) {
  const m = surfaceNets(sdf, min, max, h);
  const n = m.positions.length / 3;
  const colors = new Float32Array(n * 3), mood = new Float32Array(n * 2);
  for (let v = 0; v < n; v++) {
    const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
    const nx = m.normals[v * 3], ny = m.normals[v * 3 + 1], nz = m.normals[v * 3 + 2];
    const ao = occlusion(aoScene || sdf, x, y, z, nx, ny, nz);
    const c = colorFn(x, y, z, nx, ny, nz);
    colors[v * 3] = srgbToLinear(clamp(c[0], 0, 1)) * ao;
    colors[v * 3 + 1] = srgbToLinear(clamp(c[1], 0, 1)) * ao;
    colors[v * 3 + 2] = srgbToLinear(clamp(c[2], 0, 1)) * ao;
    mood[v * 2] = bodyT(worldY === null ? y : worldY + y);
    mood[v * 2 + 1] = tint;
    m.positions[v * 3] -= pivot[0]; m.positions[v * 3 + 1] -= pivot[1]; m.positions[v * 3 + 2] -= pivot[2];
  }
  return { ...m, colors, mood, pivot };
}

function shiftDecal(d, pivot) {
  for (let v = 0; v < d.positions.length; v += 3) {
    d.positions[v] -= pivot[0]; d.positions[v + 1] -= pivot[1]; d.positions[v + 2] -= pivot[2];
  }
  return { ...d, pivot };
}

// quality: 1 = full, 0.7 = lighter phones (coarser grids)
export function buildRongu(quality = 1) {
  const q = 1 / clamp(quality, 0.5, 1);
  const parts = {};
  parts.head = meshPart(headSdf, [-0.55, 1.0, -0.62], [0.55, 2.28, 0.48], 0.0105 * q, headColor, { pivot: RIG.neck, aoScene: sceneSdf });
  parts.shirt = meshPart(shirtSdf, [-0.46, 0.52, -0.34], [0.46, 1.25, 0.34], 0.0115 * q, shirtColor, { pivot: RIG.chest, aoScene: sceneSdf, tint: 0 });
  parts.pelvis = meshPart(pelvisSdf, [-0.33, 0.34, -0.37], [0.33, 0.78, 0.29], 0.013 * q, pelvisColor, { pivot: RIG.hips, aoScene: sceneSdf });
  parts.sleeve = meshPart(sleeveSdf, [-0.12, -0.16, -0.12], [0.12, 0.12, 0.12], 0.009 * q, () => C.shirt, { worldY: RIG.shoulder[1], tint: 0 });
  parts.upperArm = meshPart(upperArmSdf, [-0.08, -0.31, -0.08], [0.08, 0.08, 0.08], 0.008 * q, skinColor, { worldY: RIG.shoulder[1] });
  parts.forearm = meshPart(forearmSdf, [-0.075, -0.29, -0.075], [0.075, 0.075, 0.075], 0.008 * q, skinColor, { worldY: RIG.shoulder[1] - RIG.upperArm });
  for (const pose of Object.keys(HAND_POSES)) {
    parts['hand_' + pose] = meshPart(handSdf(pose), [-0.07, -0.2, -0.06], [0.08, 0.06, 0.13], 0.006 * q, handColor, { worldY: 0.58 });
  }
  parts.thigh = meshPart(thighSdf, [-0.1, -0.3, -0.1], [0.1, 0.1, 0.1], 0.009 * q, skinColor, { worldY: RIG.hip[1] });
  parts.shin = meshPart(shinSdf, [-0.095, -0.32, -0.095], [0.095, 0.095, 0.095], 0.009 * q, skinColor, { worldY: RIG.hip[1] - RIG.thigh });
  parts.shoe = meshPart(shoeSdf, [-0.16, -0.135, -0.2], [0.16, 0.1, 0.33], 0.0075 * q, shoeColor, { worldY: 0.12, tint: 0 });
  parts.badge = shiftDecal(badgeDecal(), RIG.chest);
  parts.face = shiftDecal(facePatch(), RIG.neck);
  return parts;
}
