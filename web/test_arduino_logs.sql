-- ============================================
-- Test SQL Queries for arduino_logs Table
-- Run these in Supabase SQL Editor
-- ============================================

-- 1. Check table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'arduino_logs'
ORDER BY ordinal_position;

-- 2. Check if table exists and count rows
SELECT COUNT(*) as total_rows FROM arduino_logs;

-- 3. Check recent data (last 60 minutes - what the chart queries)
SELECT 
    id,
    emg_value,
    relay_state,
    flex_detected,
    created_at,
    timestamp
FROM arduino_logs
WHERE created_at >= NOW() - INTERVAL '60 minutes'
ORDER BY created_at DESC
LIMIT 20;

-- 4. Check data from last month (what the table queries)
SELECT 
    id,
    emg_value,
    relay_state,
    flex_detected,
    created_at
FROM arduino_logs
WHERE created_at >= NOW() - INTERVAL '1 month'
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check current time vs most recent data
SELECT 
    NOW() as current_time,
    MAX(created_at) as most_recent_data,
    NOW() - MAX(created_at) as time_difference
FROM arduino_logs;

-- 6. Insert test data with CURRENT timestamps (for chart to show)
-- This will insert 20 records with timestamps from NOW() going back 5 minutes
INSERT INTO arduino_logs (emg_value, relay_state, flex_detected, created_at)
SELECT 
    (50 + random() * 100)::int as emg_value,
    CASE WHEN random() > 0.7 THEN true ELSE false END as relay_state,
    CASE WHEN random() > 0.5 THEN true ELSE false END as flex_detected,
    NOW() - (random() * INTERVAL '5 minutes') as created_at
FROM generate_series(1, 20)
RETURNING id, emg_value, created_at;

-- 7. Verify the inserted test data
SELECT 
    id,
    emg_value,
    relay_state,
    flex_detected,
    created_at
FROM arduino_logs
WHERE created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;

-- 8. Insert a single test record with current timestamp (for real-time testing)
INSERT INTO arduino_logs (emg_value, relay_state, flex_detected, created_at)
VALUES (75, false, true, NOW());

-- 9. Check what the app query would return (matching the chart query exactly)
SELECT 
    created_at, 
    emg_value
FROM arduino_logs
WHERE created_at >= NOW() - INTERVAL '60 minutes'
ORDER BY created_at ASC;

-- 10. Clean up test data (optional - only if you want to remove test inserts)
-- DELETE FROM arduino_logs WHERE created_at >= NOW() - INTERVAL '1 hour' AND emg_value BETWEEN 50 AND 150;

