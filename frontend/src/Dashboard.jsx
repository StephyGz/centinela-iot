import { useCallback, useEffect, useRef, useState } from 'react';
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
const TELEGRAM_BOT_TOKEN = '9036157558:AAHBIwJGOjpKMSZs50HA3oestP8wRgCG61E';
const TELEGRAM_CHAT_STEPHANY = '1216709702'; // Sucursal 1: Bodegón Central
const TELEGRAM_CHAT_SCARLET = '1440539446';  // Sucursal 2: Farmacia Norte
const TELEGRAM_CHAT_ALIRIO = '1865483108';   // Sucursal 3+: Respaldo multi-cliente

// Respaldo por si las tablas de Supabase aún no se han creado.
const SUCURSALES_RESPALDO = [
  { id: 1, nombre: 'Bodegón Central', telefono_alerta: WHATSAPP_PHONE, api_key_whatsapp: CALLMEBOT_API_KEY, temp_min: TEMP_MIN, temp_max: TEMP_MAX },
  { id: 2, nombre: 'Farmacia Norte', telefono_alerta: '+584169410586', api_key_whatsapp: CALLMEBOT_API_KEY, temp_min: TEMP_MIN, temp_max: TEMP_MAX },
];

const LECTURAS_DEMO = [
  { id: 1, sucursal_id: 1, temperatura: 4.2, humedad: 55.0, hay_luz: true, created_at: new Date(Date.now() - 240000).toISOString() },
  { id: 2, sucursal_id: 1, temperatura: 4.8, humedad: 56.0, hay_luz: true, created_at: new Date(Date.now() - 180000).toISOString() },
  { id: 3, sucursal_id: 1, temperatura: 5.1, humedad: 57.0, hay_luz: true, created_at: new Date(Date.now() - 120000).toISOString() },
  { id: 4, sucursal_id: 1, temperatura: 5.6, humedad: 58.0, hay_luz: true, created_at: new Date(Date.now() - 60000).toISOString() },
  { id: 5, sucursal_id: 1, temperatura: 5.3, humedad: 57.5, hay_luz: true, created_at: new Date().toISOString() },
];

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fechaHora = (iso) => new Date(iso).toLocaleString('es-VE');

