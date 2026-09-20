import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { invalidateBusinessCache } from '@/lib/services/business';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, price, currency, duration_minutes, businessId } = body;

    const { data: updated, error } = await supabaseAdmin
      .from('services')
      .update({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(price !== undefined && { price: price !== null ? Number(price) : null }),
        ...(currency !== undefined && { currency }),
        ...(duration_minutes !== undefined && { duration_minutes: duration_minutes ? Number(duration_minutes) : null }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (businessId || updated?.business_id) {
      invalidateBusinessCache(businessId || updated.business_id);
    }

    return NextResponse.json({ service: updated });
  } catch (error: any) {
    console.error('Service PUT Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: service } = await supabaseAdmin
      .from('services')
      .select('business_id')
      .eq('id', id)
      .single();

    const { error } = await supabaseAdmin
      .from('services')
      .delete()
      .eq('id', id);

    if (error) throw error;

    if (service?.business_id) {
      invalidateBusinessCache(service.business_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Service DELETE Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
