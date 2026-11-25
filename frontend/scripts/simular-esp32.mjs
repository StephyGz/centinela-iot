// Simula al ESP32 enviando una lectura a Supabase (mismo endpoint y cabecera que el firmware).
// Sirve para comprobar la base de datos y el panel SIN tener el hardware conectado.
//
// Uso (dentro de /frontend):
//   npm run simular            -> lectura normal (5.0 °C, con luz)
//   npm run simular -- sinluz  -> simula corte de luz (aparece la alerta roja en el panel)
//   npm run simular -- calor   -> simula temperatura alta (9.5 °C)
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

const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const modo = (process.argv[2] || 'normal').toLowerCase();

const lectura = {
  sucursal_id: 1,
  temperatura: modo === 'calor' ? 9.5 : Number((4 + Math.random() * 2).toFixed(1)),
  humedad: Number((55 + Math.random() * 5).toFixed(1)),
  hay_luz: modo !== 'sinluz',
};

const headers = { 'Content-Type': 'application/json', apikey: KEY, Prefer: 'return=minimal' };

console.log('Enviando lectura simulada:', lectura);
const r = await fetch(`${URL}/rest/v1/lecturas_sensor`, {
  method: 'POST',
  headers,
  body: JSON.stringify(lectura),
});

if (r.ok) {
  console.log(`✅ OK (HTTP ${r.status}). Mira el panel: se actualiza en máximo 5 segundos.`);
} else {
  const txt = await r.text();
  console.error(`❌ Error HTTP ${r.status}: ${txt}`);
  if (r.status === 404) {
    console.error('👉 Las tablas no existen. Ejecuta supabase_schema.sql en Supabase > SQL Editor.');
  }
  process.exit(1);
}
