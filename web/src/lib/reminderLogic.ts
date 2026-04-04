import type { Reminder } from "./supabaseClient";

export function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateMatchesRecurrence(now: Date, r: Reminder): boolean {
  const dow = now.getDay();
  const dom = now.getDate();
  const mon = now.getMonth() + 1;
  switch (r.recurrence) {
    case "daily":
      return true;
    case "weekly":
      return r.weekday === dow;
    case "monthly":
      return r.day_of_month === dom;
    case "yearly":
      return r.month_of_year === mon && r.day_of_month === dom;
    default:
      return false;
  }
}

function parseTimeLocal(s: string | null): { h: number; m: number } | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return { h, m: min };
}

/** Storage key so a dismissed reminder does not reappear the same calendar day (or same minute for timed). */
export function dismissStorageKey(r: Reminder, now: Date): string {
  const dk = dateKeyLocal(now);
  if (r.all_day) return `${r.id}:${dk}`;
  const t = parseTimeLocal(r.time_local);
  if (!t) return `${r.id}:${dk}`;
  return `${r.id}:${dk}:${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;
}

export function isDismissedInSession(key: string): boolean {
  try {
    return sessionStorage.getItem(`reminderDismissed:${key}`) === "1";
  } catch {
    return false;
  }
}

export function markDismissedInSession(key: string): void {
  try {
    sessionStorage.setItem(`reminderDismissed:${key}`, "1");
  } catch {
    /* ignore */
  }
}

/** Whether this reminder should surface in the notification panel right now. */
export function shouldSurfaceReminder(now: Date, r: Reminder): boolean {
  if (!r.is_active) return false;
  if (!dateMatchesRecurrence(now, r)) return false;
  const key = dismissStorageKey(r, now);
  if (isDismissedInSession(key)) return false;

  if (r.all_day) return true;

  const t = parseTimeLocal(r.time_local);
  if (!t) return false;
  return now.getHours() === t.h && now.getMinutes() === t.m;
}

export function recurrenceSummary(r: Reminder): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let when = r.all_day ? "All day" : r.time_local?.slice(0, 5) ?? "—";
  switch (r.recurrence) {
    case "daily":
      return `Daily · ${when}`;
    case "weekly":
      return `Weekly (${r.weekday != null ? days[r.weekday] : "?"}) · ${when}`;
    case "monthly":
      return `Monthly (day ${r.day_of_month ?? "?"}) · ${when}`;
    case "yearly":
      return `Yearly (${r.month_of_year != null ? months[r.month_of_year - 1] : "?"} ${r.day_of_month ?? "?"}) · ${when}`;
    default:
      return when;
  }
}
