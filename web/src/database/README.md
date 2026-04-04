# Database SQL (Supabase)

Use the merged scripts in the **`web/`** folder:

| File | Purpose |
|------|---------|
| [`cleanup.sql`](../../cleanup.sql) | Drop `arduino_logs`, `emg_readings`, indexes, and the EMG retention cron job. |
| [`setup.sql`](../../setup.sql) | Extensions, tables, RLS, EMG retention cron, January tremor seed, EMG seed. |

Run **cleanup** then **setup** in the Supabase SQL Editor for a full refresh.
