import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Paper,
} from "@mui/material";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ScheduleIcon from "@mui/icons-material/Schedule";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import dayjs from "dayjs";
import { ArduinoLog, supabase } from "../lib/supabaseClient";

type Severity = "NO TREMOR" | "MILD TREMOR" | "INTENSE TREMOR";

interface Analysis {
  totalReadings: number;
  bySeverity: Record<Severity, number>;
  tremorEpisodesPerDay: number;
  intenseEpisodesPerDay: number;
  peakHours: { hour: number; count: number; label: string }[];
  peakDays: { day: number; count: number; label: string }[];
  intenseShare: number;
  consultTherapist: boolean;
  consultReasons: string[];
  suggestedTherapies: string[];
}

const SEVERITY_ORDER: Severity[] = ["NO TREMOR", "MILD TREMOR", "INTENSE TREMOR"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function analyzeLogs(logs: ArduinoLog[]): Analysis | null {
  if (!logs.length) return null;

  const bySeverity: Record<Severity, number> = {
    "NO TREMOR": 0,
    "MILD TREMOR": 0,
    "INTENSE TREMOR": 0,
  };

  const byHour: Record<number, number> = {};
  const byDay: Record<number, number> = {};
  const byDate: Record<string, { mild: number; intense: number }> = {};

  for (const log of logs) {
    const sev = (log.severity || "NO TREMOR") as Severity;
    if (SEVERITY_ORDER.includes(sev)) bySeverity[sev] += 1;

    const d = dayjs(log.created_at);
    const hour = d.hour();
    const day = d.day();
    const dateKey = d.format("YYYY-MM-DD");

    byHour[hour] = (byHour[hour] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;

    if (!byDate[dateKey]) byDate[dateKey] = { mild: 0, intense: 0 };
    if (sev === "MILD TREMOR") byDate[dateKey].mild += 1;
    if (sev === "INTENSE TREMOR") byDate[dateKey].intense += 1;
  }

  const totalTremor = bySeverity["MILD TREMOR"] + bySeverity["INTENSE TREMOR"];
  const totalReadings = logs.length;
  const intenseShare = totalReadings > 0 ? (bySeverity["INTENSE TREMOR"] / totalReadings) * 100 : 0;
  const numDays = Object.keys(byDate).length || 1;
  const tremorEpisodesPerDay = totalTremor / numDays;
  const intenseEpisodesPerDay = bySeverity["INTENSE TREMOR"] / numDays;

  const peakHours = Object.entries(byHour)
    .map(([hour, count]) => ({
      hour: Number(hour),
      count,
      label: `${Number(hour)}:00`,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const peakDays = Object.entries(byDay)
    .map(([day, count]) => ({
      day: Number(day),
      count,
      label: DAY_LABELS[Number(day)],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const consultReasons: string[] = [];
  if (intenseShare >= 25) consultReasons.push("More than 25% of readings show intense tremor.");
  if (intenseEpisodesPerDay >= 10) consultReasons.push("High number of intense tremor episodes per day.");
  if (tremorEpisodesPerDay >= 50) consultReasons.push("Very frequent tremor episodes overall.");
  if (bySeverity["INTENSE TREMOR"] >= 20 && totalReadings >= 50)
    consultReasons.push("Recurring intense tremor detected over the period.");
  const consultTherapist = consultReasons.length > 0;

  const suggestedTherapies: string[] = [];
  if (bySeverity["INTENSE TREMOR"] > 0) {
    suggestedTherapies.push("Medication review with your neurologist to optimize tremor control.");
    suggestedTherapies.push("Physical or occupational therapy for daily activities and exercises.");
  }
  if (bySeverity["MILD TREMOR"] > bySeverity["INTENSE TREMOR"]) {
    suggestedTherapies.push("Stress reduction and relaxation techniques (e.g. mindfulness, breathing).");
    suggestedTherapies.push("Avoid caffeine and ensure good sleep; both can worsen tremor.");
  }
  suggestedTherapies.push("Keep a consistent monitoring schedule to track response to treatment.");
  if (intenseShare >= 15) {
    suggestedTherapies.push("Discuss advanced options (e.g. DBS or focused ultrasound) if tremor remains disabling.");
  }

  return {
    totalReadings,
    bySeverity,
    tremorEpisodesPerDay,
    intenseEpisodesPerDay,
    peakHours,
    peakDays,
    intenseShare,
    consultTherapist,
    consultReasons,
    suggestedTherapies: [...new Set(suggestedTherapies)],
  };
}

export default function SuggestionsPage() {
  const [logs, setLogs] = useState<ArduinoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const sinceIso = dayjs().subtract(3, "month").toISOString();
      const { data, error: e } = await supabase
        .from("arduino_logs")
        .select("id, created_at, gyro_mag, severity, vib_count")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(10000);

      if (!isMounted) return;
      if (e) {
        setError(e.message);
        setLoading(false);
        return;
      }
      setLogs((data ?? []) as ArduinoLog[]);
      setLoading(false);
    };

    load();
    return () => { isMounted = false; };
  }, []);

  const analysis = useMemo(() => analyzeLogs(logs), [logs]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!analysis) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        No tremor data yet. Use the monitor and collect some readings to see personalized suggestions here.
      </Alert>
    );
  }

  const { bySeverity, tremorEpisodesPerDay, intenseEpisodesPerDay, peakHours, peakDays, consultTherapist, consultReasons, suggestedTherapies } = analysis;

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        Insights & suggestions
      </Typography>
      <Typography color="text.secondary">
        Based on the last 3 months of tremor data ({analysis.totalReadings} readings).
      </Typography>

      {/* When to consult */}
      <Card variant="outlined">
        <CardHeader
          avatar={<LocalHospitalIcon color="primary" />}
          title="When to consult a therapist or doctor"
        />
        <CardContent>
          {consultTherapist ? (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                We recommend scheduling a consultation with your neurologist or movement disorder specialist.
              </Alert>
              <List dense>
                {consultReasons.map((reason, i) => (
                  <ListItem key={i}>
                    <ListItemIcon sx={{ minWidth: 32 }}>•</ListItemIcon>
                    <ListItemText primary={reason} />
                  </ListItem>
                ))}
              </List>
            </>
          ) : (
            <Typography color="text.secondary">
              Your current patterns do not suggest an urgent need to consult. Continue monitoring; if tremor
              increases or starts affecting daily life, see your doctor.
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Frequency */}
      <Card variant="outlined">
        <CardHeader
          avatar={<ScheduleIcon color="primary" />}
          title="Tremor frequency"
        />
        <CardContent>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" color="text.secondary">Tremor episodes per day (avg)</Typography>
              <Typography variant="h6">{tremorEpisodesPerDay.toFixed(1)}</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" color="text.secondary">Intense episodes per day (avg)</Typography>
              <Typography variant="h6">{intenseEpisodesPerDay.toFixed(1)}</Typography>
            </Paper>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Severity breakdown:
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
            <Chip label={`No tremor: ${bySeverity["NO TREMOR"]}`} size="small" color="default" />
            <Chip label={`Mild: ${bySeverity["MILD TREMOR"]}`} size="small" color="primary" variant="outlined" />
            <Chip label={`Intense: ${bySeverity["INTENSE TREMOR"]}`} size="small" color="error" variant="outlined" />
          </Stack>
        </CardContent>
      </Card>

      {/* Patterns */}
      <Card variant="outlined">
        <CardHeader
          avatar={<TrendingUpIcon color="primary" />}
          title="Patterns"
        />
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Most active by hour (readings)
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
            {peakHours.length ? peakHours.map(({ hour, count, label }) => (
              <Chip key={hour} label={`${label} (${count})`} size="small" variant="outlined" />
            )) : (
              <Typography variant="body2" color="text.secondary">No pattern data yet.</Typography>
            )}
          </Stack>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Most active by day of week
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {peakDays.length ? peakDays.map(({ day, count, label }) => (
              <Chip key={day} label={`${label} (${count})`} size="small" variant="outlined" />
            )) : (
              <Typography variant="body2" color="text.secondary">No pattern data yet.</Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Suggested therapy */}
      <Card variant="outlined">
        <CardHeader
          avatar={<FitnessCenterIcon color="primary" />}
          title="Suggested therapy & next steps"
        />
        <CardContent>
          <List dense>
            {suggestedTherapies.map((item, i) => (
              <ListItem key={i}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <PsychologyIcon fontSize="small" color="action" />
                </ListItemIcon>
                <ListItemText primary={item} />
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            These are general suggestions based on your data. Always follow your doctor’s plan and discuss any new
            therapy with them first.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
