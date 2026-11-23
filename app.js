import { CONFIG } from './config.js';
import { createStore } from './data.js';
import { loadFoods, searchFoods, getFood, nutrientsFor, foodsStatus } from './foods.js';
import { renderReportHTML, buildCSV, buildPDF, shareFile, fileName } from './report.js';
import { MEALS, guessMeal, dayKey, timeKey, fromKeys, startOfDay, addDays, fmtDate, relDay, fmtTime, esc, num } from './util.js';

const $ = (id) => document.getElementById(id);
const S = {
  store: null, user: null, view: 'day', day: startOfDay(new Date()), rows: [],
  editing: null, meal: 'frokost', food: null, portion: null, snapshot: null,
  recent: [], reportRange: '7', signUpMode: false,
  subject: null, links: { canSee: [], seenBy: [] },
};

// ---------- Innstillinger (per telefon) ----------
const settings = (() => {
  let s = { nutrition: true, name: '' };
  try { s = { ...s, ...JSON.parse(localStorage.getItem('matdagbok-settings')) }; } catch {}
  return s;
})();
const saveSettings = () => { try { localStorage.setItem('matdagbok-settings', JSON.stringify(settings)); } catch {} };

// ---------- Hjelpere ----------
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
function show(view) {
  S.view = view;
  for (const v of ['login', 'day', 'report', 'settings']) $(`view-${v}`).hidden = v !== view;
  $('tabbar').hidden = view === 'login';
  document.querySelectorAll('.tabbar [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'day') renderDay();
  if (view === 'report') renderReport();
  if (view === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

// ---------- Innlogging ----------
async function start() {
  S.store = await createStore();
  $('demo-banner').hidden = !S.store.demo;
  S.user = await S.store.user();
  S.store.onAuth(async (u) => { const was = S.user; S.user = u; if (!!was !== !!u) { if (u) await refreshLinks(true); show(u ? 'day' : 'login'); } });
  if (S.user) await refreshLinks(true);
  show(S.user ? 'day' : 'login');
  loadFoods().then(() => { if (S.view === 'settings') renderSettings(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

$('login-toggle').onclick = () => {
  S.signUpMode = !S.signUpMode;
  $('login-submit').textContent = S.signUpMode ? 'Lag konto' : 'Logg inn';
  $('login-toggle').textContent = S.signUpMode ? 'Har konto? Logg inn' : 'Ny bruker? Lag konto';
  $('login-password').autocomplete = S.signUpMode ? 'new-password' : 'current-password';
};
$('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const err = $('login-error'); err.hidden = true;
  const btn = $('login-submit'); btn.disabled = true;
  try {
    const email = $('login-email').value.trim(), pw = $('login-password').value;
    if (S.signUpMode) {
      const r = await S.store.signUp(email, pw);
      if (r.needsConfirm) { err.textContent = 'Konto laget! Bekreft e-posten via lenken vi sendte, og logg inn her.'; err.hidden = false; }
    } else {
      await S.store.signIn(email, pw);
    }
    S.user = await S.store.user();
    if (S.user) { await refreshLinks(true); show('day'); }
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  finally { btn.disabled = false; }
};

// ---------- Foreldretilgang ----------
async function refreshLinks(pickDefault = false) {
  try { S.links = await S.store.links(); } catch { S.links = { canSee: [], seenBy: [] }; }
  if (S.subject && !S.links.canSee.some((l) => l.owner_id === S.subject.owner_id)) S.subject = null;
  // En forelder som er koblet til et barn, ser barnets dagbok først.
  if (pickDefault && !S.subject && S.links.canSee.length) S.subject = S.links.canSee[0];
}
function renderWho() {
  const opts = [{ key: '', label: 'Meg' }, ...S.links.canSee.map((l) => ({ key: l.owner_id, label: l.owner_name }))];
  for (const id of ['who-day', 'who-report']) {
    const el = $(id);
    el.hidden = opts.length < 2;
    el.innerHTML = opts.map((o) => `<button data-k="${o.key}" class="${(S.subject?.owner_id || '') === o.key ? 'on' : ''}">${esc(o.label)}</button>`).join('');
    el.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { S.subject = S.links.canSee.find((l) => l.owner_id === b.dataset.k) || null; show(S.view); };
    });
  }
  $('viewing-banner').hidden = !S.subject;
  $('viewing-banner').textContent = S.subject ? `Du ser dagboken til ${S.subject.owner_name}. Bare lesing.` : '';
}

// ---------- Dagbok ----------
async function renderDay() {
  renderWho();
  const rel = relDay(S.day);
  $('day-title').innerHTML = rel
    ? `${rel}<small>${esc(fmtDate(S.day))}</small>`
    : `${esc(fmtDate(S.day).split(' ')[0])}<small>${esc(S.day.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }))}</small>`;
  $('day-next').disabled = startOfDay(S.day) >= startOfDay(new Date());
  $('day-next').style.opacity = $('day-next').disabled ? .35 : 1;
  try { S.rows = await S.store.list(S.day, addDays(S.day, 1), S.subject?.owner_id); }
  catch (ex) { toast(ex.message); S.rows = []; }

  const list = $('day-list');
  if (!S.rows.length) {
    $('day-summary').innerHTML = '';
    list.innerHTML = `<div class="empty"><div class="big">🍽️</div>Ingenting registrert ${rel ? rel.toLowerCase() : 'denne dagen'}.${S.subject ? '' : '<br>Trykk på <b>+</b> for å legge til.'}</div>`;
    return;
  }
  const kcal = S.rows.reduce((a, r) => a + Number(r.kcal || 0), 0);
  const hasK = S.rows.some((r) => r.kcal != null);
  const mealsCount = new Set(S.rows.map((r) => r.meal_type)).size;
  $('day-summary').innerHTML = `
    <div class="pill"><b>${S.rows.length}</b><span>registrert</span></div>
    <div class="pill"><b>${mealsCount}</b><span>måltider</span></div>
    ${settings.nutrition && hasK ? `<div class="pill"><b>${Math.round(kcal)}</b><span>kcal</span></div>` : ''}`;

  const order = Object.keys(MEALS);
  const groups = [];
  for (const r of S.rows) {
    const last = groups[groups.length - 1];
    if (last && last.meal === r.meal_type) last.items.push(r); else groups.push({ meal: r.meal_type, items: [r] });
  }
  list.innerHTML = groups.map((g) => `
    <div class="meal-group">
      <h4><span class="dot" style="background:var(--m-${order.includes(g.meal) ? g.meal : 'mellommaltid'})"></span>${MEALS[g.meal]?.icon || ''} ${esc(MEALS[g.meal]?.label || g.meal)}</h4>
      ${g.items.map((r) => `
        <button class="entry" data-id="${r.id}" ${S.subject ? 'disabled' : ''}>
          <span class="time">${fmtTime(new Date(r.eaten_at))}</span>
          <span class="what"><div>${esc(r.description)}</div>${amountText(r) || r.note ? `<small>${esc([amountText(r), r.note].filter(Boolean).join(' · '))}</small>` : ''}</span>
          ${settings.nutrition && r.kcal != null ? `<span class="kcal">${Math.round(r.kcal)} kcal</span>` : ''}
        </button>`).join('')}
    </div>`).join('');
  if (!S.subject) list.querySelectorAll('.entry').forEach((b) => { b.onclick = () => openSheet(S.rows.find((r) => r.id === b.dataset.id)); });
}
const amountText = (r) => r.portion_text || (r.amount_g ? `${num(r.amount_g)} g` : '');

$('day-prev').onclick = () => { S.day = addDays(S.day, -1); renderDay(); };
$('day-next').onclick = () => { if (!$('day-next').disabled) { S.day = addDays(S.day, 1); renderDay(); } };
$('day-title').onclick = () => {
  const p = $('day-picker'); p.value = dayKey(S.day); p.max = dayKey(new Date());
  if (p.showPicker) { try { p.showPicker(); return; } catch {} }
  p.focus(); p.click();
};
$('day-picker').onchange = (e) => { if (e.target.value) { S.day = fromKeys(e.target.value, '00:00'); renderDay(); } };

// Sveip mellom dager
let touchX = null;
$('view-day').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
$('view-day').addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX; touchX = null;
  if (Math.abs(dx) > 80) (dx > 0 ? $('day-prev') : $('day-next')).click();
});

// ---------- Legg til / endre ----------
function renderMealChips() {
  $('f-meal').innerHTML = Object.entries(MEALS).map(([k, m]) =>
    `<button type="button" role="radio" aria-checked="${k === S.meal}" class="chip ${k === S.meal ? 'on' : ''}" data-meal="${k}">${m.icon} ${m.label}</button>`).join('');
  $('f-meal').querySelectorAll('.chip').forEach((c) => { c.onclick = () => { S.meal = c.dataset.meal; S.mealTouched = true; renderMealChips(); }; });
}

async function openSheet(entry = null) {
  S.editing = entry; S.food = null; S.portion = null; S.snapshot = null; S.mealTouched = !!entry;
  const now = new Date();
  const when = entry ? new Date(entry.eaten_at)
    : (dayKey(S.day) === dayKey(now) ? now : fromKeys(dayKey(S.day), timeKey(now)));
  $('f-date').value = dayKey(when); $('f-date').max = dayKey(now);
  $('f-time').value = timeKey(when);
  S.meal = entry?.meal_type || guessMeal(when);
  renderMealChips();
  $('f-desc').value = entry?.description || '';
  $('f-note').value = entry?.note || '';
  $('f-amount-text').value = entry && !entry.food_id ? (entry.portion_text || '') : '';
  $('f-results').hidden = true;
  $('sheet-title').textContent = entry ? 'Endre' : 'Legg til';
  $('f-delete').hidden = !entry;
  if (entry) {
    S.snapshot = pickNutri(entry);
    if (entry.food_id) {
      await loadFoods();
      setFood(getFood(entry.food_id) || { id: entry.food_id, n: entry.description, por: [] }, entry);
    } else setFood(null);
  } else setFood(null);
  renderRecent();
  $('sheet').showModal();
  if (!entry) setTimeout(() => $('f-desc').focus(), 250);
}
const pickNutri = (r) => ({ kcal: r.kcal ?? null, protein_g: r.protein_g ?? null, fat_g: r.fat_g ?? null, carbs_g: r.carbs_g ?? null, fiber_g: r.fiber_g ?? null });

async function renderRecent() {
  if (S.editing) { $('f-recent').innerHTML = ''; return; }
  try { S.recent = await S.store.recent(); } catch { S.recent = []; }
  const seen = new Map();
  for (const r of S.recent) {
    const k = r.description.toLowerCase();
    if (!seen.has(k)) seen.set(k, { r, n: 0 });
    seen.get(k).n++;
  }
  const top = [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 12).map((x) => x.r);
  $('f-recent').innerHTML = top.map((r, i) => `<button type="button" class="chip" data-i="${i}">↺ ${esc(r.description)}</button>`).join('');
  $('f-recent').querySelectorAll('.chip').forEach((c) => {
    c.onclick = async () => {
      const r = top[+c.dataset.i];
      $('f-desc').value = r.description;
      $('f-results').hidden = true;
      if (r.food_id) { await loadFoods(); S.snapshot = pickNutri(r); setFood(getFood(r.food_id) || { id: r.food_id, n: r.description, por: [] }, r); }
      else { setFood(null); $('f-amount-text').value = r.portion_text || ''; }
    };
  });
}

let searchT;
$('f-desc').addEventListener('input', () => {
  clearTimeout(searchT);
  searchT = setTimeout(async () => {
    const q = $('f-desc').value.trim();
    const box = $('f-results');
    if (S.food && q !== S.food.n) setFood(null);
    if (q.length < 2) { box.hidden = true; return; }
    await loadFoods();
    const hits = searchFoods(q);
    if (!hits.length) { box.hidden = true; return; }
    box.innerHTML = hits.map((f, i) => `<button type="button" data-i="${i}">${esc(f.n)}${f.kcal != null ? `<small>${Math.round(f.kcal)} kcal per 100 g</small>` : ''}</button>`).join('')
      + `<button type="button" data-free="1"><small>Bruk «${esc(q)}» som fritekst</small></button>`;
    box.hidden = false;
    box.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        box.hidden = true;
        if (b.dataset.free) { setFood(null); return; }
        const f = hits[+b.dataset.i];
        $('f-desc').value = f.n; S.snapshot = null; setFood(f);
      };
    });
  }, 120);
});

function setFood(f, entry = null) {
  S.food = f;
  $('f-food').hidden = !f;
  $('f-amount-wrap').hidden = !!f;
  if (!f) { S.portion = null; return; }
  $('f-food-name').textContent = '🔗 ' + f.n;
  const portions = [...(f.por || []), ['100 g', 100]];
  if (!portions.some((p) => p[0] === 'gram')) portions.push(['gram', 1]);
  $('f-portions').innerHTML = portions.map(([n, g], i) => `<button type="button" class="chip" data-i="${i}">${esc(n)}${g !== 1 && g !== 100 ? ` (${num(g)} g)` : ''}</button>`).join('');
  const chips = [...$('f-portions').querySelectorAll('.chip')];
  const choose = (i, keepQty = false) => {
    S.portion = portions[i];
    chips.forEach((c, j) => c.classList.toggle('on', j === i));
    if (S.portion[0] === 'gram') { $('f-qty').value = $('f-grams').value || 100; }
    else if (!keepQty) $('f-qty').value = S.portion[0] === '100 g' ? 1 : ($('f-qty').value || 1);
    syncGrams();
  };
  chips.forEach((c, i) => { c.onclick = () => choose(i); });

  if (entry?.amount_g) {
    // Prøv å gjenkjenne porsjonen fra portion_text, ellers vis gram
    const m = /^([\d.,]+)\s+(.+)$/.exec(entry.portion_text || '');
    const pi = m ? portions.findIndex((p) => p[0] === m[2]) : -1;
    if (pi >= 0) { $('f-qty').value = m[1].replace(',', '.'); choose(pi, true); }
    else { $('f-qty').value = entry.amount_g; choose(portions.findIndex((p) => p[0] === 'gram'), true); }
  } else {
    $('f-qty').value = 1; choose(0);
  }
}

function syncGrams() {
  if (!S.portion) return;
  const q = parseFloat(String($('f-qty').value).replace(',', '.')) || 0;
  $('f-grams').value = Math.round(q * S.portion[1] * 10) / 10 || '';
  S.snapshot = null; showNutri();
}
$('f-qty').addEventListener('input', syncGrams);
$('f-grams').addEventListener('input', () => {
  // Skriver man gram direkte, bytter vi til «gram»
  const chips = [...$('f-portions').querySelectorAll('.chip')];
  const gi = chips.findIndex((c) => c.textContent === 'gram');
  chips.forEach((c, j) => c.classList.toggle('on', j === gi));
  S.portion = ['gram', 1];
  $('f-qty').value = $('f-grams').value;
  S.snapshot = null; showNutri();
});
function currentNutri() {
  const g = parseFloat($('f-grams').value);
  if (S.food && S.food.kcal != null && g) return nutrientsFor(S.food, g);
  return S.snapshot;
}
function showNutri() {
  const n = currentNutri();
  $('f-nutri').textContent = n && n.kcal != null
    ? `${Math.round(n.kcal)} kcal · protein ${num(n.protein_g, 1)} g · fett ${num(n.fat_g, 1)} g · karbo ${num(n.carbs_g, 1)} g`
    : '';
  $('f-nutri').hidden = !settings.nutrition;
}
$('f-food-clear').onclick = () => { setFood(null); S.snapshot = null; };

$('f-date').addEventListener('change', autoMeal);
$('f-time').addEventListener('change', autoMeal);
function autoMeal() { if (!S.mealTouched && $('f-date').value && $('f-time').value) { S.meal = guessMeal(fromKeys($('f-date').value, $('f-time').value)); renderMealChips(); } }

$('sheet-cancel').onclick = () => $('sheet').close();
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) $('sheet').close(); });

