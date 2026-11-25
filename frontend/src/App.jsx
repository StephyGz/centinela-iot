import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';

export default function App() {
  // modo: null = pantalla de login | 'evaluacion' | 'auth'
  const [modo, setModo] = useState(null);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setUsuario(data.session.user);
        setModo('auth');
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUsuario(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const salir = async () => {
    if (modo === 'auth') await supabase.auth.signOut();
    setUsuario(null);
    setModo(null);
  };

  if (!modo) {
    return (
      <Login
        onEvaluacion={() => setModo('evaluacion')}
        onLogin={(user) => {
          setUsuario(user);
          setModo('auth');
        }}
      />
    );
  }

  return (
    <Dashboard
      etiquetaUsuario={modo === 'evaluacion' ? 'Modo Evaluación' : usuario?.email || 'Usuario'}
      onSalir={salir}
    />
  );
}
