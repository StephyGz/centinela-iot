# ❄️ Centinela IoT

Monitorea la cadena de frío (2 °C – 8 °C), detecta apagones con un relé y envía alertas por WhatsApp (CallMeBot).
Usa **ESP32 + DHT11 + OLED + relé**, **Supabase** y **React/Vite/Tailwind**.

```
centinela-iot/
├── supabase_schema.sql                   # Tablas + datos de ejemplo + acceso abierto
├── frontend/                             # Panel web (React + Vite + Tailwind + Recharts)
└── firmware/centinela_esp32/centinela_esp32.ino   # Código del ESP32
```

## 🚀 3 pasos para encender todo

### 1. Base de datos (Supabase)
Ve a Supabase → **SQL Editor** → **New query**, pega todo el contenido de [`supabase_schema.sql`](supabase_schema.sql) y pulsa **RUN**.
Se crean las tablas `sucursales`, `lecturas_sensor` y `eventos_alerta`, con datos de ejemplo y RLS desactivado para la demo.

### 2. Panel web
```bash
cd frontend
npm install
npm run dev        # abre http://localhost:5173
```
Las variables se leen de `frontend/.env` (usa `frontend/.env.example` como plantilla):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WHATSAPP_PHONE`, `VITE_CALLMEBOT_API_KEY`.
Pulsa **"Entrar Directo al Panel (Modo Evaluación)"**.

> En Windows PowerShell, si `npm` da un error de "ejecución de scripts", usa `npm.cmd install` y `npm.cmd run dev`.

### 3. ESP32
1. En Arduino IDE instala: **DHT sensor library**, **Adafruit Unified Sensor**, **Adafruit SSD1306** y **Adafruit GFX Library**.
2. Abre `firmware/centinela_esp32/centinela_esp32.ino` y cambia `WIFI_SSID` y `WIFI_PASSWORD` (solo redes de 2.4 GHz).
3. Selecciona la placa **ESP32 Dev Module** y pulsa **Subir**.

| Componente | GPIO |
|---|---|
| DHT11 (DATA) | 4 |
| OLED SDA / SCL | 21 / 22 |
| Relé detector de luz (INPUT_PULLUP, el contacto NO va a GND) | 18 |
| LED verde (hay luz) | 19 |
| LED rojo (sin luz) | 23 |

El ESP32 envía datos cada **15 s con luz** y cada **5 s sin luz**. Cuando se va la luz, manda el WhatsApp automáticamente.

> 🔒 Nunca subas la *secret key* ni la contraseña de la base de datos. La *publishable key* es pública por diseño.
