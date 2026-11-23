export const MEALS = {
  frokost: { label: 'Frokost', icon: '🥣' },
  lunsj: { label: 'Lunsj', icon: '🥪' },
  middag: { label: 'Middag', icon: '🍝' },
  kveldsmat: { label: 'Kveldsmat', icon: '🌙' },
  mellommaltid: { label: 'Mellommåltid', icon: '🍎' },
};

// Foreslår måltid ut fra klokkeslettet
export function guessMeal(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 10) return 'frokost';
  if (h >= 10.75 && h < 13.5) return 'lunsj';
  if (h >= 15.5 && h < 18.5) return 'middag';
  if (h >= 19.5 && h < 22.5) return 'kveldsmat';
  return 'mellommaltid';
}

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeKey = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtTime = timeKey;
export function fromKeys(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '12:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}
export function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

export function fmtDate(d, withYear = false) {
  return d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) })
    .replace(/^./, (c) => c.toUpperCase());
}
export function relDay(d) {
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  if (diff === 0) return 'I dag';
  if (diff === -1) return 'I går';
  if (diff === 1) return 'I morgen';
  return null;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v, dec = 0) => (v == null || isNaN(v) ? '' : Number(v).toLocaleString('nb-NO', { maximumFractionDigits: dec }));
