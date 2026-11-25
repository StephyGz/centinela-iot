import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Login({ onEvaluacion, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const iniciarSesion = async (e) => {
    e.preventDefault();
    setCargando(true);
    setMensaje('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) return setMensaje('❌ ' + error.message);
    onLogin(data.user);
  };

  const registrarse = async () => {
    if (!email || !password) return setMensaje('Escribe correo y contraseña (mín. 6 caracteres).');
    setCargando(true);
    setMensaje('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    setCargando(false);
    if (error) return setMensaje('❌ ' + error.message);
    if (data.session) return onLogin(data.user);
    setMensaje('✅ Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">❄️</div>
          <h1 className="text-3xl font-bold text-cyan-400">Centinela IoT</h1>
          <p className="text-slate-400 mt-1">Monitoreo de cadena de frío (2 °C – 8 °C)</p>
        </div>

        <button
          onClick={onEvaluacion}
          className="w-full py-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-lg font-bold transition shadow-lg shadow-cyan-500/20"
        >
          🚀 Entrar Directo al Panel (Modo Evaluación)
        </button>

        <div className="flex items-center gap-3 my-6 text-slate-500 text-sm">
          <div className="flex-1 h-px bg-slate-800" />
          o inicia sesión
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        <form onSubmit={iniciarSesion} className="space-y-3">
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-cyan-500 outline-none"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-cyan-500 outline-none"
            required
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={cargando}
              className="flex-1 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 font-semibold disabled:opacity-50"
            >
              {cargando ? '...' : 'Iniciar sesión'}
            </button>
            <button
              type="button"
              onClick={registrarse}
              disabled={cargando}
              className="flex-1 py-3 rounded-lg border border-slate-700 hover:bg-slate-800 font-semibold disabled:opacity-50"
            >
              Crear cuenta
            </button>
          </div>
        </form>

        {mensaje && <p className="mt-4 text-sm text-center text-slate-300">{mensaje}</p>}
      </div>
    </div>
  );
}
