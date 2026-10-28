/**
 * The daily advice calls on the Calls and SMS screen (services/api/src/farmer_calls.ts):
 *
 *  - the day's list: each call with who gets it, why, and what they will hear (folded), for the SAAO to approve, edit
 *    or remove; then send, and see who answered (an unanswered call is retried in the evening with an SMS);
 *  - farmers' questions, which come back through the SAAO because the calls are one way: the engine drafts an answer
 *    to crop questions, the officer corrects it, and the answer goes on the call list;
 *  - the register: only farmers who agreed get calls, and the calls stop when they ask.
 *
 * Officer-only: the API checks the officer's token on every request.
 */
const CROPS = {
  aman: ['আমন ধান', 'Aman rice'], boro: ['বোরো ধান', 'Boro rice'], lentil: ['মসুর', 'Lentil'], mustard: ['সরিষা', 'Mustard'],
  wheat: ['গম', 'Wheat'], potato: ['আলু', 'Potato'], maize: ['ভুট্টা', 'Maize'], sunflower: ['সূর্যমুখী', 'Sunflower'],
  chickpea: ['ছোলা', 'Chickpea'], grasspea: ['খেসারি', 'Grass pea'], sweetpotato: ['মিষ্টি আলু', 'Sweet potato'], barley: ['যব', 'Barley'],
  soybean: ['সয়াবিন', 'Soybean'], mungbean: ['মুগ', 'Mungbean'], sesame: ['তিল', 'Sesame'], aus: ['আউশ ধান', 'Aus rice'], jute: ['পাট', 'Jute'],
};
const KIND = {
  alert: ['সতর্কতা', 'Alert', 'badge-warning'],
  answer: ['প্রশ্নের উত্তর', 'Answer', 'badge-primary'],
  drain: ['পানি নামা', 'Water leaving', 'badge-primary'],
  reminder: ['মৌসুমের কথা', 'Season reminder', 'badge-neutral'],
};
const STATUS = {
  proposed: ['প্রস্তাবিত', 'Proposed', 'badge-neutral'],
  approved: ['অনুমোদিত', 'Approved', 'badge-success'],
  sent: ['পাঠানো', 'Sent', 'badge-success'],
  retry: ['সন্ধ্যায় আবার', 'Retry this evening', 'badge-warning'],
  unreached: ['পাওয়া যায়নি', 'Not reached', 'badge-danger'],
  removed: ['বাদ', 'Removed', 'badge-neutral'],
};
const OUTCOME = {
  dry_run: ['পরীক্ষামূলক, কল যায়নি', 'Dry run, nobody dialled'],
  pending: ['ফলাফলের অপেক্ষা', 'Waiting for the result'],
  answered: ['ধরেছেন', 'Answered'],
  unanswered: ['ধরেননি', 'Not answered'],
  failed: ['কল যায়নি', 'Did not go through'],
};
const SLOT = { morning: ['সকাল ৯টা', '9:00'], afternoon: ['বিকেল ৩টা', '15:00'], evening: ['সন্ধ্যা ৭টা', '19:00'] };
const CHANNEL = { in_person: ['সামনাসামনি', 'in person'], phone: ['ফোনে', 'by phone'], missed_call: ['মিসড কল', 'missed call'], app: ['অ্যাপে', 'in the app'] };
const Q_STATUS = { open: ['উত্তর বাকি', 'Needs an answer', 'badge-warning'], answered: ['কল তালিকায়', 'On the call list', 'badge-primary'], called: ['কল গেছে', 'Called', 'badge-success'] };

