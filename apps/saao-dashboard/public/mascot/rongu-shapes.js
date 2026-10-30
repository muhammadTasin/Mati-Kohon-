// Rongu's body, sculpted as signed-distance shapes and meshed by sdf.js.
// Units: Rongu stands about 2.1 tall, feet at y = 0, facing +z. "L" is his left (+x).
// World parts (head, shirt, pelvis) are modelled where they stand; limb parts are modelled
// around their own joint, pointing down -y, and the rig places them.
// The look is a soft vinyl toy: clean colours, broad round face, chunky hands.
import {
  sphere, ellipsoid, capsule, roundBox, torusY, smin, smax, clamp, smoothstep, noise3,
  surfaceNets, occlusion, rayHit, gradient, hexToRgb, mixRgb, srgbToLinear,
} from './sdf.js';

export const RIG = {
  hips: [0, 0.58, 0],
  chest: [0, 0.8, -0.02],
  neck: [0, 1.19, -0.04],
  eye: { x: 0.215, y: 1.665, z: 0.25, r: 0.14 },
  shoulder: [0.27, 1.04, -0.02],
  upperArm: 0.21,
  forearm: 0.2,
  hip: [0.13, 0.5, 0],
  thigh: 0.2,
  shin: 0.18,
  tailRoot: [0, 0.52, -0.25],
  armRest: 0.22, // the arms hang slightly out from the body
};

export const COLORS = {
  skin: '#86C266', skinDeep: '#6CA850', belly: '#E3E7B6', bellyLine: '#C9D49A', throat: '#DCE6B2',
  teal: '#49B6C8', casque: '#86D3EA', casqueDeep: '#4AA8D4', rim: '#F4ECCB', spine: '#F2A266',
  shirt: '#2D4EA2', shirtDeep: '#25418C', pad: '#B5D88F',
  shoe: '#6B727B', shoeDeep: '#474D55', sole: '#F6F3EC', lace: '#FAFAF6', soleLine: '#B9BEC4', heelTab: '#A0C477',
};
const C = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, hexToRgb(v)]));

// ---------- head ----------
const EYE_T = { x: 0.215, y: 1.675, z: 0.17, r: 0.18 }; // the eye turret, bulging above the glasses
const CASQUE = { y: 1.84, z: -0.17, rx: 0.13, ry: 0.36, rz: 0.27, tilt: 0.5 };
const ca = Math.cos(CASQUE.tilt), sa = Math.sin(CASQUE.tilt);
function casqueLocal(y, z) {
  const dy = y - CASQUE.y, dz = z - CASQUE.z;
  return [dy * ca - dz * sa, dy * sa + dz * ca];
}
const SPINES = [];
for (let i = 0; i < 9; i++) {
  const phi = (102 - i * 11) * Math.PI / 180;
  const ly = CASQUE.ry * 0.95 * Math.cos(phi), lz = CASQUE.rz * 0.95 * Math.sin(phi);
  SPINES.push({ y: CASQUE.y + ly * ca + lz * sa, z: CASQUE.z - ly * sa + lz * ca, r: 0.036 - i * 0.0018 });
}

export function headSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 1.64, -0.08, 0.58, 0.66, 0.6);
  if (bound > 0.08) return bound;
  const ax = Math.abs(x);
  let d = ellipsoid(x, y, z, 0, 1.6, -0.05, 0.38, 0.27, 0.34); // cranium
  d = smin(d, ellipsoid(x, y, z, 0, 1.44, 0.04, 0.44, 0.235, 0.355), 0.12); // broad round face
  d = smin(d, ellipsoid(x, y, z, 0, 1.465, 0.22, 0.29, 0.165, 0.16), 0.09); // muzzle
  d = smin(d, sphere(ax, y, z, EYE_T.x, EYE_T.y, EYE_T.z, EYE_T.r), 0.07);
  d = smin(d, capsule(x, y, z, 0, 1.32, -0.05, 0, 1.08, -0.05, 0.18), 0.08);
  // casque: a thick fan rising behind the head, thinning to its rim
  const [ly, lz] = casqueLocal(y, z);
  const taper = 1 - 0.45 * clamp((y - 1.8) / 0.3, 0, 1);
  d = smin(d, ellipsoid(x / taper, ly, lz, 0, 0, 0, CASQUE.rx, CASQUE.ry, CASQUE.rz) * taper, 0.08);
  for (const s of SPINES) d = smin(d, sphere(x, y, z, 0, s.y, s.z, s.r), 0.016);
  // sockets for the eyeballs, with a soft lip
  d = smax(d, -sphere(ax, y, z, RIG.eye.x, RIG.eye.y, RIG.eye.z, RIG.eye.r + 0.004), 0.016);
  return d;
}

