import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { ArduinoLog, supabase } from "../lib/supabaseClient";

type Severity = "NO TREMOR" | "MILD TREMOR" | "INTENSE TREMOR" | "Unknown";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toSeverity(s: unknown): Severity {
  if (s === "NO TREMOR" || s === "MILD TREMOR" || s === "INTENSE TREMOR") return s;
  return "Unknown";
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function analyze(logs: ArduinoLog[]) {
  const bySeverity: Record<Severity, number> = {
    "NO TREMOR": 0,
    "MILD TREMOR": 0,
    "INTENSE TREMOR": 0,
    Unknown: 0,
  };
  const byHour: Record<number, number> = {};
  const byDay: Record<number, number> = {};
  const byDate: Record<string, { mild: number; intense: number; total: number }> = {};

  const gyroValues: number[] = [];
  const vibValues: number[] = [];

  for (const log of logs) {
    const sev = toSeverity((log as any).severity);
    bySeverity[sev] += 1;

    const d = dayjs((log as any).created_at);
    const hour = d.hour();
    const day = d.day();
    const dateKey = d.format("YYYY-MM-DD");

    byHour[hour] = (byHour[hour] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;

    if (!byDate[dateKey]) byDate[dateKey] = { mild: 0, intense: 0, total: 0 };
    byDate[dateKey].total += 1;
    if (sev === "MILD TREMOR") byDate[dateKey].mild += 1;
    if (sev === "INTENSE TREMOR") byDate[dateKey].intense += 1;

    const gm = (log as any).gyro_mag;
    if (typeof gm === "number" && Number.isFinite(gm)) gyroValues.push(gm);
    const vc = (log as any).vib_count;
    if (typeof vc === "number" && Number.isFinite(vc)) vibValues.push(vc);
  }

  const totalReadings = logs.length;
  const daysWithData = Object.keys(byDate).length || 1;
  const tremorReadings =
    bySeverity["MILD TREMOR"] + bySeverity["INTENSE TREMOR"];
  const intenseShare =
    totalReadings > 0 ? (bySeverity["INTENSE TREMOR"] / totalReadings) * 100 : 0;
  const tremorEpisodesPerDay = tremorReadings / daysWithData;
  const intenseEpisodesPerDay = bySeverity["INTENSE TREMOR"] / daysWithData;

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
      label: DAY_LABELS[Number(day)] ?? String(day),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const consultReasons: string[] = [];
  if (intenseShare >= 25) consultReasons.push("≥ 25% of readings show intense tremor.");
  if (intenseEpisodesPerDay >= 10) consultReasons.push("High number of intense tremor readings per day (avg).");
  if (tremorEpisodesPerDay >= 50) consultReasons.push("Very frequent tremor readings overall (avg per day).");
  if (bySeverity["INTENSE TREMOR"] >= 20 && totalReadings >= 50)
    consultReasons.push("Recurring intense tremor detected over the selected period.");

  return {
    totalReadings,
    bySeverity,
    daysWithData,
    tremorEpisodesPerDay,
    intenseEpisodesPerDay,
    intenseShare,
    peakHours,
    peakDays,
    consultReasons,
    gyro: {
      min: gyroValues.length ? Math.min(...gyroValues) : null,
      max: gyroValues.length ? Math.max(...gyroValues) : null,
      mean: mean(gyroValues),
      median: median(gyroValues),
    },
    vib: {
      min: vibValues.length ? Math.min(...vibValues) : null,
      max: vibValues.length ? Math.max(...vibValues) : null,
      mean: mean(vibValues),
      median: median(vibValues),
    },
  };
}

export default function SummaryPage() {
  const [logs, setLogs] = useState<ArduinoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const sinceIso = dayjs().subtract(3, "month").toISOString();
      const { data, error: e } = await supabase
        .from("arduino_logs")
        .select("id, created_at, gyro_mag, severity, vib_count")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(20000);

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
    return () => {
      isMounted = false;
    };
  }, []);

  const analysis = useMemo(() => analyze(logs), [logs]);

  const createdAtSorted = useMemo(() => {
    const times = logs
      .map((l) => (l as any).created_at as string | undefined)
      .filter(Boolean) as string[];
    times.sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf());
    return times;
  }, [logs]);

  const range = useMemo(() => {
    if (!createdAtSorted.length) return null;
    return {
      start: dayjs(createdAtSorted[0]),
      end: dayjs(createdAtSorted[createdAtSorted.length - 1]),
    };
  }, [createdAtSorted]);

  const recent = useMemo(() => {
    return [...logs]
      .sort((a, b) => dayjs((b as any).created_at).valueOf() - dayjs((a as any).created_at).valueOf())
      .slice(0, 40);
  }, [logs]);

  const recentIntense = useMemo(() => {
    return recent.filter((r) => toSeverity((r as any).severity) === "INTENSE TREMOR").slice(0, 10);
  }, [recent]);

  const onPrint = () => {
    // Browser print dialog supports "Save as PDF" on most systems.
    window.print();
  };

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

  if (!logs.length) {
    return (
      <Stack spacing={2} sx={{ pt: 3 }}>
        <Typography variant="h5" fontWeight={650}>
          Patient summary
        </Typography>
        <Alert severity="info">
          No readings available yet. Once the device uploads data, this page will generate a clinician-friendly summary.
        </Alert>
      </Stack>
    );
  }

  const { bySeverity, tremorEpisodesPerDay, intenseEpisodesPerDay, intenseShare, peakHours, peakDays, consultReasons } =
    analysis;

  return (
    <Box sx={{ pt: 3, pb: 5 }} className="print-root">
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          flexWrap="wrap"
          gap={1}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
              Patient tremor summary
            </Typography>
            <Typography color="text.secondary">
              Generated {dayjs().format("YYYY-MM-DD HH:mm")} • Data window: last 3 months
              {range ? ` • Actual range: ${range.start.format("YYYY-MM-DD")} → ${range.end.format("YYYY-MM-DD")}` : ""}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} className="print-hide">
            <Button variant="contained" startIcon={<PrintIcon />} onClick={onPrint}>
              Print / Save as PDF
            </Button>
          </Stack>
        </Stack>
        <Divider />
      </Stack>

      <Stack spacing={3}>
        <Card>
          <CardHeader avatar={<LocalHospitalIcon color="primary" />} title="Clinical highlights" />
          <CardContent>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 220 }}>
                <Typography variant="body2" color="text.secondary">
                  Readings (total)
                </Typography>
                <Typography variant="h6">{analysis.totalReadings}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 220 }}>
                <Typography variant="body2" color="text.secondary">
                  Days with data
                </Typography>
                <Typography variant="h6">{analysis.daysWithData}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 220 }}>
                <Typography variant="body2" color="text.secondary">
                  Intense tremor share
                </Typography>
                <Typography variant="h6">{fmtNum(intenseShare, 1)}%</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 220 }}>
                <Typography variant="body2" color="text.secondary">
                  Tremor readings/day (avg)
                </Typography>
                <Typography variant="h6">{fmtNum(tremorEpisodesPerDay, 1)}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 220 }}>
                <Typography variant="body2" color="text.secondary">
                  Intense readings/day (avg)
                </Typography>
                <Typography variant="h6">{fmtNum(intenseEpisodesPerDay, 1)}</Typography>
              </Paper>
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Severity breakdown
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
              <Chip label={`No tremor: ${bySeverity["NO TREMOR"]}`} size="small" />
              <Chip label={`Mild: ${bySeverity["MILD TREMOR"]}`} size="small" color="primary" variant="outlined" />
              <Chip label={`Intense: ${bySeverity["INTENSE TREMOR"]}`} size="small" color="error" variant="outlined" />
              {bySeverity.Unknown > 0 && <Chip label={`Unknown: ${bySeverity.Unknown}`} size="small" variant="outlined" />}
            </Stack>

            {consultReasons.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography fontWeight={650} sx={{ mb: 0.5 }}>
                  Consider clinical review
                </Typography>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {consultReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader avatar={<TrendingUpIcon color="primary" />} title="Signal summary (gyro magnitude / vibration count)" />
          <CardContent>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 260 }}>
                <Typography variant="subtitle2">Gyro magnitude</Typography>
                <Typography variant="body2" color="text.secondary">
                  min {fmtNum(analysis.gyro.min, 2)} • median {fmtNum(analysis.gyro.median, 2)} • mean{" "}
                  {fmtNum(analysis.gyro.mean, 2)} • max {fmtNum(analysis.gyro.max, 2)}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 260 }}>
                <Typography variant="subtitle2">Vibration count</Typography>
                <Typography variant="body2" color="text.secondary">
                  min {fmtNum(analysis.vib.min, 0)} • median {fmtNum(analysis.vib.median, 0)} • mean{" "}
                  {fmtNum(analysis.vib.mean, 1)} • max {fmtNum(analysis.vib.max, 0)}
                </Typography>
              </Paper>
            </Stack>
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1.5 }}>
              Notes: values summarize the last 3 months of uploaded readings. Interpretation depends on device placement and sampling behavior.
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader avatar={<ScheduleIcon color="primary" />} title="Temporal patterns" />
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Peak hours (by reading count)
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              {peakHours.map((p) => (
                <Chip key={p.hour} label={`${p.label} (${p.count})`} size="small" variant="outlined" />
              ))}
            </Stack>

            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Peak days of week
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {peakDays.map((p) => (
                <Chip key={p.day} label={`${p.label} (${p.count})`} size="small" variant="outlined" />
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Recent readings (most recent first)" subheader="Up to 40 most recent readings from the loaded window" />
          <CardContent>
            {recentIntense.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {recentIntense.length} intense tremor reading(s) appear in the most recent sample.
              </Alert>
            )}
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="recent readings">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>Time</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>Severity</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      Gyro mag
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      Vib count
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recent.map((r) => {
                    const sev = toSeverity((r as any).severity);
                    const created = dayjs((r as any).created_at).format("YYYY-MM-DD HH:mm:ss");
                    const gm = (r as any).gyro_mag;
                    const vc = (r as any).vib_count;
                    return (
                      <TableRow key={(r as any).id}>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{created}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          <Chip
                            size="small"
                            label={sev}
                            color={sev === "INTENSE TREMOR" ? "error" : sev === "MILD TREMOR" ? "primary" : "default"}
                            variant={sev === "NO TREMOR" ? "outlined" : "filled"}
                          />
                        </TableCell>
                        <TableCell align="right">{typeof gm === "number" ? gm.toFixed(2) : "—"}</TableCell>
                        <TableCell align="right">{typeof vc === "number" ? vc : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        <Typography variant="caption" color="text.secondary">
          This report is generated from device-uploaded readings and is intended to support (not replace) clinical evaluation.
        </Typography>
      </Stack>
    </Box>
  );
}

