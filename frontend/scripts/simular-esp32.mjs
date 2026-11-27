// Simula al ESP32 enviando una lectura a Supabase (mismo endpoint y cabecera que el firmware)
// y disparando automáticamente la alerta de WhatsApp (CallMeBot) cuando hay corte de luz o
// temperatura fuera de rango (< 2 °C o > 8 °C).
//
// Uso (dentro de /frontend):
//   npm run simular               -> lectura normal en Bodegón Central (5.0 °C, con luz)
//   npm run simular -- sinluz     -> simula corte de luz + envía WhatsApp automático
//   npm run simular -- calor      -> simula temp. alta (9.5 °C) + envía WhatsApp automático
//   npm run simular -- frio       -> simula temp. baja (1.1 °C) + envía WhatsApp automático
//   npm run simular -- calor 2    -> simula temp. alta en Farmacia Norte (sucursal 2) + WhatsApp
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = {};
try {
  for (const linea of readFileSync(join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
} catch {
  console.error('No se encontró el archivo .env en la raíz del proyecto.');
  process.exit(1);
}

const URL = env.VITE_SUPABASE_URL || 'https://qfrepxrrdouvqjjscovz.supabase.co';
const KEY = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9MtdkYU1vfIzuvKc-4vBDA_0BJPCTbp';
const PHONE = (env.VITE_WHATSAPP_PHONE || '+584125002119').trim();
const APIKEY = (env.VITE_CALLMEBOT_API_KEY || '7650246').trim();
const PANEL_URL = 'https://centinela-iot.netlify.app';

const modo = (process.argv[2] || 'normal').toLowerCase();
const sucursalId = Number(process.argv[3] || 1);
const nombreSucursal = sucursalId === 2 ? 'Farmacia Norte' : 'Bodegón Central';
const codigoNodo = `ESP32-${String(sucursalId).padStart(2, '0')}`;

let temperatura = Number((4 + Math.random() * 2).toFixed(1));
if (modo === 'calor') temperatura = 9.5;
else if (modo === 'frio') temperatura = 1.1;

const lectura = {
  sucursal_id: sucursalId,
  temperatura,
  humedad: Number((55 + Math.random() * 5).toFixed(1)),
  hay_luz: modo !== 'sinluz',
};

const headers = { 'Content-Type': 'application/json', apikey: KEY, Prefer: 'return=minimal' };

let alerta = null;
if (!lectura.hay_luz) {
  alerta = {
    tipo_evento: 'CORTE_LUZ',
    resumen: `Corte de luz en ${codigoNodo} (${nombreSucursal}) - Temp: ${lectura.temperatura} °C`,
    whatsapp:
      `*ALERTA CRITICA - CENTINELA IoT*\n` +
      `Se ha detectado un *CORTE DE LUZ* en tu cadena de frio:\n` +
      `- Nodo: ${codigoNodo} (${nombreSucursal})\n` +
      `- Temperatura actual: ${lectura.temperatura} °C\n` +
      `- Humedad: ${lectura.humedad.toFixed(0)} %\n` +
      `- Respaldo: Bateria Mini UPS activa\n\n` +
      `Monitorea la temperatura en vivo aqui:\n${PANEL_URL}`,
  };
} else if (lectura.temperatura > 8.0) {
  alerta = {
    tipo_evento: 'TEMP_ALTA',
    resumen: `Temperatura alta en ${codigoNodo} (${nombreSucursal}) - Temp: ${lectura.temperatura} °C`,
    whatsapp:
      `*ALERTA CRITICA - CENTINELA IoT*\n` +
      `Se ha detectado *TEMPERATURA ALTA* (> 8.0 °C) en tu cadena de frio:\n` +
      `- Nodo: ${codigoNodo} (${nombreSucursal})\n` +
      `- Temperatura actual: ${lectura.temperatura} °C\n` +
      `- Humedad: ${lectura.humedad.toFixed(0)} %\n` +
      `- Estado electrico: CON LUZ (Red Normal)\n\n` +
      `Monitorea la temperatura en vivo aqui:\n${PANEL_URL}`,
  };
} else if (lectura.temperatura < 2.0) {
  alerta = {
    tipo_evento: 'TEMP_BAJA',
    resumen: `Temperatura baja en ${codigoNodo} (${nombreSucursal}) - Temp: ${lectura.temperatura} °C`,
    whatsapp:
      `*ALERTA CRITICA - CENTINELA IoT*\n` +
      `Se ha detectado *TEMPERATURA BAJA* (< 2.0 °C) en tu cadena de frio:\n` +
      `- Nodo: ${codigoNodo} (${nombreSucursal})\n` +
      `- Temperatura actual: ${lectura.temperatura} °C\n` +
      `- Humedad: ${lectura.humedad.toFixed(0)} %\n` +
      `- Estado electrico: CON LUZ (Red Normal)\n\n` +
      `Monitorea la temperatura en vivo aqui:\n${PANEL_URL}`,
  };
}

if (alerta) {
  await fetch(`${URL}/rest/v1/eventos_alerta`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sucursal_id: sucursalId,
      tipo_evento: alerta.tipo_evento,
      mensaje_enviado: alerta.resumen,
    }),
  });
}

console.log(`Enviando lectura simulada (${codigoNodo} · ${nombreSucursal}):`, lectura);
const r = await fetch(`${URL}/rest/v1/lecturas_sensor`, {
  method: 'POST',
  headers,
  body: JSON.stringify(lectura),
});

if (!r.ok) {
  const txt = await r.text();
  console.error(`❌ Error HTTP ${r.status}: ${txt}`);
  if (r.status === 404) {
    console.error('👉 Las tablas no existen. Ejecuta supabase_schema.sql en Supabase > SQL Editor.');
  }
  process.exit(1);
}

console.log(`✅ Lectura insertada en Supabase (HTTP ${r.status}).`);

if (alerta) {
  const wpUrl = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(PHONE)}&text=${encodeURIComponent(
    alerta.whatsapp
  )}&apikey=${encodeURIComponent(APIKEY)}`;
  console.log(`📲 Enviando alerta automática a WhatsApp (${PHONE})...`);
  try {
    const wpRes = await fetch(wpUrl);
    console.log(`✅ WhatsApp enviado (HTTP ${wpRes.status}).`);
  } catch (err) {
    console.warn('⚠️ Solicitud a CallMeBot enviada con advertencia:', err.message);
  }
}
