// Datalag: Supabase når nøkkel finnes, ellers lokal lagring (demomodus).
import { CONFIG } from './config.js';

const FIELDS = ['eaten_at', 'meal_type', 'description', 'food_id', 'amount_g', 'portion_text',
  'kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'note'];
const pick = (o) => Object.fromEntries(FIELDS.map((k) => [k, o[k] ?? null]));

export async function createStore() {
  if (CONFIG.SUPABASE_ANON_KEY) return createSupabaseStore();
  return createLocalStore();
}

async function createSupabaseStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'matdagbok-auth' },
  });
  const check = ({ data, error }) => { if (error) throw new Error(norskFeil(error.message)); return data; };

  return {
    demo: false,
    async user() { const { data } = await sb.auth.getSession(); return data.session?.user ?? null; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null)); },
    async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password) {
      const data = check(await sb.auth.signUp({ email, password }));
      return { needsConfirm: !data.session };
    },
    async signOut() { await sb.auth.signOut(); },
    // ownerId: hvem sine registreringer (standard: min egen)
    async list(from, to, ownerId = null) {
      const uid = ownerId || (await this.user())?.id;
      return check(await sb.from('food_entries').select('*').eq('user_id', uid)
        .gte('eaten_at', from.toISOString()).lt('eaten_at', to.toISOString())
        .order('eaten_at', { ascending: true }));
    },
    async recent(limit = 200) {
      const uid = (await this.user())?.id;
      return check(await sb.from('food_entries').select('description,food_id,amount_g,portion_text,meal_type,kcal,protein_g,fat_g,carbs_g,fiber_g')
        .eq('user_id', uid).order('eaten_at', { ascending: false }).limit(limit));
    },
    // Foreldretilgang
    async links() {
      const uid = (await this.user())?.id;
      const rows = check(await sb.from('viewers').select('*'));
      return { canSee: rows.filter((r) => r.viewer_id === uid), seenBy: rows.filter((r) => r.owner_id === uid) };
    },
    async createCode(ownerName) {
      const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => abc[b % abc.length]).join('');
      check(await sb.from('share_codes').insert({ code, owner_name: ownerName }));
      return code;
    },
    async acceptCode(code) { return check(await sb.rpc('accept_share_code', { p_code: code })); },
    async removeLink(ownerId, viewerId) {
      check(await sb.from('viewers').delete().eq('owner_id', ownerId).eq('viewer_id', viewerId));
    },
    async add(e) { return check(await sb.from('food_entries').insert(pick(e)).select().single()); },
    async update(id, e) { return check(await sb.from('food_entries').update(pick(e)).eq('id', id).select().single()); },
    async remove(id) { check(await sb.from('food_entries').delete().eq('id', id)); },
  };
}

function norskFeil(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'Feil e-post eller passord.';
  if (/Email not confirmed/i.test(msg)) return 'E-posten er ikke bekreftet ennå. Sjekk innboksen.';
  if (/already registered/i.test(msg)) return 'Det finnes allerede en konto med denne e-posten.';
  if (/Password should be/i.test(msg)) return 'Passordet må ha minst 6 tegn.';
  if (/rate limit/i.test(msg)) return 'For mange e-poster sendt den siste timen. Slå av «Confirm email» i Supabase (Authentication → Sign In / Providers → Email), eller vent en time.';
  if (/Error sending confirmation|sending.*email/i.test(msg)) return 'Supabase klarte ikke å sende bekreftelses-e-post. Slå av «Confirm email» i Supabase (Authentication → Sign In / Providers → Email).';
  if (/signups? (not allowed|is disabled|are disabled)/i.test(msg)) return 'Nye kontoer er slått av i Supabase. Slå på «Allow new users to sign up» under Authentication → Sign In / Providers.';
  if (/Unable to validate email|invalid format|is invalid/i.test(msg)) return 'E-postadressen ble ikke godtatt. Sjekk at den er skrevet riktig.';
  if (/weak|Password should contain|known to be weak/i.test(msg)) return 'Passordet er for svakt. Bruk minst 8 tegn med både bokstaver og tall.';
  if (/Invalid API key|No API key|apikey/i.test(msg)) return 'Supabase-nøkkelen ble ikke godtatt. Sjekk nøkkelen i config.js.';
  if (/permission denied/i.test(msg)) return 'Databasen mangler tilgang. Kjør den nyeste supabase.sql i Supabase (SQL Editor).';
  if (/Could not find the '.*' column|column .* does not exist/i.test(msg)) return 'Tabellen i databasen har feil kolonner. Kjør den nyeste supabase.sql i Supabase. (' + msg + ')';
  if (/row-level security/i.test(msg)) return 'Databasen avviste lagringen (tilgangsregler). Logg ut og inn igjen, eller kjør supabase.sql på nytt.';
  if (/relation .* does not exist|Could not find the (table|function)/i.test(msg)) return 'Databasen er ikke satt opp ennå (kjør supabase.sql).';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Ingen nettforbindelse. Prøv igjen.';
  return `Noe gikk galt: ${msg}`;
}

function createLocalStore() {
  const KEY = 'matdagbok-demo-entries';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = (rows) => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch {} };
  const demoUser = { id: 'demo', email: 'demo (lagres på telefonen)' };
  return {
    demo: true,
    async user() { return demoUser; },
    onAuth() {},
    async signIn() {}, async signUp() { return {}; }, async signOut() {},
    async list(from, to) {
      return load().filter((r) => { const t = new Date(r.eaten_at); return t >= from && t < to; })
        .sort((a, b) => a.eaten_at.localeCompare(b.eaten_at));
    },
    async links() { return { canSee: [], seenBy: [] }; },
    async createCode() { throw new Error('Foreldretilgang krever innlogging (ikke demomodus).'); },
    async acceptCode() { throw new Error('Foreldretilgang krever innlogging (ikke demomodus).'); },
    async removeLink() {},
    async recent() { return load().sort((a, b) => b.eaten_at.localeCompare(a.eaten_at)).slice(0, 200); },
    async add(e) {
      const row = { ...pick(e), id: crypto.randomUUID(), created_at: new Date().toISOString() };
      save([...load(), row]); return row;
    },
    async update(id, e) {
      const rows = load(); const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows[i] = { ...rows[i], ...pick(e) }; save(rows); return rows[i];
    },
    async remove(id) { save(load().filter((r) => r.id !== id)); },
  };
}
