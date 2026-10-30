// Small hooks for the soft UI (neo.css): a range slider fills up to its thumb, and a button that carries
// aria-busy="true" shows the pressed, spinning state from the design sheet.

const fill = (input) => {
  const min = Number(input.min || 0), max = Number(input.max || 100), val = Number(input.value || 0);
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--fill', `${Math.min(100, Math.max(0, pct)).toFixed(1)}%`);
};

const all = () => document.querySelectorAll('input[type="range"]').forEach(fill);

document.addEventListener('input', (e) => { if (e.target instanceof HTMLInputElement && e.target.type === 'range') fill(e.target); });
// sliders whose value a script sets, and sliders that appear later
new MutationObserver(all).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'min', 'max'] });
all();
setInterval(all, 1500); // a script setting .value fires no event; this catches it cheaply (a few sliders)

const busy = (btn) => btn.classList.toggle('is-loading', btn.getAttribute('aria-busy') === 'true');
new MutationObserver((list) => list.forEach(m => m.target instanceof HTMLElement && m.target.matches('.btn') && busy(m.target)))
  .observe(document.body, { attributes: true, attributeFilter: ['aria-busy'], subtree: true });
