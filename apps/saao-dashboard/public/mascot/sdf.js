// Signed-distance sculpting for Rongu: primitives, smooth blends, a surface-nets mesher,
// surface projection and baked ambient occlusion. Plain JavaScript with no three.js,
// so it runs inside a worker and in Node tests.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function sphere(x, y, z, cx, cy, cz, r) {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

// Inigo Quilez's ellipsoid bound: exact on the surface, close enough near it.
export function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx, qy = py / ry, qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

// A capsule from a to b whose radius runs from ra to rb.
export function capsule(x, y, z, ax, ay, az, bx, by, bz, ra, rb = ra) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}

export function roundBox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// A ring lying flat (around the y axis).
export function torusY(x, y, z, cx, cy, cz, R, r) {
  const dx = x - cx, dz = z - cz, q = Math.sqrt(dx * dx + dz * dz) - R, dy = y - cy;
  return Math.sqrt(q * q + dy * dy) - r;
}

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);

// Cheap smooth value noise for mottled skin.
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let out = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    out += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return out;
}

// Tetrahedral gradient: four samples instead of six.
export function gradient(f, x, y, z, e) {
  const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
  const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
  const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
  return [gx / l, gy / l, gz / l];
}

const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

// Sample f on a grid. Blocks far from the surface are filled from a coarse pass,
// so only a narrow band around the surface is evaluated at full resolution.
function sampleField(f, x0, y0, z0, nx, ny, nz, h) {
  const field = new Float32Array(nx * ny * nz);
  const B = 4, far = B * h * Math.sqrt(3) * 1.05;
  for (let bk = 0; bk < nz; bk += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const ei = Math.min(bi + B, nx - 1), ej = Math.min(bj + B, ny - 1), ek = Math.min(bk + B, nz - 1);
    let lo = Infinity, hi = -Infinity;
    for (const [ci, cj, ck] of CORNERS) {
      const d = f(x0 + (ci ? ei : bi) * h, y0 + (cj ? ej : bj) * h, z0 + (ck ? ek : bk) * h);
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    const uniform = lo > far ? lo : hi < -far ? hi : null;
    for (let k = bk; k <= ek; k++) for (let j = bj; j <= ej; j++) for (let i = bi; i <= ei; i++) {
      const idx = i + nx * (j + ny * k);
      if (uniform !== null) { field[idx] = uniform; continue; }
      field[idx] = f(x0 + i * h, y0 + j * h, z0 + k * h);
    }
  }
  return field;
}

// Surface nets: one vertex per cell that crosses the surface, quads across every crossing edge,
// then each vertex is pulled onto the true surface and given the field's exact normal.
export function surfaceNets(f, min, max, h) {
  const [x0, y0, z0] = min;
  const nx = Math.ceil((max[0] - x0) / h) + 1, ny = Math.ceil((max[1] - y0) / h) + 1, nz = Math.ceil((max[2] - z0) / h) + 1;
  const field = sampleField(f, x0, y0, z0, nx, ny, nz, h);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const cv = new Float64Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [di, dj, dk] = CORNERS[c];
      const v = field[(i + di) + nx * ((j + dj) + ny * (k + dk))];
      cv[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const A = CORNERS[a], Bc = CORNERS[b];
      sx += A[0] + (Bc[0] - A[0]) * t; sy += A[1] + (Bc[1] - A[1]) * t; sz += A[2] + (Bc[2] - A[2]) * t;
      n++;
    }
    cellVert[i + cx * (j + cy * k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }

  const idx = [];
  const cell = (i, j, k) => cellVert[i + cx * (j + cy * k)];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
    const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
    if (dac <= dbd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = field[i + nx * (j + ny * k)];
    const inside = v0 < 0;
    // x edge: cells (i, j-1..j, k-1..k); normal +x when the low end is inside
    if (i < cx && j > 0 && k > 0 && j < cy && k < cz && (field[i + 1 + nx * (j + ny * k)] < 0) !== inside) {
      quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !inside);
    }
    if (j < cy && i > 0 && k > 0 && i < cx && k < cz && (field[i + nx * (j + 1 + ny * k)] < 0) !== inside) {
      quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !inside);
    }
    if (k < cz && i > 0 && j > 0 && i < cx && j < cy && (field[i + nx * (j + ny * (k + 1))] < 0) !== inside) {
      quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !inside);
    }
  }

  const count = pos.length / 3;
  const positions = new Float32Array(pos);
  const normals = new Float32Array(count * 3);
  const e = h * 0.25;
  for (let v = 0; v < count; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z);
      const [gx, gy, gz] = gradient(f, x, y, z, e);
      const step = clamp(d, -h, h);
      x -= gx * step; y -= gy * step; z -= gz * step;
    }
    const [nx2, ny2, nz2] = gradient(f, x, y, z, e);
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
    normals[v * 3] = nx2; normals[v * 3 + 1] = ny2; normals[v * 3 + 2] = nz2;
  }
  const indices = count < 65536 ? new Uint16Array(idx) : new Uint32Array(idx);
  return { positions, normals, indices };
}

// Ambient occlusion from the distance field: how much nearby surface crowds each point.
export function occlusion(f, x, y, z, nx, ny, nz) {
  let occ = 0, w = 1;
  for (let i = 1; i <= 5; i++) {
    const t = 0.018 * i;
    occ += (t - Math.min(t, f(x + nx * t, y + ny * t, z + nz * t))) * w;
    w *= 0.62;
  }
  return clamp(1 - 4.2 * occ, 0.42, 1);
}

// March a ray onto the surface (sphere tracing). Returns the hit point or null.
export function rayHit(f, ox, oy, oz, dx, dy, dz, maxT = 3) {
  let t = 0;
  for (let i = 0; i < 160 && t < maxT; i++) {
    const d = f(ox + dx * t, oy + dy * t, oz + dz * t);
    if (d < 1e-4) return [ox + dx * t, oy + dy * t, oz + dz * t];
    t += d * 0.8;
  }
  return null;
}

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function mixRgb(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}
