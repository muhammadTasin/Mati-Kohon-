// The landing page's map: Bangladesh today through NASA's eyes. Every upazila is drawn as one SVG shape (no map tiles,
// light and fast) and coloured by a layer the visitor picks: what NASA sees now (rain against normal, flood water,
// soil wetness, the Aman dry spell, rice-blast weather) or, with the timeline, year by year since 2001 (groundwater,
// hot days, crops a year). Hover shows a place, a tap pins it with its numbers and a way to open it on the dashboard,
// and Rongu says what the layer means for farmers, his skin taking the layer's mood (companion.js ronguHeroSay).
// The layers, colours and breaks are the dashboard map's own (bd-map.js), so the two maps always agree.
// It is drawn as a small table model: the country stands on a slab of soil with its shadow on the page (a canvas
// under the SVG, drawn once per size), light falls from the north-west (a canvas over it), and the upazila under the
// finger, or the one pinned, rises out of it. Tanore, the pilot, is pinned at the start.

import { LAYERS, NO_DATA } from './bd-map.js';

const $ = (id) => document.getElementById(id);
const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'bn');
const tr = (bn, en) => (lang() === 'en' ? en : bn);
const BN = '০১২৩৪৫৬৭৮৯';
const num = (v) => (lang() === 'en' ? String(v) : String(v).replace(/\d/g, d => BN[d]));
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const layer = (id) => LAYERS.find(l => l.id === id);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (share) => `${num(Math.round(share * 100))}%`;

let rows = {}, years = null, liveDate = null;
let mode = 'now', layerId = 'floodNow', year = 2025, playing = 0, pinned = null;
const paths = new Map(); // upazila id -> <path>
let sea = null; // the Bay of Bengal's name, under the coast
let land = null; // the whole country as one Path2D, with the SVG's viewBox, for the slab and the light
let lift = null, liftPin = null; // the raised copies of the upazila under the finger and of the pinned one
const START_PLACE = 'ADM3_Tanore'; // the pilot upazila, pinned when the map opens
const DEPTH = 22; // the slab's thickness, in map units (the map is 1000 high)

// What NASA sees now: the dashboard's live layers, each with what Rongu says about it
const NOW = [
  { id: 'rain30', icon: 'water_drop', short: ['বৃষ্টি', 'Rain'], say(st) {
    const dry = st.share(v => v < 75);
    return {
      text: tr(`গত ৩০ দিনে ${pct(dry)} উপজেলায় স্বাভাবিকের চেয়ে অনেক কম বৃষ্টি (৭৫%-এর নিচে)। বাদামি মানে কম, নীল মানে বেশি।`,
        `In the last 30 days ${pct(dry)} of upazilas had far less rain than normal (under 75%). Brown is less, blue is more.`),
      mood: dry > 0.5 ? 'drought' : 'calm', gesture: 'think',
    };
  } },
  { id: 'floodNow', icon: 'flood', short: ['বন্যার পানি', 'Flood water'], say(st) {
    const deep = st.count(v => v >= 25), top = st.top();
    return {
      text: deep && top
        ? tr(`${num(deep)}টি উপজেলার চার ভাগের এক ভাগের বেশি জমি এখনো বন্যার পানির নিচে; সবচেয়ে বেশি ${top.r.name}-এ (${num(Math.round(top.v))}%)। রাডার মেঘ ভেদ করে দেখে।`,
          `${deep} upazilas still have more than a quarter of their land under flood water; the most is ${top.r.name} (${Math.round(top.v)}%). Radar sees through the clouds.`)
        : tr('এখন বড় কোনো বন্যার পানি নেই।', 'There is no big flood water right now.'),
      mood: deep ? 'flood' : 'calm', gesture: deep ? 'surprise' : 'nod',
    };
  } },
  { id: 'soilWet', icon: 'humidity_percentage', short: ['মাটির রস', 'Soil'], say(st) {
    const dry = st.share(v => v === 'dry');
    return {
      text: tr(`${pct(dry)} উপজেলায় মাটি গত ১০ বছরের এই সময়ের চেয়ে শুকনো; সেখানে রবি ফসল বোনার আগে মাটির রস দেখে নিতে হবে।`,
        `In ${pct(dry)} of upazilas the soil is drier than at this time in the past 10 years; check the moisture there before sowing the winter crop.`),
      mood: dry > 0.4 ? 'drought' : 'calm', gesture: 'skySoil',
    };
  } },
  { id: 'amanDryNow', icon: 'wb_sunny', short: ['আমনে খরা', 'Aman dry spell'], say(st) {
    const high = st.count(v => v === 'high'), watch = st.count(v => v === 'watch');
    return {
      text: tr(`এই সপ্তাহে ${num(high)}টি উপজেলায় আমনে সেচ দেওয়ার মতো খরা, আরও ${num(watch)}টিতে নজর রাখতে হবে।`,
        `This week ${high} upazilas have a dry spell bad enough to irrigate the Aman, and ${watch} more need watching.`),
      mood: high > 30 ? 'drought' : 'calm', gesture: 'oops',
    };
  } },
  { id: 'blastNow', icon: 'coronavirus', short: ['ব্লাস্ট', 'Rice blast'], say(st) {
    const n = st.count(v => v === 'high' || v === 'watch');
    return {
      text: tr(`${num(n)}টি উপজেলায় এই সপ্তাহে ধানের ব্লাস্ট রোগের মতো আবহাওয়া ছিল; সেখানে মাঠ ঘুরে দেখা দরকার।`,
        `${n} upazilas had rice-blast weather this week; fields there need a look.`),
      mood: 'calm', gesture: 'adjustGlasses',
    };
  } },
];

