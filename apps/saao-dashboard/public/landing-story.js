// The landing page's story, live: what NASA sees, what Mati Kohon makes of it at four places, and the call a farmer
// there would get today (GET /api/v1/landing/calls: the same rules as the real calls; nothing is sent). A pin on the
// country picks the place: the satellite turns its beam on it, the phone shows that place's call and the SMS after it
// (its recording is our Google bn-BD voice, made once a day on the server), and the datasets behind the call light up.
// Under the map, the NASA data wall: every dataset, what it measures and what it changes for the farmer. One list
// feeds the chips, the wall and the count in the numbers row, so the three cannot disagree.

const $ = (id) => document.getElementById(id);
const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'bn');
const tr = (bn, en) => (lang() === 'en' ? en : bn);
const BN = '০১২৩৪৫৬৭৮৯';
const num = (v) => (lang() === 'en' ? String(v) : String(v).replace(/\d/g, d => BN[d]));
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t2 = (pair) => tr(pair[0], pair[1]);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Every NASA dataset the app uses: its icon, what it measures, how finely, and what it does here. `short` marks the
// ones shown in the story's first step (what they read, in two or three words).
const DATASETS = [
  { id: 'power', icon: 'thermostat', name: 'NASA POWER', short: ['তাপ, ঠান্ডা, পানি খরচ', 'Heat, cold, water use'],
    res: ['০.৫° গ্রিড · প্রতিদিন, ১৯৮১ থেকে', '0.5° grid · daily since 1981'],
    what: ['দৈনিক আবহাওয়া: তাপ, ঠান্ডা, বৃষ্টি আর ফসলের পানি খরচ', 'Daily weather: heat, cold, rain and the water crops use'],
    use: ['প্রতিটি ফসলচক্রের ২৫ মৌসুমের হিসাব, আর প্রতিদিন ৫৪৪ উপজেলার তাপ ও ঠান্ডার সতর্কতা', 'The 25-season replay of every rotation, and heat and cold alerts for all 544 upazilas every day'] },
  { id: 'imerg', icon: 'rainy', name: 'GPM IMERG', short: ['বৃষ্টি', 'Rain'],
    res: ['১০ কিমি · প্রতি আধা ঘণ্টা', '10 km · every half hour'],
    what: ['মহাকাশ থেকে মাপা বৃষ্টি', 'Rain measured from space'],
    use: ['এ মাসের বৃষ্টি বনাম ২৫ বছর, আমনে খরার দিন, হাওরের আগাম বন্যার হিসাব', "This month's rain against 25 years, dry days at Aman flowering, the haor flash-flood check"] },
  { id: 'modis', icon: 'grass', name: 'MODIS (Terra)', short: ['সবুজ, ২৫ বছর', 'Greenness, 25 years'],
    res: ['২৫০ মি-১ কিমি · প্রতি ১৬ দিন, ২০০০ থেকে', '250 m–1 km · every 16 days since 2000'],
    what: ['খেতের সবুজ (NDVI) আর বন্যার মানচিত্র', 'Field greenness (NDVI) and flood maps'],
    use: ['২০০১ থেকে প্রতিটি উপজেলায় বছরে কয়টি ফসল আর শীতের সবুজ; হাওরের ৩ দিনের বন্যা মানচিত্র', 'Crops a year and winter greenness in every upazila since 2001; the 3-day flood map over the haors'] },
  { id: 'viirs', icon: 'satellite_alt', name: 'VIIRS', short: ['এখনকার সবুজ', 'Greenness now'],
    res: ['১ কিমি · ১৬ দিনের ছবি', '1 km · 16-day composites'],
    what: ['খেতের সবচেয়ে নতুন সবুজ, MODIS-এর মাপে', 'The newest greenness, on the MODIS scale'],
    use: ['১ কিমি ফসলি জমির গ্রিডে মাঠ এখন কেমন, নিজের ২৫ বছরের তুলনায়', 'How the fields look now on the 1 km cropland grid, against their own 25 years'] },
  { id: 'nisar', icon: 'radar', name: 'NISAR (NASA-ISRO)', short: ['মেঘের নিচে পানি', 'Water under cloud'],
    res: ['৮০ মি · প্রতি ১২ দিন, ২০২৫ থেকে', '80 m · every 12 days, since 2025'],
    what: ['এল-ব্যান্ড রাডার, বর্ষার মেঘ ভেদ করে দেখে', 'L-band radar that sees through monsoon cloud'],
    use: ['আঞ্চলিক বন্যার পানি ও পানি নামার আনুমানিক সীমা; বোনার আগে জমি যাচাই জরুরি', 'Regional flood extent and a provisional recession range; field workability must be checked before planting'] },
  { id: 'opera', icon: 'flood', name: 'OPERA DSWx', short: ['বন্যার পানি', 'Flood water'],
    res: ['৩০ মি · ল্যান্ডস্যাট ও সেন্টিনেল-২ থেকে', '30 m · from Landsat and Sentinel-2'],
    what: ['ভূপৃষ্ঠের পানির মানচিত্র', 'Surface water maps'],
    use: ['শীতে শুকনো থাকা জমিতে এখন বন্যার পানি, আর কত দ্রুত নামছে', 'Flood water now on land that is dry in winter, and how fast it drains'] },
  { id: 'grace', icon: 'water', name: 'GRACE / GRACE-FO + GLDAS', chip: 'GRACE', short: ['মাটির নিচের পানি', 'Groundwater'],
    res: ['জেলা · প্রতি মাস, ২০০৩ থেকে', 'District · monthly since 2003'],
    what: ['মাটির নিচে জমা পানি', 'Water stored underground'],
    use: ['কোন জেলায় ভূগর্ভের পানি নামছে; প্রতিটি ফসলচক্রের স্কোরে পাম্পের পানি', "Where groundwater is falling, by district; the water pumped in each rotation's score"] },
  { id: 'nasadem', icon: 'terrain', name: 'NASADEM', short: ['জমির উচ্চতা', 'Land height'],
    res: ['৩০ মি', '30 m'],
    what: ['জমির উচ্চতা', 'The height of the land'],
    use: ['প্রতিটি উপজেলার জমি উঁচু না নিচু, ল্যান্ডস্যাটের পানির মানচিত্রের সাথে', "Whether each upazila's land is high or low, with Landsat surface water"] },
  { id: 'smap', icon: 'water_drop', name: 'SMAP',
    res: ['৯ কিমি · প্রতিদিন', '9 km · daily'],
    what: ['মাটির রস, ওপর থেকে শিকড়ের গভীরতা পর্যন্ত', 'Soil moisture, from the surface down to the roots'],
    use: ['পাইলট এলাকায় শীতের বোনার আগে মাটির রস; রিপ্লের যাচাই', 'Soil wetness before the winter sowing at the pilot; a check on the replay'] },
  { id: 'hls', icon: 'grid_on', name: 'HLS (Landsat + Sentinel-2)',
    res: ['৩০ মি · প্রতি ২-৩ দিন', '30 m · every 2–3 days'],
    what: ['৩০ মিটারে খেতের ছবি', 'Fields seen at 30 m'],
    use: ['এ বছর কোথায় আমন নেই বা দুর্বল, যাতে কর্মকর্তা আগে সেখানে যান', "Where this year's Aman is missing or weak, so officers check there first"] },
  { id: 'merra2', icon: 'cloud_sync', name: 'MERRA-2',
    res: ['০.৫° গ্রিড · প্রতি ঘণ্টা', '0.5° grid · hourly'],
    what: ['নাসার বায়ুমণ্ডলের পুনর্বিশ্লেষণ', "NASA's reanalysis of the atmosphere"],
    use: ['বৃষ্টির দ্বিতীয় হিসাব, যাতে কোনো সতর্কতা একটি উৎসের ওপর না দাঁড়ায়; NASA POWER-এর ভিত্তি', 'A second reading of rain, so no alert rests on one source; the base under NASA POWER'] },
  { id: 'ecostress', icon: 'eco', name: 'ECOSTRESS',
    res: ['৭০ মি · মহাকাশ স্টেশন থেকে', '70 m · from the space station'],
    what: ['গাছের পানির টান', 'Plant water stress'],
    use: ['তালন্দ পাইলটে একটি যাচাই; কোনো স্কোরে ঢোকে না', 'A check at the Talanda pilot; not in any score'] },
  { id: 'sedac', icon: 'pest_control', name: 'SEDAC PEST-CHEMGRIDS',
    res: ['~১০ কিমি', '~10 km'],
    what: ['কোন ফসলে কতটা কীটনাশক লাগে', 'Pesticide used on each crop'],
    use: ['বালাই স্কোর আর কম কীটনাশকের পরামর্শ', 'The pest score and the less-pesticide tips'] },
  { id: 'gibs', icon: 'public', name: 'GIBS',
    res: ['MODIS ও VIIRS-এর আসল রঙের ছবি', 'MODIS and VIIRS true colour'],
    what: ['গতকালের, মহাকাশ থেকে দেখা ছবি', "Yesterday's view from space"],
    use: ['ড্যাশবোর্ডের মানচিত্রের নিচের ছবি, আর ব্লু মার্বেল', "The picture under the dashboard's map, and the Blue Marble"] },
];

