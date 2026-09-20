import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getAuthSession } from '@/lib/auth/session';
import { chunkText, generateEmbedding } from '@/lib/ai/knowledge';
import { invalidateBusinessCache } from '@/lib/services/business';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId') || session?.business?.id;

    if (!businessId) {
      return NextResponse.json({ documents: [], totalChunks: 0 });
    }

    const [docsRes, chunksCountRes] = await Promise.all([
      supabaseAdmin
        .from('knowledge_documents')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('knowledge_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId),
    ]);

    if (docsRes.error) throw docsRes.error;

    return NextResponse.json({
      documents: docsRes.data || [],
      totalChunks: chunksCountRes.count || 0,
    });
  } catch (error: any) {
    console.error('Knowledge GET Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const body = await request.json();
    const { businessId, title, content, sourceType = 'text' } = body;

    const targetBusinessId = businessId || session?.business?.id;
    if (!targetBusinessId) {
      return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
    }
    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    // 1. Create document
    const { data: document, error: docError } = await supabaseAdmin
      .from('knowledge_documents')
      .insert({
        business_id: targetBusinessId,
        title: title.trim(),
        content: content.trim(),
        source_type: sourceType,
      })
      .select()
      .single();

    if (docError) throw docError;

    // 2. Chunk text
    const chunks = chunkText(content.trim(), 400, 50);

    // 3. Generate embeddings and insert into knowledge_chunks
    const chunkInserts = chunks.map((chunk) => ({
      business_id: targetBusinessId,
      document_id: document.id,
      content: chunk,
      embedding: generateEmbedding(chunk),
      metadata: { title: title.trim(), source_type: sourceType },
    }));

    if (chunkInserts.length > 0) {
      const { error: chunkError } = await supabaseAdmin
        .from('knowledge_chunks')
        .insert(chunkInserts);

      if (chunkError) {
        console.error('Error inserting chunks:', chunkError);
      }
    }

    invalidateBusinessCache(targetBusinessId);

    return NextResponse.json({
      document,
      chunkCount: chunkInserts.length,
    });
  } catch (error: any) {
    console.error('Knowledge POST Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
