import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
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
