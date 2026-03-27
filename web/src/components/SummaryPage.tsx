import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
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
  const byDateGyro: Record<string, number[]> = {};

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

    const gm = (log as any).gyro_mag;
    if (typeof gm === "number" && Number.isFinite(gm)) {
      gyroValues.push(gm);
      if (!byDateGyro[dateKey]) byDateGyro[dateKey] = [];
      byDateGyro[dateKey].push(gm);
    }
    const vc = (log as any).vib_count;
    if (typeof vc === "number" && Number.isFinite(vc)) vibValues.push(vc);
  }

  const totalReadings = logs.length;
  const byDateKeys = Object.keys(
    logs.reduce<Record<string, true>>((acc, log) => {
      acc[dayjs((log as any).created_at).format("YYYY-MM-DD")] = true;
      return acc;
    }, {}),
  );
  const daysWithData = byDateKeys.length || 1;
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
    .slice(0, 3);

  const peakDays = Object.entries(byDay)
    .map(([day, count]) => ({
      day: Number(day),
      count,
      label: DAY_LABELS[Number(day)] ?? String(day),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const consultReasons: string[] = [];
  if (intenseShare >= 25) consultReasons.push("≥ 25% of readings show intense tremor.");
  if (intenseEpisodesPerDay >= 10) consultReasons.push("High number of intense tremor readings per day (avg).");
  if (tremorEpisodesPerDay >= 50) consultReasons.push("Very frequent tremor readings overall (avg per day).");
  if (bySeverity["INTENSE TREMOR"] >= 20 && totalReadings >= 50)
    consultReasons.push("Recurring intense tremor detected over the selected period.");

  const severityBarData: { name: string; n: number; fill: string }[] = [
    { name: "No tremor", n: bySeverity["NO TREMOR"], fill: "#757575" },
    { name: "Mild", n: bySeverity["MILD TREMOR"], fill: "#1976d2" },
    { name: "Intense", n: bySeverity["INTENSE TREMOR"], fill: "#d32f2f" },
  ];
  if (bySeverity.Unknown > 0) {
    severityBarData.push({ name: "Unknown", n: bySeverity.Unknown, fill: "#9e9e9e" });
  }

  const dailyGyroLine = Object.entries(byDateGyro)
    .map(([date, arr]) => ({
      date,
      label: dayjs(date).format("M/D"),
      avgGyro: arr.reduce((a, b) => a + b, 0) / arr.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

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
    severityBarData,
    dailyGyroLine,
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

  const latestLog = useMemo(() => {
    if (!logs.length) return null;
    return [...logs].sort(
      (a, b) => dayjs((b as any).created_at).valueOf() - dayjs((a as any).created_at).valueOf(),
    )[0];
  }, [logs]);

  const onPrint = () => {
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

  const {
    bySeverity,
    tremorEpisodesPerDay,
    intenseEpisodesPerDay,
    intenseShare,
    peakHours,
    peakDays,
    consultReasons,
    severityBarData,
    dailyGyroLine,
  } = analysis;

  const peaksLine = [
    `Hours: ${peakHours.map((p) => `${p.label} (${p.count})`).join(", ")}`,
    `Days: ${peakDays.map((p) => `${p.label} (${p.count})`).join(", ")}`,
  ].join(" • ");

  const chartWrapSx = {
    width: "100%",
    height: 200,
    "@media print": { height: 120 },
  } as const;

  return (
    <Box
      sx={{ pt: 2, pb: 3, "@media print": { pt: 0, pb: 0 } }}
      className="print-root print-summary-sheet"
    >
      <Stack spacing={1.5} sx={{ mb: 1.5, "@media print": { mb: 1 } }}>
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          flexWrap="wrap"
          gap={1}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 750, lineHeight: 1.2 }}>
              Patient tremor summary
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Generated {dayjs().format("YYYY-MM-DD HH:mm")} • Window: last 3 months
              {range ? ` • Data: ${range.start.format("YYYY-MM-DD")} → ${range.end.format("YYYY-MM-DD")}` : ""}
            </Typography>
            {latestLog && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Latest reading: {dayjs((latestLog as any).created_at).format("YYYY-MM-DD HH:mm")} —{" "}
                {toSeverity((latestLog as any).severity)}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} className="print-hide">
            <Button size="small" variant="contained" startIcon={<PrintIcon />} onClick={onPrint}>
              Print / PDF
            </Button>
          </Stack>
        </Stack>
        <Divider />
      </Stack>

      <Card>
        <CardHeader
          avatar={<LocalHospitalIcon color="primary" fontSize="small" />}
          title="Summary"
          titleTypographyProps={{ variant: "subtitle1", fontWeight: 650 }}
          sx={{ pb: 0 }}
        />
        <CardContent sx={{ pt: 1 }}>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} sx={{ mb: 1.5 }}>
            {(
              [
                ["Readings", String(analysis.totalReadings)],
                ["Days w/ data", String(analysis.daysWithData)],
                ["Intense %", `${fmtNum(intenseShare, 1)}%`],
                ["Tremor/day (avg)", fmtNum(tremorEpisodesPerDay, 1)],
                ["Intense/day (avg)", fmtNum(intenseEpisodesPerDay, 1)],
              ] as const
            ).map(([label, val]) => (
              <Paper
                key={label}
                variant="outlined"
                className="summary-stat-paper"
                sx={{ px: 1.25, py: 0.75, flex: "1 1 100px", minWidth: 88, maxWidth: { md: 140 } }}
              >
                <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
                  {label}
                </Typography>
                <Typography variant="body1" fontWeight={650}>
                  {val}
                </Typography>
              </Paper>
            ))}
          </Stack>

          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Severity counts — No: {bySeverity["NO TREMOR"]} • Mild: {bySeverity["MILD TREMOR"]} • Intense:{" "}
            {bySeverity["INTENSE TREMOR"]}
            {bySeverity.Unknown > 0 ? ` • Unknown: ${bySeverity.Unknown}` : ""}
          </Typography>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{ alignItems: "stretch", "@media print": { flexDirection: "row" } }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Readings by severity
              </Typography>
              <Box className="summary-chart-wrap" sx={chartWrapSx}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={severityBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis width={36} tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip formatter={(v: number) => [v, "Readings"]} />
                    <Bar dataKey="n" radius={[4, 4, 0, 0]} name="Readings">
                      {severityBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Daily mean gyro magnitude
              </Typography>
              <Box className="summary-chart-wrap" sx={chartWrapSx}>
                {dailyGyroLine.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyGyroLine} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis width={40} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip
                        formatter={(v: number) => [fmtNum(v, 2), "Avg gyro"]}
                        labelFormatter={(_, p) => {
                          const pl = p?.[0]?.payload as { date?: string } | undefined;
                          return pl?.date ? dayjs(pl.date).format("YYYY-MM-DD") : "";
                        }}
                      />
                      <Line type="monotone" dataKey="avgGyro" stroke="#2e7d32" strokeWidth={2} dot={false} name="Avg gyro" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
                    <Typography variant="caption" color="text.secondary">
                      No gyro samples in this window.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            <strong>Signal (3 mo)</strong> — Gyro mag: min {fmtNum(analysis.gyro.min, 2)} • med{" "}
            {fmtNum(analysis.gyro.median, 2)} • mean {fmtNum(analysis.gyro.mean, 2)} • max {fmtNum(analysis.gyro.max, 2)}
            {" · "}
            Vib count: min {fmtNum(analysis.vib.min, 0)} • med {fmtNum(analysis.vib.median, 0)} • mean{" "}
            {fmtNum(analysis.vib.mean, 1)} • max {fmtNum(analysis.vib.max, 0)}
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            <strong>Peaks (by reading count)</strong> — {peaksLine}
          </Typography>

          {consultReasons.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1.5, py: 0.5, "@media print": { py: 0.25 } }}>
              <Typography variant="body2" fontWeight={650} component="span" display="block" sx={{ mb: 0.25 }}>
                Consider clinical review
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {consultReasons.map((r) => (
                  <Typography component="li" variant="body2" key={r}>
                    {r}
                  </Typography>
                ))}
              </Box>
            </Alert>
          )}

          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.25 }}>
            Device-uploaded data; supports but does not replace clinical evaluation. Interpretation depends on placement
            and sampling.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
