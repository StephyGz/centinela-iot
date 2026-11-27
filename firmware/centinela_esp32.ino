/*
 * =====================================================================
 *  CENTINELA IoT - Firmware ESP32 (ESP32 Dev Module)
 *  Monitoreo de cadena de frio (2 C a 8 C) + deteccion de apagones
 * =====================================================================
 *
 *  LIBRERIAS NECESARIAS (Arduino IDE > Administrar bibliotecas):
 *    1. "DHT sensor library" por Adafruit (+ "Adafruit Unified Sensor")
 *    2. "Adafruit SSD1306" por Adafruit (+ "Adafruit GFX Library")
 *
 *  PLACA EN ARDUINO IDE:
 *    Herramientas > Placa > esp32 > "ESP32 Dev Module"
 *    Monitor Serie: 115200 baudios
 *
 *  PINES EXACTOS:
 *    - Sensor DHT11 (DATA) .......... GPIO 4  (D4)
 *    - Pantalla OLED SSD1306 SDA .... GPIO 21 (D21)
 *    - Pantalla OLED SSD1306 SCL .... GPIO 22 (D22)
 *    - Modulo Rele (Detector luz) ... GPIO 18 (D18, INPUT_PULLUP)
 *    - LED Verde (Hay Luz) .......... GPIO 19 (D19)
 *    - LED Rojo  (Sin Luz) .......... GPIO 23 (D23)
 *
 *  CONEXION DEL RELE / PRUEBA RAPIDA:
 *    - Conecta un pin del contacto del rele a GND y el otro a GPIO 18 (D18).
 *    - Con PIN 18 unido a GND (LOW)  -> HAY LUZ (LED Verde encendido).
 *    - Con PIN 18 abierto (HIGH)     -> SIN LUZ (LED Rojo encendido + Alerta WhatsApp).
 *    - Si tu rele trabaja invertido (contacto NC), cambia RELE_LOW_ES_CON_LUZ a false.
 * =====================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>

// ======================= 1. CONFIGURACION WIFI =======================
// Cambia estos 2 valores por el nombre y clave de tu red WiFi (2.4 GHz):
const char* WIFI_SSID     = "TU_WIFI_AQUI";
const char* WIFI_PASSWORD = "TU_CLAVE_WIFI_AQUI";

// =================== 2. CREDENCIALES DEL PROYECTO ====================
const char* SUPABASE_URL      = "https://qfrepxrrdouvqjjscovz.supabase.co";
const char* SUPABASE_ANON_KEY = "sb_publishable_9MtdkYU1vfIzuvKc-4vBDA_0BJPCTbp";

const char* WHATSAPP_PHONE    = "+584125002119";
const char* CALLMEBOT_API_KEY = "7650246";

const int   SUCURSAL_ID       = 1; // 1 = Bodegon Central, 2 = Farmacia Norte
const char* NOMBRE_SUCURSAL   = "Bodegon Central";
const char* PANEL_URL         = "https://centinela-iot.netlify.app";

// =================== 3. INTERVALOS DE DEMOSTRACION ===================
// Listos para demostrar en vivo:
//   - Con luz: envia cada 15 segundos (15000 ms)
//   - Sin luz: envia cada 5 segundos  (5000 ms)
// Si en produccion deseas subirlos a minutos, puedes usar por ejemplo:
//   const unsigned long INTERVALO_CON_LUZ = 5UL * 60UL * 1000UL; // 5 minutos
//   const unsigned long INTERVALO_SIN_LUZ = 1UL * 60UL * 1000UL; // 1 minuto
const unsigned long INTERVALO_CON_LUZ = 15000UL; // 15 segundos
const unsigned long INTERVALO_SIN_LUZ = 5000UL;  // 5 segundos

// Rango seguro de cadena de frio (2.0 C a 8.0 C) y tiempo de re-alerta (60 s)
const float         TEMP_MIN_SEGURA         = 2.0;
const float         TEMP_MAX_SEGURA         = 8.0;
const unsigned long INTERVALO_REALERTA_TEMP = 60000UL;

// Polaridad del rele en GPIO 18 (INPUT_PULLUP):
// true  = GPIO 18 en LOW significa que HAY LUZ (contacto cerrado a GND con luz)
// false = GPIO 18 en HIGH significa que HAY LUZ (contacto abierto con luz)
const bool RELE_LOW_ES_CON_LUZ = true;

// ========================= 4. PINES EXACTOS ==========================
#define PIN_DHT        4   // D4  - Sensor DHT11
#define PIN_OLED_SDA   21  // D21 - OLED SDA
#define PIN_OLED_SCL   22  // D22 - OLED SCL
#define PIN_RELE       18  // D18 - Detector de luz (INPUT_PULLUP)
#define PIN_LED_VERDE  19  // D19 - LED Verde (Hay Luz)
#define PIN_LED_ROJO   23  // D23 - LED Rojo  (Sin Luz)

#define DHTTYPE        DHT11
#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT  64
#define OLED_ADDR      0x3C

DHT dht(PIN_DHT, DHTTYPE);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ======================= VARIABLES DE ESTADO =========================
float temperatura      = 5.0;  // Valor inicial seguro de respaldo
float humedad          = 56.0; // Valor inicial seguro de respaldo
bool  sensorDhtOk      = false;
bool  hay_luz          = true;
bool  hay_luz_previa   = true;
bool  oledDisponible   = false;
int   estadoTempPrevio = 0;    // 0 = Normal (2 a 8 C), 1 = Alta (>8 C), -1 = Baja (<2 C)
String estadoEnvio     = "Iniciando...";

unsigned long ultimoEnvio        = 0;
unsigned long ultimaLecturaDht   = 0;
unsigned long ultimoReintentoWf  = 0;
unsigned long ultimaAlertaTempMs = 0;

// ======================= FUNCIONES AUXILIARES ========================
String codificarTextoUrl(const String& texto) {
  String salida = "";
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; i < texto.length(); i++) {
    char c = texto.charAt(i);
    if (isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.' || c == '~') {
      salida += c;
    } else if (c == ' ') {
      salida += '+';
    } else {
      salida += '%';
      salida += hex[((unsigned char)c >> 4) & 0x0F];
      salida += hex[(unsigned char)c & 0x0F];
    }
  }
  return salida;
}

bool leerEstadoLuz() {
  // Promedio de 5 muestras rapidas para filtrar ruido electrico
  int conteoLow = 0;
  for (int i = 0; i < 5; i++) {
    if (digitalRead(PIN_RELE) == LOW) conteoLow++;
    delay(3);
  }
  bool pinEnLow = (conteoLow >= 3);
  return RELE_LOW_ES_CON_LUZ ? pinEnLow : !pinEnLow;
}

void actualizarLeds() {
  digitalWrite(PIN_LED_VERDE, hay_luz ? HIGH : LOW);
  digitalWrite(PIN_LED_ROJO,  hay_luz ? LOW  : HIGH);
}

void leerSensorDHT() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && !isnan(h)) {
    temperatura = t;
    humedad     = h;
    sensorDhtOk = true;
  } else {
    Serial.println("[DHT11] Lectura no disponible en GPIO 4 (usando ultimo valor valido: " +
                   String(temperatura, 1) + " C)");
  }
}

void actualizarPantallaOLED() {
  if (!oledDisponible) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Encabezado
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("CENTINELA IoT");
  display.setCursor(96, 0);
  display.print(WiFi.status() == WL_CONNECTED ? "WiFi" : "NoWF");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  // Temperatura grande
  display.setTextSize(2);
  display.setCursor(0, 14);
  display.print(temperatura, 1);
  display.print((char)247);
  display.print("C");

  if (temperatura > 8.0 || temperatura < 2.0) {
    display.setTextSize(1);
    display.setCursor(92, 18);
    display.print("ALERTA");
  }

  // Humedad
  display.setTextSize(1);
  display.setCursor(0, 34);
  display.print("Humedad: ");
  display.print(humedad, 0);
  display.print(" %");

  // Estado electrico
  if (hay_luz) {
    display.setCursor(0, 45);
    display.print("LUZ: CON LUZ (Normal)");
  } else {
    display.fillRect(0, 43, 128, 11, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(2, 45);
    display.print("SIN LUZ - BATERIA UPS");
    display.setTextColor(SSD1306_WHITE);
  }

  // Pie de estado
  display.setCursor(0, 56);
  display.print(estadoEnvio);
  display.display();
}

void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("[WiFi] Conectando a: ");
  Serial.println(WIFI_SSID);
  estadoEnvio = "Conectando WiFi...";
  actualizarPantallaOLED();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 12000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Conectado! IP: ");
    Serial.println(WiFi.localIP());
    estadoEnvio = "WiFi conectado";
  } else {
    Serial.println("[WiFi] Sin conexion (verifica SSID/clave de red 2.4 GHz)");
    estadoEnvio = "Sin WiFi";
  }
}

// =================== 5. ENVIO A SUPABASE Y WHATSAPP ==================
bool enviarDatosSupabase() {
  if (WiFi.status() != WL_CONNECTED) {
    estadoEnvio = "Sin WiFi";
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/lecturas_sensor";
  if (!http.begin(client, url)) return false;

  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Prefer", "return=minimal");

  String payload = "{\"sucursal_id\":" + String(SUCURSAL_ID) +
                   ",\"temperatura\":" + String(temperatura, 1) +
                   ",\"humedad\":" + String(humedad, 1) +
                   ",\"hay_luz\":" + String(hay_luz ? "true" : "false") + "}";

  Serial.println("[Supabase] POST -> " + payload);
  int httpCode = http.POST(payload);
  Serial.printf("[Supabase] Respuesta HTTP: %d\n", httpCode);

  if (httpCode == 404) {
    Serial.println("  -> Ejecuta supabase_schema.sql en el SQL Editor de Supabase.");
  }
  http.end();

  bool exito = (httpCode >= 200 && httpCode < 300);
  estadoEnvio = exito ? "Supabase OK" : ("Error HTTP " + String(httpCode));
  return exito;
}

void guardarEventoAlerta(const String& tipo, const String& mensaje) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/eventos_alerta";
  if (!http.begin(client, url)) return;

  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Prefer", "return=minimal");

  String limpio = mensaje;
  limpio.replace("\"", "'");
  String payload = "{\"sucursal_id\":" + String(SUCURSAL_ID) +
                   ",\"tipo_evento\":\"" + tipo + "\"" +
                   ",\"mensaje_enviado\":\"" + limpio + "\"}";

  http.POST(payload);
  http.end();
}

bool enviarAlertaWhatsApp(const String& mensaje) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WhatsApp] No se pudo enviar: sin conexion WiFi.");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String url = "https://api.callmebot.com/whatsapp.php?phone=" + String(WHATSAPP_PHONE) +
               "&text=" + codificarTextoUrl(mensaje) +
               "&apikey=" + String(CALLMEBOT_API_KEY);

  Serial.println("[WhatsApp] Enviando alerta: " + mensaje);
  if (!http.begin(client, url)) return false;

  http.setTimeout(15000);
  int httpCode = http.GET();
  Serial.printf("[WhatsApp] Respuesta HTTP: %d\n", httpCode);
  http.end();

  return (httpCode >= 200 && httpCode < 400);
}

void verificarAlertasTemperatura() {
  if (!sensorDhtOk) return;

  // 0 = Normal (2.0 C a 8.0 C), 1 = Alta (> 8.0 C), -1 = Baja (< 2.0 C)
  int estadoTempActual = 0;
  if (temperatura > TEMP_MAX_SEGURA) {
    estadoTempActual = 1;
  } else if (temperatura < TEMP_MIN_SEGURA) {
    estadoTempActual = -1;
  }

  String codigoNodo = "ESP32-" + String(SUCURSAL_ID < 10 ? "0" : "") + String(SUCURSAL_ID);

  if (estadoTempActual != 0) {
    bool cambioDeEstado = (estadoTempActual != estadoTempPrevio);
    bool tocaReAlerta   = (millis() - ultimaAlertaTempMs >= INTERVALO_REALERTA_TEMP);

    if (cambioDeEstado || tocaReAlerta) {
      estadoTempPrevio   = estadoTempActual;
      ultimaAlertaTempMs = millis();

      String tipo = (estadoTempActual == 1) ? "TEMP_ALTA" : "TEMP_BAJA";
      String etiqueta = (estadoTempActual == 1)
                          ? ("*TEMPERATURA ALTA* (> " + String(TEMP_MAX_SEGURA, 1) + " C)")
                          : ("*TEMPERATURA BAJA* (< " + String(TEMP_MIN_SEGURA, 1) + " C)");
      String msg = "*ALERTA CRITICA - CENTINELA IoT*\n"
                   "Se ha detectado " + etiqueta + " en tu cadena de frio:\n"
                   "- Nodo: " + codigoNodo + " (" + String(NOMBRE_SUCURSAL) + ")\n"
                   "- Temperatura actual: " + String(temperatura, 1) + " C\n"
                   "- Humedad: " + String(humedad, 0) + " %\n"
                   "- Estado electrico: " + String(hay_luz ? "CON LUZ (Red Normal)" : "SIN LUZ (Bateria Mini UPS)") + "\n\n"
                   "Monitorea la temperatura en vivo aqui:\n" + String(PANEL_URL);

      String resumen = ((estadoTempActual == 1) ? "Temperatura alta en " : "Temperatura baja en ") +
                       codigoNodo + " (" + String(NOMBRE_SUCURSAL) + ") - Temp: " + String(temperatura, 1) + " C";

      Serial.println("[ALERTA TEMP] " + resumen);
      guardarEventoAlerta(tipo, resumen);
      enviarDatosSupabase();
      ultimoEnvio = millis();
      enviarAlertaWhatsApp(msg);
      actualizarPantallaOLED();
    }
  } else if (estadoTempPrevio != 0) {
    estadoTempPrevio = 0;
    String resumen = "Temperatura normalizada en " + codigoNodo + " (" + String(NOMBRE_SUCURSAL) +
                     ") - Temp: " + String(temperatura, 1) + " C";
    Serial.println("[INFO TEMP] " + resumen);
    guardarEventoAlerta("TEMP_NORMALIZADA", resumen);
    enviarDatosSupabase();
    ultimoEnvio = millis();
    actualizarPantallaOLED();
  }
}

// ========================= 6. SETUP Y LOOP ===========================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n==========================================");
  Serial.println("   CENTINELA IoT - INICIANDO SISTEMA");
  Serial.println("==========================================");

  pinMode(PIN_RELE, INPUT_PULLUP);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  oledDisponible = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!oledDisponible) {
    Serial.println("[OLED] No detectada en 0x3C (verifica SDA=21, SCL=22)");
  }

  dht.begin();
  delay(1500);

  // Intentar primera lectura del DHT11
  for (int i = 0; i < 3 && !sensorDhtOk; i++) {
    leerSensorDHT();
    if (!sensorDhtOk) delay(500);
  }

  hay_luz        = leerEstadoLuz();
  hay_luz_previa = true; // Si arranca sin luz, dispara alerta inmediata en loop()
  actualizarLeds();
  actualizarPantallaOLED();

  conectarWiFi();
  enviarDatosSupabase();
  ultimoEnvio = millis();
  verificarAlertasTemperatura();
  actualizarPantallaOLED();
}

void loop() {
  // 1) Lectura continua del rele detector de luz
  hay_luz = leerEstadoLuz();
  actualizarLeds();

  // 2) Lectura del sensor DHT11 cada 2 segundos + verificacion automatica de alertas de temperatura
  if (millis() - ultimaLecturaDht >= 2000) {
    ultimaLecturaDht = millis();
    leerSensorDHT();
    actualizarPantallaOLED();
    verificarAlertasTemperatura();
  }

  // 3) Reintento automatico de WiFi cada 15 segundos si se desconecta
  if (WiFi.status() != WL_CONNECTED && millis() - ultimoReintentoWf >= 15000) {
    ultimoReintentoWf = millis();
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }

  // 4) Deteccion instantanea de cambio en el estado electrico
  if (hay_luz != hay_luz_previa) {
    delay(150); // Confirmacion antirrebote breve
    hay_luz = leerEstadoLuz();

    if (hay_luz != hay_luz_previa) {
      hay_luz_previa = hay_luz;
      actualizarLeds();
      leerSensorDHT();
      actualizarPantallaOLED();

      // Si se fue la luz (hay_luz pasa de true a false), disparar WhatsApp automatico
      if (!hay_luz) {
        Serial.println("[ALERTA] CORTE DE LUZ DETECTADO! Enviando WhatsApp...");
        String codigoNodo = "ESP32-" + String(SUCURSAL_ID < 10 ? "0" : "") + String(SUCURSAL_ID);
        String msg = "*ALERTA CRITICA - CENTINELA IoT*\n"
                     "Se ha detectado un *CORTE DE LUZ* en tu cadena de frio:\n"
                     "- Nodo: " + codigoNodo + " (" + String(NOMBRE_SUCURSAL) + ")\n"
                     "- Temperatura actual: " + String(temperatura, 1) + " C\n"
                     "- Humedad: " + String(humedad, 0) + " %\n"
                     "- Respaldo: Bateria Mini UPS activa\n\n"
                     "Monitorea la temperatura en vivo aqui:\n" + String(PANEL_URL);
        guardarEventoAlerta("CORTE_LUZ", "Corte de luz en " + codigoNodo + " (" + String(NOMBRE_SUCURSAL) + ") - Temp: " + String(temperatura, 1) + " C");
        enviarDatosSupabase();
        ultimoEnvio = millis();
        enviarAlertaWhatsApp(msg);
      } else {
        Serial.println("[INFO] Suministro electrico restablecido.");
        String codigoNodo = "ESP32-" + String(SUCURSAL_ID < 10 ? "0" : "") + String(SUCURSAL_ID);
        String msg = "Luz restablecida en " + codigoNodo + " (" + String(NOMBRE_SUCURSAL) +
                     "). Temperatura actual: " + String(temperatura, 1) + " C.";
        guardarEventoAlerta("LUZ_RESTABLECIDA", msg);
        enviarDatosSupabase();
        ultimoEnvio = millis();
      }
      actualizarPantallaOLED();
    }
  }

  // 5) Envio periodico a Supabase (15 s con luz / 5 s sin luz)
  unsigned long intervaloActual = hay_luz ? INTERVALO_CON_LUZ : INTERVALO_SIN_LUZ;
  if (millis() - ultimoEnvio >= intervaloActual) {
    ultimoEnvio = millis();
    enviarDatosSupabase();
    actualizarPantallaOLED();
  }

  delay(50);
}
