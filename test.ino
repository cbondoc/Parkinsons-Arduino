#include <WiFiS3.h>
#include "Arduino_LED_Matrix.h"

ArduinoLEDMatrix matrix;

// ================= USER SETTINGS =================
const char* WIFI_SSID = "bondoc_sala";
const char* WIFI_PASS = "carybondoc1234";

const char* SUPABASE_URL =
  "https://emnblgwvbearctiqlfwe.supabase.co/rest/v1/arduino_logs";
const char* SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtbmJsZ3d2YmVhcmN0aXFsZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MTM3MDcsImV4cCI6MjA3NDI4OTcwN30.h0dJYX5Vk_353hqRT8a_lURfiWKEHqVWSk2leY9zMzY";

// ================= INTERNAL =================
WiFiSSLClient client;

String supabaseHost = "";
String supabasePath = "";

const int potPin = A0;
const int buzzerPin = A1;
int thresholdValue = 15;

// LED matrix pattern
uint8_t alertPattern[96] = {
  0,1,1,0,0,0,0,0,1,1,0,0,
  1,1,1,1,0,0,0,1,1,1,1,0,
  1,1,1,1,1,0,1,1,1,1,1,0,
  1,1,1,1,1,1,1,1,1,1,1,0,
  1,1,1,1,1,1,1,1,1,1,1,0,
  0,1,1,1,1,1,1,1,1,1,0,0,
  0,0,1,1,1,1,1,1,1,0,0,0,
  0,0,0,1,1,1,1,1,0,0,0,0
};

// ================= PARSE URL =================
void parseSupabaseURL() {
  String url = String(SUPABASE_URL);
  url.replace("https://", "");
  int slashIndex = url.indexOf('/');
  supabaseHost = url.substring(0, slashIndex);
  supabasePath = url.substring(slashIndex);
}

// ================= WIFI =================
void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.disconnect();
  delay(500);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
  }
}

// ================= SEND TO SUPABASE =================
void sendToSupabase(int potValue) {
  ensureWiFi();
  if (WiFi.status() != WL_CONNECTED) return;

  client.stop();
  delay(80);

  if (!client.connect(supabaseHost.c_str(), 443)) {
    Serial.println("❌ Supabase connection failed");
    return;
  }

  bool flexDetected = potValue >= thresholdValue;
  bool relayState = flexDetected;

  // JSON MATCHING YOUR TABLE
  String json =
    "{"
      "\"emg_value\":" + String(potValue) + "," +
      "\"relay_state\":" + String(relayState ? "true" : "false") + "," +
      "\"flex_detected\":" + String(flexDetected ? "true" : "false") +
    "}";

  client.println("POST " + supabasePath + " HTTP/1.1");
  client.println("Host: " + supabaseHost);
  client.println("Content-Type: application/json");
  client.println("apikey: " + String(SUPABASE_ANON_KEY));
  client.println("Authorization: Bearer " + String(SUPABASE_ANON_KEY));
  client.println("Prefer: return=minimal");
  client.println("Connection: close");
  client.println("Content-Length: " + String(json.length()));
  client.println();
  client.print(json);

  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 3000) {
      client.stop();
      return;
    }
  }

  while (client.available()) {
    Serial.println(client.readStringUntil('\n'));
  }

  client.stop();
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  matrix.begin();
  pinMode(buzzerPin, OUTPUT);
  matrix.clear();

  parseSupabaseURL();

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

// ================= LOOP =================
void loop() {
  ensureWiFi();

  int potValue = analogRead(potPin);
  Serial.println("Value: " + String(potValue));

  sendToSupabase(potValue);

  if (potValue >= thresholdValue) {
    tone(buzzerPin, 1000);
    matrix.loadPixels(alertPattern, 96);
  } else {
    noTone(buzzerPin);
    matrix.clear();
  }

  delay(3000);   // send every 3 seconds
}
