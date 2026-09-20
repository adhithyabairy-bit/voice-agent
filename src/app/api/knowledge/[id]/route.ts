import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { invalidateBusinessCache } from '@/lib/services/business';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: doc } = await supabaseAdmin
      .from('knowledge_documents')
      .select('business_id')
      .eq('id', id)
      .single();

    // Delete chunks associated with doc
    await supabaseAdmin
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', id);

    // Delete document
    const { error } = await supabaseAdmin
      .from('knowledge_documents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    if (doc?.business_id) {
      invalidateBusinessCache(doc.business_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Knowledge DELETE Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
