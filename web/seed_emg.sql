-- Seed EMG dummy data (30s interval over the last 2 hours for two devices)
-- Run this in Supabase SQL Editor after creating the schema.

-- Optional: clear existing data (uncomment if needed)
-- delete from public.emg_readings;

insert into public.emg_readings (device_id, value_mv, created_at)
select d.device_id,
       -- baseline ~300 mV with some noise; tweak as desired
       round((300 + (random() * 80 - 40))::numeric, 2)::double precision as value_mv,
       now() - make_interval(secs => s.seconds) as created_at
from (values ('esp32-1'), ('mega2560-1')) as d(device_id)
cross join generate_series(0, 7200, 30) as s(seconds); -- 0..7200s in 30s steps (2 hours)

-- Verify
-- select count(*) from public.emg_readings where created_at >= now() - interval '2 hours';
-- select * from public.emg_readings order by created_at desc limit 10;


