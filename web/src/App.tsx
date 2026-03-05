import {
  AppBar,
  Box,
  Container,
  IconButton,
  Link,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import { useContext, useEffect, useState } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { ColorModeContext } from "./theme/AppThemeProvider";
import { supabase } from "./lib/supabaseClient";
import { Alert } from "@mui/material";
import TremorChart from "./components/TremorChart";
import TremorTable from "./components/TremorTable";
import SuggestionsPage from "./components/SuggestionsPage";

const navLinkSx = {
  color: "inherit",
  textDecoration: "none",
  px: 1.5,
  py: 1,
  borderRadius: 1,
  "&.active": { bgcolor: "action.selected", fontWeight: 600 },
};

export default function App() {
  const { toggleColorMode } = useContext(ColorModeContext);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    const testConnection = async () => {
      console.log("🔌 Testing Supabase connection...");
      const envUrl = import.meta.env.VITE_SUPABASE_URL;
      const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!envUrl || !envKey) {
        setConnectionError("Missing Supabase environment variables. Check your .env file.");
        return;
      }

      try {
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
          <Typography variant="h6" sx={{ mr: 2 }}>
            Tremor Monitoring System
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1 }}>
            <Link component={NavLink} to="/" sx={navLinkSx}>
              Monitor
            </Link>
            <Link component={NavLink} to="/suggestions" sx={navLinkSx}>
              Suggestions
            </Link>
          </Stack>
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
          <Routes>
            <Route
              path="/"
              element={
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
              }
            />
            <Route path="/suggestions" element={<SuggestionsPage />} />
          </Routes>
          {location.pathname === "/suggestions" && (
            <Box sx={{ pt: 3, pb: 4 }} />
          )}
        </Box>
      </Container>
    </>
  );
}
