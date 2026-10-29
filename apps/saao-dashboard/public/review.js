/**
 * Field Shift's statement, on the dashboard: the farmer's rotation now (planner selects), each option's review (why it
 * was suggested, its evidence, benefits, information gaps and the risks to check locally), the season risk under the
 * timeline (when crops meet heat, cold and heavy rain, when the soil lies bare, and what NASA MODIS sees), the what-if
 * for a drier or wetter, warmer year, and the place's season calendar with its 25-year trends. All numbers come from
 * the engine's advice (packages/rotation-engine/src/review.ts, data/season_calendar.ts); this file only draws them.
 */

const MONTHS_BN = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CROP_NAMES = {
  aman: ['আমন ধান', 'Aman rice'], fallow: ['খালি', 'Fallow'], boro: ['বোরো ধান', 'Boro rice'], boro_early: ['আগাম বোরো', 'Early Boro'],
  aus: ['আউশ ধান', 'Aus rice'], lentil: ['মসুর', 'Lentil'], mustard: ['সরিষা', 'Mustard'], wheat: ['গম', 'Wheat'], potato: ['আলু', 'Potato'],
  maize: ['ভুট্টা', 'Maize'], sunflower: ['সূর্যমুখী', 'Sunflower'], sunflower_kharif: ['সূর্যমুখী', 'Sunflower'], chickpea: ['ছোলা', 'Chickpea'],
  grasspea: ['খেসারি', 'Grass pea'], sweetpotato: ['মিষ্টি আলু', 'Sweet potato'], barley: ['যব', 'Barley'], soybean: ['সয়াবিন', 'Soybean'],
  soybean_k2: ['সয়াবিন', 'Soybean'], mungbean: ['মুগ', 'Mungbean'], mungbean_k2: ['মুগ', 'Mungbean'], sesame: ['তিল', 'Sesame'],
  sesame_k2: ['তিল', 'Sesame'], jute: ['পাট', 'Jute'],
};
const ROTATION_CHOICES = {
  curMonsoon: ['aman', 'fallow', 'soybean', 'mungbean', 'sesame'],
  curWinter: ['', 'boro', 'lentil', 'mustard', 'wheat', 'potato', 'maize', 'sunflower', 'chickpea', 'grasspea', 'sweetpotato', 'barley'],
  curSummer: ['', 'mungbean', 'sesame', 'jute', 'aus'],
};
const ROLES = {
  nitrogen: ['নাইট্রোজেন যোগ করে', 'Adds nitrogen', 'ডাল ফসলের শিকড়ের গুটি বাতাসের নাইট্রোজেন মাটিতে ধরে; পরের ফসলে ইউরিয়া কম লাগে।', 'Legume root nodules fix nitrogen from the air; the next crop needs less urea.'],
  deep_root: ['গভীর শিকড়', 'Deep roots', 'দেড় মিটার বা বেশি গভীর শিকড় (FAO-56) চাষের শক্ত স্তর ভেঙে নিচের পানি ও পুষ্টি তোলে।', 'Roots of 1.5 m or more (FAO-56) break the plough pan and draw deeper water and nutrients.'],
  drought: ['কম সেচে হয়', 'Little irrigation', 'এখানে ২৫ মৌসুমের হিসাবে ১০০ মিমির কম সেচ লাগে।', 'Under 100 mm of irrigation here in the 25-season replay.'],
  cover: ['বর্ষার আগে মাটি ঢাকে', 'Covers soil pre-monsoon', 'এপ্রিল-জুনের ঝড়বৃষ্টির সময় জমিতে থাকে, তাই মাটি কম ধুয়ে যায়।', 'In the field through the April-June storms, so less soil washes away.'],
  fodder: ['গোখাদ্য', 'Fodder', 'খড়, ডাঁটা বা পাতা গরুর খাবার হয়।', 'Straw, stalks or leaves feed cattle.'],
};
const FLAGS = {
  heat: ['গরম', 'Heat', 'hotDays'], cold: ['শীত', 'Cold', 'coldNights'], frost: ['তুষারের ঝুঁকি', 'Frost risk', null],
  heavy_rain: ['ভারী বৃষ্টি', 'Heavy rain', 'heavyRainDays'], bare_rain: ['খালি মাটিতে বৃষ্টি', 'Rain on bare soil', 'erosiveRainDays'],
  dry: ['শুকনো দিন', 'Dry days', 'dryDays'],
};