function headColor(x, y, z, nx, ny) {
  let c = C.skin;
  // teal scales over the crown and the tops of the eye turrets
  const crown = smoothstep(1.72, 1.86, y + 0.025 * Math.sin(x * 23) * Math.sin(z * 19)) * smoothstep(0.36, 0.18, z);
  c = mixRgb(c, C.teal, crown * 0.9);
  // the casque: a sky-blue fan with a cream rim
  const [ly, lz] = casqueLocal(y, z);
  const q = Math.sqrt((ly / CASQUE.ry) ** 2 + (lz / CASQUE.rz) ** 2);
  const inCasque = smoothstep(0.15, 0.09, Math.abs(x)) * smoothstep(1.78, 1.86, y + 0.3 * Math.max(0, -z - 0.1));
  if (inCasque > 0) {
    const fan = mixRgb(C.casque, C.casqueDeep, smoothstep(0.25, 0.82, q));
    c = mixRgb(c, mixRgb(fan, C.rim, smoothstep(0.82, 0.9, q)), inCasque);
  }
  for (const s of SPINES) {
    const d = Math.sqrt(x * x + (y - s.y) ** 2 + (z - s.z) ** 2);
    if (d < s.r + 0.014) c = mixRgb(c, C.spine, smoothstep(s.r + 0.014, s.r + 0.002, d));
  }
  // pale throat under the jaw
  c = mixRgb(c, C.throat, smoothstep(-0.2, -0.7, ny) * smoothstep(1.45, 1.33, y));
  // a slightly deeper lip around each eye socket
  const ed = Math.sqrt((Math.abs(x) - RIG.eye.x) ** 2 + (y - RIG.eye.y) ** 2 + (z - RIG.eye.z) ** 2);
  c = mixRgb(c, C.skinDeep, smoothstep(0.175, 0.142, ed) * 0.45);
  return c;
}
// how much of the scale pattern shows: faint on the face, more on the crown and the back
function headScales(x, y, z) {
  return 0.12 + 0.75 * Math.max(smoothstep(1.7, 1.86, y), smoothstep(0.1, -0.25, z));
}

// ---------- shirt ----------
export function shirtSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 0.88, -0.02, 0.48, 0.46, 0.38);
  if (bound > 0.08) return bound;
  let d = ellipsoid(x, y, z, 0, 0.88, -0.02, 0.31, 0.34, 0.25);
  d = smin(d, ellipsoid(x, y, z, 0, 0.72, 0.02, 0.33, 0.2, 0.26), 0.12);
  d = smin(d, ellipsoid(x, y, z, 0, 0.625, 0.01, 0.345, 0.06, 0.275), 0.06); // a little flare at the hem
  d = smin(d, sphere(Math.abs(x), y, z, 0.25, 1.035, -0.02, 0.112), 0.09);
  d = smax(d, 0.585 - y, 0.028);
  d = smax(d, -capsule(x, y, z, 0, 1.32, -0.04, 0, 1.05, -0.04, 0.168), 0.02);
  d = smax(d, y - 1.2, 0.025);
  d = smin(d, torusY(x, y, z, 0, 1.178, -0.042, 0.196, 0.022), 0.014);
  // soft folds near the hem and under the arms
  d += 0.0035 * Math.sin(x * 31 + z * 7) * smoothstep(0.78, 0.6, y);
  return d;
}
function shirtColor(x, y) {
  const collar = smoothstep(1.14, 1.16, y);
  const hem = smoothstep(0.615, 0.595, y) * 0.7;
  return mixRgb(C.shirt, C.shirtDeep, Math.max(collar, hem));
}