export function initCalls(ctx) {
  const { tr, num, isoDate, escapeHtml, $ } = ctx;
  const say = (pair) => tr(pair[0], pair[1]);
  let data = null;
  let editing = null; // the call whose script is open for editing
  let note = null; // the last action's result, shown under the list
  let places = null;

  const entry = (farmerId) => data?.farmers.find(f => f.farmer.id === farmerId);
  const where = (e) => [e?.place?.unionBangla ? tr(`${e.place.unionBangla} ইউনিয়ন`, `${e.place.unionEnglish || e.place.unionBangla} union`) : null,
    tr(e?.place?.upazilaBangla, e?.place?.upazila)].filter(Boolean).join(', ');
  const cropNames = (ids) => (ids || []).map(id => say(CROPS[id] || [id, id])).join(', ');

  async function api(url, body) {
    const res = await ctx.officerFetch(url, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
    return json;
  }

  async function load(path, body) {
    try {
      const got = await api(path, body);
      data = got;
      return got;
    } catch (err) {
      note = { error: true, text: String(err.message || err) };
      return null;
    } finally {
      render();
    }
  }

  // ------------------------------------------------------------------ the day's list
  function renderList() {
    const c = data.counts;
    $('callsDate').value = data.date;
    const mode = $('callsMode');
    mode.className = `badge ${data.live ? 'badge-danger' : 'badge-neutral'}`;
    mode.textContent = data.live
      ? tr(`আসল কল চালু (${data.route})`, `Real calls on (${data.route})`)
      : tr('পরীক্ষামূলক: কোনো নম্বরে কল যাবে না', 'Dry run: no number will be dialled');
    const chip = (label, n, kind = '') => `<span class="metric ${kind}"><span>${label}</span> <b>${num(n)}</b></span>`;
    ctx.setHtml('callsCounts', [
      chip(tr('প্রস্তাবিত', 'Proposed'), c.proposed),
      chip(tr('অনুমোদিত', 'Approved'), c.approved),
      chip(tr('পাঠানো', 'Sent'), c.sent),
      c.retry ? chip(tr('আবার চেষ্টা', 'Retry'), c.retry, 'is-warn') : '',
      c.unreached ? chip(tr('পাওয়া যায়নি', 'Not reached'), c.unreached, 'is-warn') : '',
    ].join(''));

    const calls = data.calls.filter(x => x.status !== 'removed');
    const removed = data.calls.filter(x => x.status === 'removed');
    ctx.setHtml('callsList', calls.length ? calls.map(callRow).join('') + (removed.length
      ? `<details class="fold"><summary>${tr(`বাদ দেওয়া ${num(removed.length)}টি কল`, `${removed.length} removed call(s)`)}</summary>${removed.map(callRow).join('')}</details>` : '')
      : `<p class="calls-empty">${tr('এই দিনের তালিকায় কোনো কল নেই। "তালিকা তৈরি করুন" চাপলে নাসার আজকের তথ্য দেখে তালিকা হবে।', 'No calls on this day\'s list. "Build the list" checks today\'s NASA data for every farmer.')}</p>`);

    const skipped = data.skipped || [];
    const lines = [];
    if (note) lines.push(`<span class="${note.error ? 'calls-error' : ''}">${escapeHtml(note.text)}</span>`);
    if (skipped.length) {
      lines.push(`<details class="fold"><summary>${tr(`${num(skipped.length)} জন কৃষকের জন্য আজ কল নেই`, `No call today for ${skipped.length} farmer(s)`)}</summary>${skipped.map(s => {
        const e = entry(s.farmerId);
        return `${escapeHtml(tr(e?.farmer.nameBangla, e?.farmer.nameEnglish) || s.farmerId)}: ${escapeHtml(skipReason(s.reason))}`;
      }).join('<br>')}</details>`);
    }
    const box = $('callsNote');
    box.hidden = !lines.length;
    box.innerHTML = lines.join('');
  }

  function skipReason(reason) {
    const known = {
      'nothing to say': ['আজ বলার মতো কিছু নেই', 'nothing to say today'],
      'already has a call this day': ['আজ একটি কল আছে', 'already has a call today'],
      'stopped the calls': ['কল বন্ধ করেছেন', 'stopped the calls'],
      'no consent': ['সম্মতি নেই', 'no consent'],
    };
    return known[reason] ? say(known[reason]) : reason;
  }

  function callRow(call) {
    const e = entry(call.farmerId);
    const f = e?.farmer;
    const [kbn, ken, kcls] = call.emergency ? ['জরুরি সতর্কতা', 'Emergency', 'badge-danger'] : KIND[call.kind];
    const [sbn, sen, scls] = STATUS[call.status];
    const last = call.attempts[call.attempts.length - 1];
    const open = !call.attempts.length;
    const actions = [];
    if (call.status === 'proposed') {
      actions.push(button('approve', call.id, tr('অনুমোদন', 'Approve'), 'btn-primary'));
      actions.push(button('remove', call.id, tr('বাদ দিন', 'Remove')));
    } else if (call.status === 'approved' || (call.status === 'removed' && open)) {
      actions.push(button('undo', call.id, tr('ফিরিয়ে নিন', 'Undo')));
    }
    if (last && (last.outcome === 'dry_run' || last.outcome === 'pending') && call.status === 'sent') {
      actions.push(button('mark', call.id, tr('ধরেছেন', 'Answered'), '', 'answered'));
      actions.push(button('mark', call.id, tr('ধরেননি', 'Not answered'), '', 'unanswered'));
    }
    const edit = editing === call.id
      ? `<div class="call-edit">
          <label>${tr('কলের কথা', 'What the call says')}<textarea class="form-control" rows="5" id="edit-script-${call.id}" lang="bn">${escapeHtml(call.scriptBangla)}</textarea></label>
          <label>${tr('এসএমএস', 'SMS')}<textarea class="form-control" rows="2" id="edit-sms-${call.id}" lang="bn">${escapeHtml(call.smsBangla)}</textarea></label>
          <div class="call-actions">${button('save-edit', call.id, tr('সংরক্ষণ', 'Save'), 'btn-primary')}${button('cancel-edit', call.id, tr('বাতিল', 'Cancel'))}</div>
        </div>`
      : `${call.durationSeconds > 60 && open ? `<span class="metric is-warn call-long"><span>${tr('দীর্ঘ কল', 'Long call')}</span> <b>${tr(`${num(call.durationSeconds)} সেকেন্ড: এক মিনিটের মধ্যে আনুন`, `${call.durationSeconds} s: trim it to a minute`)}</b></span>` : ''}
        <details class="fold call-script"><summary>${tr(`কৃষক যা শুনবেন (~${num(call.durationSeconds)} সেকেন্ড)`, `What the farmer hears (~${call.durationSeconds} s)`)}${call.edited ? ` · ${tr('সম্পাদিত', 'edited')}` : ''}</summary>
          <p lang="bn">${escapeHtml(call.scriptBangla)}</p>
          <p class="call-sms" lang="bn"><b>${tr('এসএমএস (না ধরলে)', 'SMS (if not answered)')}:</b> ${escapeHtml(call.smsBangla)}</p>
          ${open && call.status !== 'removed' ? button('edit', call.id, tr('লেখা বদলান', 'Edit the wording')) : ''}
        </details>`;
    const attempts = call.attempts.map((a, i) => `<span class="metric ${a.outcome === 'answered' ? '' : a.outcome === 'dry_run' || a.outcome === 'pending' ? 'is-water' : 'is-warn'}"><span>${tr(i ? 'দ্বিতীয় চেষ্টা' : 'কল', i ? 'Retry' : 'Call')}</span> <b>${escapeHtml(say(OUTCOME[a.outcome]))}</b></span>`).join('');
    const sms = call.sms ? `<span class="metric is-water"><span>${tr('এসএমএস', 'SMS')}</span> <b>${call.sms.dryRun ? tr('পরীক্ষামূলক', 'dry run') : call.sms.error ? tr('যায়নি', 'failed') : tr('গেছে', 'sent')}</b></span>` : '';
    return `
      <article class="call-row ${call.emergency ? 'is-emergency' : ''} status-${call.status}">
        <div class="call-top">
          <span class="badge ${kcls}">${tr(kbn, ken)}</span>
          <strong class="call-title">${escapeHtml(tr(call.titleBangla, call.titleEnglish))}</strong>
          <span class="badge ${scls} call-status">${tr(sbn, sen)}</span>
        </div>
        <div class="call-who"><span class="material-symbols-outlined" aria-hidden="true">person</span> <strong>${escapeHtml(tr(f?.nameBangla, f?.nameEnglish) || call.farmerId)}</strong>${f?.sample ? ` <span class="tag tag-yellow">${tr('নমুনা', 'sample')}</span>` : ''}
          <span class="call-where">${escapeHtml(where(e))} · ${escapeHtml(ctx.land(f?.landType))} · ${say(SLOT[call.slot])}</span></div>
        <p class="call-why">${escapeHtml(tr(call.whyBangla, call.whyEnglish))}</p>
        ${edit}
        ${attempts || sms ? `<div class="call-attempts">${attempts}${sms}</div>` : ''}
        ${actions.length ? `<div class="call-actions">${actions.join('')}</div>` : ''}
      </article>`;
  }

  const button = (action, id, label, cls = 'btn-secondary', value = '') =>
    `<button class="btn btn-sm ${cls}" type="button" data-calls="${action}" data-id="${escapeHtml(id)}"${value ? ` data-value="${value}"` : ''}>${label}</button>`;

  // ------------------------------------------------------------------ questions
  function renderQuestions() {
    const select = $('qFarmer');
    const chosen = select.value;
    select.innerHTML = data.farmers.map(({ farmer, callable }) => `<option value="${escapeHtml(farmer.id)}">${escapeHtml(tr(farmer.nameBangla, farmer.nameEnglish))}${callable ? '' : ` (${tr('কল বন্ধ', 'calls stopped')})`}</option>`).join('');
    if (chosen) select.value = chosen;
    $('qText').placeholder = tr('যেমন: আমি সরিষা আর মসুর করতে চাই, কোনটা ভালো?', 'e.g. "I want mustard and lentil, which is better?" (in Bangla)');
    ctx.setHtml('questionList', data.questions.length ? data.questions.map(q => {
      const f = entry(q.farmerId)?.farmer;
      const [bn, en, cls] = Q_STATUS[q.status];
      const body = q.status === 'open'
        ? `<textarea class="form-control" rows="4" id="answer-${q.id}" lang="bn" placeholder="${escapeHtml(tr('উত্তর লিখুন', 'Write the answer (in Bangla)'))}">${escapeHtml(q.draftBangla)}</textarea>
           <small class="q-hint">${q.draftBangla ? tr('ইঞ্জিনের খসড়া: পাঠানোর আগে মিলিয়ে নিন।', "The engine's draft: check it before it goes.") : tr('ইঞ্জিন এই প্রশ্ন বোঝেনি; উত্তর আপনি লিখুন।', "The engine did not understand this question; write the answer.")}</small>
           <div class="call-actions">${button('answer', q.id, tr('উত্তর অনুমোদন: কল তালিকায় দিন', 'Approve the answer for the call list'), 'btn-primary')}</div>`
        : `<details class="fold"><summary>${tr('উত্তর', 'Answer')}</summary><p lang="bn">${escapeHtml(q.answerBangla || '')}</p></details>`;
      return `
        <article class="question-row status-${q.status}">
          <div class="call-top"><strong>${escapeHtml(tr(f?.nameBangla, f?.nameEnglish) || q.farmerId)}</strong>
            <span class="tag">${say(CHANNEL[q.channel])} · ${isoDate(q.askedAt)}</span>
            <span class="badge ${cls} call-status">${tr(bn, en)}</span></div>
          <p class="q-text" lang="bn">${escapeHtml(q.textBangla)}</p>
          ${body}
        </article>`;
    }).join('') : `<p class="calls-empty">${tr('এখনো কোনো প্রশ্ন নেই।', 'No questions yet.')}</p>`);
  }

  // ------------------------------------------------------------------ the register
  function renderRegister() {
    const r = data.register;
    $('regCount').textContent = tr(`${num(r.callable)}/${num(r.farmers)} জন কল পাচ্ছেন`, `${r.callable} of ${r.farmers} get calls`);
    ctx.setHtml('registerList', data.farmers.map(e => {
      const f = e.farmer;
      const on = e.callable;
      return `
        <div class="register-row ${on ? '' : 'is-stopped'}">
          <div class="reg-main">
            <strong>${escapeHtml(tr(f.nameBangla, f.nameEnglish))}</strong>${f.sample ? ` <span class="tag tag-yellow">${tr('নমুনা', 'sample')}</span>` : ''} <small class="reg-phone">${escapeHtml(f.phoneMasked)}</small>
            <small>${escapeHtml(where(e))} · ${escapeHtml(ctx.land(f.landType))} · ${escapeHtml(cropNames(f.crops))}</small>
          </div>
          <div class="reg-side">
            <span class="badge ${on ? 'badge-success' : 'badge-neutral'}">${on ? tr('কল চালু', 'Calls on') : tr('কল বন্ধ', 'Calls stopped')}</span>
            <small>${f.callSlot ? say(SLOT[f.callSlot]) : ''}</small>
            ${button(on ? 'stop' : 'start', f.id, on ? tr('কল বন্ধ করুন', 'Stop calls') : tr('আবার চালু', 'Start again'))}
          </div>
        </div>`;
    }).join(''));
    const crops = $('regCrops');
    const ticked = new Set([...crops.querySelectorAll('input:checked')].map(i => i.value));
    crops.innerHTML = data.crops.map(id => `<label><input type="checkbox" value="${escapeHtml(id)}"${ticked.has(id) ? ' checked' : ''}> ${escapeHtml(say(CROPS[id] || [id, id]))}</label>`).join('');
    const unknown = $('unknownCallers');
    unknown.hidden = !data.unknownCallers.length;
    if (data.unknownCallers.length) {
      unknown.textContent = tr(
        `নিবন্ধন নেই এমন নম্বর থেকে ${num(data.unknownCallers.length)}টি মিসড কল (সর্বশেষ ${data.unknownCallers[0].phoneMasked})। দেখা হলে নিবন্ধন করুন।`,
        `${data.unknownCallers.length} missed call(s) from numbers not in the register (latest ${data.unknownCallers[0].phoneMasked}). Register them when you meet them.`);
    }
    fillPlaces();
  }

  async function fillPlaces() {
    if (!places) {
      try {
        places = (await (await fetch('/api/v1/places')).json()).upazilas;
      } catch {
        return;
      }
      const districts = [...new Set(places.map(u => u.district))].sort();
      $('regDistrict').innerHTML = districts.map(d => `<option>${escapeHtml(d)}</option>`).join('');
      $('regDistrict').value = 'Rajshahi';
      fillUpazilas();
    }
  }

  function fillUpazilas() {
    const d = $('regDistrict').value;
    $('regUpazila').innerHTML = places.filter(u => u.district === d).sort((a, b) => a.name.localeCompare(b.name))
      .map(u => `<option value="${escapeHtml(u.id === 'ADM3_Tanore' ? 'talanda_tanore' : u.id)}">${escapeHtml(u.id === 'ADM3_Tanore' ? `${u.name} (Talanda pilot)` : u.name)}</option>`).join('');
  }

  // ------------------------------------------------------------------ events
  async function act(action, id, value) {
    const date = $('callsDate').value || undefined;
    note = null;
    if (action === 'go-sign-in') return window.switchScreen('screen-officer');
    if (action === 'build') {
      const got = await load('/api/v1/officer/calls/plan', { date });
      if (got) note = { text: tr(`তালিকা তৈরি: ${num(got.calls.filter(c => c.status === 'proposed').length)}টি প্রস্তাবিত কল।`, `List built: ${got.calls.filter(c => c.status === 'proposed').length} proposed call(s).`) };
    } else if (action === 'approve-all') {
      const got = await load('/api/v1/officer/calls/approve-all', { date });
      if (got) note = { text: tr(`${num(got.approved)}টি কল অনুমোদিত।`, `${got.approved} call(s) approved.`) };
    } else if (action === 'send') {
      const got = await load('/api/v1/officer/calls/send', { date });
      if (got) note = { text: got.result.sent.length
        ? tr(`${num(got.result.sent.length)}টি কল পাঠানো হয়েছে${got.result.live ? '' : ' (পরীক্ষামূলক: কোনো নম্বরে কল যায়নি)'}।`, `${got.result.sent.length} call(s) sent${got.result.live ? '' : ' (dry run: no number was dialled)'}.`)
        : tr('পাঠানোর মতো অনুমোদিত কল নেই।', 'No approved calls to send.') };
    } else if (action === 'follow-up') {
      const got = await load('/api/v1/officer/calls/follow-up', { date });
      if (got) note = { text: tr(`ফলাফল দেখা হলো: ${num(got.result.checked.length)}টি রিপোর্ট; আবার চেষ্টা ${num(got.result.retries.length)}, পাওয়া যায়নি ${num(got.result.unreached.length)}।`, `Results read: ${got.result.checked.length} report(s); retry ${got.result.retries.length}, not reached ${got.result.unreached.length}.`) };
    } else if (['approve', 'remove', 'undo'].includes(action)) {
      await load(`/api/v1/officer/calls/${encodeURIComponent(id)}/review`, { action });
    } else if (action === 'edit') {
      editing = id;
    } else if (action === 'cancel-edit') {
      editing = null;
    } else if (action === 'save-edit') {
      const got = await load(`/api/v1/officer/calls/${encodeURIComponent(id)}/review`, { action: 'edit', scriptBangla: $(`edit-script-${id}`).value, smsBangla: $(`edit-sms-${id}`).value });
      if (got) editing = null;
    } else if (action === 'mark') {
      const got = await load(`/api/v1/officer/calls/${encodeURIComponent(id)}/outcome`, { outcome: value });
      if (got && value === 'unanswered') {
        note = { text: got.call?.sms?.dryRun
          ? tr('সন্ধ্যায় আবার কল হবে। কাজের কথার এসএমএস তৈরি, তবে পরীক্ষামূলক বলে পাঠানো হয়নি।', 'The call will be tried again this evening. The SMS with the action is ready, but not sent in a dry run.')
          : tr('সন্ধ্যায় আবার কল হবে, আর কাজের কথাটি এসএমএসে গেছে।', 'The call will be tried again this evening, and the action went by SMS.') };
      }
    } else if (action === 'answer') {
      const got = await load(`/api/v1/officer/questions/${encodeURIComponent(id)}/answer`, { answerBangla: $(`answer-${id}`).value });
      if (got) note = { text: got.call ? tr('উত্তরটি আজকের কল তালিকায় আছে; অনুমোদন দিলে যাবে।', "The answer is on today's call list; it goes once you approve it.") : tr('উত্তর রাখা হয়েছে; এই কৃষকের আজ অন্য কল আছে।', 'Answer saved; this farmer already has a call today.') };
    } else if (action === 'stop' || action === 'start') {
      try {
        await api(`/api/v1/officer/farmers/${encodeURIComponent(id)}/calls`, { on: action === 'start', how: action === 'start' ? 'in_person' : 'told the officer' });
      } catch (err) {
        note = { error: true, text: String(err.message || err) };
      }
      await load(`/api/v1/officer/calls/plan?date=${encodeURIComponent(date || '')}`);
    }
    render();
  }

  $('screen-delivery').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-calls]');
    if (!btn) return;
    btn.disabled = true;
    act(btn.dataset.calls, btn.dataset.id, btn.dataset.value).finally(() => { btn.disabled = false; });
  });
  $('callsDate').addEventListener('change', () => load(`/api/v1/officer/calls/plan?date=${encodeURIComponent($('callsDate').value)}`));
  $('regDistrict').addEventListener('change', fillUpazilas);

  $('questionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = $('questionMsg');
    try {
      await api('/api/v1/officer/questions', { farmerId: $('qFarmer').value, channel: $('qChannel').value, textBangla: $('qText').value });
      $('qText').value = '';
      msg.hidden = true;
      await load(`/api/v1/officer/calls/plan?date=${encodeURIComponent($('callsDate').value)}`);
    } catch (err) {
      msg.hidden = false;
      msg.className = 'calls-msg calls-error';
      msg.textContent = String(err.message || err);
    }
  });

  $('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = $('registerMsg');
    msg.hidden = false;
    if (!$('regConsent').checked) {
      msg.className = 'calls-msg calls-error';
      msg.textContent = tr('আগে কৃষকের সম্মতি নিন: কৃষক রাজি হলে টিক দিন।', 'Ask the farmer first: tick the box once they agree.');
      return;
    }
    try {
      const got = await api('/api/v1/officer/farmers', {
        nameBangla: $('regName').value,
        nameEnglish: $('regNameEn').value,
        phone: $('regPhone').value,
        placeId: $('regUpazila').value,
        unionBangla: $('regUnion').value,
        villageBangla: $('regVillage').value,
        landType: $('regLand').value,
        crops: [...$('regCrops').querySelectorAll('input:checked')].map(i => i.value),
        callSlot: $('regSlot').value,
        consent: $('regConsent').checked,
        consentMethod: $('regConsentHow').value,
      });
      msg.className = 'calls-msg';
      msg.textContent = tr(`${got.farmer.nameBangla} নিবন্ধিত (${got.farmer.id})। পরের তালিকা থেকে কল পাবেন।`, `${got.farmer.nameEnglish} registered (${got.farmer.id}). Calls start from the next list.`);
      $('registerForm').reset();
      $('regCrops').querySelectorAll('input').forEach(i => { i.checked = false; });
      await load(`/api/v1/officer/calls/plan?date=${encodeURIComponent($('callsDate').value)}`);
    } catch (err) {
      msg.className = 'calls-msg calls-error';
      msg.textContent = String(err.message || err);
    }
  });

  function render() {
    const signedIn = ctx.signedIn();
    $('callsGate').hidden = signedIn;
    $('callsWorkspace').hidden = !signedIn || !data;
    if (!signedIn || !data) return;
    renderList();
    renderQuestions();
    renderRegister();
  }

  return {
    render,
    /** After sign-in (load the day's list) or sign-out (forget it). */
    async refresh() {
      if (!ctx.signedIn()) {
        data = null;
        note = null;
        editing = null;
        return render();
      }
      await load('/api/v1/officer/calls/plan');
    },
  };
}
