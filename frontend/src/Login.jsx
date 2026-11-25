import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Login({ onLogin }) {
  const [modoRegistro, setModoRegistro] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const enviarFormulario = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      return setMensaje('⚠️ Ingresa tu correo y contraseña (mínimo 6 caracteres).');
    }
    setCargando(true);
    setMensaje('');

    if (!modoRegistro) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      setCargando(false);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return setMensaje('❌ Correo o contraseña incorrectos. Si no tienes cuenta, pulsa "Crear cuenta".');
        }
        if (error.message.includes('Email not confirmed')) {
          return setMensaje(
            '⚠️ Correo pendiente de confirmación. En Supabase desactiva "Confirm email" (Authentication > Providers > Email) o confirma tu correo.'
          );
        }
        return setMensaje('❌ ' + error.message);
      }
      onLogin(data.user);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setCargando(false);
      if (error) return setMensaje('❌ ' + error.message);
      if (data.session) return onLogin(data.user);
      setMensaje(
        '✅ Cuenta registrada. Revisa tu correo para confirmar (o desactiva "Confirm email" en Supabase > Authentication > Providers > Email para entrar directo).'
      );
      setModoRegistro(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">❄️</div>
          <h1 className="text-3xl font-bold text-cyan-400">Centinela IoT</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Plataforma multi-nodo de monitoreo de cadena de frío (2 °C – 8 °C)
          </p>
        </div>

        {/* Selector de pestaña Iniciar Sesión / Crear Cuenta */}
        <div className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-xl bg-slate-950 border border-slate-800 text-sm font-semibold">
          <button
            type="button"
            onClick={() => {
              setModoRegistro(false);
              setMensaje('');
            }}
            className={`py-2.5 rounded-lg transition ${
              !modoRegistro ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setModoRegistro(true);
              setMensaje('');
            }}
            className={`py-2.5 rounded-lg transition ${
              modoRegistro ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={enviarFormulario} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Correo electrónico</label>
            <input
              type="email"
              placeholder="usuario@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-cyan-500 outline-none text-slate-100"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Contraseña</label>
            <input
              type="password"
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-cyan-500 outline-none text-slate-100"
              required
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
          >
            {cargando
              ? 'Procesando...'
              : modoRegistro
              ? 'Registrar cuenta y acceder'
              : 'Ingresar al Panel de Monitoreo'}
          </button>
        </form>

        {mensaje && (
          <div className="mt-4 p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-sm text-center text-slate-200">
            {mensaje}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-500">
          🔒 Acceso protegido con Supabase Auth &amp; Row Level Security (RLS)
        </div>
      </div>
    </div>
  );
}
