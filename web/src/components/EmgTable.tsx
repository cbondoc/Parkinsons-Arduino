import { useEffect, useState } from "react";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { Stack, TextField, MenuItem, Button } from "@mui/material";
import dayjs from "dayjs";
import { EmgReading, supabase } from "../lib/supabaseClient";

const columns: GridColDef[] = [
  {
    field: "created_at",
    headerName: "Time",
    flex: 1,
    valueFormatter: ({ value }) =>
      dayjs(value as string).format("YYYY-MM-DD HH:mm:ss"),
  },
  { field: "device_id", headerName: "Device", flex: 1 },
  { field: "value_mv", headerName: "Value (mV)", flex: 1, type: "number" },
];

export default function EmgTable() {
  const [rows, setRows] = useState<EmgReading[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [devices, setDevices] = useState<string[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<string>("all");

  const fetchData = async () => {
    const sinceIso = dayjs().subtract(1, "month").toISOString();
    let query = supabase
      .from("emg_readings")
      .select("*", { count: "exact" })
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500);
    if (deviceFilter !== "all") {
      query = query.eq("device_id", deviceFilter);
    }
    const { data, count } = await query;
    setRows((data ?? []) as EmgReading[]);
    setRowCount(count ?? 0);
    // populate devices list lazily
    const { data: devs } = await supabase
      .from("emg_readings")
      .select("device_id")
      .not("device_id", "is", null)
      .limit(1000);
    const unique = Array.from(
      new Set((devs ?? []).map((r: any) => r.device_id))
    );
    setDevices(unique as string[]);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceFilter]);

  return (
    <div style={{ width: "100%", height: 480 }}>
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
        <Button variant="outlined" size="small" onClick={fetchData}>
          Refresh
        </Button>
      </Stack>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        pagination
        rowCount={rowCount}
        pageSizeOptions={[25, 50, 100, 200, 500]}
        initialState={{
          pagination: { paginationModel: { pageSize: 50, page: 0 } },
        }}
      />
    </div>
  );
}
