-- ============================================
-- 00_drop_all.sql — Tear down everything for a fresh start
-- Run this first in Supabase SQL Editor.
-- Note: Supabase does not allow DROP DATABASE from the SQL editor; this drops
-- all tables, policies, and cron jobs in your project so you can recreate them.
-- ============================================

-- 1) Drop RLS policies only when table exists (avoids error on fresh DB)
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

-- 2) Drop table (cascade removes dependent objects)
DROP TABLE IF EXISTS public.arduino_logs CASCADE;

-- 3) Drop indexes if they were created outside table (optional; CASCADE usually handles)
DROP INDEX IF EXISTS public.arduino_logs_created_at_idx;
