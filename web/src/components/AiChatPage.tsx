import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { ArduinoLog, supabase } from "../lib/supabaseClient";

type ChatRole = "user" | "assistant" | "system";
type UiMessage = {
  id: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  ts: number;
};

function summarizeForAi(logs: ArduinoLog[]) {
  if (!logs.length) return null;
  const bySeverity = { no: 0, mild: 0, intense: 0, unknown: 0 };
  let intenseCount = 0;
  const byHour: Record<number, number> = {};
  const byDay: Record<number, number> = {};
  const byDate: Record<string, number> = {};

  let minGm: number | null = null;
  let maxGm: number | null = null;
  let sumGm = 0;
  let cntGm = 0;

  for (const l of logs) {
    const sev = (l as any).severity as string | undefined;
    if (sev === "NO TREMOR") bySeverity.no += 1;
    else if (sev === "MILD TREMOR") bySeverity.mild += 1;
    else if (sev === "INTENSE TREMOR") {
      bySeverity.intense += 1;
      intenseCount += 1;
    } else bySeverity.unknown += 1;

    const d = dayjs((l as any).created_at);
    const hour = d.hour();
    const day = d.day();
    const dateKey = d.format("YYYY-MM-DD");
    byHour[hour] = (byHour[hour] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;
    byDate[dateKey] = (byDate[dateKey] || 0) + 1;

    const gm = (l as any).gyro_mag;
    if (typeof gm === "number" && Number.isFinite(gm)) {
      minGm = minGm === null ? gm : Math.min(minGm, gm);
      maxGm = maxGm === null ? gm : Math.max(maxGm, gm);
      sumGm += gm;
      cntGm += 1;
    }
  }

  const createdTimes = logs
    .map((l) => (l as any).created_at as string | undefined)
    .filter(Boolean) as string[];
  createdTimes.sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf());
  const range =
    createdTimes.length > 0
      ? { start: createdTimes[0], end: createdTimes[createdTimes.length - 1] }
      : null;

  const total = logs.length;
  const daysWithData = Object.keys(byDate).length || 1;
  const tremorReadings = bySeverity.mild + bySeverity.intense;
  const intenseShare = total > 0 ? (bySeverity.intense / total) * 100 : 0;

  const peakHours = Object.entries(byHour)
    .map(([h, c]) => ({ hour: Number(h), count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const peakDays = Object.entries(byDay)
    .map(([d, c]) => ({ day: Number(d), count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    dataWindow: "last_3_months",
    range,
    totals: {
      readings: total,
      daysWithData,
      severity: bySeverity,
      tremorReadingsPerDayAvg: tremorReadings / daysWithData,
      intenseReadingsPerDayAvg: intenseCount / daysWithData,
      intenseSharePct: intenseShare,
    },
    gyroMag: {
      min: minGm,
      max: maxGm,
      mean: cntGm ? sumGm / cntGm : null,
    },
    patterns: {
      peakHours,
      peakDays,
    },
  };
}

async function postChat(
  endpoint: string,
  payload: {
    messages: { role: ChatRole; content: string }[];
    context: unknown;
  },
  signal?: AbortSignal,
): Promise<{ reply: string }> {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
    | string
    | undefined;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (supabaseAnonKey && supabaseAnonKey.trim().length > 0) {
    headers.apikey = supabaseAnonKey;
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    let details = "";
    try {
      details = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`AI request failed (${res.status}). ${details}`.trim());
  }

  const json = (await res.json()) as any;
  const reply = typeof json?.reply === "string" ? json.reply : null;
  if (!reply) throw new Error("AI response missing `reply` string.");
  return { reply };
}

export default function AiChatPage() {
  const endpoint = import.meta.env.VITE_AI_CHAT_ENDPOINT as string | undefined;

  const [logs, setLogs] = useState<ArduinoLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [messages, setMessages] = useState<UiMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content:
        "Ask me questions about the tremor findings (patterns, severity, what to discuss with your doctor, what the numbers mean). I’ll use your recent data summary for context.",
      ts: Date.now(),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoadingLogs(true);
      setLogsError(null);
      const sinceIso = dayjs().subtract(3, "month").toISOString();
      const { data, error } = await supabase
        .from("arduino_logs")
        .select("id, created_at, gyro_mag, severity, vib_count")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(20000);

      if (!isMounted) return;
      if (error) {
        setLogsError(error.message);
        setLoadingLogs(false);
        return;
      }
      setLogs((data ?? []) as ArduinoLog[]);
      setLoadingLogs(false);
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const context = useMemo(() => summarizeForAi(logs), [logs]);

  const canSend = !sending && draft.trim().length > 0;

  const send = async () => {
    const question = draft.trim();
    if (!question) return;

    setDraft("");
    const userMsg: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    if (!endpoint) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "AI is not configured yet. To enable chat, set `VITE_AI_CHAT_ENDPOINT` (a server-side endpoint that calls your AI provider without exposing API keys).",
          ts: Date.now(),
        },
      ]);
      return;
    }

    setSending(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const systemPrompt =
      "You are a helpful health assistant. You explain the tremor report in plain language, highlight patterns, and suggest what to ask a clinician. " +
      "Do not diagnose. If asked for medical advice, recommend consulting a licensed clinician. " +
      "Use the provided `context` summary as the only patient data.";

    const payload = {
      messages: [
        { role: "system" as const, content: systemPrompt },
        ...messages.slice(-12).map((m) => ({ role: m.role as ChatRole, content: m.content })),
        { role: "user" as const, content: question },
      ],
      context,
    };

    try {
      const { reply } = await postChat(endpoint, payload, abortRef.current.signal);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: reply, ts: Date.now() },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            e instanceof Error
              ? `Sorry — I couldn’t reach the AI service. ${e.message}`
              : "Sorry — I couldn’t reach the AI service.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setSending(false);
  };

  return (
    <Box sx={{ pt: 3, pb: 5 }}>
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={650}>
          Ask AI about your findings
        </Typography>
        <Typography color="text.secondary">
          This chat can explain what the summary means and help you prepare questions for your doctor.
        </Typography>

        {!endpoint && (
          <Alert severity="warning">
            AI is not configured. Set <code>VITE_AI_CHAT_ENDPOINT</code> to enable chat (use a server-side proxy; never put an AI API key in the browser).
          </Alert>
        )}

        {loadingLogs && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Loading your recent tremor data summary…
            </Typography>
          </Box>
        )}
        {logsError && <Alert severity="error">Could not load logs: {logsError}</Alert>}
        {!loadingLogs && !logsError && !context && (
          <Alert severity="info">No readings yet. Once readings are available, the AI will use them as context.</Alert>
        )}

        <Card>
          <CardHeader
            avatar={<SmartToyIcon color="primary" />}
            title="Chat"
            subheader={context ? "Using last 3 months of readings as context" : "No data context yet"}
          />
          <CardContent>
            <Stack spacing={1.5} sx={{ maxHeight: 440, overflowY: "auto", pr: 1 }}>
              {messages.map((m) => (
                <Box
                  key={m.id}
                  sx={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <PaperMessage role={m.role} content={m.content} />
                </Box>
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                label="Ask a question"
                placeholder='e.g. "What does intense share mean?" or "When should I talk to my doctor?"'
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) void send();
                  }
                }}
                multiline
                minRows={2}
              />
              <Stack direction="row" spacing={1} alignItems="stretch">
                <Button
                  variant="contained"
                  endIcon={<SendIcon />}
                  onClick={() => void send()}
                  disabled={!canSend}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {sending ? "Sending…" : "Send"}
                </Button>
                {sending && (
                  <Button variant="outlined" onClick={stop}>
                    Stop
                  </Button>
                )}
              </Stack>
            </Stack>

            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1.5 }}>
              This chat is informational and not a diagnosis. Always discuss medical decisions with a licensed clinician.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

function PaperMessage({ role, content }: { role: UiMessage["role"]; content: string }) {
  return (
    <Box
      sx={{
        maxWidth: "80ch",
        px: 1.5,
        py: 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor: role === "user" ? "primary.main" : "divider",
        bgcolor: role === "user" ? "primary.main" : "background.paper",
        color: role === "user" ? "primary.contrastText" : "text.primary",
        whiteSpace: "pre-wrap",
      }}
    >
      <Typography variant="body2">{content}</Typography>
    </Box>
  );
}