$('entry-form').onsubmit = async (e) => {
  e.preventDefault();
  const desc = $('f-desc').value.trim();
  if (!desc) { $('f-desc').focus(); return; }
  const when = fromKeys($('f-date').value, $('f-time').value);
  if (when > new Date(Date.now() + 5 * 60000)) { toast('Tidspunktet er frem i tid.'); return; }
  const grams = S.food ? parseFloat($('f-grams').value) || null : null;
  const n = S.food ? (currentNutri() || {}) : {};
  let portion_text = $('f-amount-text').value.trim() || null;
  if (S.food && S.portion) {
    const q = num(parseFloat($('f-qty').value), 1);
    portion_text = S.portion[0] === 'gram' ? null : S.portion[0] === '100 g' ? null : `${q} ${S.portion[0]}`;
  }
  const entry = {
    eaten_at: when.toISOString(), meal_type: S.meal, description: desc,
    food_id: S.food?.id || null, amount_g: grams, portion_text,
    kcal: n.kcal ?? null, protein_g: n.protein_g ?? null, fat_g: n.fat_g ?? null, carbs_g: n.carbs_g ?? null, fiber_g: n.fiber_g ?? null,
    note: $('f-note').value.trim() || null,
  };
  const btn = $('sheet-save'); btn.disabled = true;
  try {
    if (S.editing) await S.store.update(S.editing.id, entry); else await S.store.add(entry);
    $('sheet').close();
    toast(S.editing ? 'Endret ✓' : 'Lagret ✓');
    S.day = startOfDay(when);
    if (S.view !== 'day') show('day'); else renderDay();
  } catch (ex) { toast(ex.message); }
  finally { btn.disabled = false; }
};

