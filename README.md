# Matdagbok for Iris

En enkel app for iPhone der Iris registrerer hva hun spiser (dato, klokkeslett, måltid og hva),
med kobling til Matvaretabellen og rapporter som kan deles som PDF eller regneark.

Appen er en webapp (PWA): den åpnes i Safari og legges på hjemskjermen, og ser da ut og
oppfører seg som en vanlig app. Ingen App Store nødvendig.

## Hva appen gjør

- **Dagbok**: dagens registreringer gruppert per måltid. Bla mellom dager med pilene eller ved å sveipe.
- **Legg til (+)**: dato og klokkeslett er forhåndsutfylt, måltid foreslås ut fra klokkeslettet.
  Søk i Matvaretabellen (f.eks. «brød», «eple») og velg porsjon (skive, dl, stk …), eller skriv fritekst.
  «Nylig brukt» gjør det raskt å registrere det samme igjen.
- **Rapport**: 7, 14, 30 dager eller valgfri periode. Del som PDF eller CSV (åpnes i Excel/Numbers)
  via iPhone-delingsarket: Meldinger, Mail, AirDrop, Filer osv.
- **Innstillinger**: skru av/på visning av kalorier i dagboken, navn, logg ut.
- **Foreldretilgang**: Iris trykker «Lag kode til en forelder» i Innstillinger og får en 6-tegns kode (gyldig i 24 timer).
  Forelderen lager sin egen konto, skriver inn koden og kan da se dagboken og rapportene hennes (bare lesing).
  Begge kan fjerne tilgangen når som helst.

## Oppsett (ca. 15 minutter)

### 1. Database i Supabase
1. Åpne prosjektet i Supabase → **SQL Editor** → **New query**.
2. Lim inn hele `supabase.sql` og trykk **Run**.
3. **Authentication → Providers → Email**: la e-post være på. Vil du slippe bekreftelses-e-post,
   slå av «Confirm email».
4. **Project Settings → API**: kopier **anon / publishable**-nøkkelen (IKKE `service_role`).
5. Lim nøkkelen inn i `config.js` (`SUPABASE_ANON_KEY`). Den publishable-nøkkelen er laget for å ligge åpent i en app; dataene beskyttes av tilgangsreglene i databasen.

Tabellen har Row Level Security: hver bruker ser bare sine egne registreringer.

### 2. Legge appen på nett (GitHub Pages)
1. I repoet på GitHub: **Settings → Pages**.
2. Under «Build and deployment»: Source = **Deploy from a branch**, Branch = **main**, mappe **/ (root)** → **Save**.
3. Etter 1–2 minutter ligger appen på https://lovenskioldeiendom.github.io/matdagbok/
4. I Supabase: **Authentication → URL Configuration** → sett Site URL til adressen over
   (så lenker i bekreftelses-e-post går til appen).

Endringer som pushes til `main` publiseres automatisk.

### 3. På Iris sin iPhone
1. Åpne adressen i **Safari**.
2. Trykk Del-knappen → **Legg til på Hjem-skjerm**.
3. Åpne appen fra hjemskjermen, lag konto/logg inn.

## Demomodus
Uten nøkkel i `config.js` kjører appen i demomodus og lagrer bare på telefonen. Fint for å prøve.

## Matvaretabellen
Appen henter matvarene fra Mattilsynets åpne API (matvaretabellen.no/api) og lagrer en kompakt
kopi på telefonen i 30 dager. Mattilsynet ber om at Matvaretabellen oppgis som kilde, og det står
i appen og på rapportene. Skulle direkte henting blokkeres i nettleseren, kjør
`node tools/hent-matvaretabell.mjs` før publisering; da brukes `foods.min.json` i stedet.

## Filer
| Fil | Innhold |
|---|---|
| `index.html`, `styles.css` | Skjermbilder og utseende |
| `app.js` | Logikk for dagbok, registrering, rapport og innstillinger |
| `data.js` | Lagring (Supabase eller lokalt) og innlogging |
| `foods.js` | Søk og næringsberegning fra Matvaretabellen |
| `report.js` | Rapport, PDF, CSV og deling |
| `sw.js`, `manifest.webmanifest`, `icons/` | Gjør den installerbar på hjemskjermen |
| `supabase.sql` | Databasetabell og tilgangsregler |