// Year by year: the dashboard's yearly layers, read here for this map's own year (district series, crops per upazila)
const yearOf = (r, key) => {
  if (!years || !r) return null;
  const k = years.years.indexOf(year);
  if (k < 0) return null;
  if (key === 'crops') return years.upazilaCropsByYear?.[r.id]?.[k] ?? null;
  return years.districts?.[r.district]?.[key]?.[k] ?? null;
};
const YEARS = [
  { id: 'yearGroundwater', key: 'groundwaterMm', from: 2003, icon: 'water', short: ['ভূগর্ভস্থ পানি', 'Groundwater'], say(st) {
    const m = median(st.values);
    if (m == null) return { text: tr('এ বছরের তথ্য নেই।', 'No data for this year.'), mood: 'calm' };
    return {
      text: tr(`${num(year)} সালে মাঝামাঝি জেলায় ভূগর্ভস্থ পানির মজুত ২০০৩–০৭-এর চেয়ে ${num(Math.abs(Math.round(m)))} মিমি ${m < 0 ? 'কম' : 'বেশি'}।`,
        `In ${year} the middle district held ${Math.abs(Math.round(m))} mm ${m < 0 ? 'less' : 'more'} groundwater than in 2003-07.`),
      mood: m < -45 ? 'drought' : 'calm', gesture: 'showTablet',
    };
  } },
  { id: 'yearHot', key: 'hotDays', from: 2001, icon: 'thermostat', short: ['গরম দিন', 'Hot days'], say(st) {
    const v = mean(st.values);
    return {
      text: tr(`${num(year)} সালে একটি জেলায় গড়ে ${num(Math.round(v ?? 0))} দিন ৩৬°সে বা তার বেশি গরম ছিল।`,
        `In ${year} a district had ${Math.round(v ?? 0)} days of 36 °C or more on average.`),
      mood: (v ?? 0) > 25 ? 'heat' : 'calm', gesture: 'oops',
    };
  } },
  { id: 'yearCrops', key: 'crops', from: 2001, icon: 'grass', short: ['বছরে ফসল', 'Crops a year'], say(st) {
    const v = mean(st.values);
    return {
      text: tr(`${num(year)} সালে একটি উপজেলার জমিতে গড়ে বছরে ${num((v ?? 0).toFixed(1))}টি ফসল হয়েছে।`,
        `In ${year} an upazila's land carried ${(v ?? 0).toFixed(1)} crops a year on average.`),
      mood: 'happy', gesture: 'thumbsUp',
    };
  } },
];

