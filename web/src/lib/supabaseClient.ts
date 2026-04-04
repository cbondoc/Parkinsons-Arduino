import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "❌ Supabase env vars missing! Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file"
  );
  console.error("Current values:", {
    url: supabaseUrl ? "✓ Set" : "✗ Missing",
    key: supabaseAnonKey ? "✓ Set" : "✗ Missing",
  });
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

export type ArduinoLog = {
  id: string;
  gyro_mag: number;
  gx: number | null;
  gy: number | null;
  gz: number | null;
  vib_count: number;
  severity: "NO TREMOR" | "MILD TREMOR" | "INTENSE TREMOR";
  created_at: string;
};

export type ReminderCategory = "medication" | "exercise" | "consultation";
export type ReminderRecurrence = "daily" | "weekly" | "monthly" | "yearly";

export type Reminder = {
  id: string;
  title: string;
  category: ReminderCategory;
  recurrence: ReminderRecurrence;
  all_day: boolean;
  time_local: string | null;
  weekday: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
  is_active: boolean;
  created_at: string;
};
