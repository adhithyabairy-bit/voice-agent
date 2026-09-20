// ============================================================
// GET /api/agent — Get agent configuration and status
// PUT /api/agent — Update agent settings
// ============================================================

import { isGroqConfigured } from '@/lib/ai/groq';
import { isSarvamConfigured } from '@/lib/ai/sarvam-stt';
import { isSupabaseConfigured } from '@/lib/db/supabase';
import { getDemoConfig } from '@/lib/ai/demo';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const demoConfig = getDemoConfig();

    return Response.json({
      agent: {
        name: 'ABC Clinic Receptionist',
        language: 'te-IN',
        voice: 'shubh',
        personality: 'friendly',
        status: demoConfig.isDemo ? 'demo' : 'online',
      },
      providers: {
        groq: {
          configured: isGroqConfigured(),
          status: isGroqConfigured() ? 'connected' : 'not_configured',
        },
        sarvam: {
          configured: isSarvamConfigured(),
          status: isSarvamConfigured() ? 'connected' : 'not_configured',
        },
        supabase: {
          configured: isSupabaseConfigured(),
          status: isSupabaseConfigured() ? 'connected' : 'not_configured',
        },
      },
      demo: demoConfig,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Agent GET Error:', err.message);
    return Response.json(
      { error: 'Failed to fetch agent info', details: err.message },
      { status: 500 }
    );
  }
}
