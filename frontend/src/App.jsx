import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUsuario(data?.session?.user ?? null);
      setVerificando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUsuario(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const salir = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
  };

  if (verificando) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">
        Verificando sesión...
      </div>
    );
  }

  if (!usuario) {
    return <Login onLogin={(user) => setUsuario(user)} />;
  }

  return <Dashboard usuario={usuario} etiquetaUsuario={usuario.email || 'Usuario'} onSalir={salir} />;
}
