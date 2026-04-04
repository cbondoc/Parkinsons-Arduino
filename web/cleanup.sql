-- ============================================
-- cleanup.sql — Tear down Parkinsons Supabase objects
-- Run in Supabase SQL Editor before setup.sql for a full reset.
-- Does not drop extensions (pgcrypto / pg_cron may be shared).
-- ============================================

-- Stop EMG retention job (pg_cron)
DO $$
BEGIN
  PERFORM 1 FROM cron.job WHERE jobname = 'emg_retention_monthly';
  IF FOUND THEN
    PERFORM cron.unschedule('emg_retention_monthly');
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END
$$;

DROP TABLE IF EXISTS public.arduino_logs CASCADE;
DROP TABLE IF EXISTS public.emg_readings CASCADE;

DROP INDEX IF EXISTS public.arduino_logs_created_at_idx;
DROP INDEX IF EXISTS public.emg_readings_created_at_idx;
DROP INDEX IF EXISTS public.emg_readings_device_created_idx;
