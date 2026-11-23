// Matvaretabellen (Mattilsynet): henter, forenkler og mellomlagrer matvarer for søk.
// Data oppdateres årlig, så vi lagrer en kompakt kopi lokalt i opptil 30 dager.
const SOURCES = [
  'https://www.matvaretabellen.no/api/nb/foods.json',
  './foods.min.json', // reserve: lag med tools/hent-matvaretabell.mjs hvis direkte henting blokkeres
];
const CACHE_KEY = 'matdagbok-foods-v1';
const MAX_AGE = 30 * 24 * 3600 * 1000;

let foods = [];
let loading = null;

const norm = (s) => s.toLowerCase()
  .replace(/[éèêë]/g, 'e').replace(/[áàâä]/g, 'a').replace(/[óòôö]/g, 'o').replace(/[üúù]/g, 'u').replace(/[íìï]/g, 'i');

function compact(raw) {
  const list = raw.foods || raw;
  return list.map((f) => {
    if (f.n) return f; // allerede kompakt
    const c = Object.fromEntries((f.constituents || []).filter((x) => x.quantity != null).map((x) => [x.nutrientId, x.quantity]));
    return {
      id: f.foodId, n: f.foodName, k: (f.searchKeywords || []).join(' '),
      kcal: f.calories?.quantity ?? null, p: c.Protein ?? null, f: c.Fett ?? null, c: c.Karbo ?? null, fi: c.Fiber ?? null,
      por: (f.portions || []).filter((p) => p.unit === 'g').map((p) => [p.portionName, p.quantity]),
    };
  });
}

function index(list) {
  foods = list.map((f) => ({ ...f, _s: norm(`${f.n} ${f.k || ''}`), _n: norm(f.n) }));
}

export function foodsStatus() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (c) return { count: c.list.length, at: new Date(c.at) };
  } catch {}
  return { count: foods.length, at: null };
}

export async function loadFoods(force = false) {
  if (loading && !force) return loading;
  loading = (async () => {
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (c?.list?.length) { index(c.list); if (Date.now() - c.at < MAX_AGE) return foods.length; }
      } catch {}
    }
    for (const url of SOURCES) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) continue;
        const list = compact(await res.json());
        if (!list.length) continue;
        index(list);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list })); } catch {}
        return foods.length;
      } catch { /* prøv neste kilde */ }
    }
    return foods.length;
  })();
  return loading;
}

export function searchFoods(q, limit = 12) {
  const terms = norm(q).split(/[\s,]+/).filter(Boolean);
  if (!terms.length || !foods.length) return [];
  const out = [];
  for (const f of foods) {
    if (!terms.every((t) => f._s.includes(t))) continue;
    let score = 0;
    if (f._n.startsWith(terms[0])) score += 10;
    if (f._n.split(/[\s,]+/).some((w) => w.startsWith(terms[0]))) score += 4;
    score -= f.n.length / 40;
    out.push([score, f]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}

export function getFood(id) { return foods.find((f) => f.id === id) || null; }

export function nutrientsFor(food, grams) {
  if (!food || !grams) return null;
  const k = grams / 100;
  const r = (v) => (v == null ? null : Math.round(v * k * 10) / 10);
  return { kcal: r(food.kcal), protein_g: r(food.p), fat_g: r(food.f), carbs_g: r(food.c), fiber_g: r(food.fi) };
}