const list = () => (mode === 'now' ? NOW : YEARS);
const current = () => list().find(l => l.id === layerId) ?? list()[0];
/** The dashboard layer behind the current choice, with this map's own year for the yearly ones. */
function spec() {
  const c = current(), base = layer(c.id);
  return c.key ? { ...base, value: (r) => yearOf(r, c.key) } : base;
}
const unit = (s) => (!s.unit ? '' : s.unit[1] === '%' ? '%' : ` ${tr(s.unit[0], s.unit[1])}`); // 55%, but 70 mm
const fmt = (s, v) => `${s.signed && v > 0 ? '+' : ''}${num(Number(v).toFixed(s.digits))}`;
const classOf = (s, v) => s.breaks.reduce((k, b) => (v >= b ? k + 1 : k), 0);
function colorOf(s, r) {
  const v = r ? s.value(r) : null;
  if (v == null) return NO_DATA;
  if (s.categories) return s.categories.find(c => c[0] === v)?.[3] ?? NO_DATA;
  return s.colors[classOf(s, v)];
}
function valueText(s, r) {
  const v = r ? s.value(r) : null;
  if (v == null) return tr('তথ্য নেই', 'no data');
  if (s.categories) { const c = s.categories.find(x => x[0] === v); return c ? tr(c[1], c[2]) : String(v); }
  return `${fmt(s, v)}${unit(s)}`;
}
function stats(s) {
  const all = Object.values(rows).map(r => ({ r, v: s.value(r) })).filter(x => x.v != null);
  return {
    values: all.map(x => x.v).filter(v => typeof v === 'number'),
    share: (f) => (all.length ? all.filter(x => f(x.v)).length / all.length : 0),
    count: (f) => all.filter(x => f(x.v)).length,
    top: () => all.filter(x => typeof x.v === 'number').sort((a, b) => b.v - a.v)[0] ?? null,
  };
}

// ---------- drawing: lon/lat to a 1000-high box, Bangladesh's latitude squeezing the longitude ----------
function draw(geo) {
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  const each = (c, f) => (typeof c[0] === 'number' ? f(c) : c.forEach(x => each(x, f)));
  for (const f of geo.features) each(f.geometry.coordinates, ([lon, lat]) => {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  });
  const k = 1000 / (maxLat - minLat), cos = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const X = (lon) => (lon - minLon) * cos * k, Y = (lat) => (maxLat - lat) * k;
  const width = Math.ceil(X(maxLon));
  const ring = (pts) => {
    let d = '', lx = null, ly = null;
    pts.forEach(([lon, lat], i) => {
      const x = X(lon), y = Y(lat);
      if (i && i < pts.length - 1 && Math.hypot(x - lx, y - ly) < 1.1) return; // drop points closer than about a pixel
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      lx = x; ly = y;
    });
    return `${d}Z`;
  };
  const svg = $('lmSvg');
  const vb = [-6, -6, width + 12, 1012 + DEPTH + 14]; // room under the coast for the slab
  svg.setAttribute('viewBox', vb.join(' '));
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  let all = '';
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const p = document.createElementNS(ns, 'path');
    const d = polys.map(poly => poly.map(ring).join('')).join('');
    p.setAttribute('d', d);
    p.dataset.id = f.properties.id;
    p.style.fill = NO_DATA; // the first colours fade in from the no-data grey, not from black
    g.append(p);
    paths.set(f.properties.id, p);
    all += d;
  }
  land = { path: new Path2D(all), vb, width };
  liftPin = document.createElementNS(ns, 'path');
  liftPin.setAttribute('class', 'lm-lift pin');
  lift = document.createElementNS(ns, 'path');
  lift.setAttribute('class', 'lm-lift');
  sea = document.createElementNS(ns, 'text');
  sea.setAttribute('class', 'lm-sea');
  sea.setAttribute('x', X(90.3).toFixed(0));
  sea.setAttribute('y', Y(21.25).toFixed(0));
  sea.setAttribute('text-anchor', 'middle');
  seaName();
  svg.replaceChildren(g, liftPin, lift, sea);
  relief();
}
function seaName() { if (sea) sea.textContent = tr('বঙ্গোপসাগর', 'BAY OF BENGAL'); }