// ---------- pelvis (the ridged cream belly shows below the shirt) ----------
export function pelvisSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 0.56, -0.04, 0.38, 0.27, 0.37);
  if (bound > 0.08) return bound;
  let d = ellipsoid(x, y, z, 0, 0.585, 0, 0.28, 0.155, 0.232);
  d = smin(d, sphere(Math.abs(x), y, z, 0.13, 0.5, 0, 0.098), 0.08);
  d = smin(d, capsule(x, y, z, 0, 0.56, -0.1, 0, RIG.tailRoot[1], RIG.tailRoot[2] + 0.02, 0.095, 0.08), 0.06);
  return d;
}
function pelvisColor(x, y, z, nx, ny, nz) {
  const front = smoothstep(0.35, 0.75, nz) * smoothstep(0.42, 0.5, y);
  const ridge = smoothstep(0.35, 0.5, Math.abs(((y * 30) % 1 + 1) % 1 - 0.5) * 2) * 0.6;
  const belly = mixRgb(C.belly, C.bellyLine, ridge);
  return mixRgb(C.skin, belly, front);
}

// ---------- limbs (local to their joint, pointing down) ----------
const limb = (len, r0, r1) => (x, y, z) => capsule(x, y, z, 0, 0, 0, 0, -len, 0, r0, r1);
export const upperArmSdf = limb(RIG.upperArm, 0.068, 0.062);
export const forearmSdf = limb(RIG.forearm, 0.062, 0.056);
export const thighSdf = limb(RIG.thigh, 0.098, 0.09);
export const shinSdf = limb(RIG.shin + 0.04, 0.09, 0.08);
export function sleeveSdf(x, y, z) {
  let d = capsule(x, y, z, 0, 0.01, 0, 0, -0.125, 0, 0.104, 0.114);
  d = smax(d, -(y + 0.12), 0.016);
  return d;
}
const skinColor = () => C.skin;

// Chunky toy hands: the right hand (palm toward +x, thumb toward +z); the left hand is its mirror.
export const HAND_POSES = {
  relaxed: { curl: [[0.45, 0.55], [0.5, 0.6], [0.55, 0.65]], spread: 0.1, thumb: 'side' },
  open: { curl: [[0.12, 0.1], [0.1, 0.08], [0.12, 0.1]], spread: 0.28, thumb: 'out' },
  fist: { curl: [[1.45, 1.55], [1.45, 1.55], [1.45, 1.55]], spread: 0.04, thumb: 'wrap' },
  point: { curl: [[1.45, 1.55], [1.45, 1.55], [0.05, 0.05]], spread: 0.04, thumb: 'wrap' },
  thumbsUp: { curl: [[1.45, 1.55], [1.45, 1.55], [1.45, 1.55]], spread: 0.04, thumb: 'up' },
  grip: { curl: [[0.95, 0.85], [0.95, 0.85], [0.95, 0.85]], spread: 0.06, thumb: 'grip' },
};
export function handSdf(pose) {
  const p = HAND_POSES[pose];
  const fingers = p.curl.map(([a1, a2], i) => {
    const f = i - 1; // -1 back, 0 middle, +1 front (index)
    const bx = 0.004, by = -0.1, bz = f * 0.034;
    const sp = f * p.spread;
    const d1 = [Math.sin(a1), -Math.cos(a1)], d2 = [Math.sin(a1 + a2), -Math.cos(a1 + a2)];
    const mx = bx + d1[0] * 0.042, my = by + d1[1] * 0.042, mz = bz + sp * 0.042;
    const tx = mx + d2[0] * 0.036, ty = my + d2[1] * 0.036, tz = mz + sp * 0.03;
    return [bx, by, bz, mx, my, mz, tx, ty, tz];
  });
  const thumbs = {
    side: [0.016, -0.05, 0.05, 0.034, -0.085, 0.085],
    out: [0.014, -0.05, 0.05, 0.024, -0.075, 0.115],
    wrap: [0.016, -0.055, 0.05, 0.05, -0.09, 0.035],
    up: [0.014, -0.045, 0.05, 0.016, -0.03, 0.12],
    grip: [0.018, -0.055, 0.05, 0.056, -0.08, 0.058],
  }[p.thumb];
  return (x, y, z) => {
    let d = ellipsoid(x, y, z, 0, -0.058, 0, 0.038, 0.066, 0.064);
    d = smin(d, capsule(x, y, z, 0, 0.01, 0, 0, -0.03, 0, 0.05, 0.046), 0.025);
    for (const [bx, by, bz, mx, my, mz, tx, ty, tz] of fingers) {
      d = smin(d, capsule(x, y, z, bx, by, bz, mx, my, mz, 0.026, 0.024), 0.016);
      d = smin(d, capsule(x, y, z, mx, my, mz, tx, ty, tz, 0.024, 0.023), 0.01);
      d = smin(d, sphere(x, y, z, tx, ty, tz, 0.027), 0.008);
    }
    d = smin(d, capsule(x, y, z, thumbs[0], thumbs[1], thumbs[2], thumbs[3], thumbs[4], thumbs[5], 0.025, 0.023), 0.016);
    d = smin(d, sphere(x, y, z, thumbs[3], thumbs[4], thumbs[5], 0.026), 0.008);
    return d;
  };
}
function handColor(x, y) {
  return mixRgb(C.skin, C.pad, smoothstep(-0.13, -0.18, y) * 0.5);
}

