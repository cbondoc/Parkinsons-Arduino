-- ============================================
-- 03_rls_policies.sql — Row Level Security for anon (and optional authenticated)
-- Run after 02_tables.sql. Enables read/insert for anon (Arduino and web app).
-- ============================================

-- ---------- arduino_logs ----------
ALTER TABLE public.arduino_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read arduino_logs" ON public.arduino_logs;
CREATE POLICY "Allow anon read arduino_logs"
  ON public.arduino_logs
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert arduino_logs" ON public.arduino_logs;
CREATE POLICY "Allow anon insert arduino_logs"
  ON public.arduino_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Optional: allow authenticated users (uncomment if you add Supabase Auth)
-- CREATE POLICY "Allow authenticated read arduino_logs"
--   ON public.arduino_logs FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Allow authenticated insert arduino_logs"
--   ON public.arduino_logs FOR INSERT TO authenticated WITH CHECK (true);
