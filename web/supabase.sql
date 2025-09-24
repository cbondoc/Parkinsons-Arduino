-- Enable required extensions
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- Table to store EMG readings
create table if not exists public.emg_readings (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  value_mv double precision not null,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists emg_readings_created_at_idx on public.emg_readings (created_at desc);
create index if not exists emg_readings_device_created_idx on public.emg_readings (device_id, created_at desc);

-- Row Level Security
alter table public.emg_readings enable row level security;

-- Policies: allow read to everyone (anon) for this demo
drop policy if exists "Read EMG" on public.emg_readings;
create policy "Read EMG" on public.emg_readings
  for select
  to anon
  using (true);

-- Allow inserts from anon (Arduino via anon key)
drop policy if exists "Insert EMG" on public.emg_readings;
create policy "Insert EMG" on public.emg_readings
  for insert
  to anon
  with check (true);

-- Retention: delete rows older than 1 month, daily at 00:10 UTC
-- Requires pg_cron (enabled above) and supabase to allow cron schema
grant usage on schema cron to postgres, anon, authenticated;
select cron.schedule(
  'emg_retention_monthly',            -- job name
  '10 0 * * *',                       -- every day at 00:10 UTC
  $$ delete from public.emg_readings where created_at < now() - interval '1 month'; $$
);