$('f-delete').onclick = async () => {
  if (!S.editing) return;
  if (!confirm('Slette denne registreringen?')) return;
  try { await S.store.remove(S.editing.id); $('sheet').close(); toast('Slettet'); renderDay(); }
  catch (ex) { toast(ex.message); }
};

$('tab-add').onclick = () => {
  if (S.subject) { S.subject = null; toast('Du registrerer i din egen dagbok'); if (S.view === 'day') renderDay(); }
  openSheet();
};
document.querySelectorAll('.tabbar [data-view]').forEach((b) => { b.onclick = () => show(b.dataset.view); });

// ---------- Rapport ----------
function reportPeriod() {
  const today = startOfDay(new Date());
  if (S.reportRange === 'custom') {
    const f = $('report-from').value ? fromKeys($('report-from').value, '00:00') : addDays(today, -6);
    const t = $('report-to').value ? fromKeys($('report-to').value, '00:00') : today;
    return f <= t ? [f, addDays(t, 1)] : [t, addDays(f, 1)];
  }
  return [addDays(today, -(+S.reportRange - 1)), addDays(today, 1)];
}
let reportRows = [];
const reportName = () => S.subject?.owner_name || settings.name;
async function renderReport() {
  renderWho();
  const [from, to] = reportPeriod();
  $('report-custom').hidden = S.reportRange !== 'custom';
  $('report-body').innerHTML = '<p class="muted center">Henter …</p>';
  try { reportRows = await S.store.list(from, to, S.subject?.owner_id); }
  catch (ex) { $('report-body').innerHTML = `<p class="error">${esc(ex.message)}</p>`; return; }
  $('report-body').innerHTML = renderReportHTML(reportRows, from, to);
}
$('report-range').querySelectorAll('button').forEach((b) => {
  b.onclick = () => {
    S.reportRange = b.dataset.range;
    $('report-range').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (S.reportRange === 'custom' && !$('report-from').value) {
      $('report-to').value = dayKey(new Date()); $('report-from').value = dayKey(addDays(new Date(), -6));
    }
    renderReport();
  };
});
$('report-from').onchange = renderReport;
$('report-to').onchange = renderReport;
$('share-pdf').onclick = async () => {
  const [from, to] = reportPeriod();
  if (!reportRows.length) { toast('Ingen registreringer å dele.'); return; }
  try { await shareFile(buildPDF(reportRows, from, to, reportName()), fileName(reportName(), from, to, 'pdf'), 'application/pdf'); }
  catch (ex) { toast(ex.message); }
};
$('share-csv').onclick = async () => {
  const [from, to] = reportPeriod();
  if (!reportRows.length) { toast('Ingen registreringer å dele.'); return; }
  await shareFile(new Blob([buildCSV(reportRows)], { type: 'text/csv' }), fileName(reportName(), from, to, 'csv'), 'text/csv');
};

