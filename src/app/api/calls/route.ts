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

    if (Array.isArray(calls) && calls.length > 0) {
      return NextResponse.json({ calls });
    }

    // Fallback: If calls table is empty, retrieve from conversations table
    const { data: legacyConvs } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50);

    if (Array.isArray(legacyConvs) && legacyConvs.length > 0) {
      const mapped = legacyConvs.map((conv) => ({
        id: conv.id,
        caller_number: conv.customer_name || 'Web Caller',
        started_at: conv.started_at || conv.created_at,
        duration_seconds: conv.duration || 0,
        status: 'completed',
        language: conv.language || 'te-IN',
        call_summaries: [
          {
            summary: conv.summary || `Call conducted in ${conv.language || 'te-IN'}.`,
            customer_intent: conv.intent || 'Customer Inquiry',
            lead_status: conv.lead_status || 'interested',
            extracted_data: { name: conv.customer_name },
          },
        ],
        call_messages: [],
      }));
      return NextResponse.json({ calls: mapped });
    }

    return NextResponse.json({ calls: [] });
  } catch (error: any) {
    console.error('Calls GET Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const session = await getAuthSession(request);
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

    // Resolve target business
    let resolvedBusinessId = businessId || session?.business?.id;
    if (!resolvedBusinessId && session?.userId) {
      const { data: userBus } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .eq('owner_id', session.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedBusinessId = userBus?.id;
    }
    if (!resolvedBusinessId) {
      const { data: fallbackBus } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedBusinessId = fallbackBus?.id;
    }

    let targetCallId = callId;

    // Check if call already exists in `calls` table
    let existingCall = null;
    if (targetCallId) {
      const { data: callRow } = await supabaseAdmin
        .from('calls')
        .select('id')
        .eq('id', targetCallId)
        .maybeSingle();
      existingCall = callRow;
    }

    // 1. Create or update call record in `calls`
    if (!existingCall) {
      const { data: newCall, error: callErr } = await supabaseAdmin
        .from('calls')
        .insert({
          business_id: resolvedBusinessId,
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

      if (callErr) {
        console.error('Calls insert error:', callErr);
        throw callErr;
      }
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
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
      }));

      const { error: msgErr } = await supabaseAdmin.from('call_messages').insert(formattedMessages);
      if (msgErr) console.warn('call_messages insert warning:', msgErr);
    }

    // 3. Generate summary via Groq
    let summaryData: any = {
      summary: null,
      intent: 'Inquiry',
      customer_name: 'Caller',
      lead_status: 'interested',
      follow_up_required: true,
      extracted_data: {},
    };

    if (Array.isArray(messages) && messages.length >= 1) {
      try {
        const summaryPrompt = buildSummaryPrompt(messages, language as LanguageCode);
        const groqResponse = await getChatResponse([
          { role: 'user', content: summaryPrompt },
        ], { temperature: 0.2, maxTokens: 300 });

        let cleanJson = groqResponse.trim();
        if (cleanJson.includes('```json')) {
          cleanJson = cleanJson.split('```json')[1].split('```')[0].trim();
        } else if (cleanJson.includes('```')) {
          cleanJson = cleanJson.split('```')[1].split('```')[0].trim();
        }

        const parsed = JSON.parse(cleanJson);
        summaryData = {
          summary: parsed.summary || parsed.takeaway || `Customer discussed business inquiries in ${language}.`,
          intent: parsed.intent || parsed.customer_intent || 'Customer Inquiry',
          customer_name: parsed.customer_name || parsed.name || 'Caller',
          lead_status: parsed.lead_status || 'interested',
          follow_up_required: parsed.lead_status === 'interested' || parsed.lead_status === 'converted' || parsed.follow_up_required === true,
          extracted_data: parsed,
        };
      } catch (sumErr) {
        console.warn('Call summary generation fallback:', sumErr);
        const userMsgs = messages.filter((m: any) => m.role === 'user');
        const lastUser = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : 'Customer inquiry';
        summaryData.summary = `Caller discussed: "${lastUser.slice(0, 90)}". Voice receptionist provided information and assistance.`;
        summaryData.intent = 'General Inquiry';
        summaryData.lead_status = 'interested';
      }

      // 4. Save call summary to call_summaries table
      const { error: sumInsertErr } = await supabaseAdmin
        .from('call_summaries')
        .insert({
          call_id: targetCallId,
          summary: summaryData.summary,
          customer_intent: summaryData.intent,
          lead_status: summaryData.lead_status,
          follow_up_required: summaryData.follow_up_required,
          extracted_data: summaryData.extracted_data || {},
        });
      if (sumInsertErr) console.warn('call_summaries insert warning:', sumInsertErr);

      // Also sync to legacy conversations table if conversation exists
      if (callId) {
        await supabaseAdmin
          .from('conversations')
          .update({
            summary: summaryData.summary,
            intent: summaryData.intent,
            lead_status: summaryData.lead_status,
            customer_name: summaryData.customer_name,
            duration: durationSeconds,
            ended_at: new Date().toISOString(),
          })
          .eq('id', callId);
      }
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
