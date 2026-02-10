import {
  AppBar,
  Box,
  Container,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import TremorChart from "./components/TremorChart";
import TremorTable from "./components/TremorTable";
import { useContext, useEffect, useState } from "react";
import { ColorModeContext } from "./theme/AppThemeProvider";
import { supabase } from "./lib/supabaseClient";
import { Alert } from "@mui/material";

export default function App() {
  const { toggleColorMode } = useContext(ColorModeContext);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    // Test Supabase connection on mount
    const testConnection = async () => {
      console.log("🔌 Testing Supabase connection...");
      const envUrl = import.meta.env.VITE_SUPABASE_URL;
      const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!envUrl || !envKey) {
        setConnectionError("Missing Supabase environment variables. Check your .env file.");
        return;
      }

      try {
        // Try a simple query to test connection
        const { error, count } = await supabase
          .from("arduino_logs")
          .select("*", { count: "exact", head: true })
          .limit(0);

        if (error) {
          console.error("❌ Connection test error:", error);
          setConnectionError(`Database error: ${error.message}. Check RLS policies.`);
        } else {
          console.log("✅ Supabase connection successful");
          console.log(`📊 Total rows in arduino_logs: ${count ?? "unknown"}`);
          setConnectionError(null);
        }
      } catch (err) {
        console.error("❌ Connection test failed:", err);
        setConnectionError(`Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    };

    testConnection();
  }, []);

  return (
    <>
      <AppBar position="sticky" color="default" enableColorOnDark>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Tremor Monitor
          </Typography>
          <IconButton
            color="inherit"
            onClick={toggleColorMode}
            aria-label="Toggle dark mode"
          >
            <Brightness4Icon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg">
        <Box sx={{ maxWidth: 960, mx: "auto" }}>
          {connectionError && (
            <Alert severity="error" sx={{ mt: 2, mb: 2 }} onClose={() => setConnectionError(null)}>
              {connectionError}
            </Alert>
          )}
          <Stack spacing={3}>
            <Box sx={{ pt: 3 }}>
              <TremorChart />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                History (last month)
              </Typography>
              <TremorTable />
            </Box>
          </Stack>
        </Box>
      </Container>
    </>
  );
}
