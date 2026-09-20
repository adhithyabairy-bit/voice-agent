// ============================================================
// GET /api/agents — Get agent information
// PUT /api/agents — Update agent configuration
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getAuthSession } from '@/lib/auth/session';
import { invalidateBusinessCache } from '@/lib/services/business';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId') || session?.business?.id;

    if (!businessId) {
      return NextResponse.json({ agent: session?.agent || null });
    }

    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json({ agent: agent || null });
  } catch (error: any) {
    console.error('Agent GET Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const body = await request.json();
    const { agentId, businessId, ...updates } = body;

    const targetBusinessId = businessId || session?.business?.id;

    if (!targetBusinessId) {
      return NextResponse.json({ error: 'Business not found. Please complete onboarding.' }, { status: 400 });
    }

    let targetAgentId = agentId || session?.agent?.id;

    if (!targetAgentId) {
      const { data: existingAgent } = await supabaseAdmin
        .from('agents')
        .select('id')
        .eq('business_id', targetBusinessId)
        .limit(1)
        .single();
      targetAgentId = existingAgent?.id;
    }

    if (targetAgentId) {
      const { data: updated, error } = await supabaseAdmin
        .from('agents')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetAgentId)
        .select()
        .single();

      if (error) throw error;
      invalidateBusinessCache(targetBusinessId);
      return NextResponse.json({ agent: updated });
    } else {
      // Create new agent if none exists
      const { data: created, error } = await supabaseAdmin
        .from('agents')
        .insert({
          business_id: targetBusinessId,
          agent_name: updates.agent_name || 'AI Assistant',
          language: updates.language || 'te-IN',
          voice: updates.voice || 'aditya',
          response_style: updates.response_style || 'friendly',
          greeting: updates.greeting || 'నమస్కారం! నేను మీకు ఎలా సహాయపడగలను?',
          fallback_message: updates.fallback_message || 'క్షమించండి, మీ మాట సరిగా వినపడలేదు. మళ్లీ చెప్పగలరా?',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      invalidateBusinessCache(targetBusinessId);
      return NextResponse.json({ agent: created });
    }
  } catch (error: any) {
    console.error('Agent PUT Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
