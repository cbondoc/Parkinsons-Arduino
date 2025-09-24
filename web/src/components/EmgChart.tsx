import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Stack,
  TextField,
  MenuItem,
  Box,
  Tabs,
  Tab,
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
import { EmgReading, supabase } from "../lib/supabaseClient";

type ChartPoint = { t: string; value: number; device_id?: string | null };
type ViewMode = "realtime" | "last";

export default function EmgChart() {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("last");

  // Maintain device list independently
  useEffect(() => {
    let isMounted = true;
    const fetchDevices = async () => {
      const { data: devs } = await supabase
        .from("emg_readings")
        .select("device_id")
        .not("device_id", "is", null)
        .limit(1000);
      if (!isMounted) return;
      const unique = Array.from(
        new Set((devs ?? []).map((r: any) => r.device_id))
      );
      setDevices(unique as string[]);
    };
    fetchDevices();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load data based on mode and manage realtime subscription
  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const buildBaseQuery = () => {
      let query = supabase
        .from("emg_readings")
        .select("created_at, value_mv, device_id");
      if (deviceFilter !== "all") {
        query = query.eq("device_id", deviceFilter);
      }
      return query;
    };

    const toPoints = (rows: any[]) =>
      (rows ?? []).map((r: any) => ({
        t: r.created_at,
        value: r.value_mv,
        device_id: r.device_id as string | null,
      }));

    const loadRealtime = async () => {
      const sinceIso = dayjs().subtract(60, "minute").toISOString();
      const { data } = await buildBaseQuery()
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true });
      if (!isMounted) return;
      setPoints(toPoints(data ?? []));

      channel = supabase
        .channel("emg_readings_inserts")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "emg_readings" },
          (payload) => {
            const row = payload.new as EmgReading;
            if (deviceFilter !== "all" && row.device_id !== deviceFilter)
              return;
            setPoints((prev) =>
              [
                ...prev,
                {
                  t: row.created_at,
                  value: row.value_mv,
                  device_id: row.device_id,
                },
              ].slice(-2000)
            );
          }
        )
        .subscribe();
    };

    const loadLastLog = async () => {
      // Find latest timestamp for the selected device (or overall)
      const { data: latestRows } = await buildBaseQuery()
        .order("created_at", { ascending: false })
        .limit(1);
      const latest = latestRows && latestRows[0]?.created_at;
      if (!latest) {
        if (isMounted) setPoints([]);
        return;
      }
      const end = dayjs(latest);
      const start = end.subtract(60, "minute");
      const { data } = await buildBaseQuery()
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true });
      if (!isMounted) return;
      setPoints(toPoints(data ?? []));
    };

    if (viewMode === "realtime") {
      loadRealtime();
    } else {
      loadLastLog();
    }

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [viewMode, deviceFilter]);

  const data = useMemo(() => {
    const filtered =
      deviceFilter === "all"
        ? points
        : points.filter((p) => p.device_id === deviceFilter);
    return filtered.map((p) => ({
      time: dayjs(p.t).format("HH:mm:ss"),
      value: p.value,
    }));
  }, [points, deviceFilter]);

  return (
    <Card>
      <CardHeader
        title="EMG"
        subheader={
          viewMode === "realtime"
            ? "Real-time (last 60 minutes)"
            : "Last log (60 minutes ending at latest reading)"
        }
      />
      <CardContent>
        <Stack
          direction="row"
          spacing={2}
          sx={{ mb: 2, alignItems: "center", justifyContent: "space-between" }}
        >
          <Tabs
            value={viewMode}
            onChange={(_, v) => setViewMode(v)}
            aria-label="EMG view mode"
          >
            <Tab label="Real-time" value="realtime" />
            <Tab label="Last log" value="last" />
          </Tabs>
          <TextField
            select
            size="small"
            label="Device"
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            sx={{ width: 220 }}
          >
            <MenuItem value="all">All devices</MenuItem>
            {devices.map((d) => (
              <MenuItem key={d} value={d}>
                {d}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Box sx={{ width: "100%", maxWidth: 900, height: 320, mx: "auto" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" minTickGap={30} />
              <YAxis unit=" mV" />
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
