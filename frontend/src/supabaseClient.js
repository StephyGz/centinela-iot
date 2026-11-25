import { createClient } from '@supabase/supabase-js';

// Valores tomados del .env (con respaldo público para que la demo nunca falle).
// La "publishable/anon key" es pública por diseño; NUNCA pongas aquí la secret key.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://qfrepxrrdouvqjjscovz.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_9MtdkYU1vfIzuvKc-4vBDA_0BJPCTbp';
export const WHATSAPP_PHONE = import.meta.env.VITE_WHATSAPP_PHONE || '+584125002119';
export const CALLMEBOT_API_KEY = import.meta.env.VITE_CALLMEBOT_API_KEY || '7650246';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