// Where each sample place's pin stands, in the country outline's own units (#lmGhostLand, viewBox -6 -6 721 1048:
// landing-map.js's projection, at the upazila's centroid)
const PINS = { landing_talanda: [79, 333], landing_chauhali: [265, 413], landing_dharampasha: [460, 269], landing_koyra: [208, 743] };
const SAT = [637, 82]; // under the satellite drawn over the north-east
const RANK = { alert: 0, drain: 1, reminder: 2, answer: 3, plan: 4 };
const BARS = 34;
const MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso) => { const [, m, d] = iso.split('-').map(Number); return tr(`${num(d)} ${MONTHS_BN[m - 1]}`, `${d} ${MONTHS_EN[m - 1]}`); };
const clock = (sec) => `${num(Math.floor(sec / 60))}:${num(String(Math.round(sec % 60)).padStart(2, '0'))}`;

let samples = [], voice = false, chosen = null, latest = null;
const seen = {}; // each dataset's newest reading the server holds (YYYY-MM-DD), shown on its row
const audio = new Audio();
audio.preload = 'none';

// ---------- the datasets: the story's first step, the wall, the count ----------
function chips() {
  const lit = new Set(current()?.call.datasets ?? []);
  $('flowData').innerHTML = DATASETS.filter(d => d.short).map(d => `
    <li data-id="${d.id}" class="${lit.has(d.id) ? 'on' : ''}"><span class="material-symbols-outlined" aria-hidden="true">${d.icon}</span>
      <span><b>${esc(d.chip ?? d.name.replace(/ \(.*\)$/, ''))}</b><small>${esc(t2(d.short))}</small></span>${seen[d.id] ? `<time datetime="${seen[d.id]}">${day(seen[d.id])}</time>` : ''}</li>`).join('');
}
function wall() {
  $('dataWall').innerHTML = DATASETS.map(d => `
    <li class="data-card"><span class="material-symbols-outlined" aria-hidden="true">${d.icon}</span>
      <h3>${esc(d.name)}</h3>
      <span class="data-res">${esc(t2(d.res))}</span>
      <p>${esc(t2(d.what))}</p>
      <p class="data-use"><b>${tr('মাটি কহনে:', 'In Mati Kohon:')}</b> ${esc(t2(d.use))}</p></li>`).join('');
  const n = $('proofDatasets');
  n.dataset.num = String(DATASETS.length); // app.js writes it again in the other language
  n.textContent = num(DATASETS.length);
}
function daily() {
  if (!latest) return;
  $('proofDaily').textContent = tr(`নাসার তথ্য হালনাগাদ, সর্বশেষ ${day(latest)}`, `NASA update, latest ${day(latest)}`);
}

