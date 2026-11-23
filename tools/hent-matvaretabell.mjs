// Lager foods.min.json (kompakt kopi av Matvaretabellen) ved siden av appen.
// Trengs bare hvis appen ikke får hentet matvaretabellen direkte (f.eks. CORS-blokkering).
// Kjør: node tools/hent-matvaretabell.mjs   (Node 18+)
import { writeFileSync } from 'node:fs';
const res = await fetch('https://www.matvaretabellen.no/api/nb/foods.json');
if (!res.ok) throw new Error('Feil ' + res.status);
const { foods } = await res.json();
const list = foods.map((f) => {
  const c = Object.fromEntries((f.constituents || []).filter((x) => x.quantity != null).map((x) => [x.nutrientId, x.quantity]));
  return {
    id: f.foodId, n: f.foodName, k: (f.searchKeywords || []).join(' '),
    kcal: f.calories?.quantity ?? null, p: c.Protein ?? null, f: c.Fett ?? null, c: c.Karbo ?? null, fi: c.Fiber ?? null,
    por: (f.portions || []).filter((p) => p.unit === 'g').map((p) => [p.portionName, p.quantity]),
  };
});
writeFileSync(new URL('../foods.min.json', import.meta.url), JSON.stringify(list));
console.log(`Lagret ${list.length} matvarer i foods.min.json`);
