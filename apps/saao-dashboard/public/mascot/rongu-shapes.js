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
  shoulder: [0.31, 1.04, -0.02],
  upperArm: 0.21,
  forearm: 0.2,
  hip: [0.13, 0.5, 0],
  thigh: 0.2,
  shin: 0.18,
  tailRoot: [0, 0.55, -0.12],
  armRest: 0.32, // the arms hang slightly out from the body, clear of the shirt
};

export const COLORS = {
  skin: '#8AC84E', skinDeep: '#6DAA3E', belly: '#E3E7B6', bellyLine: '#C9D49A', throat: '#DCE6B2',
  teal: '#46BCC2', crest: '#5BB0E6', spike: '#F28A35', spikeTip: '#F8B567',
  shirt: '#2F57C6', shirtDeep: '#2547A8', pad: '#A9D873',
  shorts: '#D9C7A0', shortsDeep: '#C2AC82',
  shoe: '#24272C', sole: '#F6F3EC', lace: '#FAFAF6', heelTab: '#7CC243',
};
const C = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, hexToRgb(v)]));

// ---------- head ----------
const EYE_T = { x: 0.215, y: 1.675, z: 0.17, r: 0.18 }; // the eye turret, bulging above the glasses
// the crest: a rounded cone rising from the crown, a little flattened side to side
const CREST = { base: [1.8, -0.1], tip: [2.08, -0.18], r0: 0.2, r1: 0.06, squash: 0.85 };
function headBase(x, y, z) {
  const ax = Math.abs(x);
  let d = ellipsoid(x, y, z, 0, 1.6, -0.05, 0.38, 0.27, 0.34); // cranium
  d = smin(d, ellipsoid(x, y, z, 0, 1.44, 0.04, 0.44, 0.235, 0.355), 0.12); // broad round face
  d = smin(d, ellipsoid(x, y, z, 0, 1.465, 0.22, 0.29, 0.165, 0.16), 0.09); // muzzle
  d = smin(d, sphere(ax, y, z, EYE_T.x, EYE_T.y, EYE_T.z, EYE_T.r), 0.07);
  d = smin(d, capsule(x, y, z, 0, 1.32, -0.05, 0, 1.13, -0.05, 0.148), 0.08);
  // a rounded peak: a broad dome on the crown that rises into a soft point
  const [by, bz] = CREST.base, [ty, tz] = CREST.tip;
  const peak = smin(ellipsoid(x, y, z, 0, by + 0.06, bz - 0.02, CREST.r0 * CREST.squash, CREST.r0 * 0.85, CREST.r0), capsule(x / CREST.squash, y, z, 0, by + 0.08, bz - 0.03, 0, ty, tz, CREST.r0 * 0.68, CREST.r1) * CREST.squash, 0.08);
  d = smin(d, peak, 0.09);
  return d;
}
// orange spikes along the crest's back edge and down the back of the head
const SPIKES = [-6, 18, 42, 66, 92].map((deg, i) => {
  const a = deg * Math.PI / 180, oy = 1.76, oz = -0.08;
  const dy = Math.cos(a), dz = -Math.sin(a);
  const hit = rayHit(headBase, 0, oy + dy * 0.8, oz + dz * 0.8, 0, -dy, -dz, 1.2) || [0, oy + dy * 0.3, oz + dz * 0.3];
  const n = gradient(headBase, hit[0], hit[1], hit[2], 0.003);
  const len = [0.105, 0.12, 0.11, 0.09, 0.07][i], r = [0.042, 0.046, 0.044, 0.038, 0.032][i];
  const b = [hit[0] - n[0] * 0.012, hit[1] - n[1] * 0.012, hit[2] - n[2] * 0.012];
  return { b, t: [b[0] + n[0] * len, b[1] + n[1] * len, b[2] + n[2] * len], r, len };
});
const spikeSdf = (x, y, z, k) => {
  const s = SPIKES[k];
  return capsule(x * 1.45, y, z, ...s.b, ...s.t, s.r, s.r * 0.32) / 1.45;
};

