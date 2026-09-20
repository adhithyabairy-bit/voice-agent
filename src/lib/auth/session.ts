// ============================================================
// Auth & Business Session Helper
// Resolves the authenticated user and their active business
// from request headers (Bearer token) or Supabase cookies.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/db/supabase';
import type { Business, Agent } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface AuthSession {
  userId: string | null;
  email: string | null;
  business: Business | null;
  agent: Agent | null;
}

/**
 * Get authenticated user and their business from an incoming Next.js Request.
 */
export async function getAuthSession(request: Request): Promise<AuthSession> {
  if (!isSupabaseConfigured()) {
    return {
      userId: null,
      email: null,
      business: null,
      agent: null,
    };
  }

  try {
    // 1. Check Authorization header (Bearer <jwt>)
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    let token: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    }

    // 2. If no Bearer token, check cookies
    if (!token) {
      const cookieHeader = request.headers.get('cookie') || '';
      // Parse sb-access-token or supabase-auth-token
      const matches = cookieHeader.match(/sb-[a-z0-9]+-auth-token=([^;]+)/i) ||
                      cookieHeader.match(/sb-access-token=([^;]+)/i);
      if (matches && matches[1]) {
        try {
          // Cookie might be base64-encoded or raw JSON
          const raw = decodeURIComponent(matches[1]);
          if (raw.startsWith('{') || raw.startsWith('[')) {
            const parsed = JSON.parse(raw);
            token = parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null);
          } else {
            token = raw;
          }
        } catch {
          token = matches[1];
        }
      }
    }

    let userId: string | null = null;
    let email: string | null = null;

    if (token) {
      try {
        const { data: adminData, error: adminError } = await supabaseAdmin.auth.getUser(token);
        if (!adminError && adminData?.user) {
          userId = adminData.user.id;
          email = adminData.user.email || null;
        } else {
          const client = createClient(supabaseUrl, supabaseAnonKey);
          const { data: clientData, error: clientError } = await client.auth.getUser(token);
          if (!clientError && clientData?.user) {
            userId = clientData.user.id;
            email = clientData.user.email || null;
          }
        }
      } catch (err) {
        console.warn('Error fetching user with token:', err);
      }
    }

    // 3. Resolve business owned by the user
    let business: Business | null = null;
    let agent: Agent | null = null;

    if (userId) {
      const { data: busData } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (busData) {
        business = {
          ...busData,
          business_name: busData.business_name || busData.name,
          name: busData.business_name || busData.name,
        };

        const { data: agentData } = await supabaseAdmin
          .from('agents')
          .select('*')
          .eq('business_id', busData.id)
          .maybeSingle();

        if (agentData) {
          agent = {
            ...agentData,
            agent_name: agentData.agent_name || agentData.name,
            name: agentData.agent_name || agentData.name,
          };
        }
      }
    }

    return {
      userId,
      email,
      business,
      agent,
    };
  } catch (error) {
    console.error('Error resolving auth session:', error);
    return {
      userId: null,
      email: null,
      business: null,
      agent: null,
    };
  }
}
