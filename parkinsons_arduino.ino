// EMG Flex-Relax Control with Relay + Serial Plotter Output
// Board: Arduino Mega
// EMG Sensor: A1
// Relay Module: A0

const int emgPin = A1;
const int relayPin = A0;

int emgValue = 0;
int flexThreshold = 1000;   // Adjust based on your readings
bool relayState = false;
unsigned long lastDetection = 0;
const unsigned long detectionInterval = 1000;  // 1 second interval
const unsigned long relayOnDuration = 1000;    // 5 seconds ON

void setup() {
  Serial.begin(115200);
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW);  // Relay OFF initially
  delay(2000); // Let sensor stabilize

  Serial.println("System ready. Flex to turn ON relay for 5 seconds.");
}

void loop() {
  unsigned long currentMillis = millis();

  // Read EMG value continuously
  emgValue = analogRead(emgPin);

  // Print only numbers for Serial Plotter
  Serial.print(emgValue);
  Serial.print("\t");        // Separate columns with tabs
  Serial.println(flexThreshold);

  // --- Check flex every 1 second ---
  if (currentMillis - lastDetection >= detectionInterval) {
    lastDetection = currentMillis;

    if (emgValue > flexThreshold && !relayState) {
      relayState = true;
      digitalWrite(relayPin, HIGH); // Turn relay ON
      Serial.println("Relay ON (Flex detected!)");

      unsigned long relayStart = millis();
      while (millis() - relayStart < relayOnDuration) {
        emgValue = analogRead(emgPin);

        // Keep plotting while relay is ON
        Serial.print(emgValue);
        Serial.print("\t");
        Serial.println(flexThreshold);

        delay(50);
      }

      digitalWrite(relayPin, LOW);  // Turn relay OFF
      relayState = false;
      Serial.println("Relay OFF after 5 seconds.");
    }
  }

  delay(10);
}
