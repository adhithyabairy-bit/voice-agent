// ============================================================
// GET /api/business — Get business information
// PUT /api/business — Update business information
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getBusinessInfo, updateBusinessInfo, invalidateBusinessCache } from '@/lib/services/business';
import { getAuthSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessIdParam = searchParams.get('businessId');

    const session = await getAuthSession(request);
    const context = await getBusinessInfo(
      businessIdParam || session?.business?.id || undefined,
      session?.userId || undefined
    );

    return NextResponse.json(context);
  } catch (error: any) {
    console.error('Business GET Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch business info', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    const body = await request.json();
    const { businessId, ...data } = body;

    const targetBusinessId = businessId || session?.business?.id;

    if (!targetBusinessId) {
      return NextResponse.json(
        { error: 'No business found to update. Please complete onboarding.' },
        { status: 400 }
      );
    }

    const updated = await updateBusinessInfo(targetBusinessId, data);

    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to update business info' },
        { status: 500 }
      );
    }

    invalidateBusinessCache(targetBusinessId);

    return NextResponse.json({ business: updated });
  } catch (error: any) {
    console.error('Business PUT Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to update business info', details: error.message },
      { status: 500 }
    );
  }
}
