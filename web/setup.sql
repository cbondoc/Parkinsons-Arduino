-- ============================================
-- setup.sql — Full schema + RLS + cron + seeds
-- Run after cleanup.sql (or on a new project). Creates:
--   public.arduino_logs (tremor / gyro — matches Arduino + web app)
--   public.emg_readings (EMG demo / README examples)
-- Seeds: Jan + Mar + Apr 1–4 2026 arduino_logs + 2h EMG sample data.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------- arduino_logs (TremorChart, TremorTable, Arduino POST) ----------
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

CREATE INDEX IF NOT EXISTS arduino_logs_created_at_idx
  ON public.arduino_logs (created_at DESC);

COMMENT ON TABLE public.arduino_logs IS 'Tremor data from Arduino: gyro, vibration count, severity (buzzer).';

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

-- ---------- emg_readings (optional EMG path / docs) ----------
CREATE TABLE public.emg_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT,
  value_mv DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emg_readings_created_at_idx
  ON public.emg_readings (created_at DESC);
CREATE INDEX IF NOT EXISTS emg_readings_device_created_idx
  ON public.emg_readings (device_id, created_at DESC);

ALTER TABLE public.emg_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read EMG" ON public.emg_readings;
CREATE POLICY "Read EMG" ON public.emg_readings
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Insert EMG" ON public.emg_readings;
CREATE POLICY "Insert EMG" ON public.emg_readings
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ---------- Retention: EMG rows older than 1 month, daily 00:10 UTC ----------
GRANT USAGE ON SCHEMA cron TO postgres, anon, authenticated;

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

SELECT cron.schedule(
  'emg_retention_monthly',
  '10 0 * * *',
  $$ DELETE FROM public.emg_readings WHERE created_at < now() - interval '1 month'; $$
);

