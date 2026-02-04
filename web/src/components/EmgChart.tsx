import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  ToggleButtonGroup,
  ToggleButton,
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

type ChartPoint = { t: string; value: number };

export default function EmgChart() {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [mode, setMode] = useState<"live" | "history">("live");

  // Load data based on mode
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      // For history mode, load last 3 months. For live mode, load last 24 hours
      const timeWindow = mode === "history" ? 90 : 1; // days
      const sinceIso = dayjs().subtract(timeWindow, "day").toISOString();
      console.log(`Chart querying >= (${timeWindow} day window):`, sinceIso);
      console.log(`Current time:`, dayjs().toISOString());
      
      const { data, error } = await supabase
        .from("arduino_logs")
        .select("created_at, emg_value")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(mode === "history" ? 20000 : 5000);

      if (!isMounted) return;

      if (error) {
        console.error("Error loading chart data:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        return;
      }
      console.log(
        `Chart data loaded: ${data?.length || 0} records (last ${timeWindow} day(s))`
      );
      const pts = (data ?? []).map((r) => ({
        t: r.created_at,
        value: r.emg_value,
      }));
      setPoints(pts);
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
                  value: row.emg_value,
                },
              ].slice(-2000)
            );
          }
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

  // Polling fallback for live mode (helps when realtime is not enabled on the table)
  useEffect(() => {
    if (mode !== "live") {
      return;
    }
    let isMounted = true;
    const poll = async () => {
      const sinceIso = dayjs().subtract(15, "minute").toISOString();
      const { data, error } = await supabase
        .from("arduino_logs")
        .select("created_at, emg_value")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(2000);
      if (!isMounted) return;
      if (error) {
        console.error("Live polling error:", error);
        return;
      }
      if (data) {
        setPoints((prev) => {
          // merge new data keeping order and de-duping by timestamp/value pair
          const merged = [...prev];
          data.forEach((d) => {
            const key = `${d.created_at}-${d.emg_value}`;
            const exists = merged.find((p) => `${p.t}-${p.value}` === key);
            if (!exists) {
              merged.push({ t: d.created_at, value: d.emg_value });
            }
          });
          return merged.slice(-2000);
        });
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
    // For live mode: show last 10 minutes
    // For history mode: show all loaded data (up to 30 days)
    const windowStart =
      mode === "live" 
        ? now.subtract(10, "minute") 
        : now.subtract(90, "day"); // Show up to 90 days for history (covers all loaded data)

    const filtered = points.filter((p) => {
      const pointTime = dayjs(p.t);
      // For history, show all data that's not in the future
      // For live, only show recent data
      if (mode === "history") {
        return pointTime.isBefore(now) || pointTime.isSame(now);
      } else {
        return pointTime.isAfter(windowStart) && pointTime.isBefore(now);
      }
    });

    console.log(`Filtered data: ${filtered.length} points for ${mode} mode`);
    console.log(`  Total points loaded: ${points.length}`);
    console.log(`  Window: ${windowStart.format()} to ${now.format()}`);
    if (points.length > 0) {
      console.log(`  First point: ${dayjs(points[0].t).format()}`);
      console.log(`  Last point: ${dayjs(points[points.length - 1].t).format()}`);
    }

    return filtered
      .sort((a, b) => dayjs(a.t).valueOf() - dayjs(b.t).valueOf())
      .map((p) => ({
        time: dayjs(p.t).format(mode === "history" ? "MM-DD HH:mm" : "HH:mm:ss"),
        value: p.value,
      }));
  }, [points, mode]);

  return (
    <Card>
      <CardHeader
        title="EMG - Real-time"
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
            <ToggleButton value="live">Live (10m)</ToggleButton>
            <ToggleButton value="history">History (24h)</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      <CardContent>
        <Box sx={{ width: "100%", maxWidth: 900, height: 320, mx: "auto" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" minTickGap={30} />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
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
