#include <Wire.h>
#include <Arduino_LED_Matrix.h>
#include <WiFiS3.h>

/* ==================== CALIBRATION ==================== */
// Set to 1 to run LED matrix calibration, then 0 when done.
// Open Serial Monitor (115200), watch the LED: each step shows ONE corner or full.
// Tell me which physical position lights for step 1, 2, 3, 4 (e.g. "1=bottom-right, 2=bottom-left").
#define CALIBRATE 0

/* ==================== WIFI / SUPABASE ==================== */

const char* WIFI_SSID = "parkinsons";
const char* WIFI_PASS = "12345678";

const char SUPABASE_HOST[] = "emnblgwvbearctiqlfwe.supabase.co";
const char SUPABASE_API_KEY[] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtbmJsZ3d2YmVhcmN0aXFsZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MTM3MDcsImV4cCI6MjA3NDI4OTcwN30.h0dJYX5Vk_353hqRT8a_lURfiWKEHqVWSk2leY9zMzY";
const char SUPABASE_PATH[] = "/rest/v1/arduino_logs";

WiFiSSLClient sslClient;

/* ==================== PINS ==================== */
#define VIB_PIN    7
#define BUZZER_PIN 8

// MPU6050 I2C address: 0x68 (AD0 low) or 0x69 (AD0 high). Set at runtime by initMPU6050().
uint8_t mpuAddr = 0;

/* ==================== OBJECTS ==================== */
ArduinoLEDMatrix matrix;

/* ==================== LED FRAMES ==================== */
const uint32_t FRAME_OFF[3]     = { 0, 0, 0 };
const uint32_t FRAME_MILD[3]    = { 0x00001800, 0x00003C00, 0x00001800 };
const uint32_t FRAME_INTENSE[3] = { 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF };
// Up arrow (send/upload) when sending to Supabase — ..*.. / ***** / ..*.. / ..*..
const uint32_t FRAME_SEND[3]    = { 0x00002002, 0x00780200, 0x20000000 };

// Calibration: single-LED frames (row-major 12x8, our assumed layout)
// 1=top-left, 2=top-right, 3=bottom-left, 4=bottom-right, 5=all on
const uint32_t CAL_TOP_LEFT[3]     = { 0x80000000, 0x00000000, 0x00000000 };
const uint32_t CAL_TOP_RIGHT[3]    = { 0x00100000, 0x00000000, 0x00000000 };
const uint32_t CAL_BOTTOM_LEFT[3]  = { 0x00000000, 0x00000000, 0x00000800 };
const uint32_t CAL_BOTTOM_RIGHT[3] = { 0x00000000, 0x00000000, 0x00000001 };

/* ==================== SENSOR ==================== */
int16_t gx, gy, gz;
float gyroMag = 0;  // magnitude = sqrt(gx²+gy²+gz²), raw units ~0 to ~56756

/* ==================== SEVERITY RANGES (sensor → severity) ====================
 *  Gyro:   gyroMag (float) — rotation magnitude from MPU6050 raw 16-bit values.
 *  Vib:    vibCount (int)  — number of HIGH readings on VIB_PIN in last 1 second.
 *
 *  NO TREMOR:      vibCount == 0              (gyro ignored)
 *  MILD TREMOR:    vibCount >= 1  AND gyroMag < GYRO_INTENSE_THRESHOLD
 *  INTENSE TREMOR: vibCount >= 1  AND gyroMag >= GYRO_INTENSE_THRESHOLD
 * ============================================================================ */
#define GYRO_INTENSE_THRESHOLD 20000

/* ==================== VIBRATION ==================== */
int vibCount = 0;
unsigned long vibTimer = 0;

/* ==================== LOG BUFFER ==================== */
#define MAX_LOGS 50  // Only keep last 50 logs
struct LogEntry {
  float gyro;
  int vib;
  const char* severity;
};
LogEntry logs[MAX_LOGS];
int logCount = 0;

/* ==================== TIMING ==================== */
unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL = 5000;

/* ==================== NON-BLOCKING SEND STATE ==================== */
enum SendState {
  SEND_IDLE,
  SEND_CONNECTING,
  SEND_WRITING,
  SEND_READING,
  SEND_DONE
};
SendState sendState = SEND_IDLE;
String sendPayload;           // built once when send starts
int sendLogCount = 0;         // snapshot size we're sending
LogEntry sendLogs[MAX_LOGS];  // snapshot so main buffer can keep filling
unsigned int sendReadPos = 0; // for detecting "201" in response
bool sendSaw201 = false;
const unsigned long SEND_READ_TIMEOUT_MS = 15000;
unsigned long sendReadStart = 0;

/* ==================== MPU6050 (I2C) ==================== */
#define MPU_REG_WHO_AM_I  0x75
#define MPU_REG_PWR_MGMT  0x6B
#define MPU_REG_GYRO_CFG  0x1B
#define MPU_REG_GYRO_XH   0x43

