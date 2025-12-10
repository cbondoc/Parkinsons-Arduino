#include <WiFiS3.h>
#include "Arduino_LED_Matrix.h"

ArduinoLEDMatrix matrix;

// ==================================================
// 🔧 USER SETTINGS (you said you already filled them)
// ==================================================
const char* WIFI_SSID = "bondoc_sala";
const char* WIFI_PASS = "carybondoc1234";

const char* SUPABASE_URL = "https://emnblgwvbearctiqlfwe.supabase.co/rest/v1/arduino_logs";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtbmJsZ3d2YmVhcmN0aXFsZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MTM3MDcsImV4cCI6MjA3NDI4OTcwN30.h0dJYX5Vk_353hqRT8a_lURfiWKEHqVWSk2leY9zMzY";

// ==================================================
// 🔧 INTERNAL VARIABLES
// ==================================================
WiFiSSLClient client;

String supabaseHost = "";
String supabasePath = "";

const int potPin = A0;
const int buzzerPin = A1;

int thresholdValue = 15;

// Matrix pattern
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


// ==================================================
// 🔧 PARSE SUPABASE URL
// ==================================================
void parseSupabaseURL() {
  String url = String(SUPABASE_URL);

  url.replace("https://", "");

  int slashIndex = url.indexOf('/');
  supabaseHost = url.substring(0, slashIndex);
  supabasePath = url.substring(slashIndex);

  Serial.println("Parsed Supabase Host: " + supabaseHost);
  Serial.println("Parsed Path: " + supabasePath);
}


// ==================================================
// 🔧 ENSURE WIFI CONNECTED
// ==================================================
void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("🔌 WiFi lost. Reconnecting…");
  WiFi.disconnect();
  delay(500);

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 9000) {
    Serial.print(".");
    delay(500);
  }

  if (WiFi.status() == WL_CONNECTED)
    Serial.println("\n✅ WiFi Reconnected!");
  else
    Serial.println("\n❌ WiFi reconnect failed.");
}


// ==================================================
// 🔧 SEND DATA TO SUPABASE
// ==================================================
void sendToSupabase(int value) {
  ensureWiFi();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Not sending: WiFi disconnected");
    return;
  }

  client.stop();
  delay(80);

  Serial.println("🌐 Connecting to Supabase...");

  if (!client.connect(supabaseHost.c_str(), 443)) {
    Serial.println("❌ Supabase connection failed.");
    return;
  }

  String json = "{\"value\": " + String(value) + "}";

  // POST request
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

  // Wait for response
  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 3000) {
      Serial.println("⏳ Supabase timeout");
      client.stop();
      return;
    }
  }

  // Print response
  while (client.available()) {
    String line = client.readStringUntil('\n');
    Serial.println("📩 " + line);
  }

  Serial.println("✅ Data sent!\n");
  client.stop();
}


// ==================================================
// 🚀 SETUP
// ==================================================
void setup() {
  Serial.begin(115200);

  matrix.begin();
  pinMode(buzzerPin, OUTPUT);
  matrix.clear();

  parseSupabaseURL();

  Serial.println("Connecting to WiFi…");
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\n✅ WiFi connected!");
}


// ==================================================
// 🔁 LOOP
// ==================================================
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

  delay(1000);
}
