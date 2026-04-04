import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { supabase, type Reminder, type ReminderCategory, type ReminderRecurrence } from "../lib/supabaseClient";
import { recurrenceSummary } from "../lib/reminderLogic";

const WEEKDAYS = [
  { v: 0, label: "Sunday" },
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" },
];

const MONTHS = [
  { v: 1, label: "January" },
  { v: 2, label: "February" },
  { v: 3, label: "March" },
  { v: 4, label: "April" },
  { v: 5, label: "May" },
  { v: 6, label: "June" },
  { v: 7, label: "July" },
  { v: 8, label: "August" },
  { v: 9, label: "September" },
  { v: 10, label: "October" },
  { v: 11, label: "November" },
  { v: 12, label: "December" },
];

type Props = {
  onRemindersChanged?: () => void;
  /** When true, omit page title and intro (e.g. right drawer supplies its own header). */
  hideHeader?: boolean;
};

export default function SettingsPage({ onRemindersChanged, hideHeader = false }: Props) {
  const [list, setList] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ReminderCategory>("medication");
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>("daily");
  const [allDay, setAllDay] = useState(false);
  const [timeLocal, setTimeLocal] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [monthOfYear, setMonthOfYear] = useState(1);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("reminders")
      .select("*")
      .order("created_at", { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      setList([]);
    } else {
      setList((data as Reminder[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const canSubmit = useMemo(() => {
    if (!title.trim()) return false;
    if (!allDay && !timeLocal) return false;
    if (recurrence === "weekly" && weekday === undefined) return false;
    if (recurrence === "monthly" && (dayOfMonth < 1 || dayOfMonth > 31)) return false;
    if (
      recurrence === "yearly" &&
      (monthOfYear < 1 || monthOfYear > 12 || dayOfMonth < 1 || dayOfMonth > 31)
    )
      return false;
    return true;
  }, [title, allDay, timeLocal, recurrence, weekday, dayOfMonth, monthOfYear]);

  const buildInsert = (): Record<string, unknown> => {
    const row: Record<string, unknown> = {
      title: title.trim(),
      category,
      recurrence,
      all_day: allDay,
      time_local: allDay ? null : `${timeLocal}:00`,
      is_active: true,
    };
    if (recurrence === "daily") {
      row.weekday = null;
      row.day_of_month = null;
      row.month_of_year = null;
    } else if (recurrence === "weekly") {
      row.weekday = weekday;
      row.day_of_month = null;
      row.month_of_year = null;
    } else if (recurrence === "monthly") {
      row.weekday = null;
      row.day_of_month = dayOfMonth;
      row.month_of_year = null;
    } else {
      row.weekday = null;
      row.day_of_month = dayOfMonth;
      row.month_of_year = monthOfYear;
    }
    return row;
  };

  const handleAdd = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const { error: insErr } = await supabase.from("reminders").insert(buildInsert());
    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setTitle("");
    await load();
    onRemindersChanged?.();
  };

  const handleDelete = async (id: string) => {
    setError(null);
    const { error: delErr } = await supabase.from("reminders").delete().eq("id", id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    await load();
    onRemindersChanged?.();
  };

  const handleActiveToggle = async (r: Reminder, active: boolean) => {
    setError(null);
    const { error: upErr } = await supabase.from("reminders").update({ is_active: active }).eq("id", r.id);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    await load();
    onRemindersChanged?.();
  };

  return (
    <Stack spacing={3} sx={{ pt: hideHeader ? 0 : 3, pb: hideHeader ? 2 : 6 }}>
      {!hideHeader && (
        <>
          <Typography variant="h5" component="h1">
            Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create reminders for medication, exercise, or consultations. They appear in the bell menu when the schedule
            matches your device time.
          </Typography>
        </>
      )}

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card variant="outlined">
        <CardHeader title="Add reminder" subheader="Choose how often it repeats and whether it is all day or at a specific time." />
        <CardContent>
          <Stack spacing={2} sx={{ maxWidth: 480 }}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              required
              placeholder="e.g. Take levodopa"
            />
            <FormControl fullWidth>
              <InputLabel id="cat-label">Category</InputLabel>
              <Select
                labelId="cat-label"
                label="Category"
                value={category}
                onChange={(e: SelectChangeEvent) => setCategory(e.target.value as ReminderCategory)}
              >
                <MenuItem value="medication">Medication</MenuItem>
                <MenuItem value="exercise">Exercise</MenuItem>
                <MenuItem value="consultation">Consultation</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="rec-label">Repeat</InputLabel>
              <Select
                labelId="rec-label"
                label="Repeat"
                value={recurrence}
                onChange={(e: SelectChangeEvent) => setRecurrence(e.target.value as ReminderRecurrence)}
              >
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
                <MenuItem value="yearly">Yearly</MenuItem>
              </Select>
            </FormControl>

            {recurrence === "weekly" && (
              <FormControl fullWidth>
                <InputLabel id="wd-label">Day of week</InputLabel>
                <Select
                  labelId="wd-label"
                  label="Day of week"
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                >
                  {WEEKDAYS.map((d) => (
                    <MenuItem key={d.v} value={d.v}>
                      {d.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {recurrence === "monthly" && (
              <TextField
                label="Day of month"
                type="number"
                inputProps={{ min: 1, max: 31 }}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                fullWidth
              />
            )}

            {recurrence === "yearly" && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel id="mo-label">Month</InputLabel>
                  <Select
                    labelId="mo-label"
                    label="Month"
                    value={monthOfYear}
                    onChange={(e) => setMonthOfYear(Number(e.target.value))}
                  >
                    {MONTHS.map((m) => (
                      <MenuItem key={m.v} value={m.v}>
                        {m.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Day"
                  type="number"
                  inputProps={{ min: 1, max: 31 }}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                  fullWidth
                />
              </Stack>
            )}

            <FormControlLabel
              control={<Switch checked={allDay} onChange={(_, v) => setAllDay(v)} />}
              label="All day"
            />
            {!allDay && (
              <TextField
                label="Time"
                type="time"
                value={timeLocal}
                onChange={(e) => setTimeLocal(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}

            <Box>
              <Button variant="contained" disabled={!canSubmit || saving} onClick={() => void handleAdd()}>
                {saving ? <CircularProgress size={22} color="inherit" /> : "Save reminder"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardHeader title="Your reminders" />
        <CardContent>
          {loading ? (
            <CircularProgress size={28} />
          ) : list.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No reminders yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {list.map((r) => (
                <Stack
                  key={r.id}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  justifyContent="space-between"
                  sx={{
                    py: 1,
                    px: 1.5,
                    borderRadius: 1,
                    bgcolor: "action.hover",
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={600} noWrap title={r.title}>
                      {r.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {r.category} · {recurrenceSummary(r)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={r.is_active}
                          onChange={(_, v) => void handleActiveToggle(r, v)}
                          size="small"
                        />
                      }
                      label="On"
                    />
                    <Button
                      color="error"
                      size="small"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => void handleDelete(r.id)}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
