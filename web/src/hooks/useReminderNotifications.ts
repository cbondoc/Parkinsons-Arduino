import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Reminder } from "../lib/supabaseClient";
import {
  dismissStorageKey,
  markDismissedInSession,
  shouldSurfaceReminder,
} from "../lib/reminderLogic";

export type ReminderNotification = {
  id: string;
  reminderId: string;
  title: string;
  category: Reminder["category"];
  dismissKey: string;
  createdAt: number;
};

export function useReminderNotifications(enabled: boolean) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [items, setItems] = useState<ReminderNotification[]>([]);
  const seenKeysRef = useRef<Set<string>>(new Set());

  const refreshReminders = useCallback(async () => {
    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("reminders fetch:", error);
      return;
    }
    setReminders((data as Reminder[]) ?? []);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refreshReminders();
  }, [enabled, refreshReminders]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const now = new Date();
      const next: ReminderNotification[] = [];

      for (const r of reminders) {
        if (!shouldSurfaceReminder(now, r)) continue;
        const key = dismissStorageKey(r, now);
        if (seenKeysRef.current.has(key)) continue;
        seenKeysRef.current.add(key);
        next.push({
          id: `${key}:${now.getTime()}`,
          reminderId: r.id,
          title: r.title,
          category: r.category,
          dismissKey: key,
          createdAt: now.getTime(),
        });
      }

      if (next.length) {
        setItems((prev) => [...next, ...prev]);
      }
    };

    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, [enabled, reminders]);

  const dismiss = useCallback((dismissKey: string) => {
    markDismissedInSession(dismissKey);
    setItems((prev) => prev.filter((n) => n.dismissKey !== dismissKey));
  }, []);

  const clearAll = useCallback(() => {
    setItems((prev) => {
      for (const n of prev) markDismissedInSession(n.dismissKey);
      return [];
    });
  }, []);

  return {
    reminders,
    refreshReminders,
    notifications: items,
    dismiss,
    clearAll,
    unreadCount: items.length,
  };
}