/** Fills the planner's three rotation selects in the current language, keeping what was chosen. */
export function fillRotationSelects({ tr }) {
  for (const [id, crops] of Object.entries(ROTATION_CHOICES)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const keep = el.value;
    el.innerHTML = crops.map(c => {
      const name = c ? tr(...CROP_NAMES[c]) : id === 'curWinter' ? tr('জানা নেই', 'Not given') : tr('কিছু নেই', 'Nothing');
      return `<option value="${c}">${name}</option>`;
    }).join('');
    el.value = crops.includes(keep) ? keep : crops[0];
  }
}

/** The farmer's rotation now from the planner, or undefined when no winter crop is chosen. */
export function rotationFromSelects() {
  const winter = document.getElementById('curWinter')?.value;
  if (!winter) return undefined;
  return { monsoon: document.getElementById('curMonsoon')?.value || 'aman', winter, summer: document.getElementById('curSummer')?.value || null };
}

const cropName = (id, tr) => tr(...(CROP_NAMES[id] ?? [id, id]));

/** Badge, crop roles, constraint warnings and the five-part review for one comparison card. */
export function reviewHtml(opt, { tr, escapeHtml }) {
  const r = opt.review;
  if (!r) return '';
  const roles = r.roles.length ? `<div class="role-chips">${r.roles.map(x => `<span class="role-chip role-${x.id}" title="${escapeHtml(tr(ROLES[x.id][2], ROLES[x.id][3]))}">${escapeHtml(tr(ROLES[x.id][0], ROLES[x.id][1]))}: ${escapeHtml(x.cropIds.map(c => cropName(c, tr)).join(', '))}</span>`).join('')}</div>` : '';
  const flags = r.constraintFlags.map(l => `<p class="constraint-flag"><span class="material-symbols-outlined" aria-hidden="true">warning</span> ${escapeHtml(tr(l.bn, l.en))}</p>`).join('');
  // Evidence lines carry whole provenance strings: shown cut near 150 characters, in full on hover
  const short = (t, cut) => (cut && t.length > 150 ? `${t.slice(0, 150).replace(/[;,]?\s+\S*$/, '')}…` : t);
  const li = (l, showSource) => `<li${showSource ? '' : ` title="${escapeHtml(tr(l.bn, l.en))}"`}>${escapeHtml(short(tr(l.bn, l.en), !showSource))}${showSource && l.source ? ` <small class="review-src" title="${escapeHtml(l.source)}">${tr('সূত্র', 'source')}</small>` : ''}</li>`;
  const sec = (bn, en, lines, cls, showSource = true) => (lines?.length
    ? `<div class="review-sec review-${cls}"><h5>${tr(bn, en)}</h5><ul>${lines.map(l => li(l, showSource)).join('')}</ul></div>` : '');
  return `${roles}${flags}<details class="fold review-fold"><summary>${tr('কেন, প্রমাণ, লাভ, তথ্যের ঘাটতি ও যাচাই', 'Why, evidence, benefits, gaps and checks')}</summary>
    ${sec('কেন প্রস্তাব', 'Why it was suggested', r.why, 'why')}
    ${sec('প্রমাণ (তথ্যসূত্র)', 'Evidence (sources)', r.evidence, 'evidence', false)}
    ${sec('সম্ভাব্য লাভ', 'Possible benefits', r.benefits, 'benefits')}
    ${sec('তথ্যের ঘাটতি', 'Information gaps', r.gaps, 'gaps')}
    ${sec('স্থানীয়ভাবে যাচাই করুন (কৃষক ও কর্মকর্তা)', 'Check locally (farmer and officer)', r.checks, 'checks')}
  </details>`;
}

