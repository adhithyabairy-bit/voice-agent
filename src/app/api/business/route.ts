// ============================================================
// GET /api/business — Get business information
// PUT /api/business — Update business information
// ============================================================

import { getBusinessInfo, updateBusinessInfo } from '@/lib/services/business';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const context = await getBusinessInfo();
    return Response.json(context);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Business GET Error:', err.message);
    return Response.json(
      { error: 'Failed to fetch business info', details: err.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { businessId, ...data } = body;

    const updated = await updateBusinessInfo(
      businessId || '00000000-0000-0000-0000-000000000001',
      data
    );

    if (!updated) {
      return Response.json(
        { error: 'Failed to update business info' },
        { status: 500 }
      );
    }

    return Response.json({ business: updated });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Business PUT Error:', err.message);
    return Response.json(
      { error: 'Failed to update business info', details: err.message },
      { status: 500 }
    );
  }
}
