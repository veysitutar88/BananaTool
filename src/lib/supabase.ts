/**
 * supabase.ts — Supabase client singleton
 *
 * Requires env vars:
 *   VITE_SUPABASE_URL      — Project URL from supabase.com → Settings → API
 *   VITE_SUPABASE_ANON_KEY — Public anon key (safe to expose in browser)
 *
 * Usage:
 *   import { supabase } from '../lib/supabase';
 */

import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Storage features will be disabled.'
  );
}

export const supabase = url && key
  ? createClient(url, key)
  : null;
