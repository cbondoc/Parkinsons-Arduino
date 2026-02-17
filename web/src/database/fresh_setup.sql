-- ============================================
-- fresh_setup.sql — Full reset and recreate
-- Run this single file in Supabase SQL Editor to drop all, then create
-- extensions, table, and RLS policies. Gyro/vibration/buzzer only (no EMG).
-- ============================================

-- ----- 1) DROP ALL -----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'arduino_logs') THEN
    DROP POLICY IF EXISTS "Allow anon read arduino_logs" ON public.arduino_logs;
    DROP POLICY IF EXISTS "Allow anon insert arduino_logs" ON public.arduino_logs;
    DROP POLICY IF EXISTS "Read arduino_logs" ON public.arduino_logs;
    DROP POLICY IF EXISTS "Insert arduino_logs" ON public.arduino_logs;
  END IF;
END
$$;

DROP TABLE IF EXISTS public.arduino_logs CASCADE;
DROP INDEX IF EXISTS public.arduino_logs_created_at_idx;

-- ----- 2) EXTENSIONS -----
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ----- 3) TABLES -----
CREATE TABLE public.arduino_logs (
  id BIGSERIAL PRIMARY KEY,
  gyro_mag DOUBLE PRECISION NOT NULL,
  gx DOUBLE PRECISION,
  gy DOUBLE PRECISION,
  gz DOUBLE PRECISION,
  vib_count INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL CHECK (severity IN ('NO TREMOR', 'MILD TREMOR', 'INTENSE TREMOR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arduino_logs_created_at_idx ON public.arduino_logs (created_at DESC);

-- ----- 4) RLS POLICIES -----
ALTER TABLE public.arduino_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read arduino_logs" ON public.arduino_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert arduino_logs" ON public.arduino_logs FOR INSERT TO anon WITH CHECK (true);