static uint8_t mpuReadReg(uint8_t addr, uint8_t reg) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return 0xFF;
  if (Wire.requestFrom(addr, (uint8_t)1) != 1) return 0xFF;
  return (uint8_t)Wire.read();
}

static bool mpuWriteReg(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission(true) == 0;
}

// Returns true if an MPU-class device answers (WHO_AM_I) and wake/gyro config succeeded.
bool initMPU6050() {
  const uint8_t candidates[] = { 0x68, 0x69 };
  for (uint8_t i = 0; i < 2; i++) {
    uint8_t a = candidates[i];
    uint8_t who = mpuReadReg(a, MPU_REG_WHO_AM_I);
    // MPU-6050/6000: 0x68; MPU-9250: 0x71; MPU-6500: 0x70 (same gyro register map)
    if (who != 0x68 && who != 0x71 && who != 0x70) continue;

    if (!mpuWriteReg(a, MPU_REG_PWR_MGMT, 0x80)) continue;  // reset
    delay(100);
    if (!mpuWriteReg(a, MPU_REG_PWR_MGMT, 0x00)) continue;  // wake, internal clock
    delay(20);
    if (!mpuWriteReg(a, MPU_REG_GYRO_CFG, 0x00)) continue;  // ±250 °/s

    mpuAddr = a;
    return true;
  }
  mpuAddr = 0;
  return false;
}

/* ==================== SETUP ==================== */
void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(VIB_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin();
  Wire.setClock(100000);

  matrix.begin();
  matrix.loadFrame(FRAME_OFF);

  if (!initMPU6050()) {
    Serial.println("⚠️ MPU not detected on I2C — gyro will stay 0. Check wiring, 3V3, SDA/SCL, AD0 (0x68 vs 0x69).");
  } else {
    Serial.print("✅ MPU OK at I2C 0x");
    Serial.println(mpuAddr, HEX);
  }

#if !CALIBRATE
  connectWiFi();
  Serial.println("✅ Tremor Monitoring Started (Batch Mode)");
#else
  Serial.println("=== LED CALIBRATION MODE ===");
  Serial.println("Watch the matrix. Each step lights ONE corner or all.");
  Serial.println("Report: which physical position lights for step 1,2,3,4?");
#endif
}

/* ==================== LOOP ==================== */
void loop() {
#if CALIBRATE
  // Cycle: 1=top-left, 2=top-right, 3=bottom-left, 4=bottom-right, 5=all on
  static int step = 0;
  const int steps = 5;
  const uint32_t* frames[] = { CAL_TOP_LEFT, CAL_TOP_RIGHT, CAL_BOTTOM_LEFT, CAL_BOTTOM_RIGHT, FRAME_INTENSE };
  const char* names[] = { "1: TOP-LEFT (row0 col0)", "2: TOP-RIGHT (row0 col11)", "3: BOTTOM-LEFT (row7 col0)", "4: BOTTOM-RIGHT (row7 col11)", "5: ALL ON" };

  matrix.loadFrame(frames[step]);
  Serial.println(names[step]);
  step = (step + 1) % steps;
  delay(2000);
  return;
#endif

  readMPU6050();
  readVibrationSensor();

  const char* severity = classifyAndDisplay();
  bufferLog(severity);

  // Non-blocking send: tick each loop; starts a new batch when interval elapsed
  sendBatchToSupabaseNonBlocking();

  delay(20); // ~50Hz
}

/* ==================== WIFI ==================== */
void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }

  Serial.println("\n✅ WiFi Connected");
}

/* ==================== MPU6050 ==================== */
void readMPU6050() {
  if (mpuAddr == 0) return;

  Wire.beginTransmission(mpuAddr);
  Wire.write(MPU_REG_GYRO_XH);
  if (Wire.endTransmission(false) != 0) {
    while (Wire.available()) Wire.read();
    return;
  }

  uint8_t n = Wire.requestFrom(mpuAddr, (uint8_t)6);
  if (n != 6) {
    while (Wire.available()) Wire.read();
    return;
  }

  gx = (int16_t)((Wire.read() << 8) | Wire.read());
  gy = (int16_t)((Wire.read() << 8) | Wire.read());
  gz = (int16_t)((Wire.read() << 8) | Wire.read());

  gyroMag = sqrt(
    (float)gx * gx +
    (float)gy * gy +
    (float)gz * gz
  );
}

/* ==================== VIBRATION ==================== */
void readVibrationSensor() {
  if (digitalRead(VIB_PIN) == HIGH) vibCount++;

  if (millis() - vibTimer >= 1000) {
    vibTimer = millis();
    vibCount = 0;
  }
}

