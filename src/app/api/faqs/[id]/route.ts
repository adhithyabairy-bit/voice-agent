import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { generateEmbedding } from '@/lib/ai/knowledge';
import { invalidateBusinessCache } from '@/lib/services/business';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { question, answer, businessId } = body;

    const { data: updated, error } = await supabaseAdmin
      .from('faqs')
      .update({
        ...(question !== undefined && { question: question.trim() }),
        ...(answer !== undefined && { answer: answer.trim() }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const bId = businessId || updated?.business_id;
    if (bId) {
      // Re-index chunk
      if (question || answer) {
        const q = question || updated.question;
        const a = answer || updated.answer;
        const faqText = `FAQ - Question: ${q}\nAnswer: ${a}`;
        const embedding = generateEmbedding(faqText);
        await supabaseAdmin
          .from('knowledge_chunks')
          .delete()
          .eq('business_id', bId)
          .contains('metadata', { faq_id: id });

        await supabaseAdmin.from('knowledge_chunks').insert({
          business_id: bId,
          content: faqText,
          embedding,
          metadata: { type: 'faq', faq_id: id, question: q },
        });
      }

      invalidateBusinessCache(bId);
    }

    return NextResponse.json({ faq: updated });
  } catch (error: any) {
    console.error('FAQ PUT Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: faq } = await supabaseAdmin
      .from('faqs')
      .select('business_id')
      .eq('id', id)
      .single();

    const { error } = await supabaseAdmin
      .from('faqs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    if (faq?.business_id) {
      await supabaseAdmin
        .from('knowledge_chunks')
        .delete()
        .eq('business_id', faq.business_id)
        .contains('metadata', { faq_id: id });

      invalidateBusinessCache(faq.business_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('FAQ DELETE Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
