/*
 * =====================================================================
 *  CENTINELA IoT - Firmware ESP32 (ESP32 Dev Module)
 *  Monitoreo de cadena de frio (2 C - 8 C) + deteccion de apagones
 * =====================================================================
 *
 *  LIBRERIAS (Arduino IDE > Herramientas > Administrar bibliotecas):
 *    - "DHT sensor library"   (Adafruit)  + "Adafruit Unified Sensor"
 *    - "Adafruit SSD1306"     (Adafruit)  + "Adafruit GFX Library"
 *  WiFi / HTTPClient / WiFiClientSecure vienen incluidas con el core ESP32.
 *
 *  PLACA: Herramientas > Placa > ESP32 Arduino > "ESP32 Dev Module"
 *
 *  CONEXIONES:
 *    DHT11  DATA ............ GPIO 4  (D4)
 *    OLED SSD1306 SDA ....... GPIO 21 (D21)
 *    OLED SSD1306 SCL ....... GPIO 22 (D22)
 *    Rele (detector de luz) . GPIO 18 (D18)  -> INPUT_PULLUP
 *    LED Verde (hay luz) .... GPIO 19 (D19)  (con resistencia 220 ohm)
 *    LED Rojo  (sin luz) .... GPIO 23 (D23)  (con resistencia 220 ohm)
 *
 *  LOGICA DEL RELE:
 *    La bobina del rele se alimenta con un cargador conectado a la RED
 *    ELECTRICA. El contacto NO (normalmente abierto) une GPIO18 con GND.
 *      - Hay luz  -> rele activado -> contacto cerrado -> GPIO18 = LOW
 *      - Sin luz  -> rele en reposo -> contacto abierto -> GPIO18 = HIGH (pull-up)
 *    El ESP32 sigue encendido gracias a la bateria / Mini UPS.
 *    Si tu cableado es al reves (usas el contacto NC), cambia
 *    RELE_LOW_SIGNIFICA_LUZ a false.
 * =====================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>

// ------------------------- CONFIGURACION -----------------------------
// >>> CAMBIA ESTO POR TU RED WiFi (solo 2.4 GHz) <<<
const char* WIFI_SSID     = "TU_WIFI";
const char* WIFI_PASSWORD = "TU_CLAVE_WIFI";

// Supabase (la publishable/anon key es publica; NUNCA uses la secret key aqui)
const char* SUPABASE_URL      = "https://qfrepxrrdouvqjjscovz.supabase.co";
const char* SUPABASE_ANON_KEY = "sb_publishable_9MtdkYU1vfIzuvKc-4vBDA_0BJPCTbp";

// WhatsApp via CallMeBot
const char* WHATSAPP_PHONE   = "+584125002119";
const char* CALLMEBOT_APIKEY = "7650246";

const int   SUCURSAL_ID     = 1;   // 1 = Bodegon Central, 2 = Farmacia Norte
const char* NOMBRE_SUCURSAL = "Bodegon Central";

// Intervalos de envio (milisegundos) - valores cortos para la DEMO.
// Para produccion, por ejemplo:
//   INTERVALO_CON_LUZ = 5UL * 60UL * 1000UL;   // 5 minutos
//   INTERVALO_SIN_LUZ = 1UL * 60UL * 1000UL;   // 1 minuto
const unsigned long INTERVALO_CON_LUZ = 15UL * 1000UL;  // 15 segundos con luz
const unsigned long INTERVALO_SIN_LUZ = 5UL  * 1000UL;  // 5 segundos sin luz

const float TEMP_MIN = 2.0;
const float TEMP_MAX = 8.0;

const bool RELE_LOW_SIGNIFICA_LUZ = true;

// ------------------------------ PINES --------------------------------
#define PIN_DHT       4
#define PIN_SDA       21
#define PIN_SCL       22
#define PIN_RELE      18
#define PIN_LED_VERDE 19
#define PIN_LED_ROJO  23

#define DHTTYPE DHT11
#define OLED_ANCHO 128
#define OLED_ALTO  64
#define OLED_DIR   0x3C   // Si no enciende la pantalla prueba 0x3D

DHT dht(PIN_DHT, DHTTYPE);
Adafruit_SSD1306 oled(OLED_ANCHO, OLED_ALTO, &Wire, -1);

// ------------------------------ ESTADO -------------------------------
float temperatura = 0.0;
float humedad     = 0.0;
bool  hayLuz      = true;
bool  hayLuzAnterior = true;
bool  oledOk      = false;
unsigned long ultimoEnvio   = 0;
unsigned long ultimaLectura = 0;
String estadoRed = "Iniciando...";

// =====================================================================
//                              UTILIDADES
// =====================================================================
String urlEncode(const String& s) {
  String out = "";
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; i < s.length(); i++) {
    char c = s.charAt(i);
    if (isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.' || c == '~') {
      out += c;
    } else if (c == ' ') {
      out += "+";
    } else {
      out += '%';
      out += hex[((unsigned char)c >> 4) & 0x0F];
      out += hex[(unsigned char)c & 0x0F];
    }
  }
  return out;
}

bool leerRele() {
  // Antirrebote simple: 5 lecturas, mayoria decide
  int bajos = 0;
  for (int i = 0; i < 5; i++) {
    if (digitalRead(PIN_RELE) == LOW) bajos++;
    delay(4);
  }
  bool nivelBajo = (bajos >= 3);
  return RELE_LOW_SIGNIFICA_LUZ ? nivelBajo : !nivelBajo;
}

void actualizarLeds() {
  digitalWrite(PIN_LED_VERDE, hayLuz ? HIGH : LOW);
  digitalWrite(PIN_LED_ROJO,  hayLuz ? LOW  : HIGH);
}

void leerDHT() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && !isnan(h)) {   // Si falla, conserva el ultimo valor valido
    temperatura = t;
    humedad = h;
  } else {
    Serial.println("[DHT] Lectura fallida, se mantiene el ultimo valor");
  }
}

void mostrarOLED() {
  if (!oledOk) return;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);

  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.print("CENTINELA IoT");
  oled.setCursor(92, 0);
  oled.print(WiFi.status() == WL_CONNECTED ? "WiFi" : "----");
  oled.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  oled.setTextSize(2);
  oled.setCursor(0, 14);
  oled.print(temperatura, 1);
  oled.print((char)247);   // simbolo de grado
  oled.print("C");
  if (temperatura > TEMP_MAX || temperatura < TEMP_MIN) {
    oled.setTextSize(1);
    oled.setCursor(104, 18);
    oled.print("!!");
  }

  oled.setTextSize(1);
  oled.setCursor(0, 34);
  oled.print("Humedad: ");
  oled.print(humedad, 0);
  oled.print(" %");

  oled.setCursor(0, 46);
  if (hayLuz) {
    oled.print("LUZ: OK - Red normal");
  } else {
    oled.fillRect(0, 44, 128, 11, SSD1306_WHITE);
    oled.setTextColor(SSD1306_BLACK);
    oled.setCursor(2, 46);
    oled.print("SIN LUZ - BATERIA UPS");
    oled.setTextColor(SSD1306_WHITE);
  }

  oled.setCursor(0, 57);
  oled.print(estadoRed);
  oled.display();
}

// =====================================================================
//                                 RED
// =====================================================================
void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("[WiFi] Conectando a ");
  Serial.println(WIFI_SSID);
  estadoRed = "Conectando WiFi...";
  mostrarOLED();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Conectado. IP: ");
    Serial.println(WiFi.localIP());
    estadoRed = "WiFi OK";
  } else {
    Serial.println("[WiFi] No se pudo conectar (se reintentara)");
    estadoRed = "Sin WiFi";
  }
}

// POST JSON a una tabla de Supabase (REST). Devuelve true si OK.
bool postSupabase(const char* tabla, const String& json) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure cliente;
  cliente.setInsecure();   // Demo: sin validar certificado TLS
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/" + tabla;
  if (!http.begin(cliente, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Prefer", "return=minimal");
  http.setTimeout(10000);
  int codigo = http.POST(json);
  Serial.printf("[Supabase] POST %s -> HTTP %d\n", tabla, codigo);
  if (codigo < 200 || codigo >= 300) Serial.println(http.getString());
  http.end();
  return codigo >= 200 && codigo < 300;
}

bool enviarLectura() {
  String json = "{\"sucursal_id\":" + String(SUCURSAL_ID) +
                ",\"temperatura\":" + String(temperatura, 1) +
                ",\"humedad\":" + String(humedad, 1) +
                ",\"hay_luz\":" + String(hayLuz ? "true" : "false") + "}";
  Serial.println("[Datos] " + json);
  bool ok = postSupabase("lecturas_sensor", json);
  estadoRed = ok ? "Enviado OK" : "Error de envio";
  return ok;
}

bool enviarWhatsApp(const String& mensaje) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure cliente;
  cliente.setInsecure();
  HTTPClient http;
  String url = "https://api.callmebot.com/whatsapp.php?phone=" + urlEncode(WHATSAPP_PHONE) +
               "&text=" + urlEncode(mensaje) +
               "&apikey=" + String(CALLMEBOT_APIKEY);
  if (!http.begin(cliente, url)) return false;
  http.setTimeout(15000);
  int codigo = http.GET();
  Serial.printf("[WhatsApp] HTTP %d\n", codigo);
  http.end();
  return codigo == 200;
}

void registrarEvento(const String& tipo, const String& mensaje) {
  String m = mensaje;
  m.replace("\"", "'");
  String json = "{\"sucursal_id\":" + String(SUCURSAL_ID) +
                ",\"tipo_evento\":\"" + tipo + "\"" +
                ",\"mensaje_enviado\":\"" + m + "\"}";
  postSupabase("eventos_alerta", json);
}

// =====================================================================
//                            SETUP / LOOP
// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== CENTINELA IoT ===");

  pinMode(PIN_RELE, INPUT_PULLUP);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);

  Wire.begin(PIN_SDA, PIN_SCL);
  oledOk = oled.begin(SSD1306_SWITCHCAPVCC, OLED_DIR);
  if (!oledOk) Serial.println("[OLED] No detectada (revisa SDA=21, SCL=22, direccion 0x3C)");

  dht.begin();
  delay(1500);   // El DHT11 necesita ~1 s para estabilizarse

  hayLuz = leerRele();
  hayLuzAnterior = hayLuz;
  actualizarLeds();
  leerDHT();
  mostrarOLED();

  conectarWiFi();
  enviarLectura();
  ultimoEnvio = millis();
  mostrarOLED();
}

void loop() {
  // 1) Estado electrico (se revisa constantemente)
  hayLuz = leerRele();
  actualizarLeds();

  // 2) Leer DHT11 cada 2 s (no soporta lecturas mas rapidas)
  if (millis() - ultimaLectura >= 2000) {
    ultimaLectura = millis();
    leerDHT();
    mostrarOLED();
  }

  // 3) Reconectar WiFi si se perdio
  if (WiFi.status() != WL_CONNECTED) conectarWiFi();

  // 4) Cambio de estado electrico
  if (hayLuz != hayLuzAnterior) {
    hayLuzAnterior = hayLuz;
    leerDHT();
    mostrarOLED();

    if (!hayLuz) {
      // Se fue la luz -> alerta inmediata por WhatsApp
      Serial.println("[ALERTA] Corte de luz detectado!");
      String msg = "ALERTA CENTINELA IoT: CORTE DE LUZ en " + String(NOMBRE_SUCURSAL) +
                   ". Temp actual: " + String(temperatura, 1) + " C, Humedad: " +
                   String(humedad, 0) + "%. Equipo funcionando con bateria Mini UPS.";
      bool ok = enviarWhatsApp(msg);
      registrarEvento(ok ? "CORTE_LUZ" : "CORTE_LUZ_SIN_WHATSAPP", msg);
    } else {
      Serial.println("[INFO] Luz restablecida");
      String msg = "Centinela IoT: Luz RESTABLECIDA en " + String(NOMBRE_SUCURSAL) +
                   ". Temp actual: " + String(temperatura, 1) + " C.";
      enviarWhatsApp(msg);
      registrarEvento("LUZ_RESTABLECIDA", msg);
    }
    enviarLectura();          // Reporta el cambio al panel de inmediato
    ultimoEnvio = millis();
    mostrarOLED();
  }

  // 5) Envio periodico (15 s con luz / 5 s sin luz)
  unsigned long intervalo = hayLuz ? INTERVALO_CON_LUZ : INTERVALO_SIN_LUZ;
  if (millis() - ultimoEnvio >= intervalo) {
    ultimoEnvio = millis();
    enviarLectura();
    mostrarOLED();
  }

  delay(50);
}
