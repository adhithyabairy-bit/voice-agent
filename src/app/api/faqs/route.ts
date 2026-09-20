import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getAuthSession } from '@/lib/auth/session';
import { generateEmbedding } from '@/lib/ai/knowledge';
import { invalidateBusinessCache } from '@/lib/services/business';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId') || session?.business?.id;

    if (!businessId) {
      return NextResponse.json({ faqs: [] });
    }

    const { data: faqs, error } = await supabaseAdmin
      .from('faqs')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ faqs: faqs || [] });
  } catch (error: any) {
    console.error('FAQs GET Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const body = await request.json();
    const { businessId, question, answer } = body;

    const targetBusinessId = businessId || session?.business?.id;
    if (!targetBusinessId) {
      return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
    }
    if (!question?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: 'Question and answer are required' }, { status: 400 });
    }

    const { data: faq, error } = await supabaseAdmin
      .from('faqs')
      .insert({
        business_id: targetBusinessId,
        question: question.trim(),
        answer: answer.trim(),
      })
      .select()
      .single();

    if (error) throw error;

    // Index into knowledge_chunks for semantic retrieval
    try {
      const faqText = `FAQ - Question: ${question.trim()}\nAnswer: ${answer.trim()}`;
      const embedding = generateEmbedding(faqText);
      await supabaseAdmin.from('knowledge_chunks').insert({
        business_id: targetBusinessId,
        content: faqText,
        embedding,
        metadata: { type: 'faq', faq_id: faq.id, question: question.trim() },
      });
    } catch (embErr) {
      console.error('Error generating FAQ chunk embedding:', embErr);
    }

    invalidateBusinessCache(targetBusinessId);
    return NextResponse.json({ faq });
  } catch (error: any) {
    console.error('FAQs POST Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
