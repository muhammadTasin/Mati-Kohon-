/**
 * Real photos in the dashboard: which crop photo goes with a step of a rotation, and the credits for every photo.
 * The photos are openly licensed Wikimedia Commons pictures of Bangladeshi fields and crops (resized and cropped)
 * and NASA MODIS images (public domain); img/credits.json lists each one's author, licence and source page, and
 * the credits are shown on the data-quality screen and in a dialog from any "photo by" link.
 */

/** The crop photo (img/crops/<id>.jpg) for a step of a rotation, or null for fallow land and crops with no photo. */
export function cropPhoto(step) {
  if (!step || step.fallow) return null;
  const crop = String(step.crop || '').toLowerCase();
  if (crop.includes('boro')) return 'boro';
  if (step.seasonType === 'Aman' || crop.includes('rice')) return 'aman';
  return ['lentil', 'mustard', 'wheat', 'potato', 'maize', 'sunflower', 'jute'].find(id => crop.includes(id)) ?? null;
}

/** A row of crop photos for a rotation, with the crop names under them. */
export function cropStrip(steps, { tr, escapeHtml }) {
  return `<div class="crop-strip">${(steps || []).map(step => {
    const photo = cropPhoto(step);
    const name = step.fallow ? tr('বর্ষায় পতিত', 'Monsoon fallow') : tr(step.cropBangla || step.crop, step.crop);
    return `<figure class="crop-chip${photo ? '' : ' no-photo'}">${photo
      ? `<img src="img/crops/${photo}.jpg" alt="" width="96" height="96" loading="lazy">`
      : `<span class="material-symbols-outlined" aria-hidden="true">${step.fallow ? 'water' : 'eco'}</span>`}<figcaption>${escapeHtml(name)}</figcaption></figure>`;
  }).join('<span class="crop-arrow" aria-hidden="true">→</span>')}</div>`;
}

let credits = null;
async function loadCredits() {
  if (!credits) {
    try {
      credits = await (await fetch('img/credits.json')).json();
    } catch {
      credits = {};
    }
  }
  return credits;
}

const WHAT = {
  'photos/harvest-home.jpg': ['আমন কাটা শেষে ধান ঘরে তোলা', 'Carrying the paddy harvest home'],
  'photos/harvest-river.jpg': ['নদীর পাশে আমন কাটা', 'Harvesting Aman beside a river'],
  'photos/farmer-rajshahi.jpg': ['ব্রি রাজশাহীর ধানখেতে কৃষক', 'A farmer in a BRRI Rajshahi paddy field'],
  'photos/nasa-modis-bangladesh.jpg': ['নাসার MODIS উপগ্রহে বাংলাদেশ', 'Bangladesh from NASA MODIS'],
  'photos/nasa-modis-flood-2024.jpg': ['নাসার MODIS-এ ২০২৪ সালের বন্যা', 'The 2024 flood from NASA MODIS'],
  'photos/haor-boat.jpg': ['টাঙ্গুয়ার হাওর', 'Tanguar Haor'],
  'photos/transplanting.jpg': ['ধানের চারা রোপণ', 'Transplanting rice'],
  'photos/seedbed.jpg': ['বীজতলা থেকে চারা তোলা', 'Lifting seedlings from the seedbed'],
  'photos/mustard-field.jpg': ['সরিষার খেত', 'A mustard field'],
};

/** The credit list (a <ul> of photo, what it shows, author, licence and source). */
export async function renderCredits(listEl, { tr, escapeHtml }) {
  if (!listEl) return;
  const all = await loadCredits();
  listEl.innerHTML = Object.entries(all).map(([file, c]) => {
    const what = WHAT[file] ? tr(...WHAT[file]) : (file.startsWith('crops/') ? tr(`ফসল: ${file.slice(6, -4)}`, `Crop: ${file.slice(6, -4)}`) : file);
    const licence = c.licenseUrl ? `<a href="${escapeHtml(c.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(c.license)}</a>` : escapeHtml(c.license);
    return `<li><img src="img/${escapeHtml(file)}" alt="" width="56" height="56" loading="lazy">
      <span><strong>${escapeHtml(what)}</strong><br>${escapeHtml(c.artist || '')} · ${licence} · <a href="${escapeHtml(c.page)}" target="_blank" rel="noopener">${tr('মূল ছবি', 'Original')}</a></span></li>`;
  }).join('');
}

/** A dialog with the credits, for the "photo by" links that sit outside the data-quality screen. */
export async function showCreditsDialog({ tr, escapeHtml }) {
  let dialog = document.getElementById('creditsDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'creditsDialog';
    dialog.className = 'credits-dialog';
    dialog.innerHTML = `<div class="credits-dialog-head"><h3></h3><button class="btn btn-sm btn-secondary" type="button" value="close"></button></div><ul class="credit-list"></ul>`;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  dialog.querySelector('h3').textContent = tr('ছবি ও কৃতজ্ঞতা', 'Photos and credits');
  dialog.querySelector('button').textContent = tr('বন্ধ করুন', 'Close');
  await renderCredits(dialog.querySelector('ul'), { tr, escapeHtml });
  dialog.showModal();
}
