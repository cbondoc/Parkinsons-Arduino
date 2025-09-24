import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Stack,
  TextField,
  MenuItem,
  Box,
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

export default function EmgChart() {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<string>("all");

  useEffect(() => {
    let isMounted = true;

    const loadInitial = async () => {
      const sinceIso = dayjs().subtract(60, "minute").toISOString();
      const { data } = await supabase
        .from("emg_readings")
        .select("created_at, value_mv, device_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true });
      if (!isMounted) return;
      const pts = (data ?? []).map((r: any) => ({
        t: r.created_at,
        value: r.value_mv,
        device_id: r.device_id as string | null,
      }));
      setPoints(pts);
      const uniqueDevices = Array.from(
        new Set(
          (data ?? []).map((r: any) => r.device_id).filter((d: any) => !!d)
        )
      );
      setDevices(uniqueDevices as string[]);
    };

    loadInitial();

    const channel = supabase
      .channel("emg_readings_inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "emg_readings" },
        (payload) => {
          const row = payload.new as EmgReading;
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
          setDevices((prev) => {
            const set = new Set(prev);
            if (row.device_id) set.add(row.device_id);
            return Array.from(set);
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

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
      <CardHeader title="EMG - Real-time" subheader="Last 60 minutes" />
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
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
