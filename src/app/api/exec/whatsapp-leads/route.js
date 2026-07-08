import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';
import sql from 'mssql';
import { requireExecAuth } from '@/lib/exec/auth';
import { internalError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// GET /api/exec/whatsapp-leads?status=pending&limit=50
export async function GET(request) {
  const authError = requireExecAuth(request);
  if (authError) return authError;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'Azure SQL not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'all';
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

  try {
    const pool = await getPool();

    const whereClause = status !== 'all' ? `WHERE l.status = @status` : '';

    const result = await pool.request()
      .input('status', sql.NVarChar(30), status)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          l.id,
          l.phone_number,
          l.patient_name,
          l.insurance_company,
          l.specialty_requested,
          l.preferred_doctor,
          l.preferred_date,
          l.preferred_time_range,
          l.visit_reason,
          l.checkout_link,
          l.urgency_level,
          l.status,
          l.created_at,
          -- Count of conversations in this session
          (SELECT COUNT(*) FROM whatsapp_conversations c
           WHERE c.phone_number = l.phone_number
             AND c.session_date = CAST(l.created_at AT TIME ZONE 'Romance Standard Time' AS DATE)
          ) AS message_count
        FROM whatsapp_leads l
        ${whereClause}
        ORDER BY l.created_at DESC
      `);

    // Summary counts for KPIs
    const counts = await pool.request().query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'link_sent' THEN 1 ELSE 0 END) AS link_sent,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN status = 'discarded' THEN 1 ELSE 0 END) AS discarded,
        SUM(CASE WHEN urgency_level = 'emergency' THEN 1 ELSE 0 END) AS emergencies,
        -- Last 7 days
        SUM(CASE WHEN created_at >= DATEADD(day, -7, SYSDATETIMEOFFSET()) THEN 1 ELSE 0 END) AS last_7d
      FROM whatsapp_leads
    `);

    // Pending escalations
    const escalations = await pool.request().query(`
      SELECT TOP 20
        id, phone_number, patient_name,
        preferred_contact_time, contact_phone,
        conversation_summary, status, created_at
      FROM human_escalations
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `);

    return NextResponse.json({
      leads: result.recordset,
      summary: counts.recordset[0],
      pendingEscalations: escalations.recordset,
    });
  } catch (err) {
    return internalError(err, '[GET /api/exec/whatsapp-leads]');
  }
}

// PATCH /api/exec/whatsapp-leads — update lead status
export async function PATCH(request) {
  const authError = requireExecAuth(request);
  if (authError) return authError;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'Azure SQL not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, status, table } = body;
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

  const targetTable = table === 'escalation' ? 'human_escalations' : 'whatsapp_leads';
  const allowed = table === 'escalation'
    ? ['pending', 'called', 'resolved']
    : ['link_sent', 'paid', 'expired', 'discarded'];

  if (!allowed.includes(status)) {
    return NextResponse.json({ error: `Invalid status "${status}" for ${targetTable}` }, { status: 400 });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.NVarChar(30), status)
      .query(`UPDATE ${targetTable} SET status = @status WHERE id = @id`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError(err, '[PATCH /api/exec/whatsapp-leads]');
  }
}
