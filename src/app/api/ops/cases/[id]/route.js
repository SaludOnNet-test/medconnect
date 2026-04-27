import { NextResponse } from 'next/server';
import { getCase, updateCase, appendCallLog } from '@/lib/opsCases';
import { requireRole } from '@/lib/adminAuth';

export async function GET(request, { params }) {
  const r = requireRole(request, ['admin', 'ops']);
  if (r instanceof Response) return r;
  const { id } = await params;
  const c = await getCase(id);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ case: c });
}

export async function PATCH(request, { params }) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;
  const session = rr;
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
