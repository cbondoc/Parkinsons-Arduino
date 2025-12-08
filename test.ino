#include <WiFiS3.h>
#include "Arduino_LED_Matrix.h"

ArduinoLEDMatrix matrix;

// ---------- WIFI ----------
char ssid[] = "bondoc_sala";
char pass[] = "carybondoc1234";

// ---------- SUPABASE ----------
const char* host = "emnblgwvbearctiqlfwe.supabase.co";
const int httpsPort = 443;
const char* apiUrl = "/rest/v1/arduino_logs";
const char* apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtbmJsZ3d2YmVhcmN0aXFsZndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MTM3MDcsImV4cCI6MjA3NDI4OTcwN30.h0dJYX5Vk_353hqRT8a_lURfiWKEHqVWSk2leY9zMzY";

// Use SSL client
WiFiSSLClient client;

// ---------- PINS ----------
const int potPin = A0;
const int buzzerPin = A1;

int thresholdValue = 15;

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

void setup() {
  Serial.begin(115200);

  // LED matrix
  matrix.begin();
  pinMode(buzzerPin, OUTPUT);
  matrix.clear();

  // WiFi
  WiFi.begin(ssid, pass);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nWiFi connected.");
}

void sendToSupabase(int value) {
  if (!client.connect(host, httpsPort)) {
    Serial.println("⚠ Supabase connection failed");
    return;
  }

  String json = "{\"value\": " + String(value) + "}";

  // HTTPS POST Request
  client.println(String("POST ") + apiUrl + " HTTP/1.1");
  client.println(String("Host: ") + host);
  client.println("Content-Type: application/json");
  client.println(String("apikey: ") + apiKey);
  client.println(String("Authorization: Bearer ") + apiKey);
  client.println("Prefer: return=minimal");
  client.println(String("Content-Length: ") + json.length());
  client.println();
  client.print(json);

  // Read response
  while (client.connected()) {
    String line = client.readStringUntil('\n');
    if (line == "\r") break;  // headers end
  }

  String status = client.readString();
  Serial.print("Supabase response: ");
  Serial.println(status);
}

void loop() {
  int potValue = analogRead(potPin);
  Serial.println(potValue);

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
