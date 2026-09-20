import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getAuthSession } from '@/lib/auth/session';
import { getChatResponse } from '@/lib/ai/groq';
import { buildSummaryPrompt } from '@/lib/ai/prompts';
import type { LanguageCode } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId') || session?.business?.id;

    let query = supabaseAdmin
      .from('calls')
      .select(`
        *,
        call_summaries (*),
        call_messages (*)
      `)
      .order('started_at', { ascending: false })
      .limit(50);

    if (businessId) {
      query = query.eq('business_id', businessId);
    }

    const { data: calls, error } = await query;
    if (error) throw error;

    return NextResponse.json({ calls: calls || [] });
  } catch (error: any) {
    console.error('Calls GET Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      callId,
      businessId,
      agentId,
      callerNumber,
      messages = [],
      language = 'te-IN',
      startTime,
      status = 'completed',
    } = body;

    const durationSeconds = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

    let targetCallId = callId;

    // 1. Create or update call record
    if (!targetCallId) {
      const { data: newCall, error: callErr } = await supabaseAdmin
        .from('calls')
        .insert({
          business_id: businessId,
          agent_id: agentId || null,
          caller_number: callerNumber || 'Web Caller',
          started_at: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          status,
          language,
        })
        .select()
        .single();

      if (callErr) throw callErr;
      targetCallId = newCall.id;
    } else {
      await supabaseAdmin
        .from('calls')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          status,
        })
        .eq('id', targetCallId);
    }

    // 2. Insert call messages if provided
    if (Array.isArray(messages) && messages.length > 0) {
      const formattedMessages = messages.map((m: any) => ({
        call_id: targetCallId,
        speaker: m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : 'system',
        message: m.content,
        timestamp: m.timestamp || new Date().toISOString(),
      }));

      await supabaseAdmin.from('call_messages').insert(formattedMessages);
    }

    // 3. Generate summary via Groq
    let summaryData: any = {
      summary: null,
      intent: null,
      customer_name: null,
      lead_status: 'none',
      follow_up_required: false,
    };

    if (messages.length > 1) {
      try {
        const summaryPrompt = buildSummaryPrompt(messages, language as LanguageCode);
        const groqResponse = await getChatResponse([
          { role: 'user', content: summaryPrompt },
        ], { temperature: 0.2, maxTokens: 250 });

        const parsed = JSON.parse(groqResponse);
        summaryData = {
          summary: parsed.summary || null,
          intent: parsed.intent || null,
          customer_name: parsed.customer_name || null,
          lead_status: parsed.lead_status || 'none',
          follow_up_required: parsed.lead_status === 'interested' || parsed.lead_status === 'converted',
          extracted_data: parsed,
        };
      } catch (sumErr) {
        console.error('Call summary generation error:', sumErr);
        summaryData.summary = `Call in ${language} with ${messages.length} exchanges.`;
      }

      // 4. Save call summary
      await supabaseAdmin
        .from('call_summaries')
        .insert({
          call_id: targetCallId,
          summary: summaryData.summary,
          customer_intent: summaryData.intent,
          lead_status: summaryData.lead_status,
          follow_up_required: summaryData.follow_up_required,
          extracted_data: summaryData.extracted_data || {},
        });
    }

    return NextResponse.json({
      success: true,
      callId: targetCallId,
      summary: summaryData.summary,
      intent: summaryData.intent,
      leadStatus: summaryData.lead_status,
      customerName: summaryData.customer_name,
    });
  } catch (error: any) {
    console.error('Calls POST Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
