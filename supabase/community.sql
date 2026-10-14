-- Ejecutar en el editor SQL de Supabase. Requiere activar Anonymous Sign-Ins en Auth.
create table if not exists public.community_chargers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null check (char_length(name) between 3 and 120),
 address text not null default '',
 instructions text not null check (char_length(instructions) between 10 and 2000),
 lat double precision not null check (lat between -90 and 90),
 lng double precision not null check (lng between -180 and 180),
 power_kw numeric not null check (power_kw > 0 and power_kw <= 500),
 connector text not null check (connector in ('Tipo2','CCS','CHAdeMO')),
 created_at timestamptz not null default now(),
 hidden boolean not null default false
);
create table if not exists public.community_votes (
 charger_id uuid not null references public.community_chargers(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 verdict text not null check (verdict in ('confirmed','incorrect')),
 comment text not null default '' check (char_length(comment) <= 500),
 updated_at timestamptz not null default now(),
 primary key(charger_id,user_id)
);
alter table public.community_chargers enable row level security;
alter table public.community_votes enable row level security;
drop policy if exists community_read on public.community_chargers;
create policy community_read on public.community_chargers for select using (not hidden);
drop policy if exists community_create on public.community_chargers;
create policy community_create on public.community_chargers for insert to authenticated with check (owner_id=auth.uid() and not hidden);
drop policy if exists votes_read on public.community_votes;
create policy votes_read on public.community_votes for select using (true);
drop policy if exists votes_create on public.community_votes;
create policy votes_create on public.community_votes for insert to authenticated with check (user_id=auth.uid());
drop policy if exists votes_update on public.community_votes;
create policy votes_update on public.community_votes for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create index if not exists community_votes_charger_idx on public.community_votes(charger_id);
create index if not exists community_chargers_created_idx on public.community_chargers(created_at desc);
-- Los cargadores de la comunidad son informativos; no pasan al planificador hasta revisión.
