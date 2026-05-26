import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/clinics/[id]
 *
 * Updates the notification config on a clinic:
 *   { notificationEmail?: string|null, notificationsEnabled?: boolean }
 *
 * Auth: admin only — this is a config-level change that affects who
 * receives clinic-side emails. Ops can read the listing but not mutate.
 *
 * Email validation matches the lightweight RFC-5322-ish check used in
 * /api/admin/bookings/[id]/email — strict regexes generate too many
 * false negatives for real-world clinic emails.
 */
export async function PATCH(request, { params }) {
  const rr = requireRole(request, ['admin']);
  if (rr instanceof Response) return rr;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { id } = await params;
  const clinicId = Number(id);
  if (!Number.isFinite(clinicId) || clinicId <= 0) {
    return NextResponse.json({ error: 'invalid clinic id' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Build dynamic UPDATE list — only touch the fields the caller sent so
  // partial updates work (toggling enabled without changing the email, etc.)
  const sets = [];
  const pool = await getPool();
  const req = pool.request();
  req.input('id', sql.Int, clinicId);

  if ('notificationEmail' in body) {
    let email = body.notificationEmail;
    if (email === null || email === '' || email === undefined) {
      req.input('notification_email', sql.NVarChar(255), null);
      sets.push('notification_email = @notification_email');
    } else {
      email = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'invalid email' }, { status: 400 });
      }
      req.input('notification_email', sql.NVarChar(255), email);
      sets.push('notification_email = @notification_email');
    }
  }

  if ('notificationsEnabled' in body) {
    const enabled = body.notificationsEnabled === true || body.notificationsEnabled === 1;
    req.input('notifications_enabled', sql.Bit, enabled ? 1 : 0);
    sets.push('notifications_enabled = @notifications_enabled');
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  try {
    const result = await req.query(
      `UPDATE clinics SET ${sets.join(', ')} WHERE id = @id;
       SELECT TOP 1 id, name, city, notification_email, notifications_enabled
       FROM clinics WHERE id = @id`,
    );
    const row = result.recordset[0];
    if (!row) {
      return NextResponse.json({ error: 'clinic not found' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      clinic: {
        id: row.id,
        name: row.name,
        city: row.city,
        notificationEmail: row.notification_email || null,
        notificationsEnabled: row.notifications_enabled === false ? false : !!row.notifications_enabled,
      },
    });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid column name')) {
      return NextResponse.json(
        { error: 'migration_pending', detail: 'Run /api/db/setup to add the notification columns' },
        { status: 503 },
      );
    }
    console.error('[PATCH /api/admin/clinics/:id]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
