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
import EmgChart from "./components/EmgChart";
import EmgTable from "./components/EmgTable";
import { useContext } from "react";
import { ColorModeContext } from "./theme/AppThemeProvider";

export default function App() {
  const { toggleColorMode } = useContext(ColorModeContext);
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
          <Stack spacing={3}>
            <Box sx={{ pt: 3 }}>
              <EmgChart />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                History (last month)
              </Typography>
              <EmgTable />
            </Box>
          </Stack>
        </Box>
      </Container>
    </>
  );
}
