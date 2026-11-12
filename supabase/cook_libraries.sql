-- CookCasting: бібліотека рецептів у хмарі.
-- Акаунти спільні з MovieCasting (той самий проєкт Supabase), дані рецептів — в окремій таблиці.
-- Виконайте один раз: Supabase → SQL Editor → New query → вставити → Run.

create table if not exists public.cook_libraries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cook_libraries enable row level security;

drop policy if exists "own cook library: select" on public.cook_libraries;
drop policy if exists "own cook library: insert" on public.cook_libraries;
drop policy if exists "own cook library: update" on public.cook_libraries;
drop policy if exists "own cook library: delete" on public.cook_libraries;

create policy "own cook library: select" on public.cook_libraries for select using (auth.uid() = user_id);
create policy "own cook library: insert" on public.cook_libraries for insert with check (auth.uid() = user_id);
create policy "own cook library: update" on public.cook_libraries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own cook library: delete" on public.cook_libraries for delete using (auth.uid() = user_id);