function Tarjeta({ titulo, valor, detalle, ok, icono }) {
  const color = ok
    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
    : 'border-red-500/60 bg-red-500/10 text-red-400';
  return (
    <div className={`rounded-2xl border-2 p-6 transition-colors ${color}`}>
      <div className="flex items-center justify-between text-slate-300">
        <span className="font-medium">{titulo}</span>
        <span className="text-2xl">{icono}</span>
      </div>
      <div className="text-3xl sm:text-4xl font-extrabold mt-3">{valor}</div>
      <div className="text-sm mt-2 opacity-90 font-medium">{detalle}</div>
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
  const [simulando, setSimulando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [ultimaAct, setUltimaAct] = useState(null);
  const [mostrarNuevoNodo, setMostrarNuevoNodo] = useState(false);
  const [nuevoNombreNodo, setNuevoNombreNodo] = useState('');
  const [nuevoTelefonoNodo, setNuevoTelefonoNodo] = useState('+58');
  const [creandoNodo, setCreandoNodo] = useState(false);
  const [tempMin, setTempMin] = useState(TEMP_MIN);
  const [tempMax, setTempMax] = useState(TEMP_MAX);
  const timerGuardarRangoRef = useRef(null);

  const sucursalActual = sucursales.find((s) => s.id === sucursalId) || SUCURSALES_RESPALDO[0];
  const codigoNodo = `ESP32-${String(sucursalActual.id).padStart(2, '0')}`;

  const enviarAlertaPruebaMultiCanal = useCallback(
    async ({ tipoEvento, motivoTexto, lecturaRef, sucursalObj, minLim, maxLim }) => {
      const suc = sucursalObj || sucursalActual;
      const cod = `ESP32-${String(suc.id).padStart(2, '0')}`;
      const telefono = (suc.telefono_alerta || WHATSAPP_PHONE).trim();
      const apikey = (suc.api_key_whatsapp || CALLMEBOT_API_KEY).trim();
      const panelUrl = window.location.origin;

      const tVal = lecturaRef && lecturaRef.temperatura !== null ? Number(lecturaRef.temperatura) : null;
      const hVal = lecturaRef && lecturaRef.humedad !== null ? Number(lecturaRef.humedad) : null;
      const luzVal = lecturaRef ? lecturaRef.hay_luz !== false : true;

      const tempTexto = tVal !== null && Number.isFinite(tVal) ? `${tVal.toFixed(1)} °C` : 'Sin lectura';
      const humTexto = hVal !== null && Number.isFinite(hVal) ? `${hVal.toFixed(0)} %` : '--';
      const estadoLuzTexto = luzVal ? 'CON LUZ (Red Normal)' : 'SIN LUZ (Batería Mini UPS)';
      const rangoTexto =
        Number.isFinite(minLim) && Number.isFinite(maxLim)
          ? `${minLim.toFixed(1)} °C a ${maxLim.toFixed(1)} °C`
          : '2.0 °C a 8.0 °C';

      const texto =
        `*ALERTA CENTINELA IoT*\n` +
        `Evento: ${motivoTexto}\n` +
        `Sucursal: ${suc.nombre} (${cod})\n` +
        `Teléfono registrado: ${telefono}\n` +
        `Estado eléctrico: ${estadoLuzTexto}\n` +
        `Temperatura actual: ${tempTexto} (Rango: ${rangoTexto})\n` +
        `Humedad: ${humTexto}\n\n` +
        `Monitorea la temperatura en vivo aquí:\n${panelUrl}`;

      // Enrutamiento silencioso Multi-Cliente vía Telegram (@centila_cit_bot)
      const chatIdDestino =
        suc.id === 1
          ? TELEGRAM_CHAT_STEPHANY
          : suc.id === 2
          ? TELEGRAM_CHAT_SCARLET
          : TELEGRAM_CHAT_ALIRIO;

      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${encodeURIComponent(
        chatIdDestino
      )}&text=${encodeURIComponent(texto)}`;

      const envios = [
        fetch(telegramUrl, { method: 'GET' }).catch(() => {
          new Image().src = telegramUrl;
        }),
      ];

      // Sucursal 1 (Bodegón Central) envía también a WhatsApp (CallMeBot)
      if (suc.id === 1) {
        const whatsappUrl = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
          telefono
        )}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(apikey)}`;

        envios.push(
          fetch(whatsappUrl, { method: 'GET', mode: 'no-cors' }).catch(() => {
            new Image().src = whatsappUrl;
          })
        );
      }

      await Promise.allSettled(envios);

      const canalesTexto = suc.id === 1 ? `WhatsApp (${telefono}) + Telegram` : `Telegram (${suc.nombre})`;
      const resumenEvento = `Alerta de prueba enviada vía ${canalesTexto} | ${cod} (${suc.nombre}) | Tel: ${telefono} | ${tempTexto} | ${estadoLuzTexto}`;
      const nuevoEvento = {
        sucursal_id: suc.id,
        tipo_evento: tipoEvento,
        mensaje_enviado: resumenEvento,
      };

      const { error: errInsert } = await supabase.from('eventos_alerta').insert(nuevoEvento);
      if (errInsert) {
        setEventos((prev) => [{ id: Date.now(), created_at: new Date().toISOString(), ...nuevoEvento }, ...prev]);
      }
      return { telefono, errInsert, resumenEvento, canalesTexto };
    },
    [sucursalActual]
  );

  // Cargar rango personalizado desde Supabase (con respaldo localStorage) al cambiar de sucursal o actualizarse en BD
  useEffect(() => {
    setAviso('');
    const suc = sucursales.find((s) => s.id === sucursalId);
    const minDb = suc && suc.temp_min !== null && suc.temp_min !== undefined ? Number(suc.temp_min) : NaN;
    const maxDb = suc && suc.temp_max !== null && suc.temp_max !== undefined ? Number(suc.temp_max) : NaN;

    if (Number.isFinite(minDb) && Number.isFinite(maxDb) && minDb < maxDb) {
      setTempMin(minDb);
      setTempMax(maxDb);
      return;
    }

    try {
      const guardado = localStorage.getItem(`centinela_rango_${sucursalId}`);
      if (guardado) {
        const { min, max } = JSON.parse(guardado);
        if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
          setTempMin(min);
          setTempMax(max);
          return;
        }
      }
    } catch {
      // Ignorar errores de localStorage
    }
    setTempMin(TEMP_MIN);
    setTempMax(TEMP_MAX);
  }, [sucursalId, sucursales]);

  const cargarSucursales = useCallback(async () => {
    let { data, error: errSuc } = await supabase
      .from('sucursales')
      .select('id, nombre, telefono_alerta, api_key_whatsapp, temp_min, temp_max')
      .order('id');

    // Respaldo si las columnas temp_min/temp_max aún no se han agregado en Supabase
    if (errSuc) {
      const resBasico = await supabase
        .from('sucursales')
        .select('id, nombre, telefono_alerta, api_key_whatsapp')
        .order('id');
      data = resBasico.data;
      errSuc = resBasico.error;
    }

    if (!errSuc && data && data.length) {
      setSucursales(data.map((s) => (s.id === 2 ? { ...s, telefono_alerta: '+584169410586' } : s)));
    }
  }, []);

  // Cargar sucursales al iniciar
  useEffect(() => {
    cargarSucursales();
  }, [cargarSucursales]);

  const crearNuevoNodo = async (e) => {
    e.preventDefault();
    const nombreLimpio = nuevoNombreNodo.trim();
    if (!nombreLimpio) return;
    setCreandoNodo(true);
    setAviso('');

    const { data: creado, error: errCrear } = await supabase
      .from('sucursales')
      .insert({
        nombre: nombreLimpio,
        telefono_alerta: nuevoTelefonoNodo.trim() || '+58',
        api_key_whatsapp: CALLMEBOT_API_KEY,
      })
      .select()
      .single();

    if (errCrear || !creado) {
      setCreandoNodo(false);
      setAviso('⚠️ No se pudo registrar el nodo en Supabase. Verifica que hayas ejecutado supabase_schema.sql.');
      return;
    }

    // Insertar lectura inicial para que la nueva nevera/nodo tenga datos de arranque
    await supabase.from('lecturas_sensor').insert({
      sucursal_id: creado.id,
      temperatura: 4.5,
      humedad: 58.0,
      hay_luz: true,
    });

    await cargarSucursales();
    setSucursalId(creado.id);
    setNuevoNombreNodo('');
    setNuevoTelefonoNodo('+58');
    setMostrarNuevoNodo(false);
    setCreandoNodo(false);
    setAviso(
      `✅ Nuevo espacio "${creado.nombre}" vinculado como Nodo ESP32-${String(creado.id).padStart(2, '0')} (SUCURSAL_ID = ${creado.id} en firmware).`
    );
  };

  const rangoValido = Number.isFinite(tempMin) && Number.isFinite(tempMax) && tempMin < tempMax;
  const minEfectivo = rangoValido ? tempMin : TEMP_MIN;
  const maxEfectivo = rangoValido ? tempMax : TEMP_MAX;

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

    const listaEventos = !ev.error && ev.data ? ev.data : [];
    if (!ev.error) setEventos(listaEventos);

    if (lec.error) {
      setError(
        'Falta crear las tablas en Supabase: abre Supabase > SQL Editor, pega supabase_schema.sql y pulsa RUN. (Mostrando datos de vista previa).'
      );
      setLecturas((prev) => (prev.length ? prev : LECTURAS_DEMO));
    } else {
      setError('');
      const ordenadas = (lec.data || []).slice().reverse();
      setLecturas(ordenadas);
    }
    setUltimaAct(new Date());
  }, [sucursalId]);

  // Refresco cada 5 s + Realtime
  useEffect(() => {
    cargarDatos();
    const t = setInterval(() => {
      cargarDatos();
      cargarSucursales();
    }, REFRESCO_MS);
    let canal = null;
    try {
      canal = supabase
        .channel(`centinela-${sucursalId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lecturas_sensor' }, () => cargarDatos())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos_alerta' }, () => cargarDatos())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sucursales' }, () => cargarSucursales())
        .subscribe();
    } catch (e) {
      console.warn('Realtime no disponible, se usa refresco cada 5 s', e);
    }
    return () => {
      clearInterval(t);
      if (canal) supabase.removeChannel(canal);
    };
  }, [cargarDatos, cargarSucursales, sucursalId]);

  const ultima = lecturas.length ? lecturas[lecturas.length - 1] : null;
  const temp = ultima && ultima.temperatura !== null ? Number(ultima.temperatura) : null;
  const tempOk = temp !== null && temp >= minEfectivo && temp <= maxEfectivo;
  const hayLuz = ultima ? ultima.hay_luz !== false : true;
  const emergencia =
    Boolean(ultima) && (ultima.hay_luz === false || (temp !== null && (temp > maxEfectivo || temp < minEfectivo)));

  const actualizarRango = (nuevoMin, nuevoMax) => {
    setTempMin(nuevoMin);
    setTempMax(nuevoMax);
    if (Number.isFinite(nuevoMin) && Number.isFinite(nuevoMax) && nuevoMin < nuevoMax) {
      try {
        localStorage.setItem(`centinela_rango_${sucursalId}`, JSON.stringify({ min: nuevoMin, max: nuevoMax }));
      } catch {
        // Ignorar errores de localStorage
      }

      setSucursales((prev) =>
        prev.map((s) => (s.id === sucursalId ? { ...s, temp_min: nuevoMin, temp_max: nuevoMax } : s))
      );

      if (timerGuardarRangoRef.current) clearTimeout(timerGuardarRangoRef.current);
      const idObjetivo = sucursalId;
      timerGuardarRangoRef.current = setTimeout(async () => {
        await supabase
          .from('sucursales')
          .update({ temp_min: nuevoMin, temp_max: nuevoMax })
          .eq('id', idObjetivo);
      }, 400);
    }
  };

  const datosGrafica = lecturas.map((l) => ({
    hora: hora(l.created_at),
    temperatura: Number(l.temperatura),
  }));
  const valoresGrafica = datosGrafica.map((d) => d.temperatura).filter((v) => Number.isFinite(v));
  const yMin = Math.floor(Math.min(minEfectivo, ...(valoresGrafica.length ? valoresGrafica : [minEfectivo])) - 2);
  const yMax = Math.ceil(Math.max(maxEfectivo, ...(valoresGrafica.length ? valoresGrafica : [maxEfectivo])) + 2);

  const enviarPruebaWhatsApp = async () => {
    setEnviando(true);
    setAviso('');
    const { errInsert, canalesTexto } = await enviarAlertaPruebaMultiCanal({
      tipoEvento: 'PRUEBA_ALERTA',
      motivoTexto: 'PRUEBA DE CONEXIÓN DE ALERTAS',
      lecturaRef: ultima,
      sucursalObj: sucursalActual,
      minLim: minEfectivo,
      maxLim: maxEfectivo,
    });
    setEnviando(false);

    if (errInsert) {
      setAviso(`✅ Alerta de prueba enviada vía ${canalesTexto}. (Ejecuta supabase_schema.sql para guardar en BD).`);
    } else {
      setAviso(`✅ Alerta de prueba enviada vía ${canalesTexto} y registrada en la base de datos.`);
      cargarDatos();
    }
  };

  const simularLectura = async (modo) => {
    setSimulando(true);
    setAviso('');
    const tempNormal = minEfectivo + (maxEfectivo - minEfectivo) * (0.35 + Math.random() * 0.3);
    const tempSimulada =
      modo === 'calor'
        ? Number((maxEfectivo + 1.6).toFixed(1))
        : modo === 'frio'
        ? Number((minEfectivo - 1.6).toFixed(1))
        : Number(tempNormal.toFixed(1));
    const nueva = {
      sucursal_id: sucursalId,
      temperatura: tempSimulada,
      humedad: Number((55 + Math.random() * 5).toFixed(1)),
      hay_luz: modo !== 'apagon',
    };

    const { error: errSim } = await supabase
      .from('lecturas_sensor')
      .insert(nueva);

    if (errSim) {
      setLecturas((prev) => [...prev.slice(-19), { id: Date.now(), created_at: new Date().toISOString(), ...nueva }]);
    }

    setSimulando(false);
    if (errSim) {
      setAviso('🧪 Simulación aplicada en vista previa local (ejecuta supabase_schema.sql para guardarla en Supabase).');
    } else {
      const estadoLuz = nueva.hay_luz ? 'Con Luz' : 'Sin Luz';
      setAviso(`✅ Lectura simulada (${nueva.temperatura} °C, ${estadoLuz}) registrada en ${sucursalActual.nombre}.`);
      cargarDatos();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Barra superior */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">❄️</span>
            <div>
              <h1 className="text-xl font-bold text-cyan-400 leading-tight">Centinela IoT</h1>
              <p className="text-[11px] text-slate-400">
                Nodo activo: <span className="text-cyan-300 font-mono">{codigoNodo}</span> · {sucursalActual.nombre}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="selector-sucursal" className="text-sm text-slate-400">
              Nevera / ESP32:
            </label>
            <select
              id="selector-sucursal"
              value={sucursalId}
              onChange={(e) => setSucursalId(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {`ESP32-${String(s.id).padStart(2, '0')} · ${s.nombre}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMostrarNuevoNodo((v) => !v)}
              className="text-xs px-3 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-semibold transition"
            >
              + Vincular ESP32
            </button>
            <span className="hidden sm:inline text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              👤 {etiquetaUsuario}
            </span>
            <button
              onClick={onSalir}
              className="text-sm px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {mostrarNuevoNodo && (
          <form
            onSubmit={crearNuevoNodo}
            className="rounded-2xl border border-cyan-500/40 bg-slate-900 p-4 flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-400 mb-1">
                Nombre de la sucursal
              </label>
              <input
                type="text"
                placeholder="Ej. Clínica Sur"
                value={nuevoNombreNodo}
                onChange={(e) => setNuevoNombreNodo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm outline-none focus:border-cyan-500"
                required
              />
            </div>
            <div className="w-full sm:w-56">
              <label className="block text-xs text-slate-400 mb-1">Número de teléfono de alertas</label>
              <input
                type="text"
                placeholder="+584120000000"
                value={nuevoTelefonoNodo}
                onChange={(e) => setNuevoTelefonoNodo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm outline-none focus:border-cyan-500 font-mono"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creandoNodo}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm disabled:opacity-50"
              >
                {creandoNodo ? 'Vinculando...' : 'Guardar Nodo'}
              </button>
              <button
                type="button"
                onClick={() => setMostrarNuevoNodo(false)}
                className="px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-300 p-4 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Alerta Visual de Apagón o Temperatura Fuera de Rango */}
        {emergencia && (
          <div className="rounded-2xl border-2 border-red-500 bg-red-600/20 p-5 animate-pulse shadow-lg shadow-red-600/20">
            <p className="text-xl sm:text-2xl font-extrabold text-red-400">
              🚨 ¡ALERTA DE EMERGENCIA! Corte de luz o temperatura fuera de rango
            </p>
            <p className="text-red-200 mt-1 text-sm">
              {sucursalActual.nombre} — {!hayLuz && 'SIN LUZ (Usando Batería Mini UPS). '}
              {temp !== null && temp > maxEfectivo && `Temperatura actual (${temp.toFixed(1)} °C) supera el máximo de ${maxEfectivo.toFixed(1)} °C.`}
              {temp !== null && temp < minEfectivo && `Temperatura actual (${temp.toFixed(1)} °C) está por debajo del mínimo de ${minEfectivo.toFixed(1)} °C.`}
            </p>
          </div>
        )}

        {/* 3 Tarjetas Principales */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Tarjeta
            titulo="Temperatura (°C)"
            icono="🌡️"
            valor={temp !== null ? `${temp.toFixed(1)} °C` : '--'}
            detalle={
              temp === null
                ? 'Esperando lecturas...'
                : tempOk
                ? `Rango seguro (${minEfectivo.toFixed(1)} °C a ${maxEfectivo.toFixed(1)} °C)`
                : `¡FUERA DE RANGO! (${minEfectivo.toFixed(1)} °C a ${maxEfectivo.toFixed(1)} °C)`
            }
            ok={temp === null || tempOk}
          />
          <Tarjeta
            titulo="Humedad (%)"
            icono="💧"
            valor={ultima && ultima.humedad !== null ? `${Number(ultima.humedad).toFixed(0)} %` : '--'}
            detalle="Humedad relativa de la cava"
            ok={true}
          />
          <Tarjeta
            titulo="Estado Eléctrico"
            icono={hayLuz ? '⚡' : '🔋'}
            valor={hayLuz ? 'CON LUZ - Red Normal' : 'SIN LUZ - Usando Batería Mini UPS'}
            detalle={hayLuz ? 'Suministro eléctrico estable' : 'Apagón detectado por relé físico'}
            ok={hayLuz}
          />
        </section>

        {/* Gráfica Simple de Temperatura + Configuración de Rango */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold">Temperatura — últimas 20 lecturas</h2>
              <span className="text-xs text-slate-400">
                {ultima ? `Última lectura: ${fechaHora(ultima.created_at)}` : 'Sin lecturas'}
                {ultimaAct ? ` · Refresco: ${ultimaAct.toLocaleTimeString('es-VE')}` : ''}
              </span>
            </div>

            {/* Rango personalizado por usuario/nevera */}
            <div className="flex flex-wrap items-center gap-2.5 bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs">
              <span className="text-slate-400 font-medium">⚙️ Rango seguro:</span>

              <div className="flex items-center gap-1.5">
                <span className="text-blue-400 font-medium">Mín</span>
                <div className="flex items-center rounded-lg bg-slate-900 border border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => actualizarRango(Number((minEfectivo - 0.5).toFixed(1)), maxEfectivo)}
                    className="px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                    title="Disminuir mínimo"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    step="0.5"
                    value={Number.isFinite(tempMin) ? tempMin : ''}
                    onChange={(e) => actualizarRango(e.target.value === '' ? NaN : Number(e.target.value), tempMax)}
                    className="w-12 py-1 bg-transparent text-slate-100 text-center font-mono outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => actualizarRango(Number((minEfectivo + 0.5).toFixed(1)), maxEfectivo)}
                    className="px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                    title="Aumentar mínimo"
                  >
                    +
                  </button>
                </div>
                <span className="text-slate-400">°C</span>
              </div>

              <span className="text-slate-700">|</span>

              <div className="flex items-center gap-1.5">
                <span className="text-red-400 font-medium">Máx</span>
                <div className="flex items-center rounded-lg bg-slate-900 border border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => actualizarRango(minEfectivo, Number((maxEfectivo - 0.5).toFixed(1)))}
                    className="px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                    title="Disminuir máximo"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    step="0.5"
                    value={Number.isFinite(tempMax) ? tempMax : ''}
                    onChange={(e) => actualizarRango(tempMin, e.target.value === '' ? NaN : Number(e.target.value))}
                    className="w-12 py-1 bg-transparent text-slate-100 text-center font-mono outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => actualizarRango(minEfectivo, Number((maxEfectivo + 0.5).toFixed(1)))}
                    className="px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white transition"
                    title="Aumentar máximo"
                  >
                    +
                  </button>
                </div>
                <span className="text-slate-400">°C</span>
              </div>

              {(minEfectivo !== TEMP_MIN || maxEfectivo !== TEMP_MAX) && (
                <button
                  type="button"
                  onClick={() => actualizarRango(TEMP_MIN, TEMP_MAX)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  title="Restablecer 2 °C a 8 °C"
                >
                  ↺ 2–8 °C
                </button>
              )}
            </div>
          </div>
          {!rangoValido && (
            <p className="text-xs text-amber-400 mb-2">
              ⚠️ El mínimo debe ser menor que el máximo (usando 2.0 °C – 8.0 °C temporalmente).
            </p>
          )}
          <div className="h-72">
            {datosGrafica.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={datosGrafica} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="hora" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} domain={[yMin, yMax]} unit="°C" />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(v) => [`${v} °C`, 'Temperatura']}
                  />
                  <ReferenceLine
                    y={maxEfectivo}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: `Máx ${maxEfectivo} °C`, fill: '#ef4444', fontSize: 12 }}
                  />
                  <ReferenceLine
                    y={minEfectivo}
                    stroke="#3b82f6"
                    strokeDasharray="4 4"
                    label={{ value: `Mín ${minEfectivo} °C`, fill: '#3b82f6', fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="temperatura"
                    stroke="#22d3ee"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#22d3ee' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">
                Sin lecturas para esta sucursal
              </div>
            )}
          </div>
        </section>

        {/* Botón de Prueba de WhatsApp en Vivo + Tabla de Alertas + Simulador de Apoyo */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Alertas (WhatsApp / Telegram)</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {sucursalId === 1 ? 'Hardware ESP32 conectado' : 'Prueba manual en panel'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Teléfono configurado:{' '}
                <span className="text-slate-200 font-mono">{sucursalActual.telefono_alerta || WHATSAPP_PHONE}</span>
              </p>
            </div>
            {sucursalId !== 1 && (
              <button
                onClick={enviarPruebaWhatsApp}
                disabled={enviando}
                className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {enviando ? 'Enviando...' : '📲 Enviar Alerta de Prueba'}
              </button>
            )}
          </div>

          {/* Controles de prueba solo en nodos demo (Farmacia Norte / nuevos); Bodegón Central recibe datos reales del ESP32 */}
          {sucursalId === 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
              <span>
                📡 <strong className="text-emerald-400">Telemetría física en vivo (ESP32-01):</strong> las alertas
                automáticas a WhatsApp por corte y retorno de luz se envían directamente desde el hardware ESP32.
              </span>
              <span className="text-slate-500">Para simulaciones de prueba en panel, cambia a Farmacia Norte.</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400 mr-1">🧪 Prueba rápida en panel:</span>
              <button
                type="button"
                disabled={simulando}
                onClick={() => simularLectura('normal')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700"
              >
                ✅ Simular Normal ({minEfectivo}°C–{maxEfectivo}°C, Con Luz)
              </button>
              <button
                type="button"
                disabled={simulando}
                onClick={() => simularLectura('apagon')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-300 border border-slate-700"
              >
                🔌 Simular Corte de Luz
              </button>
              <button
                type="button"
                disabled={simulando}
                onClick={() => simularLectura('calor')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700"
              >
                🌡️ Simular Temp. Alta (&gt;{maxEfectivo}°C)
              </button>
              <button
                type="button"
                disabled={simulando}
                onClick={() => simularLectura('frio')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
              >
                ❄️ Simular Temp. Baja (&lt;{minEfectivo}°C)
              </button>
            </div>
          )}

          {aviso && (
            <div className="rounded-lg bg-slate-800/90 border border-slate-700 px-4 py-2.5 text-sm text-slate-200">
              {aviso}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="text-left py-2 pr-4">Fecha y Hora</th>
                  <th className="text-left py-2 pr-4">Tipo de Evento</th>
                  <th className="text-left py-2">Mensaje Enviado</th>
                </tr>
              </thead>
              <tbody>
                {eventos.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-500">
                      {sucursalId === 1
                        ? 'Aún no hay alertas registradas para este nodo.'
                        : 'Aún no hay alertas registradas. Pulsa “Enviar Alerta de Prueba” para probar.'}
                    </td>
                  </tr>
                )}
                {eventos.map((e) => (
                  <tr key={e.id} className="border-b border-slate-800/60">
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-400">{fechaHora(e.created_at)}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          e.tipo_evento === 'PRUEBA_WHATSAPP' || e.tipo_evento === 'PRUEBA_ALERTA'
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
          Centinela IoT · Cadena de frío 2 °C – 8 °C · Actualización automática cada 5 s + Realtime
        </footer>
      </main>
    </div>
  );
}
