# ❄️ Centinela IoT — Monitoreo de Cadena de Frío (2 °C a 8 °C)

Sistema completo de monitoreo de cadena de frío (2 °C a 8 °C), detección física de apagones mediante relé y envío de alertas vía WhatsApp (CallMeBot).

> **¡Todo preconfigurado!** Los archivos `.env` (en la raíz y en `/frontend/.env`) y las credenciales en el firmware del ESP32 **ya vienen incluidos en el repositorio** listos para clonar, ejecutar y probar.

```
centinela-iot/
├── .env                                           # Variables de entorno ya configuradas
├── INICIAR_PANEL.bat                              # Doble clic en Windows para abrir la web
├── supabase_schema.sql                            # Script SQL listo para pegar en Supabase
├── frontend/                                      # Dashboard Web (React + Vite + Tailwind + Recharts)
│   └── .env                                       # Variables de entorno para Vite
└── firmware/
    ├── centinela_esp32.ino                        # Código del ESP32
    └── centinela_esp32/centinela_esp32.ino        # Carpeta lista para abrir directo en Arduino IDE
```

---

## 🚀 Los 3 pasos para encender todo

### Paso 1: Base de Datos en Supabase (1 sola vez)
1. Abre el proyecto en [Supabase](https://supabase.com/dashboard) → menú **SQL Editor** → **New query**.
2. Copia y pega todo el contenido de [`supabase_schema.sql`](supabase_schema.sql) y pulsa **RUN**.
3. Esto crea las tablas `sucursales` (*Bodegón Central* y *Farmacia Norte*), `lecturas_sensor` (con lecturas iniciales de prueba) y `eventos_alerta`, con **RLS activado** (solo usuarios autenticados pueden ver el panel y crear nuevas neveras/nodos ESP32, mientras que el ESP32 físico puede insertar telemetría).
4. En Supabase ve a **Authentication → Providers → Email** y desactiva **"Confirm email"** (para que cualquier cuenta creada pueda iniciar sesión de inmediato en la presentación).

### Paso 2: Encender el Dashboard Web
- **Opción rápida (Windows):** haz doble clic en **`INICIAR_PANEL.bat`**.
- **Opción por terminal:**
  ```bash
  cd frontend
  npm install
  npm run dev
  ```
  *(Si PowerShell bloquea `npm`, usa `npm.cmd install` y `npm.cmd run dev`).*
- Abre **http://localhost:5173**, crea tu cuenta con correo y contraseña (o inicia sesión) para acceder al panel.
- Dentro del panel puedes cambiar entre nodos (`ESP32-01`, `ESP32-02`), vincular nuevas neveras/ESP32 con el botón **"+ Vincular ESP32"**, enviar alertas con **"📲 Enviar Alerta de Prueba a WhatsApp"** y usar los botones de **prueba rápida** (*Simular Normal*, *Simular Corte de Luz*, *Simular Temp. Alta*).

### Paso 3: Cargar el Firmware al ESP32
1. En **Arduino IDE**, instala desde el Gestor de Bibliotecas:
   - **DHT sensor library** (de Adafruit) + **Adafruit Unified Sensor**
   - **Adafruit SSD1306** (de Adafruit) + **Adafruit GFX Library**
2. Abre [`firmware/centinela_esp32/centinela_esp32.ino`](firmware/centinela_esp32/centinela_esp32.ino).
3. Cambia únicamente `WIFI_SSID` y `WIFI_PASSWORD` por los de tu red WiFi (**debe ser de 2.4 GHz**):
   ```cpp
   const char* WIFI_SSID     = "TU_WIFI_AQUI";
   const char* WIFI_PASSWORD = "TU_CLAVE_WIFI_AQUI";
   ```
4. Selecciona la placa **ESP32 Dev Module**, elige el puerto COM y pulsa **Subir**.
5. Abre el **Monitor Serie a 115200 baudios** para ver las lecturas y respuestas HTTP en vivo.

---

## 🔌 Tabla de Pines del ESP32

| Componente | Pin ESP32 | Detalle |
|---|---|---|
| **Sensor DHT11** (DATA) | **GPIO 4 (D4)** | Alimentar con 3.3V y GND |
| **Pantalla OLED SSD1306** (SDA) | **GPIO 21 (D21)** | I2C dirección `0x3C` |
| **Pantalla OLED SSD1306** (SCL) | **GPIO 22 (D22)** | I2C dirección `0x3C` |
| **Módulo Relé** (Detector de luz) | **GPIO 18 (D18)** | `INPUT_PULLUP` (unido a GND = CON LUZ; abierto = SIN LUZ) |
| **LED Verde** (Hay Luz) | **GPIO 19 (D19)** | Con resistencia de 220 Ω a GND |
| **LED Rojo** (Sin Luz) | **GPIO 23 (D23)** | Con resistencia de 220 Ω a GND |

> 💡 **Tip para probar el apagón rápido:** con un cable jumper entre **GPIO 18 (D18)** y **GND** el sistema marca **CON LUZ** (LED Verde). Al desconectar ese cable simula el corte de luz: se enciende el **LED Rojo**, la OLED muestra **SIN LUZ - BATERIA UPS**, el Dashboard muestra la **Alerta Roja de Emergencia**, el envío pasa a cada **5 segundos** y se dispara la alerta automática a **WhatsApp**.
