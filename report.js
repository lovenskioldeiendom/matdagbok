// Rapporter: oppsummering per dag, PDF og CSV, deling via iPhone-delingsarket.
import { MEALS, fmtDate, fmtTime, dayKey, esc, num } from './util.js';

export function groupByDay(rows) {
  const days = new Map();
  for (const r of rows) {
    const k = dayKey(new Date(r.eaten_at));
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(r);
  }
  return [...days.entries()].map(([key, items]) => ({ key, items, tot: totals(items) }));
}

export function totals(items) {
  const t = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0, known: 0, count: items.length };
  for (const r of items) {
    if (r.kcal != null) t.known++;
    for (const k of ['kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g']) t[k] += Number(r[k] || 0);
  }
  return t;
}

const amount = (r) => [r.portion_text, r.amount_g ? `${num(r.amount_g)} g` : ''].filter(Boolean).join(' · ');

export function renderReportHTML(rows, from, to) {
  const days = groupByDay(rows);
  if (!days.length) return `<div class="empty"><div class="big">🗓️</div>Ingen registreringer i perioden.</div>`;
  const nDays = Math.round((to - from) / 86400000);
  const daysWithData = days.length;
  const all = totals(rows);
  const head = `
    <div class="summary">
      <div class="pill"><b>${daysWithData}/${nDays}</b><span>dager registrert</span></div>
      <div class="pill"><b>${num(rows.length / daysWithData, 1)}</b><span>registreringer per dag</span></div>
      ${all.known ? `<div class="pill"><b>${Math.round(all.kcal / daysWithData)}</b><span>kcal per dag (snitt)</span></div>` : ''}
    </div>`;
  const body = days.slice().reverse().map((d) => `
    <div class="report-day">
      <h4>${esc(fmtDate(new Date(d.items[0].eaten_at), true))}<span>${d.tot.known ? Math.round(d.tot.kcal) + ' kcal' : ''}</span></h4>
      <table class="report-table">${d.items.map((r) => `
        <tr><td>${fmtTime(new Date(r.eaten_at))}</td>
            <td><b>${esc(r.description)}</b><br><span class="muted small">${esc(MEALS[r.meal_type]?.label || '')}${amount(r) ? ' · ' + esc(amount(r)) : ''}${r.note ? ' · ' + esc(r.note) : ''}</span></td>
            <td>${r.kcal != null ? Math.round(r.kcal) : ''}</td></tr>`).join('')}
      </table>
    </div>`).join('');
  return head + body;
}

function fileName(name, from, to, ext) {
  const f = dayKey(from), t = dayKey(new Date(to - 1));
  return `Matdagbok${name ? '-' + name.replace(/[^\wæøåÆØÅ-]/g, '') : ''}_${f}_${t}.${ext}`;
}

export function buildCSV(rows) {
  const cols = ['Dato', 'Klokkeslett', 'Måltid', 'Hva', 'Mengde', 'Gram', 'kcal', 'Protein (g)', 'Fett (g)', 'Karbohydrat (g)', 'Fiber (g)', 'Kommentar', 'Matvare-id'];
  const q = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const dec = (v) => (v == null ? '' : String(v).replace('.', ','));
  const lines = rows.map((r) => {
    const d = new Date(r.eaten_at);
    return [dayKey(d), fmtTime(d), MEALS[r.meal_type]?.label, r.description, r.portion_text, dec(r.amount_g),
      dec(r.kcal), dec(r.protein_g), dec(r.fat_g), dec(r.carbs_g), dec(r.fiber_g), r.note, r.food_id].map(q).join(';');
  });
  // Semikolon og BOM gjør at norsk Excel/Numbers åpner filen riktig.
  return '﻿' + [cols.join(';'), ...lines].join('\r\n');
}

export function buildPDF(rows, from, to, name) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('PDF-verktøyet er ikke lastet. Sjekk nettforbindelsen.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const last = new Date(to - 1);
  doc.setFontSize(18);
  doc.text(`Matdagbok${name ? ' for ' + name : ''}`, 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(`${fmtDate(from, true)} – ${fmtDate(last, true)}`, 14, 25);
  const days = groupByDay(rows);
  const all = totals(rows);
  const nDays = Math.round((to - from) / 86400000);
  let summary = `${days.length} av ${nDays} dager registrert · ${rows.length} registreringer`;
  if (all.known && days.length) summary += ` · snitt ${Math.round(all.kcal / days.length)} kcal per registrerte dag`;
  doc.text(summary, 14, 31);
  doc.setTextColor(0);

  const body = [];
  for (const d of days) {
    body.push([{ content: fmtDate(new Date(d.items[0].eaten_at), true) + (d.tot.known ? `   (${Math.round(d.tot.kcal)} kcal, P ${num(d.tot.protein_g)} g, F ${num(d.tot.fat_g)} g, K ${num(d.tot.carbs_g)} g)` : ''),
      colSpan: 5, styles: { fillColor: [253, 230, 232], fontStyle: 'bold' } }]);
    for (const r of d.items) {
      body.push([fmtTime(new Date(r.eaten_at)), MEALS[r.meal_type]?.label || '',
        r.description + (r.note ? `\n${r.note}` : ''), amount(r), r.kcal != null ? String(Math.round(r.kcal)) : '']);
    }
  }
  doc.autoTable({
    startY: 37,
    head: [['Kl.', 'Måltid', 'Hva', 'Mengde', 'kcal']],
    body,
    styles: { fontSize: 9.5, cellPadding: 2, valign: 'top' },
    headStyles: { fillColor: [232, 99, 111] },
    columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 26 }, 3: { cellWidth: 34 }, 4: { cellWidth: 14, halign: 'right' } },
    didDrawPage: () => {
      doc.setFontSize(8); doc.setTextColor(140);
      doc.text('Næringsdata: Matvaretabellen, Mattilsynet. Laget med Matdagbok.', 14, 290);
      doc.setTextColor(0);
    },
  });
  return doc.output('blob');
}

export async function shareFile(blob, name, type) {
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export { fileName };