// ---------- the places and their calls ----------
const current = () => samples.find(s => s.id === chosen) ?? null;
const pinName = (s) => t2([s.name.bn, s.name.en]).split(',').at(-1).trim();

function pins() {
  const land = $('flowLand');
  land.querySelectorAll('.fl-pin').forEach(p => p.remove());
  for (const s of samples) {
    const at = PINS[s.id];
    if (!at) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fl-pin';
    b.dataset.id = s.id;
    b.style.left = `${((at[0] + 6) / 721) * 100}%`;
    b.style.top = `${((at[1] + 6) / 1048) * 100}%`;
    b.setAttribute('aria-pressed', String(s.id === chosen));
    b.innerHTML = `<span class="fl-pin-dot" aria-hidden="true"></span><span class="fl-pin-name">${esc(pinName(s))}</span>`;
    land.append(b);
  }
}

function beam() {
  const at = PINS[chosen];
  if (!at) return;
  const line = $('flowBeam'), foot = $('flowFoot');
  line.setAttribute('x1', SAT[0]); line.setAttribute('y1', SAT[1]);
  line.setAttribute('x2', at[0]); line.setAttribute('y2', at[1]);
  foot.setAttribute('cx', at[0]); foot.setAttribute('cy', at[1]);
}

function why() {
  const s = current();
  if (!s) return;
  $('flowWhy').innerHTML = `<b>${esc(t2([s.name.bn, s.name.en]))}, ${esc(t2([s.district.bn, s.district.en]))} · ${esc(t2([s.land.bn, s.land.en]))}</b>${esc(tr(s.call.whyBangla, s.call.whyEnglish))}`;
}