/** NDVI as a green shade: under 0.35 the land is bare, flooded or just planted. */
function ndviStyle(v) {
  if (v === null || v === undefined) return 'background:var(--surface-3, #E4DED4)';
  const ramp = ['#EBD3B0', '#E6EFE2', '#C7DDC1', '#A2C69E', '#78AB7A', '#4F8C5C', '#2F6B48'];
  const i = v < 0.35 ? 0 : Math.min(ramp.length - 1, 1 + Math.floor((v - 0.35) / 0.1));
  return `background:${ramp[i]};color:${i >= 5 ? '#fff' : 'inherit'}`;
}

/** The season risk of the chosen option, month by month (July to June), under the timeline. */
export function seasonRiskHtml(option, advice, { tr, escapeHtml, num }) {
  const risk = option?.seasonRisk;
  if (!risk) return '';
  const month = m => tr(MONTHS_BN[m], MONTHS_EN[m]);
  const cell = mo => {
    const crop = mo.cropId && mo.cropShare >= 0.5 ? cropName(mo.cropId, tr) : tr('খালি', 'bare');
    const chips = mo.flags.map(f => {
      const [bn, en, key] = FLAGS[f] ?? [f, f, null];
      const n = key ? mo[key] : null;
      return `<span class="risk-chip risk-${f}">${escapeHtml(tr(bn, en))}${n !== null ? ` ${num(n)}` : ''}</span>`;
    }).join('');
    return `<div class="risk-col${mo.cropShare >= 0.5 ? '' : ' is-bare'}">
      <div class="risk-month">${escapeHtml(month(mo.month))}</div>
      <div class="risk-crop">${escapeHtml(crop)}</div>
      <div class="risk-flags">${chips || '<span class="risk-none">–</span>'}</div>
      <div class="risk-ndvi" style="${ndviStyle(mo.ndvi)}" title="${tr('নাসা MODIS NDVI, ২০২১–২৫', 'NASA MODIS NDVI, 2021-25')}">${mo.ndvi === null ? '–' : num(mo.ndvi.toFixed(2))}</div>
    </div>`;
  };
  const crops = risk.crops.map(c => tr(
    `${c.cropBangla}: জমিতে থাকার দিনে গড়ে ${num(c.hotDays)} দিন ৩৬°সে+ গরম, ${num(c.coldNights)} রাত ১০°সে বা কম, ${num(c.heavyRainDays)} দিন ৪৪ মিমি+ বৃষ্টি`,
    `${c.cropEnglish}: on its field days, on average ${c.hotDays} days of 36 °C+, ${c.coldNights} nights of 10 °C or less, ${c.heavyRainDays} days of 44 mm+ rain`,
  ));
  return `<h4 class="risk-title">${tr('এই চক্রে কোন মাসে কী ঝুঁকি, আর স্যাটেলাইটে জমি কেমন দেখায়', 'Which months carry which risk in this rotation, and how the land looks from space')}</h4>
    <div class="risk-grid" role="table" aria-label="${escapeHtml(tr('মাসভিত্তিক ঝুঁকি', 'Risk by month'))}">${risk.months.map(cell).join('')}</div>
    <div class="risk-rowlabels"><span>${tr('শেষ সারি: নাসা MODIS NDVI (০.৩৫-এর নিচে খালি বা পানিতে ডোবা)', 'Last row: NASA MODIS NDVI (below 0.35 bare or flooded)')}</span></div>
    <p class="risk-summary"><strong>${tr(`জমি খালি বছরে ${num(risk.bareDays)} দিন; তাতে গড়ে ${num(risk.bareErosiveRainDays)} দিন মাটি-ধোয়া (২৩ মিমি+) বৃষ্টি।`, `Field bare ${risk.bareDays} days a year, meeting ${risk.bareErosiveRainDays} days of soil-moving (23 mm+) rain.`)}</strong> ${escapeHtml(crops.join('; '))}${tr('।', '.')}</p>
    <p class="form-note">${escapeHtml(risk.source)}</p>`;
}

