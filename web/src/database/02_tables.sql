-- ============================================
-- 02_tables.sql — Create tables and indexes
-- Matches ArduinoLog type: id, gyro_mag, gx, gy, gz, vib_count, severity, created_at
-- ============================================

-- Main table: Arduino tremor/gyro logs (used by TremorChart and TremorTable)
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

COMMENT ON TABLE public.arduino_logs IS 'Tremor data from Arduino: gyro, vibration count, severity (buzzer). No EMG.';
