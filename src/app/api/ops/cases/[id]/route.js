import { NextResponse } from 'next/server';
import { getCase, updateCase, appendCallLog } from '@/lib/opsCases';
import { requireAuth } from '@/lib/adminAuth';

export async function GET(request, { params }) {
  const session = requireAuth(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const c = await getCase(id);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ case: c });
}

export async function PATCH(request, { params }) {
  const session = requireAuth(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  if (body.callLogEntry) {
    await appendCallLog(id, body.callLogEntry, session.username);
    delete body.callLogEntry;
  }
  if (Object.keys(body).length > 0) {
    await updateCase(id, body);
  }
  const c = await getCase(id);
  return NextResponse.json({ case: c });
}
