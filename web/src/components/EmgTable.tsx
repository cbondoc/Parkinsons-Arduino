import { useEffect, useState } from "react";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
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

  useEffect(() => {
    const fetchData = async () => {
      const sinceIso = dayjs().subtract(1, "month").toISOString();
      const { data, count } = await supabase
        .from("emg_readings")
        .select("*", { count: "exact" })
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data ?? []) as EmgReading[]);
      setRowCount(count ?? 0);
    };
    fetchData();
  }, []);

  return (
    <div style={{ width: "100%", height: 420 }}>
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
