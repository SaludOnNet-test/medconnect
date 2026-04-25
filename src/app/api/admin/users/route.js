import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { requireAuth, createAdmin } from '@/lib/adminAuth';

export async function GET(request) {
  const session = requireAuth(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!DB_AVAILABLE) return NextResponse.json({ users: [] });

  const result = await query(
    `SELECT id, username, display_name, role, is_active, created_at, last_login
     FROM admin_users ORDER BY created_at DESC`
  );
  return NextResponse.json({ users: result.recordset });
}

export async function POST(request) {
  const session = requireAuth(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  if (!DB_AVAILABLE) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

  try {
    const { username, password, displayName, role } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'username and password required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'password must be at least 6 chars' }, { status: 400 });
    }
    await createAdmin({ username, password, displayName, role: role || 'ops' });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    console.error('[admin/users POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
