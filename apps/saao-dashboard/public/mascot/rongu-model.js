// Rongu in three.js: materials, the rig, and the parts that move on their own
// (eyes, lids, mouth, glasses, the rainbow tail, the tablet, the satellite backpack, the tongue).
import * as THREE from './vendor/three-rongu.min.js';
import { RIG, COLORS, FACE } from './rongu-shapes.js';

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const lin = (hex) => new THREE.Color(hex); // three converts sRGB hex to linear

// Moods: the colour Rongu turns, and how strongly (0 = his own green).
export const MOODS = {
  calm: ['#96C85C', 0],
  happy: ['#9FE24A', 0.35],
  heat: ['#F07A3A', 0.72],
  drought: ['#BFA25E', 0.7],
  flood: ['#36B5CC', 0.65],
  cold: ['#CFEDEA', 0.6],
  shy: ['#F08C9A', 0.35],
};

// ---------- materials ----------
const SKIN_GLSL = `
uniform vec4 uMoodFrom;
uniform vec4 uMoodTo;
uniform float uWave;
uniform float uScaleFreq;
uniform float uBump;
uniform float uShimmer;
uniform float uTime;
uniform float uGlow;
uniform float uRim;
varying vec3 vMood;
varying vec3 vRest;
vec3 rgHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float rgBeads(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 r = g + 0.5 + (rgHash(i + g) - 0.5) * 0.45 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  float edge = sqrt(d2) - sqrt(d1); // 0 on the crease between two beads
  float h = smoothstep(0.0, 0.42, edge);
  return 1.0 - (1.0 - h) * (1.0 - h); // a rounded dome
}
vec3 rgPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
vec3 rgHue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}`;

function injectSkin(material, shared) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aMood;\nattribute vec3 aRest;\nvarying vec3 vMood;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMood = aMood;\nvRest = aRest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 scaleP = vRest * uScaleFreq;
  float scaleAA = clamp(1.6 - length(fwidth(scaleP)) * 2.2, 0.0, 1.0);
  float scaleH = rgBeads(scaleP);
  scaleAA *= vMood.z;
  diffuseColor.rgb *= mix(1.0, 0.7 + 0.36 * scaleH, scaleAA); // darker creases, slightly lighter bead tops
  float moodWave = smoothstep(vMood.x - 0.07, vMood.x + 0.07, uWave);
  vec4 mood = mix(uMoodFrom, uMoodTo, moodWave);
  float skinLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float moodLum = max(dot(mood.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.02);
  diffuseColor.rgb = mix(diffuseColor.rgb, mood.rgb * (skinLum / moodLum), mood.a * vMood.y);
  float band = smoothstep(0.1, 0.0, abs(fract(vMood.x * 3.0 - uTime * 0.9) - 0.5) - 0.38);
  diffuseColor.rgb = mix(diffuseColor.rgb, rgHue(fract(vMood.x * 2.0 + uTime * 0.3)) * (skinLum * 1.6 + 0.08), uShimmer * band * vMood.y * 0.55);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = rgPerturb(-vViewPosition, normal, vec2(dFdx(scaleH), dFdy(scaleH)) * uBump * scaleAA, faceDirection);`)
      // a soft glow, brightest at the edges: light passing through soft vinyl (a cheap subsurface look)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float rgFres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
  totalEmissiveRadiance += diffuseColor.rgb * (uGlow + uRim * rgFres);`);
  };
  material.customProgramCacheKey = () => 'rongu-skin';
}

const FACE_GLSL = `
uniform float uOpen;
uniform float uSmile;
uniform float uWidth;
uniform float uBlush;
uniform float uTongue;
varying vec2 vFace;`;

