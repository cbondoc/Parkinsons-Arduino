# EMG Logger (React + Vite + Supabase)

This app logs EMG sensor readings every 30s from Arduino to Supabase and visualizes them with a real-time chart and a 1-month history table.

## Stack

- React + Vite (TS)
- Material UI + DataGrid
- Recharts
- Supabase (Postgres, Realtime, RLS)

## 1) Supabase Setup

1. Create a project at https://supabase.com.
2. Open SQL Editor: run `cleanup.sql` then `setup.sql` in this folder (full reset + schema, RLS, cron, seeds).
3. Get API values:
   - Project Settings → API → Project URL
   - anon public API key

## 2) Env vars

Create `web/.env` with:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_AI_CHAT_ENDPOINT=...
```

### AI chat (optional)

The **Ask AI** page calls a server-side endpoint so API keys are never exposed in the browser.

- Set `VITE_AI_CHAT_ENDPOINT` to a URL you control (example: a Supabase Edge Function, or a Vercel/Netlify serverless route).
- The frontend will send:

```json
{
  "messages": [{ "role": "system|user|assistant", "content": "..." }],
  "context": { "totals": { "readings": 123 }, "patterns": { "peakHours": [] } }
}
```

- Your endpoint must return:

```json
{ "reply": "..." }
```

#### Easiest setup: Supabase Edge Function + OpenAI

1) Install Supabase CLI (Windows):

```powershell
winget install Supabase.CLI
```

2) Login and link your project:

```powershell
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

3) Set secrets (server-side):

```powershell
supabase secrets set GEMINI_API_KEY=<YOUR_GEMINI_KEY>
supabase secrets set GEMINI_MODEL=gemini-flash-latest
```

4) Deploy the Edge Function:

```powershell
supabase functions deploy ai-chat
```

5) Point the frontend at the function:

- Your endpoint will be:
  - `https://<YOUR_PROJECT_REF>.functions.supabase.co/ai-chat`
- Add this to `web/.env`:

```env
VITE_AI_CHAT_ENDPOINT=https://<YOUR_PROJECT_REF>.functions.supabase.co/ai-chat
```

Then restart `npm run dev`.

## 3) Run locally

```
cd web
npm install
npm run dev
```

## 4) Deploy (optional)

- Push to GitHub, import in Vercel. Add env vars in Vercel Project → Settings → Environment Variables.

## 5) Arduino → Supabase

Send HTTP POST every 30s to Supabase REST:

- Endpoint: POST {VITE_SUPABASE_URL}/rest/v1/emg_readings
- Headers:
  - apikey: {VITE_SUPABASE_ANON_KEY}
  - Authorization: Bearer {VITE_SUPABASE_ANON_KEY}
  - Content-Type: application/json
  - Prefer: return=representation
- JSON body:

```
{ "device_id": "mega2560-1", "value_mv": 123.4 }
```

### ESP32 (recommended) example

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* SUPABASE_URL = "https://YOUR_REF.supabase.co";
const char* SUPABASE_ANON = "YOUR_ANON_KEY";

unsigned long lastPost = 0;

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi connected");
}

float readEMGmV() {
  // Example: read analog pin and convert to mV. Adjust for your sensor/scale.
  int raw = analogRead(34); // EMG signal to GPIO34 (ADC1)
  float voltage = (raw / 4095.0f) * 3300.0f; // mV @ 3.3V ref
  return voltage;
}

void loop() {
  if (millis() - lastPost >= 30000) {
    lastPost = millis();
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      String url = String(SUPABASE_URL) + "/rest/v1/emg_readings";
      http.begin(url);
      http.addHeader("apikey", SUPABASE_ANON);
      http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Prefer", "return=representation");

      float value_mv = readEMGmV();
      String payload = String("{\"device_id\":\"esp32-1\",\"value_mv\":") + String(value_mv, 2) + "}";
      int code = http.POST(payload);
      String resp = http.getString();
      Serial.printf("POST %d %s\n", code, resp.c_str());
      http.end();
    }
  }
}
```

### Mega 2560 + ESP8266 (AT firmware) notes

- Simpler: program ESP8266/ESP32 directly and stream sensor from Mega via UART.
- If Mega is main MCU, send readings via Serial to ESP8266; ESP8266 posts JSON.

## Data retention

A daily cron job deletes `emg_readings` rows older than 1 month (see `setup.sql`).

## Safety

Demo policies allow anon insert/select. For production, use a service role for inserts.