function phone() {
  const s = current();
  const box = $('flowPhone');
  if (!s) return;
  const c = s.call;
  const bars = Array.from({ length: BARS }, (_, i) => `<i style="height:${Math.round(22 + 70 * Math.abs(Math.sin(i * 1.7 + c.durationSeconds) * Math.cos(i * 0.6)))}%"></i>`).join('');
  box.removeAttribute('aria-busy');
  box.innerHTML = `
    <div class="phone-screen">
      <div class="phone-caller">
        <span class="phone-avatar material-symbols-outlined" aria-hidden="true">eco</span>
        <span class="phone-who"><b>${tr('মাটি কহন', 'Mati Kohon')}</b><span>${esc(t2([s.name.bn, s.name.en]))}</span></span>
        <span class="phone-tag">${tr('নমুনা', 'Sample')}</span>
      </div>
      <p class="phone-title">${esc(tr(c.titleBangla, c.titleEnglish))}</p>
      <div class="phone-player">
        <button class="phone-play" id="phonePlay" type="button" aria-label="${tr('কলটি শুনুন', 'Play the call')}"${voice ? '' : ' disabled'}><span class="material-symbols-outlined" aria-hidden="true">play_arrow</span></button>
        <span class="phone-wave" id="phoneWave" aria-hidden="true">${bars}</span>
        <span class="phone-len" id="phoneLen">${clock(c.durationSeconds)}</span>
      </div>
      ${voice ? '' : `<p class="phone-off">${tr('এই সার্ভারে কণ্ঠ চালু নেই; কলের কথাগুলো নিচে।', 'No voice is set up on this server; the words of the call are below.')}</p>`}
      <div><span class="phone-label">${tr('কলে যা বলা হয়', 'What the call says, in Bangla')}</span>
        <p class="phone-script clamped" id="phoneScript" lang="bn">${esc(c.scriptBangla)}</p></div>
      <button class="phone-more" id="phoneMore" type="button" aria-expanded="false" aria-controls="phoneScript">${tr('পুরোটা পড়ুন', 'Read it all')}</button>
      <div class="phone-sms"><span class="material-symbols-outlined" aria-hidden="true">sms</span>
        <div><span class="phone-label">${tr('তারপর এসএমএস', 'Then an SMS')}</span><p lang="bn">${esc(c.smsBangla)}</p></div></div>
    </div>`;
  const script = $('phoneScript');
  $('phoneMore').hidden = script.scrollHeight <= script.clientHeight + 2;
}

/** The recording's progress on the wave and the clock (the time left while it plays). */
function progress() {
  const s = current();
  const wave = $('phoneWave');
  if (!s || !wave) return;
  const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : s.call.durationSeconds;
  const f = audio.src && audio.currentTime > 0 ? Math.min(1, audio.currentTime / total) : 0;
  wave.querySelectorAll('i').forEach((b, i) => b.classList.toggle('played', i < Math.round(f * BARS)));
  $('phoneLen').textContent = clock(f > 0 ? total - audio.currentTime : total);
}
function playIcon() {
  const b = $('phonePlay');
  if (!b) return;
  const on = !audio.paused && !audio.ended;
  b.querySelector('.material-symbols-outlined').textContent = on ? 'pause' : 'play_arrow';
  b.setAttribute('aria-label', on ? tr('থামান', 'Pause') : tr('কলটি শুনুন', 'Play the call'));
}
function stop() {
  audio.pause();
  if (audio.src) { audio.removeAttribute('src'); audio.load(); }
  playIcon();
  progress();
}

