import { Container, CssBaseline, Stack, Typography } from "@mui/material";
import EmgChart from "./components/EmgChart";
import EmgTable from "./components/EmgTable";

export default function App() {
  return (
    <>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Typography variant="h4" component="h1">
            EMG Logger
          </Typography>
          <EmgChart />
          <Typography variant="h6">History (last month)</Typography>
          <EmgTable />
        </Stack>
      </Container>
    </>
  );
}
