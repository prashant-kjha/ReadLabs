import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars not set — auth will not work.');
}

// Fall back to syntactically valid placeholders when env vars are absent.
// `createClient` throws "supabaseUrl is required." on an empty URL, which would
// crash the whole app at module load (blank white screen) — e.g. in CI/E2E
// runs or a misconfigured deploy. With placeholders the UI still renders and
// only auth calls fail, which is far easier to diagnose than a blank page.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