export function headSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 1.68, -0.1, 0.58, 0.7, 0.62);
  if (bound > 0.08) return bound;
  let d = headBase(x, y, z);
  for (let k = 0; k < SPIKES.length; k++) d = smin(d, spikeSdf(x, y, z, k), 0.02);
  // sockets for the eyeballs, with a soft lip
  d = smax(d, -sphere(Math.abs(x), y, z, RIG.eye.x, RIG.eye.y, RIG.eye.z, RIG.eye.r + 0.004), 0.016);
  return d;
}

function headColor(x, y, z, nx, ny) {
  let c = C.skin;
  // the crown turns teal, and the crest sky blue towards its tip
  const crown = smoothstep(1.74, 1.88, y + 0.02 * Math.sin(x * 23) * Math.sin(z * 19)) * smoothstep(0.36, 0.18, z);
  c = mixRgb(c, C.teal, crown * 0.9);
  c = mixRgb(c, C.crest, smoothstep(1.88, 2.04, y));
  for (let k = 0; k < SPIKES.length; k++) {
    const d = spikeSdf(x, y, z, k);
    if (d < 0.012) {
      const sp = SPIKES[k];
      const along = clamp(((x - sp.b[0]) * (sp.t[0] - sp.b[0]) + (y - sp.b[1]) * (sp.t[1] - sp.b[1]) + (z - sp.b[2]) * (sp.t[2] - sp.b[2])) / (sp.len * sp.len), 0, 1);
      c = mixRgb(c, mixRgb(C.spike, C.spikeTip, smoothstep(0.55, 1, along)), smoothstep(0.012, 0.002, d));
    }
  }
  // pale throat under the jaw
  c = mixRgb(c, C.throat, smoothstep(-0.2, -0.7, ny) * smoothstep(1.45, 1.33, y) * smoothstep(-0.02, 0.14, z));
  const throat = smoothstep(1.33, 1.25, y) * smoothstep(-0.06, 0.06, z);
  const ridge = smoothstep(0.35, 0.5, Math.abs(((y * 36) % 1 + 1) % 1 - 0.5) * 2) * 0.5;
  c = mixRgb(c, mixRgb(C.throat, C.bellyLine, ridge), throat);
  // a slightly deeper lip around each eye socket
  const ed = Math.sqrt((Math.abs(x) - RIG.eye.x) ** 2 + (y - RIG.eye.y) ** 2 + (z - RIG.eye.z) ** 2);
  c = mixRgb(c, C.skinDeep, smoothstep(0.175, 0.142, ed) * 0.45);
  return c;
}
// how many dark spots show: a few on the face, more on the crown, crest and back, none on the throat
function headSpots(x, y, z, nx, ny) {
  const crown = smoothstep(1.7, 1.8, y), back = smoothstep(0.0, -0.22, z);
  return (0.35 + 0.65 * Math.max(crown, back)) * smoothstep(-0.25, 0.05, ny) * smoothstep(1.3, 1.38, y);
}

// ---------- shirt ----------
export function shirtSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 0.88, -0.02, 0.48, 0.46, 0.38);
  if (bound > 0.08) return bound;
  let d = ellipsoid(x, y, z, 0, 0.88, -0.02, 0.29, 0.34, 0.25);
  d = smin(d, ellipsoid(x, y, z, 0, 0.72, 0.02, 0.31, 0.2, 0.26), 0.12);
  d = smin(d, ellipsoid(x, y, z, 0, 0.625, 0.01, 0.325, 0.06, 0.275), 0.06); // a little flare at the hem
  d = smin(d, sphere(Math.abs(x), y, z, 0.27, 1.035, -0.02, 0.112), 0.09);
  d = smin(d, ellipsoid(x, y, z, 0, 1.1, -0.1, 0.25, 0.13, 0.18), 0.08); // the yoke across the upper back
  d = smin(d, ellipsoid(x, y, z, 0, 1.13, -0.22, 0.235, 0.12, 0.12), 0.05); // the hood, folded down on the back
  d = smax(d, 0.585 - y, 0.028);
  d = smax(d, -capsule(x, y, z, 0, 1.32, -0.045, 0, 1.05, -0.045, 0.15), 0.02);
  d = smax(d, y - 1.2, 0.025);
  d = smin(d, torusY(x, y, z, 0, 1.184, -0.048, 0.178, 0.034), 0.014); // the hoodie's thick neckline
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
  d = smin(d, capsule(x, y, z, 0, 0.56, -0.08, 0.056, 0.507, -0.173, 0.1, 0.098), 0.07);
  return d;
}
function pelvisColor(x, y, z, nx, ny, nz) {
  const front = smoothstep(0.35, 0.75, nz) * smoothstep(0.42, 0.5, y);
  const ridge = smoothstep(0.35, 0.5, Math.abs(((y * 30) % 1 + 1) % 1 - 0.5) * 2) * 0.6;
  const belly = mixRgb(C.belly, C.bellyLine, ridge);
  return mixRgb(C.skin, belly, front);
}

