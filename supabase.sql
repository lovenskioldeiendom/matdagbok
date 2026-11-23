-- Kjør dette én gang i Supabase: SQL Editor → New query → lim inn → Run.
-- Lager tabellen for måltider og slår på Row Level Security,
-- slik at hver innlogget bruker bare ser og endrer sine egne registreringer.

create table if not exists public.food_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  eaten_at     timestamptz not null default now(),
  meal_type    text not null default 'mellommaltid'
               check (meal_type in ('frokost','lunsj','middag','kveldsmat','mellommaltid')),
  description  text not null check (char_length(description) between 1 and 300),
  food_id      text,               -- id fra Matvaretabellen (f.eks. '06.178'), null hvis fritekst
  amount_g     numeric(7,1),       -- mengde i gram
  portion_text text,               -- f.eks. '2 skiver' eller '1 dl'
  kcal         numeric(7,1),
  protein_g    numeric(6,1),
  fat_g        numeric(6,1),
  carbs_g      numeric(6,1),
  fiber_g      numeric(6,1),
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists food_entries_user_time_idx
  on public.food_entries (user_id, eaten_at desc);

alter table public.food_entries enable row level security;

drop policy if exists "Les egne"    on public.food_entries;
drop policy if exists "Lag egne"    on public.food_entries;
drop policy if exists "Endre egne"  on public.food_entries;
drop policy if exists "Slett egne"  on public.food_entries;

-- (Les-policyen lages lenger ned, etter tabellen for foreldretilgang)
create policy "Lag egne"   on public.food_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Endre egne" on public.food_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Slett egne" on public.food_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Holder updated_at oppdatert
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists food_entries_touch on public.food_entries;
create trigger food_entries_touch before update on public.food_entries
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Foreldretilgang: Iris lager en kode i appen, forelderen skriver den inn
-- med sin egen innlogging og får lesetilgang til registreringene hennes.
-- =====================================================================

create table if not exists public.share_codes (
  code        text primary key check (code ~ '^[A-Z0-9]{6}$'),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name  text not null check (char_length(owner_name) between 1 and 60),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);
alter table public.share_codes enable row level security;
drop policy if exists "Egne koder" on public.share_codes;
create policy "Egne koder" on public.share_codes for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create table if not exists public.viewers (
  owner_id     uuid not null references auth.users(id) on delete cascade,
  viewer_id    uuid not null references auth.users(id) on delete cascade,
  owner_name   text not null,
  viewer_email text,
  created_at   timestamptz not null default now(),
  primary key (owner_id, viewer_id)
);
alter table public.viewers enable row level security;
drop policy if exists "Se egne koblinger"    on public.viewers;
drop policy if exists "Fjerne egne koblinger" on public.viewers;
create policy "Se egne koblinger" on public.viewers for select to authenticated
  using ((select auth.uid()) in (owner_id, viewer_id));
create policy "Fjerne egne koblinger" on public.viewers for delete to authenticated
  using ((select auth.uid()) in (owner_id, viewer_id));
-- Ingen insert-policy: koblinger lages bare via funksjonen under.

create or replace function public.accept_share_code(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.share_codes;
begin
  if auth.uid() is null then raise exception 'Du må være logget inn'; end if;
  select * into c from public.share_codes
    where code = upper(trim(p_code)) and expires_at > now();
  if not found then raise exception 'Koden er ugyldig eller utløpt'; end if;
  if c.owner_id = auth.uid() then raise exception 'Dette er din egen kode'; end if;
  insert into public.viewers (owner_id, viewer_id, owner_name, viewer_email)
    values (c.owner_id, auth.uid(), c.owner_name, (select email from auth.users where id = auth.uid()))
    on conflict (owner_id, viewer_id) do update set owner_name = excluded.owner_name;
  delete from public.share_codes where code = c.code;
  return c.owner_name;
end $$;
revoke execute on function public.accept_share_code(text) from public, anon;
grant execute on function public.accept_share_code(text) to authenticated;

-- Les egne registreringer, og registreringene til dem som har delt med deg
drop policy if exists "Les egne og delte" on public.food_entries;
create policy "Les egne og delte" on public.food_entries for select to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.viewers v
               where v.owner_id = food_entries.user_id and v.viewer_id = (select auth.uid()))
  );

-- Gir innloggede brukere tilgang til tabellene via appen (tilgangsreglene over gjelder fortsatt)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.food_entries to authenticated;
grant select, insert, delete on public.share_codes to authenticated;
grant select, delete on public.viewers to authenticated;

-- Ber Supabase laste inn tabellene på nytt med en gang
notify pgrst, 'reload schema';