-- ---------- Seed: arduino_logs (January 2026) ----------
INSERT INTO public.arduino_logs (gyro_mag, gx, gy, gz, vib_count, severity, created_at) VALUES
( 8200,  4000,  5000,  3000,  0, 'NO TREMOR',      '2026-01-01 08:15:00+00'),
(15200,  8000,  9000,  7000,  2, 'NO TREMOR',      '2026-01-01 10:30:00+00'),
(23500, 12000, 14000,  9000,  5, 'MILD TREMOR',    '2026-01-01 14:00:00+00'),
( 9100,  5000,  4000,  5000,  0, 'NO TREMOR',      '2026-01-01 18:45:00+00'),
(28100, 15000, 16000, 12000,  8, 'INTENSE TREMOR', '2026-01-01 21:20:00+00'),
( 7800,  3000,  4500,  4000,  0, 'NO TREMOR',      '2026-01-02 07:00:00+00'),
(19800, 10000, 11000,  8000,  3, 'NO TREMOR',      '2026-01-02 09:15:00+00'),
(24200, 13000, 14000, 10000,  6, 'MILD TREMOR',    '2026-01-02 12:30:00+00'),
(31200, 16000, 17000, 14000, 12, 'INTENSE TREMOR', '2026-01-02 16:00:00+00'),
(11200,  6000,  5500,  6000,  1, 'NO TREMOR',      '2026-01-02 20:00:00+00'),
(16500,  8500,  9000,  7000,  2, 'NO TREMOR',      '2026-01-03 08:00:00+00'),
(22800, 12000, 13000,  9500,  5, 'MILD TREMOR',    '2026-01-03 11:00:00+00'),
( 8900,  4500,  5000,  4500,  0, 'NO TREMOR',      '2026-01-03 14:30:00+00'),
(26500, 14000, 15000, 11000,  7, 'MILD TREMOR',    '2026-01-03 17:45:00+00'),
(33400, 17000, 18000, 15000, 14, 'INTENSE TREMOR', '2026-01-03 22:00:00+00'),
( 9500,  5000,  4800,  5200,  0, 'NO TREMOR',      '2026-01-04 09:00:00+00'),
(21000, 11000, 11500,  8500,  4, 'MILD TREMOR',    '2026-01-04 13:00:00+00'),
( 7200,  3500,  4000,  3500,  0, 'NO TREMOR',      '2026-01-04 19:00:00+00'),
(18500,  9500, 10000,  7500,  3, 'NO TREMOR',      '2026-01-05 08:30:00+00'),
(25500, 13500, 14000, 10500,  6, 'MILD TREMOR',    '2026-01-05 15:00:00+00'),
(29800, 15500, 16000, 12500, 10, 'INTENSE TREMOR', '2026-01-05 21:30:00+00'),
(10200,  5200,  5800,  5500,  1, 'NO TREMOR',      '2026-01-06 07:45:00+00'),
(23800, 12500, 13200,  9800,  5, 'MILD TREMOR',    '2026-01-06 12:00:00+00'),
( 8800,  4400,  4700,  4800,  0, 'NO TREMOR',      '2026-01-06 18:00:00+00'),
(17200,  8800,  9200,  7200,  2, 'NO TREMOR',      '2026-01-07 10:00:00+00'),
(27200, 14500, 14800, 11500,  8, 'MILD TREMOR',    '2026-01-07 16:30:00+00'),
( 8100,  4000,  4200,  3800,  0, 'NO TREMOR',      '2026-01-08 08:00:00+00'),
(22100, 11500, 12000,  9000,  4, 'MILD TREMOR',    '2026-01-08 14:00:00+00'),
(31500, 16500, 16800, 13000, 11, 'INTENSE TREMOR', '2026-01-08 20:00:00+00'),
( 9200,  4600,  5000,  4600,  0, 'NO TREMOR',      '2026-01-09 09:15:00+00'),
(19200, 10000, 10500,  7800,  3, 'NO TREMOR',      '2026-01-09 11:30:00+00'),
(24800, 13000, 13500, 10200,  6, 'MILD TREMOR',    '2026-01-09 17:00:00+00'),
( 7600,  3800,  4000,  3600,  0, 'NO TREMOR',      '2026-01-10 07:30:00+00'),
(20500, 10800, 11200,  8200,  4, 'MILD TREMOR',    '2026-01-10 13:45:00+00'),
(28900, 15000, 15500, 11800,  9, 'INTENSE TREMOR', '2026-01-10 21:00:00+00'),
(10800,  5600,  5400,  5800,  1, 'NO TREMOR',      '2026-01-11 08:45:00+00'),
(23400, 12200, 12800,  9600,  5, 'MILD TREMOR',    '2026-01-11 15:20:00+00'),
( 8500,  4200,  4600,  4200,  0, 'NO TREMOR',      '2026-01-12 10:00:00+00'),
(26200, 13800, 14200, 10800,  7, 'MILD TREMOR',    '2026-01-12 18:00:00+00'),
( 7900,  3900,  4300,  3900,  0, 'NO TREMOR',      '2026-01-13 06:00:00+00'),
(17800,  9200,  9600,  7300,  2, 'NO TREMOR',      '2026-01-13 12:00:00+00'),
(30200, 15800, 16200, 12600, 10, 'INTENSE TREMOR', '2026-01-13 19:30:00+00'),
( 9700,  4900,  5100,  5000,  0, 'NO TREMOR',      '2026-01-14 09:00:00+00'),
(21500, 11200, 11800,  8800,  4, 'MILD TREMOR',    '2026-01-14 14:30:00+00'),
( 9100,  4500,  4800,  4700,  0, 'NO TREMOR',      '2026-01-14 20:00:00+00'),
(16800,  8600,  9000,  7000,  2, 'NO TREMOR',      '2026-01-15 07:15:00+00'),
(24400, 12800, 13200, 10000,  6, 'MILD TREMOR',    '2026-01-15 16:00:00+00'),
(32600, 17000, 17200, 13500, 13, 'INTENSE TREMOR', '2026-01-15 22:00:00+00'),
( 8300,  4100,  4400,  4000,  0, 'NO TREMOR',      '2026-01-16 08:30:00+00'),
(19800, 10300, 10800,  8000,  3, 'NO TREMOR',      '2026-01-16 11:00:00+00'),
(25600, 13400, 13800, 10400,  6, 'MILD TREMOR',    '2026-01-16 15:30:00+00'),
( 7400,  3600,  3900,  3500,  0, 'NO TREMOR',      '2026-01-17 06:45:00+00'),
(22500, 11800, 12200,  9200,  5, 'MILD TREMOR',    '2026-01-17 13:00:00+00'),
(29300, 15200, 15600, 12000,  9, 'INTENSE TREMOR', '2026-01-17 20:45:00+00'),
(10400,  5300,  5500,  5200,  1, 'NO TREMOR',      '2026-01-18 09:00:00+00'),
(18800,  9800, 10200,  7600,  3, 'NO TREMOR',      '2026-01-18 17:00:00+00'),
( 8600,  4300,  4500,  4400,  0, 'NO TREMOR',      '2026-01-19 10:30:00+00'),
(26800, 14000, 14500, 11000,  7, 'MILD TREMOR',    '2026-01-19 18:30:00+00'),
( 8000,  4000,  4100,  3700,  0, 'NO TREMOR',      '2026-01-20 07:00:00+00'),
(21200, 11000, 11500,  8500,  4, 'MILD TREMOR',    '2026-01-20 14:00:00+00'),
(30800, 16000, 16400, 12800, 11, 'INTENSE TREMOR', '2026-01-20 21:00:00+00'),
( 9400,  4700,  4900,  4800,  0, 'NO TREMOR',      '2026-01-21 08:15:00+00'),
(23800, 12400, 13000,  9700,  5, 'MILD TREMOR',    '2026-01-21 12:45:00+00'),
( 7700,  3800,  4000,  3600,  0, 'NO TREMOR',      '2026-01-22 06:30:00+00'),
(18200,  9400,  9800,  7400,  2, 'NO TREMOR',      '2026-01-22 16:00:00+00'),
(27800, 14500, 15000, 11400,  8, 'MILD TREMOR',    '2026-01-22 19:30:00+00'),
( 9900,  5000,  5200,  5100,  0, 'NO TREMOR',      '2026-01-23 09:30:00+00'),
(22200, 11600, 12000,  9000,  4, 'MILD TREMOR',    '2026-01-23 15:00:00+00'),
(31900, 16600, 17000, 13200, 12, 'INTENSE TREMOR', '2026-01-23 22:15:00+00'),
( 8200,  4000,  4300,  3900,  0, 'NO TREMOR',      '2026-01-24 07:45:00+00'),
(19600, 10200, 10600,  7900,  3, 'NO TREMOR',      '2026-01-24 11:30:00+00'),
(25200, 13200, 13600, 10300,  6, 'MILD TREMOR',    '2026-01-24 17:00:00+00'),
( 8800,  4400,  4600,  4500,  0, 'NO TREMOR',      '2026-01-25 10:00:00+00'),
(23100, 12000, 12500,  9400,  5, 'MILD TREMOR',    '2026-01-25 14:30:00+00'),
(28500, 14800, 15200, 11800,  9, 'INTENSE TREMOR', '2026-01-25 20:00:00+00'),
( 7500,  3700,  4000,  3500,  0, 'NO TREMOR',      '2026-01-26 06:00:00+00'),
(17500,  9000,  9400,  7100,  2, 'NO TREMOR',      '2026-01-26 13:00:00+00'),
(26400, 13800, 14200, 10600,  7, 'MILD TREMOR',    '2026-01-26 18:45:00+00'),
( 9100,  4500,  4800,  4600,  0, 'NO TREMOR',      '2026-01-27 08:30:00+00'),
(20800, 10800, 11300,  8400,  4, 'MILD TREMOR',    '2026-01-27 16:00:00+00'),
( 7900,  3900,  4200,  3800,  0, 'NO TREMOR',      '2026-01-28 07:15:00+00'),
(24200, 12600, 13100,  9800,  5, 'MILD TREMOR',    '2026-01-28 12:00:00+00'),
(31200, 16200, 16600, 12900, 11, 'INTENSE TREMOR', '2026-01-28 21:00:00+00'),
( 9700,  4900,  5100,  5000,  0, 'NO TREMOR',      '2026-01-29 09:00:00+00'),
(19000,  9900, 10300,  7700,  3, 'NO TREMOR',      '2026-01-29 15:30:00+00'),
( 8400,  4200,  4400,  4100,  0, 'NO TREMOR',      '2026-01-30 08:00:00+00'),
(25800, 13500, 13900, 10500,  6, 'MILD TREMOR',    '2026-01-30 14:00:00+00'),
(29800, 15500, 15800, 12200, 10, 'INTENSE TREMOR', '2026-01-30 19:30:00+00'),
( 8000,  4000,  4200,  3800,  0, 'NO TREMOR',      '2026-01-31 07:00:00+00'),
(21800, 11400, 11800,  8700,  4, 'MILD TREMOR',    '2026-01-31 11:00:00+00'),
(27500, 14300, 14700, 11200,  8, 'MILD TREMOR',    '2026-01-31 17:00:00+00'),
(33000, 17200, 17500, 13600, 14, 'INTENSE TREMOR', '2026-01-31 23:00:00+00');

