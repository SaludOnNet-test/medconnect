import { NextResponse } from 'next/server';
import { listCases } from '@/lib/opsCases';
import { requireAuth } from '@/lib/adminAuth';

export async function GET(request) {
  const session = requireAuth(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || null;
  const limit = Number(searchParams.get('limit') || 100);

  try {
    const cases = await listCases({ status, limit });
    return NextResponse.json({ cases });
  } catch (err) {
    console.error('[GET /api/ops/cases]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