function injectFace(material, shared) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FACE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 f = vFace;
  float px = max(fwidth(f.y), 0.0008) * 1.1;
  float w = 0.6 * uWidth;
  float u = f.x / w;
  float lineY = 1.372 + (0.018 + 0.03 * uSmile) * u * u + 0.012 * uSmile * smoothstep(0.7, 1.0, abs(u)) - 0.006 * uSmile;
  float lowY = lineY - uOpen * 0.08 * max(0.0, 1.0 - u * u) * (0.7 + 0.3 * uWidth);
  float inside = step(abs(u), 1.0) * smoothstep(lowY - px, lowY + px, f.y) * smoothstep(lineY + px, lineY - px, f.y) * step(0.002, uOpen);
  float line = (1.0 - smoothstep(0.0052, 0.0052 + px, abs(f.y - lineY))) * smoothstep(1.06, 0.97, abs(u));
  float tongue = 1.0 - smoothstep(0.85, 1.0, length(vec2(u / 0.42, (f.y - lowY - 0.008) / max(0.022 * uOpen, 0.001))));
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  float bd = length(vec2((abs(f.x) - 0.6) / 0.115, (f.y - 1.402) / 0.038));
  float blush = (1.0 - smoothstep(0.15, 1.0, bd)) * (0.72 + 0.25 * uBlush);
  col = mix(col, vec3(0.95, 0.45, 0.42), step(0.001, blush)); alpha = max(alpha, blush);
  float nd = length(vec2((abs(f.x) - 0.105) / 0.03, (f.y - 1.494) / 0.0085));
  float nostril = 1.0 - smoothstep(0.75, 1.0, nd);
  col = mix(col, vec3(0.1, 0.2, 0.06), nostril); alpha = max(alpha, nostril * 0.85);
  col = mix(col, vec3(0.1, 0.22, 0.07), line); alpha = max(alpha, line);
  vec3 mouthCol = mix(vec3(0.22, 0.03, 0.06), vec3(0.85, 0.32, 0.4), tongue * inside);
  col = mix(col, mouthCol, inside); alpha = max(alpha, inside);
  diffuseColor = vec4(col, alpha);`);
  };
  material.customProgramCacheKey = () => 'rongu-face';
}

// ---------- textures drawn on canvas ----------
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Badge A: a satellite over a rice seedling (no insect).
export function drawBadge(ctx, s) {
  const c = s / 2;
  ctx.clearRect(0, 0, s, s);
  ctx.save();
  ctx.beginPath(); ctx.arc(c, c, s * 0.49, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.beginPath(); ctx.arc(c, c, s * 0.425, 0, Math.PI * 2); ctx.fillStyle = '#B7E1ED'; ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#8A5A34';
  ctx.beginPath(); ctx.ellipse(c, s * 0.86, s * 0.48, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#44783A'; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c, s * 0.7); ctx.quadraticCurveTo(c - s * 0.01, s * 0.55, c + s * 0.005, s * 0.44); ctx.stroke();
  const leaf = (x, y, dx, dy, col) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx * 0.2 - dy * 0.35, y + dy * 0.2 + dx * 0.35, x + dx, y + dy);
    ctx.quadraticCurveTo(x + dx * 0.8 + dy * 0.35, y + dy * 0.8 - dx * 0.35, x, y); ctx.fill();
  };
  leaf(c, s * 0.6, -s * 0.2, -s * 0.13, '#75A457');
  leaf(c, s * 0.53, s * 0.22, -s * 0.2, '#A0C477');
  ctx.setLineDash([s * 0.025, s * 0.025]); ctx.strokeStyle = '#2B4C9A'; ctx.lineWidth = s * 0.014;
  ctx.beginPath(); ctx.arc(c, s * 0.62, s * 0.38, Math.PI * 1.12, Math.PI * 1.9); ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(s * 0.73, s * 0.26); ctx.rotate(-0.35);
  ctx.fillStyle = '#1D272B'; ctx.fillRect(-s * 0.035, -s * 0.035, s * 0.07, s * 0.07);
  ctx.fillStyle = '#6EC4D9'; ctx.strokeStyle = '#1D272B'; ctx.lineWidth = s * 0.008;
  for (const sx of [-1, 1]) { ctx.fillRect(sx < 0 ? -s * 0.135 : s * 0.045, -s * 0.026, s * 0.09, s * 0.052); ctx.strokeRect(sx < 0 ? -s * 0.135 : s * 0.045, -s * 0.026, s * 0.09, s * 0.052); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(c, c, s * 0.425, 0, Math.PI * 2); ctx.strokeStyle = '#8FB8C6'; ctx.lineWidth = s * 0.008; ctx.stroke();
}

function solarCells(ctx, w, h) {
  ctx.fillStyle = '#C9CED6'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1E3F8F'; ctx.fillRect(6, 6, w - 12, h - 12);
  ctx.strokeStyle = '#7FA6E0'; ctx.lineWidth = 2;
  for (let i = 1; i < 8; i++) { const x = 6 + (w - 12) * i / 8; ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, h - 6); ctx.stroke(); }
  for (let j = 1; j < 3; j++) { const y = 6 + (h - 12) * j / 3; ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w - 6, y); ctx.stroke(); }
}

function blobShadow(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(20,50,40,0.42)'); g.addColorStop(0.55, 'rgba(20,50,40,0.18)'); g.addColorStop(1, 'rgba(20,50,40,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// ---------- geometry helpers ----------
function partGeometry(p) {
  const g = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(p.positions, 3);
  g.setAttribute('position', pos);
  g.setAttribute('normal', new THREE.BufferAttribute(p.normals, 3));
  if (p.colors) g.setAttribute('color', new THREE.BufferAttribute(p.colors, 3));
  if (p.mood) g.setAttribute('aMood', new THREE.BufferAttribute(p.mood, 3));
  if (p.uvs) g.setAttribute('uv', new THREE.BufferAttribute(p.uvs, 2));
  g.setAttribute('aRest', pos);
  g.setIndex(new THREE.BufferAttribute(p.indices, 1));
  g.computeBoundingSphere();
  return g;
}

// Give a plain three.js geometry the skin attributes (one colour, a place on the body).
function skinned(g, hex, bodyT, tint = 1, scales = 0.3) {
  const n = g.attributes.position.count, c = lin(hex);
  const col = new Float32Array(n * 3), mood = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; mood[i * 3] = bodyT; mood[i * 3 + 1] = tint; mood[i * 3 + 2] = scales; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMood', new THREE.BufferAttribute(mood, 3));
  g.setAttribute('aRest', g.attributes.position);
  return g;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ---------- the rainbow tail: a tube whose curl is integrated from its curvature every frame ----------
const TAIL_STOPS = [
  [0, '#96C85C'], [0.1, '#4CC3A6'], [0.2, '#7BD36E'], [0.28, '#F0E45E'], [0.35, '#F9B13C'], [0.42, '#F9614D'],
  [0.49, '#F2507A'], [0.56, '#8E86E6'], [0.63, '#5A8BE0'], [0.7, '#3BA8D6'], [0.77, '#3CBFA0'], [0.85, '#6CD06E'],
  [0.93, '#B8E05A'], [1, '#F2E35C'],
].map(([t, h]) => [t, lin(h)]);
function tailColor(t) {
  for (let i = 1; i < TAIL_STOPS.length; i++) {
    if (t <= TAIL_STOPS[i][0]) {
      const [t0, c0] = TAIL_STOPS[i - 1], [t1, c1] = TAIL_STOPS[i];
      return c0.clone().lerp(c1, (t - t0) / (t1 - t0));
    }
  }
  return TAIL_STOPS[TAIL_STOPS.length - 1][1].clone();
}

class Tail {
  constructor(material) {
    this.N = 160; this.M = 18; this.L = 1.5;
    const rings = this.N + 1, n = rings * this.M + 1;
    this.positions = new Float32Array(n * 3);
    this.normals = new Float32Array(n * 3);
    const rest = new Float32Array(n * 3), col = new Float32Array(n * 3), mood = new Float32Array(n * 3);
    const idx = [];
    for (let i = 0; i < rings; i++) {
      const t = i / this.N, c = tailColor(t);
      for (let j = 0; j < this.M; j++) {
        const v = i * this.M + j, a = (j / this.M) * Math.PI * 2;
        const rr = 0.082 * Math.pow(1 - t, 0.55) + 0.019;
        rest.set([Math.cos(a) * rr, Math.sin(a) * rr, t * this.L], v * 3);
        col.set([c.r, c.g, c.b], v * 3);
        mood.set([0.55 + 0.45 * t, 0.35, 1], v * 3);
        if (i < this.N) {
          const a0 = v, a1 = i * this.M + ((j + 1) % this.M), b0 = a0 + this.M, b1 = a1 + this.M;
          idx.push(a0, b0, b1, a0, b1, a1);
        }
      }
    }
    const tip = rings * this.M, ct = tailColor(1);
    rest.set([0, 0, this.L + 0.01], tip * 3); col.set([ct.r, ct.g, ct.b], tip * 3); mood.set([1, 0.35, 1], tip * 3);
    for (let j = 0; j < this.M; j++) idx.push(this.N * this.M + j, tip, this.N * this.M + ((j + 1) % this.M));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMood', new THREE.BufferAttribute(mood, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.name = 'tail';
    this.u = new THREE.Vector3(1, 0, -0.42).normalize();
    this.v = new THREE.Vector3(0, 1, 0);
    this.w = new THREE.Vector3().crossVectors(this.u, this.v);
  }

  // curl: 0 straight … 1 the reference spiral; wag: sideways swing; phase: time; droop: start angle offset
  update({ curl = 1, wag = 0, phase = 0, droop = 0, helix = 0.1, lift = 0 }) {
    const { N, M, L, u, v, w } = this, ds = L / N;
    let th = -0.5 + droop, px = 0, py = 0;
    const P = this.positions, Nn = this.normals;
    const T = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C0 = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const s = i * ds, t = s / L;
      const r = (0.082 * Math.pow(1 - t, 0.55) + 0.019) * (i === N ? 0.6 : i === N - 1 ? 0.85 : 1);
      const lean = lift * Math.sin(Math.PI * Math.min(1, t * 1.6)) * 0.35;
      C0.set(0, 0, 0).addScaledVector(u, px).addScaledVector(v, py).addScaledVector(w, -helix * t + lean);
      T.set(0, 0, 0).addScaledVector(u, Math.cos(th)).addScaledVector(v, Math.sin(th)).normalize();
      A.copy(w); B.crossVectors(T, A).normalize();
      for (let j = 0; j < M; j++) {
        const a = (j / M) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const nx = A.x * ca + B.x * sa, ny = A.y * ca + B.y * sa, nz = A.z * ca + B.z * sa;
        const k = (i * M + j) * 3;
        P[k] = C0.x + nx * r; P[k + 1] = C0.y + ny * r; P[k + 2] = C0.z + nz * r;
        Nn[k] = nx; Nn[k + 1] = ny; Nn[k + 2] = nz;
      }
      const k = curl * (0.4 + 21 * Math.pow(t, 2.3)) + wag * Math.sin(phase - 5 * t) * (0.4 + 1.6 * t);
      th += k * ds;
      px += Math.cos(th) * ds; py += Math.sin(th) * ds;
    }
    const tip = (N + 1) * M * 3;
    P[tip] = C0.x + T.x * 0.012; P[tip + 1] = C0.y + T.y * 0.012; P[tip + 2] = C0.z + T.z * 0.012;
    Nn[tip] = T.x; Nn[tip + 1] = T.y; Nn[tip + 2] = T.z;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
  }
}

// ---------- assembling Rongu ----------
export function createModel(parts, { envIntensity = 1 } = {}) {
  const shared = {
    uMoodFrom: { value: new THREE.Vector4(0, 0, 0, 0) },
    uMoodTo: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWave: { value: 1 },
    uScaleFreq: { value: 52 },
    uBump: { value: 0.0042 }, // bead height, in model units
    uShimmer: { value: 0 },
    uGlow: { value: 0.04 },
    uRim: { value: 0.24 },
    uTime: { value: 0 },
  };
  const faceUniforms = { uOpen: { value: 0 }, uSmile: { value: 1 }, uWidth: { value: 1 }, uBlush: { value: 0 }, uTongue: { value: 0 } };
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000);
  const clipping = [clipPlane];

  const skin = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.58, clearcoat: 0.22, clearcoatRoughness: 0.45,
    sheen: 0.3, sheenRoughness: 0.75, sheenColor: lin('#D8F0B8'), envMapIntensity: envIntensity, clippingPlanes: clipping,
  });
  injectSkin(skin, shared);
  const cloth = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, sheen: 1, sheenRoughness: 0.45, sheenColor: lin('#7C9BEA'), envMapIntensity: envIntensity * 0.6, clippingPlanes: clipping });
  const rubber = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5, envMapIntensity: envIntensity * 0.7, clippingPlanes: clipping });
  const canvas = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, sheen: 0.6, sheenRoughness: 0.6, sheenColor: lin('#6E7682'), clearcoat: 0.1, envMapIntensity: envIntensity * 0.7, clippingPlanes: clipping });
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: lin('#FBFBF4'), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: envIntensity * 0.8, clippingPlanes: clipping });
  const pupil = new THREE.MeshPhysicalMaterial({ color: lin('#0A0E10'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, clippingPlanes: clipping });
  const sparkle = new THREE.MeshBasicMaterial({ color: 0xffffff, clippingPlanes: clipping });
  const frame = new THREE.MeshPhysicalMaterial({ color: lin('#14181A'), roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: envIntensity, clippingPlanes: clipping });
  const lens = new THREE.MeshPhysicalMaterial({ color: lin('#EAF8FF'), transparent: true, opacity: 0.1, roughness: 0.03, clearcoat: 1, depthWrite: false, envMapIntensity: envIntensity * 1.8, clippingPlanes: clipping });
  const badgeMat = new THREE.MeshPhysicalMaterial({ map: canvasTexture(512, 512, (c, w) => drawBadge(c, w)), alphaTest: 0.5, roughness: 0.75, sheen: 0.6, sheenColor: lin('#FFFFFF'), polygonOffset: true, polygonOffsetFactor: -2, clippingPlanes: clipping });
  const faceMat = new THREE.MeshPhysicalMaterial({ transparent: true, depthWrite: false, roughness: 0.45, clearcoat: 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, clippingPlanes: clipping });
  injectFace(faceMat, faceUniforms);
  const metal = new THREE.MeshPhysicalMaterial({ color: lin('#C9CED6'), metalness: 0.8, roughness: 0.3, envMapIntensity: envIntensity * 1.2, clippingPlanes: clipping });
  const gold = new THREE.MeshPhysicalMaterial({ color: lin('#E3B44E'), metalness: 0.85, roughness: 0.32, clearcoat: 0.4, envMapIntensity: envIntensity * 1.3, clippingPlanes: clipping });
  const tongueMat = new THREE.MeshPhysicalMaterial({ color: lin('#EA7F93'), roughness: 0.35, clearcoat: 0.6, clippingPlanes: clipping });
  const materials = [skin, cloth, canvas, rubber, eyeWhite, pupil, sparkle, frame, lens, badgeMat, faceMat, metal, gold, tongueMat];

  const mesh = (geom, mat, name) => { const m = new THREE.Mesh(geom, mat); m.name = name; m.castShadow = !mat.transparent; m.receiveShadow = true; return m; };
  const at = (obj, world, parentWorld) => { obj.position.set(world[0] - parentWorld[0], world[1] - parentWorld[1], world[2] - parentWorld[2]); return obj; };

  // hierarchy
  const root = new THREE.Group(); root.name = 'rongu';
  const body = new THREE.Group(); root.add(body); // squash and stretch happen here
  const hips = at(new THREE.Group(), RIG.hips, [0, 0, 0]); body.add(hips);
  hips.add(mesh(partGeometry(parts.pelvis), skin, 'pelvis'));
  const chest = at(new THREE.Group(), RIG.chest, RIG.hips); hips.add(chest);
  chest.add(mesh(partGeometry(parts.shirt), cloth, 'shirt'));
  chest.add(mesh(partGeometry(parts.badge), badgeMat, 'badge'));
  const neck = at(new THREE.Group(), RIG.neck, RIG.chest); chest.add(neck);
  const head = new THREE.Group(); head.scale.setScalar(1.08); neck.add(head); // a slightly bigger head reads cuter
  head.add(mesh(partGeometry(parts.head), skin, 'head'));
  const face = mesh(partGeometry(parts.face), faceMat, 'face'); face.renderOrder = 2; head.add(face);

  // eyes, lids and catchlights
  const eyes = {};
  const eyeGeo = new THREE.SphereGeometry(RIG.eye.r, 40, 28);
  const pupilGeo = new THREE.SphereGeometry(RIG.eye.r + 0.0012, 40, 12, 0, Math.PI * 2, 0, 0.5).rotateX(Math.PI / 2);
  const lidUpGeo = skinned(new THREE.SphereGeometry(RIG.eye.r + 0.0026, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.skin, 0.12);
  const lidLowGeo = skinned(new THREE.SphereGeometry(RIG.eye.r + 0.0024, 36, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), COLORS.skin, 0.12);
  const sparkGeo = new THREE.SphereGeometry(0.021, 16, 10).scale(1, 0.8, 0.35);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const pivot = new THREE.Group();
    at(pivot, [sx * RIG.eye.x, RIG.eye.y, RIG.eye.z], RIG.neck); head.add(pivot);
    const ball = new THREE.Group(); pivot.add(ball);
    ball.add(mesh(eyeGeo, eyeWhite, 'eye' + side));
    ball.add(mesh(pupilGeo, pupil, 'pupil' + side));
    const lidUp = mesh(lidUpGeo, skin, 'lidUp' + side), lidLow = mesh(lidLowGeo, skin, 'lidLow' + side);
    pivot.add(lidUp, lidLow);
    const s1 = mesh(sparkGeo, sparkle, 'spark' + side);
    s1.position.set(-0.36, 0.45, 0.82).normalize().multiplyScalar(RIG.eye.r + 0.004);
    s1.lookAt(s1.position.clone().multiplyScalar(2));
    const s2 = s1.clone(); s2.scale.setScalar(0.42);
    s2.position.set(0.32, -0.3, 0.9).normalize().multiplyScalar(RIG.eye.r + 0.004); s2.lookAt(s2.position.clone().multiplyScalar(2));
    pivot.add(s1, s2);
    eyes[side] = { pivot, ball, lidUp, lidLow, sparks: [s1, s2] };
  }

  // glasses
  const glasses = new THREE.Group(); glasses.name = 'glasses';
  at(glasses, [0, RIG.eye.y, 0.438], RIG.neck); head.add(glasses);
  const W = 0.36, H = 0.32, ring = roundedRect(W, H, 0.08);
  const hole = roundedRect(W - 0.046, H - 0.046, 0.064);
  ring.holes.push(hole);
  const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 3, curveSegments: 16 }).translate(0, 0, -0.009);
  const lensGeo = new THREE.ShapeGeometry(roundedRect(W - 0.042, H - 0.042, 0.062), 12);
  for (const sx of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(sx * RIG.eye.x, 0, 0); g.rotation.y = sx * 0.13;
    g.add(mesh(ringGeo, frame, 'frame'));
    const l = mesh(lensGeo, lens, 'lens'); l.position.z = 0.004; l.renderOrder = 3; g.add(l);
    glasses.add(g);
    const temple = mesh(new THREE.CapsuleGeometry(0.0095, 0.4, 4, 10).rotateX(Math.PI / 2), frame, 'temple');
    temple.position.set(sx * (RIG.eye.x + W / 2 + 0.006), 0.04, -0.21); temple.rotation.y = -sx * 0.07; glasses.add(temple);
  }
  const bridge = mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.04, 0.05, 0.004), new THREE.Vector3(0, 0.08, 0.026), new THREE.Vector3(0.04, 0.05, 0.004)), 12, 0.011, 10), frame, 'bridge');
  glasses.add(bridge);
  const glassesRest = glasses.position.clone();

  // tongue (shoots out to tap things)
  const tongue = new THREE.Group(); tongue.name = 'tongue';
  at(tongue, [0, 1.37, 0.36], RIG.neck); head.add(tongue);
  const tongueRod = mesh(new THREE.CylinderGeometry(0.017, 0.021, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), tongueMat, 'tongueRod');
  const tongueTip = mesh(new THREE.SphereGeometry(0.034, 18, 12), tongueMat, 'tongueTip');
  tongue.add(tongueRod, tongueTip); tongue.visible = false;

  // arms
  const arms = {};
  const sleeveGeo = partGeometry(parts.sleeve), upperGeo = partGeometry(parts.upperArm), foreGeo = partGeometry(parts.forearm);
  const handGeos = Object.fromEntries(Object.keys(parts).filter(k => k.startsWith('hand_')).map(k => [k.slice(5), partGeometry(parts[k])]));
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const shoulder = at(new THREE.Group(), [sx * RIG.shoulder[0], RIG.shoulder[1], RIG.shoulder[2]], RIG.chest);
    shoulder.rotation.order = 'ZXY';
    chest.add(shoulder);
    shoulder.add(mesh(sleeveGeo, cloth, 'sleeve' + side), mesh(upperGeo, skin, 'upperArm' + side));
    const elbow = new THREE.Group(); elbow.position.y = -RIG.upperArm; shoulder.add(elbow);
    elbow.add(mesh(foreGeo, skin, 'forearm' + side));
    const wrist = new THREE.Group(); wrist.position.y = -RIG.forearm; wrist.rotation.order = 'YXZ'; elbow.add(wrist);
    const hand = new THREE.Group(); hand.scale.x = sx > 0 ? -1 : 1; wrist.add(hand);
    const variants = {};
    for (const [pose, g] of Object.entries(handGeos)) { const m = mesh(g, skin, `hand${side}_${pose}`); m.visible = pose === 'relaxed'; hand.add(m); variants[pose] = m; }
    arms[side] = { shoulder, elbow, wrist, hand, variants, pose: 'relaxed', sx };
  }

  // legs
  const legs = {};
  const thighGeo = partGeometry(parts.thigh), shinGeo = partGeometry(parts.shin);
  const shoeGeos = ['shoeUpper', 'shoeSole', 'shoeCap', 'shoeLaces'].map((k) => [k, partGeometry(parts[k])]);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const hip = at(new THREE.Group(), [sx * RIG.hip[0], RIG.hip[1], RIG.hip[2]], RIG.hips);
    hip.rotation.order = 'ZXY'; hips.add(hip);
    hip.add(mesh(thighGeo, skin, 'thigh' + side));
    const knee = new THREE.Group(); knee.position.y = -RIG.thigh; hip.add(knee);
    knee.add(mesh(shinGeo, skin, 'shin' + side));
    const ankle = new THREE.Group(); ankle.position.y = -RIG.shin; knee.add(ankle);
    const shoe = new THREE.Group(); shoe.name = 'shoe' + side;
    for (const [k, g] of shoeGeos) shoe.add(mesh(g, k === 'shoeUpper' ? canvas : rubber, k + side));
    shoe.rotation.y = sx * 0.08; shoe.scale.setScalar(1.3); shoe.position.y = 0.036; ankle.add(shoe);
    legs[side] = { hip, knee, ankle, sx };
  }

  // tail
  const tailSkin = skin.clone();
  tailSkin.clippingPlanes = clipping; // clone() copies the plane; the tail must share the dive's
  tailSkin.clearcoat = 0.15; tailSkin.sheen = 0.2; tailSkin.envMapIntensity = envIntensity * 0.5;
  injectSkin(tailSkin, shared);
  materials.push(tailSkin);
  const tail = new Tail(tailSkin);
  const tailRoot = at(new THREE.Group(), RIG.tailRoot, RIG.hips); hips.add(tailRoot);
  tailRoot.add(tail.mesh);

  // tablet (in his right hand)
  const tablet = new THREE.Group(); tablet.name = 'tablet';
  const tabShape = roundedRect(0.31, 0.43, 0.034);
  const tabBody = mesh(new THREE.ExtrudeGeometry(tabShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 8 }).translate(0, 0, -0.004), metal, 'tabletBody');
  const screenTex = canvasTexture(256, 352, (ctx, w, h) => drawScreen(ctx, w, h, 'home'));
  const screen = mesh(new THREE.PlaneGeometry(0.288, 0.408), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, clippingPlanes: clipping }), 'screen');
  screen.position.z = 0.0091;
  const bezel = mesh(new THREE.ShapeGeometry(roundedRect(0.302, 0.422, 0.028), 8), new THREE.MeshPhysicalMaterial({ color: lin('#101316'), roughness: 0.08, clearcoat: 1, clippingPlanes: clipping }), 'bezel');
  bezel.position.z = 0.0086;
  const cam = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16).rotateX(Math.PI / 2), frame, 'tabletCamera');
  cam.position.set(-0.11, 0.175, -0.0095);
  tablet.add(tabBody, bezel, screen, cam);
  tablet.userData = { screenTex, draw: (mode, data) => { drawScreen(screenTex.image.getContext('2d'), 256, 352, mode, data); screenTex.needsUpdate = true; } };
  const tabletMount = new THREE.Group(); arms.R.hand.add(tabletMount); tabletMount.add(tablet);
  tablet.position.set(0.016, -0.17, 0.15); tablet.rotation.set(0.12, Math.PI / 2 + 0.3, 0.12);

  // the satellite backpack (solar panels become wings)
  const pack = new THREE.Group(); pack.name = 'backpack';
  at(pack, [0, 0.93, -0.29], RIG.chest); chest.add(pack);
  const box = mesh(new THREE.ExtrudeGeometry(roundedRect(0.19, 0.22, 0.03), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }).translate(0, 0, -0.05), gold, 'packBody');
  pack.add(box);
  const cellTex = canvasTexture(256, 112, solarCells);
  const cellMat = new THREE.MeshPhysicalMaterial({ map: cellTex, roughness: 0.25, metalness: 0.3, clearcoat: 1, clippingPlanes: clipping });
  const panels = [];
  for (const sx of [1, -1]) {
    const hinge = new THREE.Group(); hinge.position.set(sx * 0.105, 0.02, -0.02); pack.add(hinge);
    const panel = mesh(new THREE.BoxGeometry(0.34, 0.15, 0.012), [metal, metal, metal, metal, cellMat, cellMat], 'panel');
    panel.position.x = sx * 0.18; hinge.add(panel);
    panels.push({ hinge, sx });
  }
  const dish = mesh(new THREE.SphereGeometry(0.05, 20, 8, 0, Math.PI * 2, 0, 1.1).rotateX(Math.PI), metal, 'dish');
  dish.position.set(0, 0.17, -0.02); pack.add(dish);
  const rod = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 6), frame, 'antenna'); rod.position.set(0, 0.19, -0.02); pack.add(rod);
  const nozzle = mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.05, 16), frame, 'nozzle'); nozzle.position.set(0, -0.14, -0.02); pack.add(nozzle);
  const flame = mesh(new THREE.ConeGeometry(0.04, 0.22, 16, 1, true).rotateX(Math.PI).translate(0, -0.11, 0), new THREE.MeshBasicMaterial({ color: lin('#FFC65A'), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 'flame');
  flame.position.set(0, -0.165, -0.02); pack.add(flame);
  const straps = [];
  for (const sx of [1, -1]) {
    const strap = mesh(new THREE.TorusGeometry(0.11, 0.013, 8, 24, Math.PI * 1.15), frame, 'strap');
    strap.position.set(sx * 0.15, 0.12, 0.0); strap.rotation.set(0, Math.PI / 2, Math.PI * 0.42); pack.add(strap); straps.push(strap);
  }
  pack.scale.setScalar(0.0001); pack.visible = false;

  // soft contact shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, blobShadow), transparent: true, depthWrite: false, toneMapped: false }));
  shadow.position.y = 0.003; shadow.renderOrder = -1;

  const model = {
    root, body, hips, chest, neck, head, eyes, glasses, arms, legs, tail, tailRoot, tablet, tabletMount, pack, panels, flame, tongue, shadow,
    materials, shared, faceUniforms, clipPlane,
    setHand(side, pose) {
      const a = arms[side];
      if (a.pose === pose || !a.variants[pose]) return;
      a.variants[a.pose].visible = false; a.variants[pose].visible = true; a.pose = pose;
    },
    // apply a flat pose (see rongu-motion.js for the channels)
    apply(p, time) {
      // the root turns around his middle (1.0 up), so flips and banks pivot on his body, not his feet
      body.position.y = -1;
      body.scale.set(1 / Math.sqrt(p.squash), p.squash, 1 / Math.sqrt(p.squash));
      root.position.set(p.rootX, p.rootY + 1, p.rootZ);
      root.rotation.set(p.rootPitch, p.rootYaw, p.rootRoll, 'YXZ');
      hips.position.set(RIG.hips[0] + p.hipsX, RIG.hips[1] + p.hipsY, RIG.hips[2] + p.hipsZ);
      hips.rotation.set(p.hipsTilt, p.hipsTwist, p.hipsRoll);
      chest.rotation.set(p.chestX, p.chestY, p.chestZ);
      neck.rotation.set(p.headX * 0.35, p.headY * 0.3, p.headZ * 0.3);
      head.rotation.set(p.headX * 0.65, p.headY * 0.7, p.headZ * 0.7);
      for (const side of ['L', 'R']) {
        const e = eyes[side], yaw = p['eye' + side + 'Yaw'], pitch = p['eye' + side + 'Pitch'];
        e.ball.rotation.set(-pitch, yaw, 0, 'YXZ');
        e.lidUp.rotation.x = -1.45 + 1.5 * p['lid' + side + 'Up'];
        e.lidLow.rotation.x = 1.45 - 1.48 * p['lid' + side + 'Low'];
        const a = arms[side], s = a.sx;
        a.shoulder.rotation.set(-p['arm' + side + 'Raise'], s * p['arm' + side + 'Twist'], s * (RIG.armRest + p['arm' + side + 'Out']));
        a.elbow.rotation.set(-p['elbow' + side], 0, 0);
        a.wrist.rotation.set(-p['wrist' + side + 'X'], s * p['wrist' + side + 'Twist'], s * p['wrist' + side + 'Z']);
        const l = legs[side];
        l.hip.rotation.set(-p['leg' + side + 'Swing'], 0, s * p['leg' + side + 'Out']);
        l.knee.rotation.x = p['knee' + side];
        l.ankle.rotation.x = -p['ankle' + side];
      }
      glasses.position.copy(glassesRest); glasses.position.y += p.glassesY;
      faceUniforms.uOpen.value = p.mouthOpen; faceUniforms.uSmile.value = p.mouthSmile; faceUniforms.uWidth.value = p.mouthWidth; faceUniforms.uBlush.value = p.blush;
      tail.update({ curl: p.tailCurl, wag: p.tailWag, phase: p.tailPhase, droop: p.tailDroop, lift: p.tailLift, helix: 0.1 });
      tabletMount.scale.setScalar(Math.max(0.0001, p.tablet));
      tabletMount.visible = p.tablet > 0.02;
      const deploy = p.backpack;
      pack.visible = deploy > 0.02;
      pack.scale.setScalar(Math.max(0.0001, Math.min(1, deploy * 1.6)));
      const unfold = Math.max(0, Math.min(1, (deploy - 0.4) / 0.6));
      for (const { hinge, sx } of panels) { hinge.rotation.y = sx * (1 - unfold) * -1.5; hinge.rotation.z = sx * unfold * 0.12; }
      flame.visible = p.thrust > 0.02;
      flame.scale.set(1, Math.max(0.01, p.thrust * (0.85 + 0.3 * Math.sin(time * 47) * Math.sin(time * 31))), 1);
      tongue.visible = p.tongue > 0.01;
      tongue.rotation.set(-p.tonguePitch, p.tongueYaw, 0);
      if (tongue.visible) {
        tongueRod.scale.set(1, 1, Math.max(0.001, p.tongue));
        tongueTip.position.set(0, 0, p.tongue);
      }
      shadow.position.set(p.rootX, 0.003, p.rootZ);
      const lift = Math.max(0, p.rootY);
      shadow.scale.setScalar(Math.max(0.35, 1 - lift * 0.35));
      shadow.material.opacity = Math.max(0, 1 - lift * 0.6) * p.shadow;
      shared.uTime.value = time;
    },
  };
  return model;
}

// What the tablet shows. Simple, flat drawings in the project's colours.
export function drawScreen(ctx, w, h, mode = 'home', data = {}) {
  ctx.fillStyle = '#F3F9EA'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#C1E294'; ctx.fillRect(0, 0, w, 54);
  ctx.fillStyle = '#1D272B'; ctx.font = '600 22px "Hind Siliguri", system-ui, sans-serif';
  ctx.fillText(data.title || 'Mati Kohon', 16, 35);
  if (mode === 'chart') {
    const vals = data.values || [0.35, 0.5, 0.42, 0.7, 0.62, 0.85];
    vals.forEach((v, i) => {
      ctx.fillStyle = i === vals.length - 1 ? '#2B4C9A' : '#75A457';
      const bw = (w - 48) / vals.length;
      ctx.fillRect(24 + i * bw + 4, h - 40 - v * (h - 130), bw - 8, v * (h - 130));
    });
    ctx.fillStyle = '#44783A'; ctx.fillRect(20, h - 40, w - 40, 3);
    return;
  }
  ctx.fillStyle = '#B7E1ED'; ctx.fillRect(16, 72, w - 32, 120);
  ctx.fillStyle = '#75A457'; ctx.fillRect(16, 152, w - 32, 40);
  ctx.fillStyle = '#FAD853'; ctx.beginPath(); ctx.arc(60, 108, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1D272B'; ctx.fillRect(170, 92, 16, 16);
  ctx.fillStyle = '#6EC4D9'; ctx.fillRect(140, 95, 26, 10); ctx.fillRect(190, 95, 26, 10);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = ['#A0C477', '#C1E294', '#6EC4D9'][i];
    ctx.fillRect(16, 212 + i * 44, (w - 32) * [0.82, 0.6, 0.72][i], 30);
  }
}
