import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// Supabase Client Configuration
// Browser client uses the anon key (safe for client-side).
// Server client uses the service role key (server-only).
// Clients are lazily initialized to avoid errors when keys
// are not yet configured.
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Browser-safe Supabase client (uses anon key with RLS).
 * Use this in client components and for read operations.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      }
      _supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
    return (_supabase as unknown as Record<string, unknown>)[prop as string];
  },
});

/**
 * Server-side Supabase client (uses service role key, bypasses RLS).
 * ONLY use in API routes and server components.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      }
      _supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);
    }
    return (_supabaseAdmin as unknown as Record<string, unknown>)[prop as string];
  },
});

/**
 * Check if Supabase is configured (has valid URL and key).
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    supabaseUrl &&
    supabaseUrl.includes('supabase') &&
    supabaseAnonKey &&
    supabaseAnonKey.length > 10
  );
}
