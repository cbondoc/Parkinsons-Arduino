-- Reset EMG schema objects so you can start fresh
-- Safe to run multiple times

-- 1) Stop retention job (pg_cron)
do $$
begin
  perform 1 from cron.job where jobname = 'emg_retention_monthly';
  if found then
    perform cron.unschedule('emg_retention_monthly');
  end if;
exception when undefined_table then
  -- pg_cron not installed; ignore
  null;
end$$;

-- 2) Drop table (and dependent objects/policies)
drop table if exists public.emg_readings cascade;

-- 3) Optionally drop indexes explicitly (usually covered by cascade)
drop index if exists public.emg_readings_created_at_idx;
drop index if exists public.emg_readings_device_created_idx;

-- 4) (Optional) Clean up RLS policies if any remain (after cascade none should)
-- drop policy if exists "Read EMG" on public.emg_readings;
-- drop policy if exists "Insert EMG" on public.emg_readings;

-- Note: We intentionally do not drop extensions like pgcrypto/pg_cron since they
-- may be used by other parts of your project.


