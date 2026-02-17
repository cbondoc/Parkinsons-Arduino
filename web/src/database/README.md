# Database scripts (Supabase)

Run these in **Supabase Dashboard → SQL Editor** in order for a **fresh start**.

**Data model:** Gyro, vibration count, and severity (buzzer) only. There is **no EMG** column or table.

## Order

| File | Purpose |
|------|--------|
| `00_drop_all.sql` | Drop policies and `arduino_logs` table. |
| `01_extensions.sql` | Enable `pgcrypto` and `pg_cron`. |
| `02_tables.sql` | Create `arduino_logs` + index. |
| `03_rls_policies.sql` | Enable RLS and anon read/insert policies. |
| `05_seed_january.sql` | Optional: insert dummy arduino_logs for January 2026. |

## Fresh start (full reset)

1. Run **00_drop_all.sql** (tears down everything).
2. Run **01_extensions.sql**.
3. Run **02_tables.sql**.
4. Run **03_rls_policies.sql**.
5. Run **05_seed_january.sql** to load dummy tremor data for January 2026.

Or run the single file **fresh_setup.sql**, which does steps 1–4.

## Notes

- **DROP DATABASE** is not possible from the Supabase SQL editor; these scripts only drop objects inside your project (tables, policies).
- `arduino_logs` columns: `id`, `gyro_mag`, `gx`, `gy`, `gz`, `vib_count`, `severity`, `created_at`. No EMG.
- Realtime: ensure **Realtime** is enabled for `arduino_logs` in Supabase if the chart uses live inserts.
