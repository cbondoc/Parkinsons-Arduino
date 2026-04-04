import {
  AppBar,
  Box,
  Container,
  Drawer,
  IconButton,
  Link,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import CloseIcon from "@mui/icons-material/Close";
import SettingsIcon from "@mui/icons-material/Settings";
import { useCallback, useContext, useEffect, useState } from "react";
import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ColorModeContext } from "./theme/AppThemeProvider";
import { supabase } from "./lib/supabaseClient";
import { Alert } from "@mui/material";
import TremorChart from "./components/TremorChart";
import TremorTable from "./components/TremorTable";
import SuggestionsPage from "./components/SuggestionsPage";
import SummaryPage from "./components/SummaryPage";
import AiChatPage from "./components/AiChatPage";
import SettingsPage from "./components/SettingsPage";
import NotificationPanel from "./components/NotificationPanel";
import { useReminderNotifications } from "./hooks/useReminderNotifications";

const navLinkSx = {
  color: "inherit",
  textDecoration: "none",
  px: 1.5,
  py: 1,
  borderRadius: 1,
  "&.active": { bgcolor: "action.selected", fontWeight: 600 },
};

function SettingsDeepLink({ onOpen }: { onOpen: () => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    onOpen();
    navigate("/", { replace: true });
  }, [navigate, onOpen]);
  return null;
}

export default function App() {
  const { toggleColorMode } = useContext(ColorModeContext);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notifAnchor, setNotifAnchor] = useState<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();
  const envOk = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  const { notifications, dismiss, clearAll, refreshReminders } = useReminderNotifications(envOk);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

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
      <AppBar position="sticky" color="default" enableColorOnDark className="print-hide">
        <Toolbar>
          <Typography variant="h6" sx={{ mr: 2 }}>
           Tremor Evaluation Platform
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1 }}>
            <Link component={NavLink} to="/" sx={navLinkSx}>
              Monitor
            </Link>
            <Link component={NavLink} to="/suggestions" sx={navLinkSx}>
             Recommendations
            </Link>
            <Link component={NavLink} to="/summary" sx={navLinkSx}>
              Summary
            </Link>
            <Link component={NavLink} to="/ask-ai" sx={navLinkSx}>
              Ask AI
            </Link>
          </Stack>
          <NotificationPanel
            anchorEl={notifAnchor}
            open={Boolean(notifAnchor)}
            onClose={() => setNotifAnchor(null)}
            notifications={notifications}
            onDismiss={dismiss}
            onClearAll={clearAll}
            onToggle={(el) => setNotifAnchor((prev) => (prev ? null : el))}
          />
          <IconButton
            color="inherit"
            onClick={openSettings}
            aria-label="Open settings"
          >
            <SettingsIcon />
          </IconButton>
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
            <Route path="/summary" element={<SummaryPage />} />
            <Route path="/ask-ai" element={<AiChatPage />} />
            <Route path="/settings" element={<SettingsDeepLink onOpen={openSettings} />} />
          </Routes>
          {location.pathname === "/suggestions" && (
            <Box sx={{ pt: 3, pb: 4 }} />
          )}
        </Box>
      </Container>
      <Drawer
        anchor="right"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 440 },
            maxWidth: "100vw",
          },
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="h6" component="h2">
              Settings
            </Typography>
            <IconButton onClick={() => setSettingsOpen(false)} aria-label="Close settings" edge="end">
              <CloseIcon />
            </IconButton>
          </Stack>
          <Box sx={{ flex: 1, overflow: "auto", px: 2, pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Reminders appear in the bell menu when the schedule matches your device time.
            </Typography>
            <SettingsPage hideHeader onRemindersChanged={refreshReminders} />
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
