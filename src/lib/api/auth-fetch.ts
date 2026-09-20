import { supabase } from '@/lib/db/supabase';

/**
 * An enhanced fetch wrapper that automatically:
 * 1. Attaches the Supabase JWT Bearer token to the Authorization header.
 * 2. Synchronizes the sb-access-token cookie in document.cookie so server-side Next.js route handlers can parse it.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      if (!headers.has('Authorization') && !headers.has('authorization')) {
        headers.set('Authorization', `Bearer ${session.access_token}`);
      }
      if (typeof document !== 'undefined') {
        const maxAge = session.expires_in || 3600;
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
      }
    }
  } catch (err) {
    console.warn('Failed to attach Supabase session token to request:', err);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
