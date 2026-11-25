import { useCallback, useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { supabase, WHATSAPP_PHONE, CALLMEBOT_API_KEY } from './supabaseClient';

const TEMP_MIN = 2.0;
const TEMP_MAX = 8.0;
const REFRESCO_MS = 5000;

// Respaldo por si la tabla sucursales aún no se ha creado.
const SUCURSALES_RESPALDO = [
  { id: 1, nombre: 'Bodegón Central' },
  { id: 2, nombre: 'Farmacia Norte' },
];

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fechaHora = (iso) => new Date(iso).toLocaleString('es-VE');

function Tarjeta({ titulo, valor, detalle, ok, icono }) {
  const color = ok
    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
    : 'border-red-500/60 bg-red-500/10 text-red-400';
  return (
    <div className={`rounded-2xl border-2 p-6 ${color}`}>
      <div className="flex items-center justify-between text-slate-300">
        <span className="font-medium">{titulo}</span>
        <span className="text-2xl">{icono}</span>
      </div>
      <div className="text-4xl font-extrabold mt-3">{valor}</div>
      <div className="text-sm mt-2 opacity-90">{detalle}</div>
    </div>
  );
}

export default function Dashboard({ etiquetaUsuario, onSalir }) {
  const [sucursales, setSucursales] = useState(SUCURSALES_RESPALDO);
  const [sucursalId, setSucursalId] = useState(1);
  const [lecturas, setLecturas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [ultimaAct, setUltimaAct] = useState(null);

  // Cargar sucursales una vez
  useEffect(() => {
    supabase
      .from('sucursales')
      .select('id, nombre, telefono_alerta, api_key_whatsapp')
      .order('id')
      .then(({ data, error }) => {
        if (!error && data && data.length) setSucursales(data);
      });
  }, []);

  const cargarDatos = useCallback(async () => {
    const [lec, ev] = await Promise.all([
      supabase
        .from('lecturas_sensor')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('eventos_alerta')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);
    if (lec.error) {
      setError('No se pudieron leer los datos: ' + lec.error.message + ' (¿ejecutaste supabase_schema.sql?)');
    } else {
      setError('');
      setLecturas((lec.data || []).slice().reverse());
    }
    if (!ev.error) setEventos(ev.data || []);
    setUltimaAct(new Date());
  }, [sucursalId]);

  // Refresco cada 5 s + Realtime
  useEffect(() => {
    cargarDatos();
    const t = setInterval(cargarDatos, REFRESCO_MS);
    const canal = supabase
      .channel('centinela-' + sucursalId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lecturas_sensor' }, cargarDatos)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos_alerta' }, cargarDatos)
      .subscribe();
    return () => {
      clearInterval(t);
      supabase.removeChannel(canal);
    };
  }, [cargarDatos, sucursalId]);

  const ultima = lecturas.length ? lecturas[lecturas.length - 1] : null;
  const temp = ultima ? Number(ultima.temperatura) : null;
  const tempOk = temp !== null && temp >= TEMP_MIN && temp <= TEMP_MAX;
  const hayLuz = ultima ? ultima.hay_luz !== false : true;
  const emergencia = ultima && (ultima.hay_luz === false || temp > TEMP_MAX);
  const sucursalActual = sucursales.find((s) => s.id === sucursalId) || SUCURSALES_RESPALDO[0];

  const datosGrafica = lecturas.map((l) => ({
    hora: hora(l.created_at),
    temperatura: Number(l.temperatura),
  }));

  const enviarPruebaWhatsApp = async () => {
    setEnviando(true);
    setAviso('');
    const telefono = sucursalActual.telefono_alerta || WHATSAPP_PHONE;
    const apikey = sucursalActual.api_key_whatsapp || CALLMEBOT_API_KEY;
    const texto =
      `Prueba Centinela IoT - ${sucursalActual.nombre}` +
      (temp !== null ? ` | Temp: ${temp.toFixed(1)}C | Luz: ${hayLuz ? 'SI' : 'NO'}` : '');
    const url =
      'https://api.callmebot.com/whatsapp.php?phone=' +
      encodeURIComponent(telefono) +
      '&text=' +
      encodeURIComponent(texto) +
      '&apikey=' +
      encodeURIComponent(apikey);

    try {
      // CallMeBot no envía cabeceras CORS: 'no-cors' permite que la petición salga igual.
      await fetch(url, { method: 'GET', mode: 'no-cors' });
    } catch (e) {
      // Respaldo: disparar la petición como imagen (tampoco sufre CORS).
      new Image().src = url;
    }

    const { error } = await supabase.from('eventos_alerta').insert({
      sucursal_id: sucursalId,
      tipo_evento: 'PRUEBA_WHATSAPP',
      mensaje_enviado: texto,
    });
    setEnviando(false);
    setAviso(
      error
        ? '⚠️ WhatsApp enviado, pero no se pudo guardar el registro: ' + error.message
        : '✅ Alerta enviada a ' + telefono + '. Revisa WhatsApp en unos segundos.'
    );
    cargarDatos();
  };

  return (
    <div className="min-h-screen">
      {/* Barra superior */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">❄️</span>
            <h1 className="text-xl font-bold text-cyan-400">Centinela IoT</h1>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">Sucursal:</label>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-cyan-500"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            <span className="hidden sm:inline text-xs px-2 py-1 rounded bg-slate-800 text-slate-400">
              {etiquetaUsuario}
            </span>
            <button onClick={onSalir} className="text-sm px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-300 p-4 text-sm">{error}</div>
        )}

        {/* Alerta de emergencia */}
        {emergencia && (
          <div className="rounded-2xl border-2 border-red-500 bg-red-600/20 p-5 animate-pulse">
            <p className="text-2xl font-extrabold text-red-400">
              🚨 ¡ALERTA DE EMERGENCIA! Corte de luz o temperatura fuera de rango
            </p>
            <p className="text-red-200 mt-1 text-sm">
              {sucursalActual.nombre} — {!hayLuz && 'Sin suministro eléctrico. '}
              {temp > TEMP_MAX && `Temperatura ${temp.toFixed(1)} °C supera ${TEMP_MAX} °C.`}
            </p>
          </div>
        )}

        {/* Tarjetas */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Tarjeta
            titulo="Temperatura"
            icono="🌡️"
            valor={temp !== null ? `${temp.toFixed(1)} °C` : '--'}
            detalle={tempOk ? 'En rango seguro (2 °C – 8 °C)' : temp === null ? 'Sin datos' : 'FUERA DE RANGO'}
            ok={temp === null || tempOk}
          />
          <Tarjeta
            titulo="Humedad"
            icono="💧"
            valor={ultima ? `${Number(ultima.humedad).toFixed(0)} %` : '--'}
            detalle="Humedad relativa"
            ok={true}
          />
          <Tarjeta
            titulo="Estado Eléctrico"
            icono={hayLuz ? '⚡' : '🔋'}
            valor={hayLuz ? 'CON LUZ' : 'SIN LUZ'}
            detalle={hayLuz ? 'Red Normal' : 'Usando Batería Mini UPS'}
            ok={hayLuz}
          />
        </section>

        {/* Gráfica */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Temperatura — últimas 20 lecturas</h2>
            <span className="text-xs text-slate-500">
              {ultimaAct ? `Actualizado ${ultimaAct.toLocaleTimeString('es-VE')}` : 'Cargando...'}
            </span>
          </div>
          <div className="h-72">
            {datosGrafica.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={datosGrafica} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="hora" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} domain={[0, 'auto']} unit="°" />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(v) => [`${v} °C`, 'Temperatura']}
                  />
                  <ReferenceLine y={TEMP_MAX} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '8 °C', fill: '#ef4444', fontSize: 12 }} />
                  <ReferenceLine y={TEMP_MIN} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: '2 °C', fill: '#3b82f6', fontSize: 12 }} />
                  <Line type="monotone" dataKey="temperatura" stroke="#22d3ee" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">Sin lecturas para esta sucursal</div>
            )}
          </div>
        </section>

        {/* WhatsApp + historial */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Alertas por WhatsApp</h2>
            <button
              onClick={enviarPruebaWhatsApp}
              disabled={enviando}
              className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold disabled:opacity-50"
            >
              {enviando ? 'Enviando...' : '📲 Enviar Alerta de Prueba a WhatsApp'}
            </button>
          </div>
          {aviso && <p className="text-sm text-slate-300">{aviso}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="text-left py-2 pr-4">Fecha</th>
                  <th className="text-left py-2 pr-4">Tipo</th>
                  <th className="text-left py-2">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {eventos.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-500">
                      Aún no hay alertas registradas
                    </td>
                  </tr>
                )}
                {eventos.map((e) => (
                  <tr key={e.id} className="border-b border-slate-800/60">
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-400">{fechaHora(e.created_at)}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          e.tipo_evento === 'PRUEBA_WHATSAPP'
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {e.tipo_evento}
                      </span>
                    </td>
                    <td className="py-2">{e.mensaje_enviado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="text-center text-xs text-slate-600 pb-4">
          Centinela IoT · Cadena de frío 2 °C – 8 °C · Refresco automático cada 5 s
        </footer>
      </main>
    </div>
  );
}