// ---------- cargo shorts ----------
export function shortsHipsSdf(x, y, z) {
  const bound = ellipsoid(x, y, z, 0, 0.53, -0.02, 0.42, 0.24, 0.38);
  if (bound > 0.06) return bound;
  let d = ellipsoid(x, y, z, 0, 0.56, 0, 0.305, 0.15, 0.255);
  d = smin(d, sphere(Math.abs(x), y, z, 0.13, 0.48, 0, 0.124), 0.07);
  d = smax(d, y - 0.66, 0.02); // tucked under the hoodie
  return d;
}
// one leg of the shorts, local to the hip joint; the cargo pocket sits on +x (the right leg is mirrored)
export function shortsLegSdf(x, y, z) {
  let d = capsule(x, y, z, 0, 0.03, 0, 0, -0.19, 0, 0.118, 0.128);
  d = smax(d, -(y + 0.188), 0.012);
  d = smin(d, torusY(x, y, z, 0, -0.178, 0, 0.125, 0.012), 0.008); // rolled hem
  d = smin(d, roundBox(x, y, z, 0.12, -0.1, 0.005, 0.024, 0.055, 0.058, 0.016), 0.012); // cargo pocket
  return d;
}
const shortsColor = () => C.shorts;
function shortsLegColor(x, y) {
  if (x > 0.11 && y > -0.075 && y < -0.045) return C.shortsDeep; // the pocket flap
  if (y < -0.17) return C.shortsDeep; // the hem
  return C.shorts;
}