// ---------- sneakers (local to the ankle; the sole sits at y = -0.12) ----------
function shoeUpper(x, y, z) {
  const toe = ellipsoid(x, y, z, 0, -0.045, 0.185, 0.114, 0.074, 0.13);
  const heel = roundBox(x, y, z, 0, -0.03, -0.035, 0.108, 0.072, 0.125, 0.066);
  let u = smin(toe, heel, 0.08);
  u = smax(u, -capsule(x, y, z, 0, 0.02, -0.055, 0, 0.2, -0.055, 0.062), 0.02);
  return u;
}
const LACES = [0.005, 0.045, 0.085].map(zl => {
  const hit = rayHit(shoeUpper, 0, 0.3, zl, 0, -1, 0);
  return [zl, hit ? hit[1] : 0.03];
});
export function shoeSdf(x, y, z) {
  const sole = roundBox(x, y, z, 0, -0.096, 0.075, 0.109, 0.026, 0.222, 0.026);
  let d = smin(sole, shoeUpper(x, y, z), 0.03);
  d = smin(d, torusY(x, y, z, 0, 0.042, -0.058, 0.07, 0.021), 0.018);
  for (const [zl, yl] of LACES) d = smin(d, capsule(x, y, z, -0.06, yl + 0.004, zl, 0.06, yl + 0.004, zl, 0.011), 0.004);
  return d;
}
function shoeColor(x, y, z) {
  if (y < -0.074) return Math.abs(y + 0.09) < 0.0045 ? C.soleLine : C.sole;
  let c = C.shoe;
  if (z > 0.235 && y < -0.01) c = C.sole; // rubber toe cap
  if (y > 0.025 && Math.sqrt(x * x + (z + 0.058) ** 2) > 0.05 && z < 0.0) c = C.shoeDeep; // padded collar
  if (z < -0.15 && y > -0.03 && Math.abs(x) < 0.03) c = C.heelTab;
  for (const [zl, yl] of LACES) if (Math.abs(z - zl) < 0.014 && y > yl - 0.012 && Math.abs(x) < 0.068) c = C.lace;
  const knit = 0.97 + 0.04 * noise3(x * 60, y * 60, z * 60);
  return [c[0] * knit, c[1] * knit, c[2] * knit];
}

// ---------- the rest-pose scene, for occlusion between parts ----------
function sceneSdf(x, y, z) {
  let d = Math.min(headSdf(x, y, z), shirtSdf(x, y, z), pelvisSdf(x, y, z));
  const ax = Math.abs(x);
  const [shx, shy, shz] = RIG.shoulder;
  const ex = shx + Math.sin(RIG.armRest) * RIG.upperArm, ey = shy - Math.cos(RIG.armRest) * RIG.upperArm;
  d = Math.min(d, capsule(ax, y, z, shx, shy, shz, ex, ey, shz, 0.08, 0.062));
  d = Math.min(d, capsule(ax, y, z, ex, ey, shz, ex + Math.sin(RIG.armRest) * RIG.forearm, ey - Math.cos(RIG.armRest) * RIG.forearm, shz, 0.058));
  d = Math.min(d, capsule(ax, y, z, RIG.hip[0], RIG.hip[1], 0, RIG.hip[0], 0.12, 0, 0.085));
  return d;
}