-- ---------- Seed: arduino_logs (extra calm / NO TREMOR once per day) ----------
-- January + March–Apr 4 only (skips February — no other tremor seed that month).
INSERT INTO public.arduino_logs (gyro_mag, gx, gy, gz, vib_count, severity, created_at)
SELECT
  gmag,
  (gmag * 0.45 + (hj % 2000))::double precision,
  (gmag * 0.48 + (hj % 2200))::double precision,
  (gmag * 0.42 + (hj % 1900))::double precision,
  0,
  'NO TREMOR',
  ((d::timestamp + interval '3 hours') AT TIME ZONE 'UTC')::timestamptz
FROM (
  SELECT
    day::date AS d,
    abs(hashtext(day::text)) AS hj,
    (5800 + (abs(hashtext(day::text)) % 5200))::double precision AS gmag
  FROM generate_series(date '2026-01-01', date '2026-01-31', interval '1 day') AS day
  UNION ALL
  SELECT
    day::date,
    abs(hashtext(day::text)),
    (5800 + (abs(hashtext(day::text)) % 5200))::double precision
  FROM generate_series(date '2026-03-01', date '2026-04-04', interval '1 day') AS day
) AS calm;

-- ---------- Seed: arduino_logs (March 2026 + April 1–4) ----------
-- Six readings per calendar day; ~half NO TREMOR; rest mild/intense per firmware thresholds.
INSERT INTO public.arduino_logs (gyro_mag, gx, gy, gz, vib_count, severity, created_at)
WITH day_slot AS (
  SELECT
    d::date AS day,
    slot,
    abs(hashtext(d::text || ':' || slot::text)::bigint) AS h
  FROM generate_series(date '2026-03-01', date '2026-04-04', interval '1 day') AS d
  CROSS JOIN generate_series(1, 6) AS slot
),
base AS (
  SELECT
    day,
    slot,
    h,
    CASE WHEN (h % 10) < 5 THEN 0 ELSE ((h % 12) + 1) END AS vib_count,
    (h % 3) AS band
  FROM day_slot
),
labeled AS (
  SELECT
    day,
    slot,
    h,
    vib_count,
    CASE
      WHEN vib_count = 0 THEN 'NO TREMOR'
      WHEN band <> 2 THEN 'MILD TREMOR'
      ELSE 'INTENSE TREMOR'
    END AS severity
  FROM base
),
with_gyro AS (
  SELECT
    day,
    slot,
    h,
    vib_count,
    severity,
    CASE
      WHEN severity = 'NO TREMOR' THEN (5500 + (h % 11500))::double precision
      WHEN severity = 'MILD TREMOR' THEN (7500 + ((h * 7) % 11500))::double precision
      ELSE (20500 + ((h * 11) % 12500))::double precision
    END AS gyro_mag
  FROM labeled
)
SELECT
  gyro_mag,
  (gyro_mag * 0.47 + ((h / 2)::bigint % 2500))::double precision AS gx,
  (gyro_mag * 0.49 + ((h / 3)::bigint % 2200))::double precision AS gy,
  (gyro_mag * 0.44 + ((h / 5)::bigint % 2000))::double precision AS gz,
  vib_count,
  severity,
  (
    (
      day::timestamp
      + ((6 + ((slot * 2 + (h % 5)) % 15)) * interval '1 hour')
      + ((5 + ((h / 7) % 50)) * interval '1 minute')
    ) AT TIME ZONE 'UTC'
  )::timestamptz AS created_at
FROM with_gyro;

-- ---------- Seed: emg_readings (last 2 hours, 30s steps, two devices) ----------
INSERT INTO public.emg_readings (device_id, value_mv, created_at)
SELECT d.device_id,
       round((300 + (random() * 80 - 40))::numeric, 2)::double precision AS value_mv,
       now() - (s.seconds * interval '1 second') AS created_at
FROM (VALUES ('esp32-1'), ('mega2560-1')) AS d(device_id)
CROSS JOIN generate_series(0, 7200, 30) AS s(seconds);
