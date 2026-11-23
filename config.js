// Innstillinger for appen.
// Lim inn "anon"/"publishable" nøkkelen fra Supabase (Project Settings → API).
// IKKE bruk service_role-nøkkelen her: den gir full tilgang og skal aldri ligge i en app.
// Så lenge nøkkelen er tom, kjører appen i demomodus og lagrer bare på telefonen.
export const CONFIG = {
  SUPABASE_URL: 'https://fnyftcopnxqndhetcyjn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_NtzFhXCQwVTPTP1pISdxwQ_UnHpYs5b',
  APP_NAME: 'Iris sin matdagbok',
};