// ---------- decals: the shirt badge and the face patch (mouth, blush, nostrils) ----------
function badgeDecal(r = 0.125, cx = 0, cy = 0.9) {
  const rings = 14, segs = 40;
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j < (i === 0 ? 1 : segs); j++) {
    const rr = (i / rings) * r, a = (j / segs) * Math.PI * 2;
    const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
    const hit = rayHit(shirtSdf, x, y, 0.6, 0, 0, -1) || [x, y, 0.24];
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

export const FACE = { phi: 1.05, y0: 1.3, y1: 1.54, cz: -0.08 };
function facePatch() {
  const cols = 72, rows = 26, R = 1.2;
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
// mood attribute per vertex: [bodyT (head 0 → feet 0.55; the tail carries on to 1), how much moods tint it, how much scale pattern shows]
const bodyT = y => clamp((2.15 - y) / 2.15, 0, 1) * 0.55;

function meshPart(sdf, min, max, h, colorFn, { pivot = [0, 0, 0], worldY = null, aoScene = null, tint = 1, scales = 1 } = {}) {
  const m = surfaceNets(sdf, min, max, h);
  const n = m.positions.length / 3;
  const colors = new Float32Array(n * 3), mood = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
    const nx = m.normals[v * 3], ny = m.normals[v * 3 + 1], nz = m.normals[v * 3 + 2];
    // soft occlusion only: the real shadows come from the light
    const ao = 0.35 + 0.65 * occlusion(aoScene || sdf, x, y, z, nx, ny, nz);
    const c = colorFn(x, y, z, nx, ny, nz);
    colors[v * 3] = srgbToLinear(clamp(c[0], 0, 1)) * ao;
    colors[v * 3 + 1] = srgbToLinear(clamp(c[1], 0, 1)) * ao;
    colors[v * 3 + 2] = srgbToLinear(clamp(c[2], 0, 1)) * ao;
    mood[v * 3] = bodyT(worldY === null ? y : worldY + y);
    mood[v * 3 + 1] = tint;
    mood[v * 3 + 2] = typeof scales === 'function' ? scales(x, y, z) : scales;
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
  parts.head = meshPart(headSdf, [-0.56, 1.02, -0.64], [0.56, 2.3, 0.5], 0.0112 * q, headColor, { pivot: RIG.neck, aoScene: sceneSdf, scales: headScales });
  parts.shirt = meshPart(shirtSdf, [-0.48, 0.52, -0.36], [0.48, 1.26, 0.36], 0.0135 * q, shirtColor, { pivot: RIG.chest, aoScene: sceneSdf, tint: 0, scales: 0 });
  parts.pelvis = meshPart(pelvisSdf, [-0.34, 0.34, -0.38], [0.34, 0.78, 0.3], 0.016 * q, pelvisColor, { pivot: RIG.hips, aoScene: sceneSdf, scales: 0.5 });
  parts.sleeve = meshPart(sleeveSdf, [-0.13, -0.16, -0.13], [0.13, 0.13, 0.13], 0.011 * q, () => C.shirt, { worldY: RIG.shoulder[1], tint: 0, scales: 0 });
  parts.upperArm = meshPart(upperArmSdf, [-0.085, -0.3, -0.085], [0.085, 0.085, 0.085], 0.011 * q, skinColor, { worldY: RIG.shoulder[1] });
  parts.forearm = meshPart(forearmSdf, [-0.08, -0.28, -0.08], [0.08, 0.08, 0.08], 0.011 * q, skinColor, { worldY: RIG.shoulder[1] - RIG.upperArm });
  for (const pose of Object.keys(HAND_POSES)) {
    parts['hand_' + pose] = meshPart(handSdf(pose), [-0.09, -0.24, -0.08], [0.1, 0.08, 0.16], 0.0075 * q, handColor, { worldY: 0.6, scales: 0.4 });
  }
  parts.thigh = meshPart(thighSdf, [-0.105, -0.31, -0.105], [0.105, 0.105, 0.105], 0.012 * q, skinColor, { worldY: RIG.hip[1] });
  parts.shin = meshPart(shinSdf, [-0.1, -0.33, -0.1], [0.1, 0.1, 0.1], 0.012 * q, skinColor, { worldY: RIG.hip[1] - RIG.thigh });
  parts.shoe = meshPart(shoeSdf, [-0.16, -0.135, -0.2], [0.16, 0.1, 0.33], 0.0092 * q, shoeColor, { worldY: 0.12, tint: 0, scales: 0 });
  parts.badge = shiftDecal(badgeDecal(), RIG.chest);
  parts.face = shiftDecal(facePatch(), RIG.neck);
  return parts;
}