// ---------- the table model: a slab of soil under the map, its shadow, the light over it ----------
const mix = (a, b, t) => {
  const h = (c, i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgb(${[0, 1, 2].map(i => Math.round(h(a, i) + (h(b, i) - h(a, i)) * t)).join(',')})`;
};
/** The side of the slab at depth t (0 just under the map, 1 at the bottom): a band of grass, then soil going darker. */
const soilAt = (t) => (t < 0.16 ? '#5f7d49' : mix('#b38d5f', '#6e4e33', (t - 0.16) / 0.84));
function relief() {
  const box = document.querySelector('#lmCanvas .lm-3d');
  if (!land || !box) return;
  const W = box.clientWidth, H = box.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const [vx, vy, vw, vh] = land.vb;
  const k = Math.min(W / vw, H / vh); // the SVG's own fit (xMidYMid meet)
  const tx = (W - vw * k) / 2 - vx * k, ty = (H - vh * k) / 2 - vy * k;

  const base = $('lmBase'), PAD = 32; // the shadow spills past the box
  base.width = Math.round((W + 2 * PAD) * dpr);
  base.height = Math.round((H + 2 * PAD) * dpr);
  let c = base.getContext('2d');
  c.setTransform(k * dpr, 0, 0, k * dpr, (tx + PAD) * dpr, (ty + PAD) * dpr);
  c.save(); // the lowest layer carries the shadow on the page (shadows ignore the transform: CSS pixels times dpr)
  c.shadowColor = 'rgba(70, 50, 24, .34)';
  c.shadowBlur = 24 * dpr;
  c.shadowOffsetY = 14 * dpr;
  c.translate(0, DEPTH);
  c.fillStyle = soilAt(1);
  c.fill(land.path);
  c.restore();
  for (let d = DEPTH - 0.5; d >= 0.5; d -= 0.5) {
    c.save();
    c.translate(0, d);
    c.fillStyle = soilAt(d / DEPTH);
    c.fill(land.path);
    c.restore();
  }

  const top = $('lmLight');
  top.width = Math.round(W * dpr);
  top.height = Math.round(H * dpr);
  c = top.getContext('2d');
  c.setTransform(k * dpr, 0, 0, k * dpr, tx * dpr, ty * dpr);
  c.clip(land.path);
  const g = c.createLinearGradient(0, 0, land.width, 1000);
  g.addColorStop(0, 'rgba(255, 255, 255, .26)');
  g.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  g.addColorStop(1, 'rgba(40, 26, 0, .14)');
  c.fillStyle = g;
  c.fillRect(-10, -10, land.width + 20, 1030);
}
let reliefTimer = 0;
const reliefSoon = () => { clearTimeout(reliefTimer); reliefTimer = setTimeout(relief, 120); };

/** Raise a copy of an upazila out of the map (null puts it back). */
function raise(el, id) {
  const p = id ? paths.get(id) : null;
  if (!el) return;
  if (!p) { el.removeAttribute('d'); delete el.dataset.of; return; }
  if (el.dataset.of !== id) {
    el.setAttribute('d', p.getAttribute('d'));
    el.dataset.of = id;
    el.classList.remove('rise');
    void el.getBoundingClientRect(); // start the rise again
    el.classList.add('rise');
  }
  el.style.fill = p.style.fill;
}

// ---------- painting, the legend, the note ----------
function paint({ speak = true, say = true } = {}) {
  const s = spec();
  for (const [id, p] of paths) p.style.fill = colorOf(s, rows[id]);
  if (lift?.dataset.of) raise(lift, lift.dataset.of);
  legend(s);
  note(s);
  if (pinned) place(pinned, { speak: false });
  if (!say) return; // the first paint and a new language leave Rongu's own welcome alone
  const said = current().say(stats(s));
  window.ronguHeroSay?.(said.text, { gesture: speak ? said.gesture : null, mood: said.mood, speak });
}

function legend(s) {
  const items = s.categories
    ? s.categories.map(c => [c[3], tr(c[1], c[2])])
    : s.colors.map((c, k) => {
      const lo = s.breaks[k - 1], hi = s.breaks[k];
      return [c, k === 0 ? `< ${fmt(s, hi)}` : k === s.breaks.length ? `≥ ${fmt(s, lo)}` : `${fmt(s, lo)} – ${fmt(s, hi)}`];
    });
  $('lmLegend').innerHTML = `
    <p class="lm-legend-title">${esc(tr(...s.name))}${s.unit ? ` <span>(${esc(tr(s.unit[0], s.unit[1]))})</span>` : ''}</p>
    <ul>${items.map(([c, label]) => `<li><span class="lm-swatch" style="background:${c}"></span>${esc(label)}</li>`).join('')}
      <li><span class="lm-swatch" style="background:${NO_DATA}"></span>${esc(tr('তথ্য নেই', 'no data'))}</li></ul>`;
}

function note(s) {
  const when = mode === 'now' && liveDate
    ? new Date(`${liveDate}T00:00:00`).toLocaleDateString(lang() === 'en' ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
    : tr(`${num(year)} সাল`, `the year ${year}`);
  const text = tr(...s.note);
  const byDistrict = s.district && !/জেলা|district/i.test(text) ? tr(' · জেলাভিত্তিক', ' · by district') : ''; // unless the note says so already
  $('lmNote').textContent = `${text} · ${when}${byDistrict}`;
}

// ---------- the chips ----------
function chips() {
  $('lmLayers').innerHTML = list().map(l => `
    <button type="button" role="radio" class="lm-chip${l.id === current().id ? ' on' : ''}" aria-checked="${l.id === current().id}" data-layer="${l.id}" title="${esc(tr(...layer(l.id).name))}">
      <span class="material-symbols-outlined" aria-hidden="true">${l.icon}</span><span>${esc(tr(...l.short))}</span>
    </button>`).join('');
  document.querySelectorAll('#landingMap .lm-modes button').forEach(b => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('lmTimeline').hidden = mode !== 'years';
  const c = current();
  if (mode === 'years') {
    const r = $('lmYear');
    r.min = String(c.from); r.max = String(years?.years?.at(-1) ?? 2025);
    year = Math.min(Math.max(year, c.from), Number(r.max));
    r.value = String(year);
    $('lmYearOut').textContent = num(year);
  }
}

// ---------- a place: hover tip, tap to pin its numbers and open it ----------
const placeRows = () => [
  ['rain30', tr('বৃষ্টি, ৩০ দিন', 'Rain, 30 days')], ['floodNow', tr('বন্যার পানি', 'Flood water')],
  ['soilWet', tr('মাটির রস', 'Soil wetness')], ['amanDryNow', tr('আমনে খরা', 'Aman dry spell')], ['blastNow', tr('ব্লাস্টের আবহাওয়া', 'Blast weather')],
];
function place(id, { speak = true } = {}) {
  const r = rows[id];
  if (!r) return;
  pinned = id;
  $('lmPlace').removeAttribute('aria-busy');
  for (const [pid, p] of paths) p.classList.toggle('pinned', pid === id);
  raise(liftPin, id);
  if (lift?.dataset.of === id) raise(lift, null);
  const s = spec();
  $('lmPlace').innerHTML = `
    <p class="lm-place-name"><strong>${esc(r.name)}</strong> <span>${esc(r.district)}</span></p>
    <p class="lm-place-now">${esc(tr(...s.name))}: <b>${esc(valueText(s, r))}</b></p>
    <dl>${placeRows().filter(([lid]) => lid !== current().id).map(([lid, label]) => `<div><dt>${esc(label)}</dt><dd>${esc(valueText(layer(lid), r))}</dd></div>`).join('')}</dl>
    <button class="btn btn-sm btn-primary" type="button" data-open="${esc(id)}"><span class="material-symbols-outlined" aria-hidden="true">open_in_new</span><span>${esc(tr('এই জায়গা খুলুন', 'Open this place'))}</span></button>`;
  if (speak) {
    window.ronguHeroSay?.(tr(`${r.name}, ${r.district}: ${tr(...s.name)} ${valueText(s, r)}। নিচের বোতামে পুরো পাতাটা খুলবে।`,
      `${r.name}, ${r.district}: ${tr(...s.name)} ${valueText(s, r)}. The button below opens the whole page for it.`), { gesture: 'point', speak: true });
  }
}

function tip(e) {
  const p = e.target.closest?.('path[data-id]');
  const box = $('lmTip');
  raise(lift, p && p.dataset.id !== pinned ? p.dataset.id : null);
  if (!p) { box.hidden = true; return; }
  const r = rows[p.dataset.id];
  if (!r) { box.hidden = true; return; }
  box.innerHTML = `<strong>${esc(r.name)}</strong><span>${esc(valueText(spec(), r))}</span>`;
  const c = $('lmCanvas').getBoundingClientRect();
  box.hidden = false;
  const x = Math.min(e.clientX - c.left + 14, c.width - box.offsetWidth - 6);
  const y = Math.max(e.clientY - c.top - box.offsetHeight - 10, 6);
  box.style.transform = `translate(${x}px, ${y}px)`;
}

/** No place pinned: how to pick one. */
function hint() {
  const box = $('lmPlace');
  box.removeAttribute('aria-busy');
  box.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">touch_app</span> <span>${esc(tr('যেকোনো উপজেলায় চাপ দিন', 'Tap any upazila'))}</span>`;
}

// ---------- the timeline ----------
function stopPlay() {
  clearInterval(playing);
  playing = 0;
  $('lmPlay').querySelector('.material-symbols-outlined').textContent = 'play_arrow';
  $('lmPlay').setAttribute('aria-label', tr('চালান', 'Play'));
}
function setYear(y, { speak = false } = {}) {
  year = y;
  $('lmYear').value = String(y);
  $('lmYearOut').textContent = num(y);
  paint({ speak });
}

// ---------- start ----------
async function start() {
  chips(); // the layers and the legend need no data: they show at once, the map and the place come with it
  legend(spec());
  const [geo, map, yrs] = await Promise.all([
    fetch('data/bd_upazilas.geojson').then(r => r.json()),
    fetch('/api/v1/map/upazilas').then(r => (r.ok ? r.json() : { upazilas: {} })),
    fetch('/api/v1/map/years').then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  rows = Object.fromEntries(Object.entries(map.upazilas || {}).map(([id, r]) => [id, { ...r, id }]));
  liveDate = map.liveDate ?? null;
  years = yrs;
  if (years?.years?.length) year = years.years.at(-1);
  draw(geo);
  $('lmWait').hidden = true;
  chips();
  paint({ say: false });
  if (rows[START_PLACE]) place(START_PLACE, { speak: false }); // the pilot, pinned; Rongu keeps his welcome
  else hint();
  $('lmCanvas').classList.add('ready'); // the skeleton gives way
  new ResizeObserver(reliefSoon).observe(document.querySelector('#lmCanvas .lm-3d'));

  $('lmLayers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-layer]');
    if (!b || b.dataset.layer === layerId) return;
    layerId = b.dataset.layer;
    chips();
    paint();
  });
  document.querySelectorAll('#landingMap .lm-modes button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode === mode) return;
    stopPlay();
    mode = b.dataset.mode;
    if (mode === 'years' && !years) mode = 'now'; // no yearly data from this server
    layerId = mode === 'now' ? 'floodNow' : list()[0].id;
    chips();
    paint();
  }));
  const svg = $('lmSvg');
  svg.addEventListener('pointermove', tip);
  svg.addEventListener('pointerleave', () => { $('lmTip').hidden = true; raise(lift, null); });
  svg.addEventListener('click', (e) => { const p = e.target.closest('path[data-id]'); if (p) place(p.dataset.id); });
  $('lmPlace').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    const id = b.dataset.open;
    window.chooseRole?.('visitor');
    setTimeout(() => window.openPlace?.(id), 350); // the overview, on this place
  });
  $('lmYear').addEventListener('input', (e) => { stopPlay(); setYear(Number(e.target.value)); });
  $('lmYear').addEventListener('change', () => paint({ speak: true }));
  $('lmPlay').addEventListener('click', () => {
    if (playing) { stopPlay(); paint({ speak: true }); return; }
    const r = $('lmYear');
    if (year >= Number(r.max)) setYear(Number(r.min));
    $('lmPlay').querySelector('.material-symbols-outlined').textContent = 'pause';
    $('lmPlay').setAttribute('aria-label', tr('থামান', 'Pause'));
    playing = setInterval(() => {
      if (year >= Number(r.max)) { stopPlay(); paint({ speak: true }); return; }
      setYear(year + 1);
    }, 850);
  });
  $('lmPlay').setAttribute('aria-label', tr('চালান', 'Play'));
  // a new language: chips, legend, note and the pinned place again
  new MutationObserver(() => { chips(); seaName(); paint({ say: false }); if (pinned) place(pinned, { speak: false }); else hint(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

// only when the landing page is shown (a returning signed-in visitor may never see it)
let started = false;
const maybeStart = () => {
  if (started || !document.body.classList.contains('state-entry') || !$('landingMap')) return;
  started = true;
  start().catch((err) => {
    console.warn('landing map', err);
    $('lmWait').textContent = tr('মানচিত্র আনা যায়নি।', 'The map could not be loaded.');
    $('lmCanvas').classList.add('failed');
    hint();
  });
};
new MutationObserver(maybeStart).observe(document.body, { attributes: true, attributeFilter: ['class'] });
maybeStart();