// ---------- Innstillinger ----------
function renderSettings() {
  $('set-nutrition').checked = settings.nutrition;
  $('set-name').value = settings.name;
  $('set-account').textContent = S.store.demo ? 'Demomodus: data lagres bare på denne telefonen.' : `Innlogget som ${S.user?.email || ''}`;
  $('set-logout').hidden = S.store.demo;
  renderShare();
  const st = foodsStatus();
  $('set-foods').textContent = st.count
    ? `Matvaretabellen: ${st.count} matvarer${st.at ? ', hentet ' + st.at.toLocaleDateString('nb-NO') : ''}.`
    : 'Matvaretabellen er ikke lastet ennå (krever nett første gang).';
}
async function renderShare() {
  $('share-card').hidden = S.store.demo;
  if (S.store.demo) return;
  await refreshLinks();
  const row = (label, own, view) => `<div class="link-row"><span>${esc(label)}</span><button class="link small danger" data-o="${own}" data-v="${view}">Fjern</button></div>`;
  $('share-seenby').innerHTML = S.links.seenBy.length
    ? '<p class="small muted">Har tilgang til dagboken din:</p>' + S.links.seenBy.map((l) => row(l.viewer_email || 'Forelder', l.owner_id, l.viewer_id)).join('')
    : '';
  $('share-cansee').innerHTML = S.links.canSee.length
    ? '<p class="small muted">Du kan se dagboken til:</p>' + S.links.canSee.map((l) => row(l.owner_name, l.owner_id, l.viewer_id)).join('')
    : '';
  document.querySelectorAll('#share-seenby [data-o], #share-cansee [data-o]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Fjerne denne tilgangen?')) return;
      try { await S.store.removeLink(b.dataset.o, b.dataset.v); toast('Tilgang fjernet'); renderShare(); } catch (ex) { toast(ex.message); }
    };
  });
}
$('share-make').onclick = async () => {
  let name = settings.name;
  if (!name) {
    name = (prompt('Hva heter du? Navnet vises for forelderen.') || '').trim();
    if (!name) return;
    settings.name = name; saveSettings(); $('set-name').value = name;
  }
  try {
    const code = await S.store.createCode(name);
    $('share-code').innerHTML = `${code}<small>Gi koden til forelderen. Den virker i 24 timer.</small>`;
    $('share-code').hidden = false;
  } catch (ex) { toast(ex.message); }
};
$('share-accept').onclick = async () => {
  const code = $('share-input').value.trim().toUpperCase();
  if (code.length !== 6) { toast('Koden har 6 tegn.'); return; }
  try {
    const name = await S.store.acceptCode(code);
    $('share-input').value = '';
    await refreshLinks();
    S.subject = S.links.canSee.find((l) => l.owner_name === name) || S.subject;
    toast(`Koblet til ${name} ✓`); renderShare();
  } catch (ex) { toast(ex.message); }
};
$('set-nutrition').onchange = (e) => { settings.nutrition = e.target.checked; saveSettings(); };
$('set-name').oninput = (e) => { settings.name = e.target.value.trim(); saveSettings(); };
$('set-reload-foods').onclick = async () => {
  toast('Henter matvaretabellen …');
  const n = await loadFoods(true);
  renderSettings();
  toast(n ? `${n} matvarer lastet ✓` : 'Fikk ikke hentet matvaretabellen.');
};
$('set-logout').onclick = async () => {
  await S.store.signOut(); S.user = null; S.subject = null; $('share-code').hidden = true; S.links = { canSee: [], seenBy: [] }; show('login');
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.view === 'day' && S.user) {
    // Ny dag siden sist? Hopp til i dag.
    if (S._lastSeen && dayKey(S._lastSeen) !== dayKey(new Date()) && dayKey(S.day) === dayKey(S._lastSeen)) S.day = startOfDay(new Date());
    renderDay();
  }
  S._lastSeen = new Date();
});
S._lastSeen = new Date();

start();
