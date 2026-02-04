-- ============================================
-- Setup Row Level Security for arduino_logs table
-- Run this in Supabase SQL Editor
-- ============================================

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'arduino_logs';

-- Enable Row Level Security (if not already enabled)
ALTER TABLE public.arduino_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow anon read arduino_logs" ON public.arduino_logs;
DROP POLICY IF EXISTS "Allow anon insert arduino_logs" ON public.arduino_logs;
DROP POLICY IF EXISTS "Read arduino_logs" ON public.arduino_logs;
DROP POLICY IF EXISTS "Insert arduino_logs" ON public.arduino_logs;

-- Policy: Allow anonymous users to SELECT (read) all rows
CREATE POLICY "Allow anon read arduino_logs" 
ON public.arduino_logs
FOR SELECT
TO anon
USING (true);

-- Policy: Allow anonymous users to INSERT new rows
CREATE POLICY "Allow anon insert arduino_logs" 
ON public.arduino_logs
FOR INSERT
TO anon
WITH CHECK (true);

-- Optional: Also allow authenticated users (if you add auth later)
-- CREATE POLICY "Allow authenticated read arduino_logs" 
-- ON public.arduino_logs
-- FOR SELECT
-- TO authenticated
-- USING (true);

-- Verify policies were created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'arduino_logs';

