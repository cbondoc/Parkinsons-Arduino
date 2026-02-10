import { useEffect, useState } from "react";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { Button, Card, CardContent, CardHeader, Box } from "@mui/material";
import dayjs from "dayjs";
import { ArduinoLog, supabase } from "../lib/supabaseClient";

const columns: GridColDef[] = [
  {
    field: "created_at",
    headerName: "Time",
    flex: 1,
    valueFormatter: ({ value }) =>
      dayjs(value as string).format("YYYY-MM-DD HH:mm:ss"),
  },
  {
    field: "gyro_mag",
    headerName: "Gyro Magnitude",
    flex: 1,
    type: "number",
    valueFormatter: ({ value }) =>
      typeof value === "number" ? value.toFixed(2) : value,
  },
  {
    field: "vib_count",
    headerName: "Vibration Count",
    flex: 1,
    type: "number",
  },
  {
    field: "severity",
    headerName: "Severity",
    flex: 1,
    valueGetter: ({ value }) => value || "Unknown",
  },
];

export default function TremorTable() {
  const [rows, setRows] = useState<ArduinoLog[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);

  const fetchData = async () => {
    // First, try to get ANY data without date filter to check if table is accessible
    const { data: testData, error: testError } = await supabase
      .from("arduino_logs")
      .select("id, created_at")
      .limit(5);

    console.log(
      "Test query (no date filter):",
      testData?.length || 0,
      "records"
    );
    if (testError) {
      console.error("Test query error:", testError);
      console.error("This is likely an RLS (Row Level Security) issue.");
      console.error(
        "Run the SQL in setup_arduino_logs_rls.sql to fix permissions."
      );
      return;
    }
    if (testData && testData.length > 0) {
      console.log("Sample data:", testData[0]);
      console.log("Current time:", dayjs().toISOString());
    } else {
      console.warn(
        "No data returned - check RLS policies. Run setup_arduino_logs_rls.sql"
      );
    }

    const sinceIso = dayjs().subtract(1, "month").toISOString();
    console.log("Querying with date filter >=:", sinceIso);

    const { data, count, error } = await supabase
      .from("arduino_logs")
      .select("*", { count: "exact" })
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Error loading table data:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      return;
    }
    console.log(
      "Table data loaded:",
      data?.length || 0,
      "records, total count:",
      count
    );
    console.log("Since ISO:", sinceIso);

    // If no data with date filter, try without date filter (just limit)
    if ((!data || data.length === 0) && count === 0) {
      console.log("No data with date filter, trying without date filter...");
      const { data: allData, count: allCount } = await supabase
        .from("arduino_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(500);
      console.log(
        "Data without date filter:",
        allData?.length || 0,
        "records, count:",
        allCount
      );
      if (allData && allData.length > 0) {
        setRows(allData as ArduinoLog[]);
        setRowCount(allCount ?? 0);
        return;
      }
    }

    setRows((data ?? []) as ArduinoLog[]);
    setRowCount(count ?? 0);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <Card>
      <CardHeader
        title="Tremor History"
        action={
          <Button variant="outlined" size="small" onClick={fetchData}>
            Refresh
          </Button>
        }
      />
      <CardContent>
        <Box sx={{ width: "100%" }}>
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
            autoHeight
          />
        </Box>
      </CardContent>
    </Card>
  );
}