function choose(id, { user = false } = {}) {
  if (!samples.some(s => s.id === id)) return;
  if (id !== chosen) stop();
  chosen = id;
  $('flowLand').querySelectorAll('.fl-pin').forEach(p => p.setAttribute('aria-pressed', String(p.dataset.id === id)));
  beam();
  why();
  phone();
  chips();
  if (!user) return;
  const box = $('flowPhone');
  if (!reducedMotion()) { box.classList.remove('phone-ring'); void box.offsetWidth; box.classList.add('phone-ring'); }
  const s = current();
  window.ronguHeroSay?.(tr(`${pinName(s)}: ${s.call.titleBangla}। ফোনে চাপ দিয়ে কলটি শুনুন।`, `${pinName(s)}: ${s.call.titleEnglish}. Press play on the phone to hear the call.`), { gesture: 'point', speak: true });
}

function render() {
  chips();
  wall();
  daily();
  if (!samples.length) return;
  pins();
  choose(chosen);
}

// ---------- start ----------
async function start() {
  render();
  // how new each reading is: the daily update's sources and the VIIRS composite (MODIS's newest here is its flood map,
  // not the greenness its row is about, so it shows no date)
  const json = (u) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([json('/api/v1/live/status'), json('/api/v1/conditions/check')]).then(([st, fields]) => {
    const src = (id) => st?.sources?.find(x => x.id === id)?.latestDate ?? null;
    Object.assign(seen, { power: src('power'), imerg: src('imerg'), nisar: src('nisar_flood'), opera: src('opera_flood'),
      viirs: fields?.now?.to ?? null });
    latest = seen.power;
    daily();
    chips();
  });
  try {
    const r = await fetch('/api/v1/landing/calls');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    samples = body.samples ?? [];
    voice = Boolean(body.voice);
    // the most pressing call first: an alert, then the drain date, a reminder, the season's plan
    chosen = [...samples].sort((a, b) => (RANK[a.call.kind] ?? 9) - (RANK[b.call.kind] ?? 9))[0]?.id ?? null;
    render();
  } catch (err) {
    console.warn('landing calls', err);
    $('flowWhy').textContent = tr('নমুনা কলগুলো আনা যায়নি।', 'The sample calls could not be loaded.');
    $('flowPhone').removeAttribute('aria-busy');
    $('flowPhone').innerHTML = `<div class="phone-screen"><p class="phone-off">${tr('নমুনা কলগুলো আনা যায়নি।', 'The sample calls could not be loaded.')}</p></div>`;
  }

  $('flowLand').addEventListener('click', (e) => {
    const p = e.target.closest('.fl-pin');
    if (p) choose(p.dataset.id, { user: true });
  });
  $('flowPhone').addEventListener('click', (e) => {
    if (e.target.closest('#phoneMore')) {
      const script = $('phoneScript');
      const open = script.classList.toggle('clamped') === false;
      $('phoneMore').setAttribute('aria-expanded', String(open));
      $('phoneMore').textContent = open ? tr('কম দেখান', 'Show less') : tr('পুরোটা পড়ুন', 'Read it all');
      return;
    }
    if (!e.target.closest('#phonePlay') || !voice || !chosen) return;
    if (!audio.paused) { audio.pause(); return; }
    if (!audio.src) audio.src = `/api/v1/landing/calls/${encodeURIComponent(chosen)}/audio`;
    audio.play().catch(() => {});
  });
  audio.addEventListener('play', playIcon);
  audio.addEventListener('pause', playIcon);
  audio.addEventListener('ended', () => { playIcon(); audio.currentTime = 0; progress(); });
  audio.addEventListener('timeupdate', progress);
  audio.addEventListener('error', () => {
    if (!audio.src) return;
    voice = false;
    stop();
    phone();
  });
  // a new language: everything again in it (the recording stops)
  new MutationObserver(() => { stop(); render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

// only when the landing page is shown; leaving it stops the recording
let started = false;
const maybeStart = () => {
  if (!document.body.classList.contains('state-entry')) { if (!audio.paused) audio.pause(); return; }
  if (started || !$('storyFlow')) return;
  started = true;
  start();
};
new MutationObserver(maybeStart).observe(document.body, { attributes: true, attributeFilter: ['class'] });
maybeStart();
