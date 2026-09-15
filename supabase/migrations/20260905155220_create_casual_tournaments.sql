-- Applied migration version matches Supabase migration history.
-- Deliberately isolated: no foreign key to competitive sessions/matches and no
-- rating triggers. Guests are tournament-local identities, not auth accounts.
create table public.casual_tournaments (
  id uuid primary key,
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 0 check (revision >= 0),
  state jsonb not null check (
    jsonb_typeof(state->'players') = 'array'
    and jsonb_array_length(state->'players') between 4 and 128
    and jsonb_typeof(state->'matches') = 'array'
    and state->>'phase' in ('qualification','playoffs','completed','cancelled')
  )
);
create index casual_tournaments_created_at_idx on public.casual_tournaments (created_at desc, id);
create index casual_tournaments_created_by_idx on public.casual_tournaments (created_by);
alter table public.casual_tournaments enable row level security;
-- All access goes through authenticated web APIs. Client roles cannot mutate
-- tournament JSON, skip qualification, or forge winners directly via REST.
revoke all on public.casual_tournaments from public, anon, authenticated;
grant select, insert, update, delete on public.casual_tournaments to service_role;
comment on table public.casual_tournaments is 'Casual tournaments only. Never included in Elo, rankings, missions or competitive statistics. Server API validates state transitions and uses revision-based compare-and-swap.';
