import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
} from "@mui/material";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import dayjs from "dayjs";
import { ArduinoLog, supabase } from "../lib/supabaseClient";

type ChartPoint = {
  t: string;
  value: number;
  severity: ArduinoLog["severity"] | null;
};

export default function TremorChart() {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [mode, setMode] = useState<"live" | "history">("live");
  const [error, setError] = useState<string | null>(null);

  // Load data based on mode
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      // For history mode, load last 1 month. For live mode, load last 30 minutes
      const timeWindow = mode === "history" ? 1 : 30; // months for history, minutes for live
      const sinceIso =
        mode === "history"
          ? dayjs().subtract(timeWindow, "month").toISOString()
          : dayjs().subtract(timeWindow, "minute").toISOString();
      console.log(
        `📈 Chart querying >= (${timeWindow} ${mode === "history" ? "month" : "minute"} window):`,
        sinceIso,
      );
      console.log(`📅 Current time:`, dayjs().toISOString());
      console.log(
        `📅 Timezone:`,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );

      // First, try without date filter to see if we can access any data
      console.log("🔍 Testing table access first...");
      const { error: testError, count: testCount } = await supabase
        .from("arduino_logs")
        .select("id", { count: "exact", head: true })
        .limit(1);

      if (testError) {
        console.error("❌ Table access error:", testError);
        setError(`Cannot access table: ${testError.message}`);
        return;
      }

      console.log(`📊 Table accessible. Total rows: ${testCount ?? "unknown"}`);

      // Live: order DESC so we get newest rows first (Supabase returns max 1000 per request)
      const { data, error, count } = await supabase
        .from("arduino_logs")
        .select("created_at, gyro_mag, severity", { count: "exact" })
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: mode === "history" })
        .limit(mode === "history" ? 20000 : 1000);

      if (!isMounted) return;

      if (error) {
        console.error("Error loading chart data:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        setError(`Error loading chart data: ${error.message}`);
        return;
      }
      setError(null);
      console.log(
        `📈 Chart data loaded: ${data?.length || 0} records (last ${timeWindow} ${mode === "history" ? "months" : "minutes"}), total in DB: ${count ?? "unknown"}`,
      );

      // If no data with date filter, try without date filter — fetch NEWEST rows first
      if (!data || data.length === 0) {
        console.log("No data with date filter, fetching newest rows...");
        const { data: allData, error: allError } = await supabase
          .from("arduino_logs")
          .select("created_at, gyro_mag, severity")
          .order("created_at", { ascending: false })
          .limit(mode === "history" ? 20000 : 5000);

        if (!isMounted) return;

        if (allError) {
          console.error("Error loading all data:", allError);
          setError(`Error loading data: ${allError.message}`);
          return;
        }

        console.log(
          `All data loaded: ${allData?.length || 0} records (newest first)`,
        );
        if (allData && allData.length > 0) {
          // Reverse so chart has chronological order (oldest → newest)
          const pts = [...allData].reverse().map((r) => ({
            t: r.created_at,
            value: r.gyro_mag,
            severity: r.severity ?? null,
          }));
          setPoints(pts);
          setError(null);
          return;
        }
      }

      const raw = data ?? [];
      const pts =
        mode === "live"
          ? [...raw]
              .reverse()
              .map((r) => ({
                t: r.created_at,
                value: r.gyro_mag,
                severity: r.severity ?? null,
              }))
          : raw.map((r) => ({
              t: r.created_at,
              value: r.gyro_mag,
              severity: r.severity ?? null,
            }));
      setPoints(pts);
      setError(null);
    };

    loadData();

    // Only subscribe to realtime in live mode
    if (mode === "live") {
      const channel = supabase
        .channel("arduino_logs_inserts")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "arduino_logs" },
          (payload) => {
            const row = payload.new as ArduinoLog;
            setPoints((prev) =>
              [
                ...prev,
                {
                  t: row.created_at,
                  value: row.gyro_mag,
                  severity: row.severity ?? null,
                },
              ].slice(-2000),
            );
          },
        )
        .subscribe();

      return () => {
        isMounted = false;
        supabase.removeChannel(channel);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [mode]);

  // Polling for live mode: always fetch last 30 min from server so UI matches Supabase latest
  useEffect(() => {
    if (mode !== "live") {
      return;
    }
    let isMounted = true;
    const poll = async () => {
      const sinceIso = dayjs().subtract(30, "minute").toISOString();
      // Order DESC to get newest rows first (Supabase returns max 1000 per request)
      const { data, error } = await supabase
        .from("arduino_logs")
        .select("created_at, gyro_mag, severity")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (!isMounted) return;
      if (error) {
        console.error("Live polling error:", error);
        setError(`Live polling error: ${error.message}`);
        return;
      }
      if (data && data.length >= 0) {
        // Reverse so chart is chronological; we now have newest 1000 in window
        setPoints(
          [...data]
            .reverse()
            .map((d) => ({
              t: d.created_at,
              value: d.gyro_mag,
              severity: d.severity ?? null,
            })),
        );
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [mode]);

  const data = useMemo(() => {
    const now = dayjs();
    // For live mode: show last 30 minutes. For history mode: show all loaded data (up to 1 month)
    const windowStart =
      mode === "live" ? now.subtract(30, "minute") : now.subtract(1, "month");

    const filtered = points.filter((p) => {
      const pointTime = dayjs(p.t);
      // For history, only show data within the 1-month window (and not in the future)
      // For live, only show recent data (within the window)
      if (mode === "history") {
        const inWindow =
          pointTime.valueOf() >= windowStart.valueOf() &&
          (pointTime.isBefore(now) || pointTime.isSame(now));
        return inWindow;
      } else {
        // Include data from windowStart to now (inclusive)
        // Use valueOf() for more reliable comparison
        const pointValue = pointTime.valueOf();
        const windowStartValue = windowStart.valueOf();
        const nowValue = now.valueOf();
        return pointValue >= windowStartValue && pointValue <= nowValue;
      }
    });

    console.log(`Filtered data: ${filtered.length} points for ${mode} mode`);
    console.log(`  Total points loaded: ${points.length}`);
    console.log(`  Window: ${windowStart.format()} to ${now.format()}`);
    if (points.length > 0) {
      const firstPoint = dayjs(points[0].t);
      const lastPoint = dayjs(points[points.length - 1].t);
      console.log(
        `  First point: ${firstPoint.format()} (${firstPoint.valueOf()})`,
      );
      console.log(
        `  Last point: ${lastPoint.format()} (${lastPoint.valueOf()})`,
      );
      console.log(
        `  Window start: ${windowStart.valueOf()}, Window end: ${now.valueOf()}`,
      );
      if (mode === "live" && filtered.length === 0 && points.length > 0) {
        // Show why points are being filtered out
        const samplePoint = points[Math.floor(points.length / 2)];
        const sampleTime = dayjs(samplePoint.t);
        console.warn(
          `  Sample point time: ${sampleTime.format()} (${sampleTime.valueOf()})`,
        );
        console.warn(
          `  Is after window start? ${sampleTime.valueOf() >= windowStart.valueOf()}`,
        );
        console.warn(
          `  Is before now? ${sampleTime.valueOf() <= now.valueOf()}`,
        );
      }
    }

    // Intensity from DB severity (matches firmware: NO TREMOR is vib==0, not low gyro).
    const INTENSE_THRESHOLD = 20000;
    const NO_TREMOR_CUTOFF = 1000;
    const toIntensity = (
      gyroMag: number,
      severity: ArduinoLog["severity"] | null,
    ): 0 | 1 | 2 => {
      if (severity === "NO TREMOR") return 0;
      if (severity === "MILD TREMOR") return 1;
      if (severity === "INTENSE TREMOR") return 2;
      // Legacy rows without severity: infer from gyro only
      return gyroMag >= INTENSE_THRESHOLD
        ? 2
        : gyroMag >= NO_TREMOR_CUTOFF
          ? 1
          : 0;
    };

    return filtered
      .sort((a, b) => dayjs(a.t).valueOf() - dayjs(b.t).valueOf())
      .map((p) => {
        const d = dayjs(p.t);
        return {
          time: d.format(mode === "history" ? "MM-DD HH:mm" : "HH:mm:ss"),
          timestamp: d.valueOf(),
          value: p.value,
          intensity: toIntensity(p.value, p.severity),
        };
      });
  }, [points, mode]);

  // For history mode, fix X-axis to full 1-month window so axis always spans 1 month
  const now = dayjs();
  const historyWindowStart = now.subtract(1, "month").valueOf();
  const historyWindowEnd = now.valueOf();
  const xAxisDomain =
    mode === "history" ? [historyWindowStart, historyWindowEnd] : undefined;

  const intensityLabels: Record<number, string> = {
    0: "No tremor",
    1: "Mild",
    2: "Intense",
  };

  return (
    <Card>
      <CardHeader
        title="Tremor Monitor - Real-time"
        subheader={
          data.length > 0
            ? `Showing ${data.length} points (${points.length} total loaded)`
            : points.length > 0
              ? `No data in selected time window (${points.length} total loaded)`
              : "No data - loading..."
        }
        action={
          <ToggleButtonGroup
            size="small"
            color="primary"
            value={mode}
            exclusive
            onChange={(_, v) => {
              if (v) setMode(v);
            }}
          >
            <ToggleButton value="live">Live (30m)</ToggleButton>
            <ToggleButton value="history">History (1mo)</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      <CardContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ width: "100%", maxWidth: 900, height: 320, mx: "auto" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={mode === "history" ? "timestamp" : "time"}
                type={mode === "history" ? "number" : "category"}
                domain={xAxisDomain}
                minTickGap={30}
                tickFormatter={
                  mode === "history"
                    ? (ts: number) => dayjs(ts).format("MM/DD")
                    : undefined
                }
              />
              <YAxis
                domain={[0, 2]}
                ticks={[0, 1, 2]}
                tickFormatter={(v) => intensityLabels[v] ?? ""}
                width={80}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === "intensity")
                    return [intensityLabels[value as 0 | 1 | 2] ?? value, "Intensity"];
                  return [value, name];
                }}
                labelFormatter={(label) =>
                  typeof label === "number"
                    ? dayjs(label).format("YYYY-MM-DD HH:mm")
                    : String(label)
                }
              />
              <Line
                type="monotone"
                dataKey="intensity"
                name="Intensity"
                stroke="#1976d2"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
}
