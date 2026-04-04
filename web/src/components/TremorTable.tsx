import { useEffect, useState } from "react";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { Button, Card, CardContent, CardHeader, Box, Alert, CircularProgress } from "@mui/material";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    // First, check Supabase connection
    console.log("🔍 Checking Supabase connection...");
    console.log("Supabase URL:", import.meta.env.VITE_SUPABASE_URL ? "✓ Set" : "✗ Missing");
    console.log("Supabase Key:", import.meta.env.VITE_SUPABASE_ANON_KEY ? "✓ Set" : "✗ Missing");
    
    // First, try to get ANY data without date filter to check if table is accessible
    console.log("📊 Testing table access (no filters)...");
    const { data: testData, error: testError, count: testCount } = await supabase
      .from("arduino_logs")
      .select("id, created_at", { count: "exact" })
      .limit(5);

    console.log(
      "Test query result:",
      testData?.length || 0,
      "records",
      "Total count:",
      testCount ?? "unknown"
    );
    
    if (testError) {
      console.error("❌ Test query error:", testError);
      console.error("Error code:", testError.code);
      console.error("Error details:", testError);
      const errorMsg = `Database error: ${testError.message} (Code: ${testError.code}). This is likely an RLS (Row Level Security) issue. Check your Supabase RLS policies.`;
      setError(errorMsg);
      setLoading(false);
      return;
    }
    
    if (testData && testData.length > 0) {
      console.log("✅ Sample data found:", testData[0]);
      console.log("Current time:", dayjs().toISOString());
    } else {
      console.warn("⚠️ No data returned from test query");
      console.warn("Possible causes:");
      console.warn("  1. Table is empty");
      console.warn("  2. RLS policies are blocking access (run web/setup.sql in Supabase SQL Editor)");
      console.warn("  3. Wrong table name (expected: arduino_logs)");
      console.warn("  4. Wrong Supabase project/database");
      
      // Try to get exact row count
      const { count: exactCount, error: countError } = await supabase
        .from("arduino_logs")
        .select("*", { count: "exact", head: true });
      
      console.log("Table exists check:", countError ? `Error: ${countError.message}` : "✅ Table accessible");
      console.log("📊 Total rows in arduino_logs table:", exactCount ?? "unknown");
      
      if (exactCount === 0) {
        console.warn("⚠️ Table is EMPTY. No data found in arduino_logs.");
        console.warn("💡 Make sure:");
        console.warn("   1. You're connected to the correct Supabase project");
        console.warn("   2. Data has been inserted into the arduino_logs table");
        console.warn("   3. Check Supabase Table Editor to verify data exists");
      }
    }

    // Try a broader date range first - check last 6 months
    const sinceIso = dayjs().subtract(6, "month").toISOString();
    console.log("📅 Querying with date filter >= (6 months):", sinceIso);
    console.log("📅 Current time:", dayjs().toISOString());

    const { data, count, error } = await supabase
      .from("arduino_logs")
      .select("*", { count: "exact" })
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Error loading table data:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      setError(`Error loading data: ${error.message}`);
      setLoading(false);
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
    setLoading(false);
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
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {loading && !error && (
            <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
              <CircularProgress />
            </Box>
          )}
          {!loading && !error && rows.length === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No data found. Make sure your Supabase environment variables are set and RLS policies allow read access.
            </Alert>
          )}
          {!loading && rows.length > 0 && (
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
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