/** The what-if table: each option's irrigation, hot days in the field and rain on bare soil, now and in the scenario. */
export function whatIfHtml(advice, { tr, escapeHtml, num }) {
  const w = advice?.what_if;
  const options = advice?.options ?? [];
  const byId = Object.fromEntries((w?.options ?? []).map(o => [o.id, o]));
  const arrow = (a, b, unit) => (a === b ? `${num(a)}${unit}` : `${num(a)} → <strong>${num(b)}</strong>${unit}`);
  if (!w) return `<p class="form-note">${tr('স্লাইডার সরালে প্রতিটি চক্রের হিসাব এখানে দেখাবে।', 'Move a slider to see each rotation here.')}</p>`;
  return `<table class="data-table whatif-table">
    <thead><tr><th>${tr('চক্র', 'Rotation')}</th><th>${tr('সেচ (মিমি/বছর)', 'Irrigation (mm a year)')}</th><th>${tr('জমিতে ফসল থাকার সময় ৩৬°সে+ দিন', 'Days of 36 °C+ with a crop in the field')}</th><th>${tr('খালি মাটিতে মাটি-ধোয়া বৃষ্টির দিন', 'Soil-moving rain days on bare soil')}</th></tr></thead>
    <tbody>${options.map(o => {
      const x = byId[o.id];
      if (!x) return '';
      return `<tr${o.farmerCurrent ? ' class="is-current"' : ''}><td>${num(o.rank)}. ${escapeHtml(tr(o.nameBangla, o.nameEnglish))}${o.farmerCurrent ? ` <span class="tag tag-yellow">${tr('এখনকার', 'now')}</span>` : ''}</td>
        <td>${arrow(x.irrigationMm, x.irrigationMmScenario, '')}</td><td>${arrow(x.hotDaysInField, x.hotDaysInFieldScenario, '')}</td><td>${arrow(x.bareErosiveRainDays, x.bareErosiveRainDaysScenario, '')}</td></tr>`;
    }).join('')}</tbody></table>`;
}

const TRENDS = {
  hotDays: ['৩৬°সে+ গরম দিন (বছরে)', 'Days of 36 °C+ a year', 'দিন', 'days'],
  coldNights: ['১০°সে বা কম রাত (বছরে)', 'Nights of 10 °C or less a year', 'রাত', 'nights'],
  heavyRainDays: ['৪৪ মিমি+ বৃষ্টির দিন (বছরে)', 'Days of 44 mm+ rain a year', 'দিন', 'days'],
  rainMm: ['বছরের বৃষ্টি', 'Rain a year', 'মিমি', 'mm'],
  dryRootWet: ['শুকনো মৌসুমে (জানু-এপ্রিল) শিকড়ের মাটির রস', 'Root-zone wetness in the dry season (Jan-Apr)', '', ''],
  rootWet: ['সারা বছর শিকড়ের মাটির রস (MERRA-2 মডেল)', 'Root-zone wetness all year (MERRA-2 model)', '', ''],
  et0Mm: ['বাষ্পীভবন চাহিদা ET0', 'Evaporative demand ET0', 'মিমি', 'mm'],
};