// ---------- limbs (local to their joint, pointing down) ----------
const limb = (len, r0, r1) => (x, y, z) => capsule(x, y, z, 0, 0, 0, 0, -len, 0, r0, r1);
export const upperArmSdf = limb(RIG.upperArm, 0.068, 0.062);
export const forearmSdf = limb(RIG.forearm, 0.062, 0.056);
export const thighSdf = limb(RIG.thigh, 0.098, 0.09);
export const shinSdf = limb(RIG.shin + 0.04, 0.09, 0.08);
export function sleeveSdf(x, y, z) {
  let d = capsule(x, y, z, 0, 0.01, 0, 0, -0.16, 0, 0.104, 0.116);
  d = smax(d, -(y + 0.155), 0.016);
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

// ---------- sneakers: black canvas, white rubber sole and toe cap, white laces with a bow ----------
// Local to the ankle; the sole's bottom sits at y = -0.12, the toe points +z. Each colour is its own
// mesh, so the edges between them stay crisp.
const toeSpring = (z) => 0.022 * smoothstep(0.17, 0.33, z) ** 2; // the toe lifts a little, like a real sole
function footprint(x, z) { // a foot-shaped outline: a heel circle flowing into a wider toe circle
  const q = clamp((z + 0.085) / 0.3, 0, 1);
  return Math.hypot(x, z - (-0.085 + 0.3 * q)) - (0.094 + 0.014 * q);
}
export function soleSdf(x, y, z) {
  const yy = y - toeSpring(z);
  const d2 = footprint(x, z) + 0.004 * smoothstep(-0.09, -0.12, yy); // a slight flare at the ground
  const dy = Math.abs(yy + 0.094) - 0.026, rr = 0.012;
  const ax = Math.max(d2 + rr, 0), ay = Math.max(dy + rr, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(d2 + rr, dy + rr), 0) - rr;
}
export function upperSdf(x, y, z) {
  const yy = y - toeSpring(z);
  let u = ellipsoid(x, yy, z, 0, -0.058, 0.19, 0.098, 0.058, 0.122); // low, round toe box
  u = smin(u, ellipsoid(x, yy, z, 0, -0.035, 0.05, 0.103, 0.082, 0.14), 0.05);
  u = smin(u, ellipsoid(x, y, z, 0, -0.03, -0.075, 0.097, 0.098, 0.095), 0.05); // heel
  u = smin(u, capsule(x, y, z, 0, -0.04, -0.045, 0, 0.1, -0.045, 0.092), 0.05); // high-top ankle wrap
  u = smax(u, -(yy + 0.085), 0.006); // sits inside the sole
  u = smax(u, -capsule(x, y, z, 0, 0.0, -0.045, 0, 0.25, -0.045, 0.064), 0.014); // the opening for the leg
  u = smin(u, torusY(x, y, z, 0, 0.108, -0.047, 0.083, 0.021), 0.016); // padded collar
  u = smin(u, capsule(x * 1.35, y, z, 0, -0.012, 0.14, 0, 0.14, 0.005, 0.03) / 1.35, 0.02); // the tongue, standing up at the front
  return u;
}
// eyelets on either side of the tongue, found on the upper's surface
const EYELETS = [0.185, 0.155, 0.125, 0.095].map((zl) => {
  const side = [-1, 1].map((sx) => {
    const hit = rayHit(upperSdf, sx * 0.04, 0.35, zl, 0, -1, 0) || [sx * 0.04, 0.02, zl];
    return [hit[0], hit[1] + 0.01, hit[2]];
  });
  return side;
});
const BOW = (() => { const [l] = EYELETS[3]; const hit = rayHit(upperSdf, 0, 0.35, l[2], 0, -1, 0); return [0, (hit ? hit[1] : l[1]) + 0.012, l[2] + 0.006]; })();
// where each lace crosses, lifted over the tongue
const tongueTop = (zc) => { const hit = rayHit(upperSdf, 0, 0.35, zc, 0, -1, 0); return hit ? hit[1] : 0.03; };
const CROSSES = EYELETS.slice(0, -1).map(([l], i) => { const zc = (l[2] + EYELETS[i + 1][0][2]) / 2; return [0, tongueTop(zc) + 0.01, zc]; });
const BOTTOM = [0, tongueTop(EYELETS[0][0][2]) + 0.01, EYELETS[0][0][2]];
export function laceSdf(x, y, z) {
  const r = 0.011;
  let d = Math.min(capsule(x, y, z, ...EYELETS[0][0], ...BOTTOM, r), capsule(x, y, z, ...BOTTOM, ...EYELETS[0][1], r));
  for (let i = 0; i < CROSSES.length; i++) {
    const [l, rr] = EYELETS[i], [l2, r2] = EYELETS[i + 1], m = CROSSES[i];
    d = Math.min(d, capsule(x, y, z, ...l, ...m, r), capsule(x, y, z, ...m, ...r2, r));
    d = Math.min(d, capsule(x, y, z, ...rr, ...m, r), capsule(x, y, z, ...m, ...l2, r));
  }
  const [bx, by, bz] = BOW;
  d = smin(d, sphere(x, y, z, bx, by, bz, 0.015), 0.006);
  // the bow's loops lie flat on the shoe, clear of the leg
  d = Math.min(d, torusY(x, (y - by) * 1.6 + by, z, bx - 0.034, by + 0.002, bz + 0.012, 0.022, 0.009), torusY(x, (y - by) * 1.6 + by, z, bx + 0.034, by + 0.002, bz + 0.012, 0.022, 0.009));
  d = Math.min(d, capsule(x, y, z, bx, by, bz, bx - 0.022, by - 0.03, bz + 0.03, 0.009), capsule(x, y, z, bx, by, bz, bx + 0.024, by - 0.032, bz + 0.026, 0.009));
  return d;
}
function upperColor(x, y, z) {
  if (z < -0.155 && y > -0.035 && y < 0.04 && Math.abs(x) < 0.028) return C.heelTab;
  return C.shoe;
}
const soleColor = () => C.sole;

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
// mood attribute per vertex: [bodyT (head 0 → feet 0.55; the tail carries on to 1), how much moods tint it, how many dark spots show]
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
    mood[v * 3 + 2] = typeof scales === 'function' ? scales(x, y, z, nx, ny, nz) : scales;
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
  parts.head = meshPart(headSdf, [-0.56, 1.02, -0.64], [0.56, 2.3, 0.5], 0.0112 * q, headColor, { pivot: RIG.neck, aoScene: sceneSdf, scales: headSpots });
  parts.shirt = meshPart(shirtSdf, [-0.48, 0.52, -0.36], [0.48, 1.26, 0.36], 0.0135 * q, shirtColor, { pivot: RIG.chest, aoScene: sceneSdf, tint: 0, scales: 0 });
  parts.pelvis = meshPart(pelvisSdf, [-0.34, 0.34, -0.38], [0.34, 0.78, 0.3], 0.016 * q, pelvisColor, { pivot: RIG.hips, aoScene: sceneSdf, scales: 0 });
  parts.sleeve = meshPart(sleeveSdf, [-0.13, -0.16, -0.13], [0.13, 0.13, 0.13], 0.011 * q, () => C.shirt, { worldY: RIG.shoulder[1], tint: 0, scales: 0 });
  parts.upperArm = meshPart(upperArmSdf, [-0.085, -0.3, -0.085], [0.085, 0.085, 0.085], 0.011 * q, skinColor, { worldY: RIG.shoulder[1] });
  parts.forearm = meshPart(forearmSdf, [-0.08, -0.28, -0.08], [0.08, 0.08, 0.08], 0.011 * q, skinColor, { worldY: RIG.shoulder[1] - RIG.upperArm });
  for (const pose of Object.keys(HAND_POSES)) {
    parts['hand_' + pose] = meshPart(handSdf(pose), [-0.09, -0.24, -0.08], [0.1, 0.08, 0.16], 0.0075 * q, handColor, { worldY: 0.6, scales: 0.35 });
  }
  parts.shortsHips = meshPart(shortsHipsSdf, [-0.42, 0.3, -0.36], [0.42, 0.72, 0.34], 0.012 * q, shortsColor, { pivot: RIG.hips, aoScene: sceneSdf, tint: 0, scales: 0 });
  parts.shortsLeg = meshPart(shortsLegSdf, [-0.16, -0.23, -0.16], [0.18, 0.18, 0.16], 0.009 * q, shortsLegColor, { worldY: RIG.hip[1], tint: 0, scales: 0 });
  parts.thigh = meshPart(thighSdf, [-0.105, -0.31, -0.105], [0.105, 0.105, 0.105], 0.012 * q, skinColor, { worldY: RIG.hip[1] });
  parts.shin = meshPart(shinSdf, [-0.1, -0.33, -0.1], [0.1, 0.1, 0.1], 0.012 * q, skinColor, { worldY: RIG.hip[1] - RIG.thigh });
  const shoeBox = [[-0.15, -0.135, -0.2], [0.15, 0.13, 0.34]], shoeOpts = { worldY: 0.12, tint: 0, scales: 0 };
  parts.shoeUpper = meshPart(upperSdf, ...shoeBox, 0.0068 * q, upperColor, shoeOpts);
  parts.shoeSole = meshPart(soleSdf, ...shoeBox, 0.0062 * q, soleColor, shoeOpts);
  parts.shoeLaces = meshPart(laceSdf, [-0.1, -0.06, -0.06], [0.1, 0.13, 0.16], 0.0032 * q, () => C.lace, shoeOpts);
  parts.badge = shiftDecal(badgeDecal(), RIG.chest);
  parts.face = shiftDecal(facePatch(), RIG.neck);
  return parts;
}
