import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@mui/material";
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

type ChartPoint = { t: string; value: number };

export default function EmgChart() {
  const [points, setPoints] = useState<ChartPoint[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadInitial = async () => {
      const sinceIso = dayjs().subtract(60, "minute").toISOString();
      const { data } = await supabase
        .from("emg_readings")
        .select("created_at, value_mv")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true });
      if (!isMounted) return;
      const pts = (data ?? []).map((r: any) => ({
        t: r.created_at,
        value: r.value_mv,
      }));
      setPoints(pts);
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
            [...prev, { t: row.created_at, value: row.value_mv }].slice(-2000)
          );
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const data = useMemo(
    () =>
      points.map((p) => ({
        time: dayjs(p.t).format("HH:mm:ss"),
        value: p.value,
      })),
    [points]
  );

  return (
    <Card>
      <CardHeader title="EMG - Real-time" subheader="Last 60 minutes" />
      <CardContent>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
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
        </div>
      </CardContent>
    </Card>
  );
}