/** NASA ECOSTRESS at 70 m around the pilot in the dry season: how much land is well watered or stressed, by month. */
function ecostressHtml(eco, { tr, escapeHtml, num }) {
  if (!eco) return '';
  const pct = v => num(Math.round(v * 100));
  const rows = Object.entries(eco.monthly).map(([m, r]) => `<tr><td>${escapeHtml(tr(MONTHS_BN[m - 1], MONTHS_EN[m - 1]))}</td><td>${num(r.overpasses)}</td>
    <td>${num(r.etMedian.toFixed(1))}</td><td>${num(r.esiMedian.toFixed(2))}</td><td>${pct(r.wetShare)}%</td><td>${pct(r.stressedShare)}%</td></tr>`).join('');
  return `<h4 class="calendar-sub">${tr('মাঠের মাপে পানি খরচ ও পানির টান: নাসা ECOSTRESS (৭০ মিটার)', 'Water use and stress field by field: NASA ECOSTRESS (70 m)')}</h4>
    <p class="form-note">${tr(`পাইলটের চারপাশে প্রায় ১১ × ১১ কিমি, ফেব্রুয়ারি-এপ্রিলে দিনের বেলার মাত্র ${num(eco.overpasses)}টি মেঘমুক্ত পাস: নমুনা ছোট। প্রতিটি ৭০ মিটার জমির পানি খরচ আলাদা দেখা যায়, তাই পানির টানের জায়গা চেনা যায়।`,
      `About 11 x 11 km around the pilot, only ${eco.overpasses} clear daytime passes in February-April: a small sample. Each 70 m field's water use is seen separately, so stressed patches can be found.`)}</p>
    <table class="data-table trend-table">
      <thead><tr><th>${tr('মাস', 'Month')}</th><th>${tr('পাস', 'Passes')}</th><th>${tr('বাষ্পীভবন (মিমি/দিন, মধ্যমা)', 'ET (mm/day, median)')}</th><th>${tr('পানির টান সূচক ESI (মধ্যমা)', 'Stress index ESI (median)')}</th>
        <th>${tr(`ভালো পানি পায় (ESI ${num(eco.thresholds.wellWateredEsi)}+)`, `Well watered (ESI ${eco.thresholds.wellWateredEsi}+)`)}</th><th>${tr(`তীব্র টান (ESI ${num(eco.thresholds.stressedEsi)}-এর নিচে)`, `Strongly stressed (ESI under ${eco.thresholds.stressedEsi})`)}</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="form-note">${tr('সতর্কতা: BRRI-র জরিপে তানোরের প্রায় ৪০% জমিতে বোরো, কিন্তু মার্চ-এপ্রিলে ESI ০.৮+ মাত্র ১০–১৫% জমিতে; তাই এই সূচক এখানে বোরোর জমির মাপ নয়, মাঠের লেবেল দিয়ে মেলাতে হবে। স্কোরে এটি ঢোকে না।', 'Caution: BRRI\'s survey puts Boro on about 40% of Tanore\'s land, but only 10-15% reaches ESI 0.8+ in March-April, so here the index is not a measure of Boro area; it needs field labels to calibrate. It does not enter the scores.')}
      ${escapeHtml(eco.source)}; ${escapeHtml(eco.years)}.</p>`;
}

/** The place's season calendar (bars per month) and its trends table, on the evidence screen. */
export function calendarHtml(cal, { tr, escapeHtml, num }) {
  if (!cal) return { chart: `<p class="form-note">${tr('এই জায়গার মৌসুম ক্যালেন্ডার নেই।', 'No season calendar for this place.')}</p>`, trends: '' };
  const rows = [
    ['hotDays', tr('৩৬°সে+ গরম দিন', 'Days of 36 °C+'), 'heat'],
    ['coldNights', tr('১০°সে বা কম রাত', 'Nights of 10 °C or less'), 'cold'],
    ['erosiveRainDays', tr('২৩ মিমি+ বৃষ্টির দিন', 'Days of 23 mm+ rain'), 'rain'],
    ['dryDays', tr('প্রায় বৃষ্টিহীন দিন', 'Days with almost no rain'), 'dry'],
  ];
  const order = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
  const max = { hotDays: 31, coldNights: 31, erosiveRainDays: 8, dryDays: 31 };
  const bar = (key, m, cls) => {
    const v = cal.months[key]?.[m] ?? 0;
    const h = Math.max(2, Math.round((v / max[key]) * 100));
    return `<div class="cal-cell" title="${escapeHtml(`${tr(MONTHS_BN[m], MONTHS_EN[m])}: ${v}`)}"><span class="cal-bar cal-${cls}" style="height:${h}%"></span><span class="cal-val">${v ? num(v) : ''}</span></div>`;
  };
  const green = cal.greenness;
  const chart = `<div class="cal-table">
      <div class="cal-row cal-head"><span class="cal-label"></span>${order.map(m => `<span class="cal-m">${escapeHtml(tr(MONTHS_BN[m], MONTHS_EN[m]))}</span>`).join('')}</div>
      ${rows.map(([key, label, cls]) => `<div class="cal-row"><span class="cal-label">${escapeHtml(label)}</span>${order.map(m => bar(key, m, cls)).join('')}</div>`).join('')}
      <div class="cal-row"><span class="cal-label">${tr('শিকড়ের মাটির রস (০–১)', 'Root-zone wetness (0-1)')}</span>${order.map(m => `<span class="cal-num">${num((cal.months.rootWet?.[m] ?? 0).toFixed(2))}</span>`).join('')}</div>
      ${green ? `<div class="cal-row"><span class="cal-label">${tr('সবুজ NDVI ২০২১–২৫', 'NDVI 2021-25')}</span>${order.map(m => `<span class="cal-num" style="${ndviStyle(green.recent[m])}">${green.recent[m] === null ? '–' : num(green.recent[m].toFixed(2))}</span>`).join('')}</div>
      <div class="cal-row"><span class="cal-label">${tr('সবুজ NDVI ২০০১–০৫', 'NDVI 2001-05')}</span>${order.map(m => `<span class="cal-num" style="${ndviStyle(green.early[m])}">${green.early[m] === null ? '–' : num(green.early[m].toFixed(2))}</span>`).join('')}</div>` : ''}
    </div>
    <p class="form-note">${escapeHtml(tr(`বিন্দু: ${cal.placeBangla ?? cal.place}${cal.station ? `; স্টেশন ${cal.station}` : '; কাছে স্টেশন নেই, গ্রিডের মান'}। তুষার-সম্ভব রাত (৪°সে বা কম): বছরে ${num((cal.months.nearFrostNights ?? []).reduce((a, b) => a + b, 0).toFixed(1))}।`,
      `Point: ${cal.place}${cal.station ? `; station ${cal.station}` : '; no station near, grid values'}. Near-frost nights (4 °C or less): ${(cal.months.nearFrostNights ?? []).reduce((a, b) => a + b, 0).toFixed(1)} a year.`))}</p>
    ${ecostressHtml(cal.ecostress, { tr, escapeHtml, num })}`;
  const fmt = (id, v) => (id.includes('Wet') ? num(v.toFixed(2)) : num(v));
  const trends = `<table class="data-table trend-table">
    <thead><tr><th>${tr('কী', 'What')}</th><th>${escapeHtml(num(cal.trendPeriods.early))}</th><th>${escapeHtml(num(cal.trendPeriods.recent))}</th><th>${tr('ঢাল / দশক', 'Slope a decade')}</th><th>p</th><th>${tr('ফলাফল', 'Reading')}</th></tr></thead>
    <tbody>${cal.trends.map(t => {
      const name = TRENDS[t.id] ?? [t.id, t.id, '', ''];
      const dir = t.change > 0 ? tr('বাড়ছে', 'rising') : tr('কমছে', 'falling');
      const reading = t.clear ? `<span class="tag tag-green">${tr(`স্পষ্ট: ${dir}`, `clear: ${dir}`)}</span>` : `<span class="tag">${tr('স্পষ্ট ধারা নেই', 'no clear trend')}</span>`;
      return `<tr><td>${escapeHtml(tr(name[0], name[1]))}</td><td>${fmt(t.id, t.early)}</td><td>${fmt(t.id, t.recent)}</td><td>${num(t.slopePerDecade)}</td><td>${num(t.p)}</td><td>${reading}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="form-note">${tr('সতর্কতা: তাপমাত্রা ও মাটির রস নাসার পুনর্বিশ্লেষণ মডেলের (MERRA-2); এখানে আমাদের কাছে থাকা BMD স্টেশনের রেকর্ড মাত্র ৭ বছরের, তাই ধারা স্টেশনে মিলিয়ে দেখা যায়নি। মডেলের মাটির রস ভেজা হলেও নিচের পানি (GRACE) কমছে: এরা আলাদা স্তর।', 'Caution: temperatures and soil wetness are from NASA\'s MERRA-2 reanalysis; the BMD station records held here cover only 7 years, so the trends could not be checked at a station. A wetter model root zone and falling groundwater (GRACE) are different layers.')}</p>`;
  return { chart, trends };
}