/* ==================== CLASSIFY ==================== */
const char* classifyAndDisplay() {
  static unsigned long lastBlink = 0;
  static bool blink = false;

  if (vibCount == 0) {
    matrix.loadFrame(FRAME_OFF);
    digitalWrite(BUZZER_PIN, LOW);
    return "NO TREMOR";
  }

  if (gyroMag < GYRO_INTENSE_THRESHOLD) {
    digitalWrite(BUZZER_PIN, LOW);

    if (millis() - lastBlink > 600) {
      blink = !blink;
      matrix.loadFrame(blink ? FRAME_MILD : FRAME_OFF);
      lastBlink = millis();
    }
    return "MILD TREMOR";
  }

  digitalWrite(BUZZER_PIN, HIGH);

  if (millis() - lastBlink > 120) {
    blink = !blink;
    matrix.loadFrame(blink ? FRAME_INTENSE : FRAME_OFF);
    lastBlink = millis();
  }

  return "INTENSE TREMOR";
}

/* ==================== BUFFER ==================== */
void bufferLog(const char* severity) {
  if (logCount < MAX_LOGS) {
    logs[logCount++] = { gyroMag, vibCount, severity };
  } else {
    // shift left to keep last 50 logs only
    for (int i = 1; i < MAX_LOGS; i++) {
      logs[i - 1] = logs[i];
    }
    logs[MAX_LOGS - 1] = { gyroMag, vibCount, severity };
  }
}

/* ==================== SUPABASE (non-blocking) ==================== */
void sendBatchToSupabaseNonBlocking() {
  // ----- Start a new batch when idle and interval elapsed -----
  if (sendState == SEND_IDLE) {
    if (millis() - lastSend < SEND_INTERVAL) return;
    if (logCount <= 0) {
      lastSend = millis();
      return;
    }
    // Snapshot current buffer so we can keep logging while sending
    sendLogCount = logCount;
    for (int i = 0; i < sendLogCount; i++) sendLogs[i] = logs[i];
    sendPayload = "[";
    for (int i = 0; i < sendLogCount; i++) {
      sendPayload += "{";
      sendPayload += "\"gyro_mag\":" + String(sendLogs[i].gyro, 2) + ",";
      sendPayload += "\"vib_count\":" + String(sendLogs[i].vib) + ",";
      sendPayload += "\"severity\":\"" + String(sendLogs[i].severity) + "\"";
      sendPayload += "}";
      if (i < sendLogCount - 1) sendPayload += ",";
    }
    sendPayload += "]";
    sendState = SEND_CONNECTING;
    sendSaw201 = false;
    sendReadPos = 0;
    matrix.loadFrame(FRAME_SEND);
    Serial.print("📡 Sending batch (background): ");
    Serial.println(sendLogCount);
  }

  // ----- CONNECTING (may block once per batch; rest is non-blocking) -----
  if (sendState == SEND_CONNECTING) {
    if (sslClient.connect(SUPABASE_HOST, 443)) {
      sendState = SEND_WRITING;
    } else {
      Serial.println("❌ Supabase TLS failed");
      sslClient.stop();
      sendState = SEND_IDLE;
      lastSend = millis();
      return;
    }
  }

  // ----- WRITING: send request in one go (buffered, usually fast) -----
  if (sendState == SEND_WRITING) {
    sslClient.println("POST " + String(SUPABASE_PATH) + " HTTP/1.1");
    sslClient.println("Host: " + String(SUPABASE_HOST));
    sslClient.println("apikey: " + String(SUPABASE_API_KEY));
    sslClient.println("Authorization: Bearer " + String(SUPABASE_API_KEY));
    sslClient.println("Content-Type: application/json");
    sslClient.println("Prefer: return=minimal");
    sslClient.print("Content-Length: ");
    sslClient.println(sendPayload.length());
    sslClient.println();
    sslClient.print(sendPayload);
    sendState = SEND_READING;
    sendReadStart = millis();
    return;
  }

  // ----- READING: consume a chunk per loop (non-blocking) -----
  if (sendState == SEND_READING) {
    if (millis() - sendReadStart > SEND_READ_TIMEOUT_MS) {
      Serial.println("\n❌ Supabase read timeout — retained for retry");
      sslClient.stop();
      sendState = SEND_IDLE;
      lastSend = millis();
      return;
    }
    const int maxReadPerLoop = 64;
    int n = 0;
    while (sslClient.available() && n < maxReadPerLoop) {
      char c = sslClient.read();
      Serial.write(c);
      if (c == '2') sendReadPos = 1;
      else if (sendReadPos == 1 && c == '0') sendReadPos = 2;
      else if (sendReadPos == 2 && c == '1') sendSaw201 = true;
      else sendReadPos = 0;
      n++;
    }
    if (!sslClient.connected() && !sslClient.available()) {
      sslClient.stop();
      sendState = SEND_DONE;
    }
    return;
  }

  // ----- DONE: clear sent logs and reset -----
  if (sendState == SEND_DONE) {
    if (sendSaw201) {
      Serial.println("\n✅ Batch stored successfully");
      int keep = logCount - sendLogCount;
      if (keep > 0) {
        for (int i = 0; i < keep; i++) logs[i] = logs[sendLogCount + i];
        logCount = keep;
      } else {
        logCount = 0;
      }
    } else {
      Serial.println("\n❌ Batch failed — retained for retry");
    }
    lastSend = millis();
    sendState = SEND_IDLE;
  }
}
