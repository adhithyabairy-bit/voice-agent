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
      return NextResponse.json({ services: [] });
    }

    const { data: services, error } = await supabaseAdmin
      .from('services')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ services: services || [] });
  } catch (error: any) {
    console.error('Services GET Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const body = await request.json();
    const { businessId, name, description, price, currency = 'INR', duration_minutes } = body;

    const targetBusinessId = businessId || session?.business?.id;
    if (!targetBusinessId) {
      return NextResponse.json({ error: 'Business ID is required' }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 });
    }

    const { data: service, error } = await supabaseAdmin
      .from('services')
      .insert({
        business_id: targetBusinessId,
        name: name.trim(),
        description: description?.trim() || null,
        price: price !== undefined && price !== null ? Number(price) : null,
        currency,
        duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      })
      .select()
      .single();

    if (error) throw error;

    invalidateBusinessCache(targetBusinessId);
    return NextResponse.json({ service });
  } catch (error: any) {
    console.error('Services POST Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
