import { NextResponse } from 'next/server';
import { getPool, DB_AVAILABLE } from '@/lib/db';
import { internalError } from '@/lib/errors';
import { requireExecAuth } from '@/lib/exec/auth';

export const dynamic = 'force-dynamic';

// Windows the dashboard and email actually need. Anything else is YAGNI.
const RANGES = {
  today: { sinceSql: "CAST(GETDATE() AS DATE)", label: 'hoy' },
  yesterday: { sinceSql: "DATEADD(day, -1, CAST(GETDATE() AS DATE))",
               untilSql: "CAST(GETDATE() AS DATE)", label: 'ayer' },
  '7d': { sinceSql: "DATEADD(day, -7, SYSDATETIMEOFFSET())", label: 'últimos 7 días' },
  '28d': { sinceSql: "DATEADD(day, -28, SYSDATETIMEOFFSET())", label: 'últimos 28 días' },
  all: { sinceSql: null, label: 'desde el inicio' },
};

/**
 * GET /api/exec/business-kpis?secret=...&range=7d
 *
 * Agrega ventas, funnel web, operations cases, redirecciones, outreach y
 * clínicas onboard en una sola respuesta. Consumido por:
 *   - /admin/exec (dashboard live)
 *   - /api/exec/daily-email
 *   - /api/exec/weekly-email
 *
 * Devuelve siempre `today` y la ventana solicitada (default 7d). All queries
 * run in parallel against the same pool — Azure SQL handles this easily up to
 * the pool max (25).
 */
export async function GET(request) {
  const authError = requireExecAuth(request);
  if (authError) return authError;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'Azure SQL not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const rangeKey = searchParams.get('range') || '7d';
  const range = RANGES[rangeKey] || RANGES['7d'];

  try {
    const pool = await getPool();

    const whereCreated = range.sinceSql
      ? range.untilSql
        ? `WHERE created_at >= ${range.sinceSql} AND created_at < ${range.untilSql}`
        : `WHERE created_at >= ${range.sinceSql}`
      : '';

    const [
      ventasRes,
      ventasTodayRes,
      funnelRes,
      referralsRes,
      opsCasesRes,
      opsRedirectionRes,
      outreachRes,
      clinicsRes,
      topSpecialtyRes,
      topCityRes,
      bookingsSeriesRes,
    ] = await Promise.all([
      // Ventas en la ventana
      pool.request().query(`
        SELECT
          COUNT(*) AS total_bookings,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
          SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded,
          SUM(CASE WHEN status IN ('pending_call','clinic_proposed_alternative','alternative_clinic_proposed') THEN 1 ELSE 0 END) AS in_ops,
          ISNULL(SUM(CAST(amount AS FLOAT)), 0) AS gross_eur,
          ISNULL(SUM(CAST(ISNULL(platform_fee, amount) AS FLOAT)), 0) AS platform_fee_eur,
          ISNULL(AVG(CAST(amount AS FLOAT)), 0) AS avg_amount
        FROM bookings
        ${whereCreated}
      `),

      // Ventas hoy (siempre, para comparativa)
      pool.request().query(`
        SELECT
          COUNT(*) AS total_bookings,
          ISNULL(SUM(CAST(amount AS FLOAT)), 0) AS gross_eur,
          ISNULL(SUM(CAST(ISNULL(platform_fee, amount) AS FLOAT)), 0) AS platform_fee_eur
        FROM bookings
        WHERE created_at >= CAST(GETDATE() AS DATE)
      `),

      // Funnel events en la ventana
      pool.request().query(`
        SELECT event_name, COUNT(*) AS cnt
        FROM analytics_events
        ${whereCreated}
        GROUP BY event_name
      `),

      // Referrals por estado en la ventana
      pool.request().query(`
        SELECT state, COUNT(*) AS cnt
        FROM referrals
        ${whereCreated}
        GROUP BY state
      `),

      // Operations cases — breakdown por status (no filtramos por ventana
      // porque los casos abiertos viejos son los más importantes de ver)
      pool.request().query(`
        SELECT status, COUNT(*) AS cnt
        FROM operations_cases
        GROUP BY status
      `),

      // Métricas de redirección — únicamente casos creados en la ventana,
      // para medir % aceptación real. Sin filtro de ventana mezclaríamos
      // casos viejos con resoluciones nuevas.
      pool.request().query(`
        SELECT
          SUM(CASE WHEN alternative_proposed_at IS NOT NULL THEN 1 ELSE 0 END) AS alternatives_proposed,
          SUM(CASE WHEN status = 'patient_accepted' THEN 1 ELSE 0 END) AS patient_accepted,
          SUM(CASE WHEN status = 'patient_rejected_refunding' THEN 1 ELSE 0 END) AS patient_rejected,
          SUM(CASE WHEN status = 'no_alternative_refunding' THEN 1 ELSE 0 END) AS no_alternative,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired_no_response,
          SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded
        FROM operations_cases
        ${whereCreated}
      `),

      // Outreach a clínicas (snapshot actual, no por ventana)
      pool.request().query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'not_contacted' THEN 1 ELSE 0 END) AS not_contacted,
          SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
          SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) AS follow_up,
          SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) AS no_answer,
          SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
        FROM clinic_outreach
      `).catch((err) => {
        // Tabla nueva — si la migración aún no corrió, devolvemos zeros.
        if (String(err?.message || '').includes('Invalid object name')) {
          return { recordset: [{ total: 0 }] };
        }
        throw err;
      }),

      // Catálogo de clínicas activas
      pool.request().query(`
        SELECT COUNT(*) AS active_clinics FROM clinics
      `),

      // Top especialidades por booking en la ventana
      pool.request().query(`
        SELECT TOP 10 specialty, COUNT(*) AS cnt,
               ISNULL(SUM(CAST(amount AS FLOAT)), 0) AS gross_eur
        FROM bookings
        ${whereCreated}
        ${whereCreated ? 'AND' : 'WHERE'} specialty IS NOT NULL
        GROUP BY specialty
        ORDER BY cnt DESC
      `),

      // Top ciudades (a partir de provider_name no se puede; usamos referrals
      // que sí tiene el provider_id resolvible — pero para MVP sacamos top
      // searches de analytics_events como proxy de demanda)
      pool.request().query(`
        SELECT TOP 10
          JSON_VALUE(properties, '$.city') AS city,
          COUNT(*) AS searches
        FROM analytics_events
        WHERE event_name = 'search_performed'
          ${range.sinceSql ? `AND created_at >= ${range.sinceSql}` : ''}
          ${range.untilSql ? `AND created_at < ${range.untilSql}` : ''}
          AND JSON_VALUE(properties, '$.city') IS NOT NULL
        GROUP BY JSON_VALUE(properties, '$.city')
        ORDER BY searches DESC
      `),

      // Serie diaria de bookings últimos 14 días (para sparkline en daily)
      pool.request().query(`
        SELECT
          CAST(created_at AS DATE) AS day,
          COUNT(*) AS cnt,
          ISNULL(SUM(CAST(amount AS FLOAT)), 0) AS gross_eur
        FROM bookings
        WHERE created_at >= DATEADD(day, -14, CAST(GETDATE() AS DATE))
        GROUP BY CAST(created_at AS DATE)
        ORDER BY day ASC
      `),
    ]);

    const ventas = ventasRes.recordset[0] || {};
    const ventasToday = ventasTodayRes.recordset[0] || {};

    const events = funnelRes.recordset.reduce((acc, r) => { acc[r.event_name] = r.cnt; return acc; }, {});
    const referrals = referralsRes.recordset.reduce((acc, r) => { acc[r.state] = r.cnt; return acc; }, {});
    const opsBreakdown = opsCasesRes.recordset.reduce((acc, r) => { acc[r.status] = r.cnt; return acc; }, {});
    const redirections = opsRedirectionRes.recordset[0] || {};
    const outreach = outreachRes.recordset[0] || {};
    const clinicsOnboard = clinicsRes.recordset[0]?.active_clinics || 0;

    const pct = (a, b) => (a && b) ? Math.round((a / b) * 100) : 0;

    const funnel = {
      events,
      conversion: {
        search_to_clinic_view:   pct(events.clinic_viewed,   events.search_performed),
        clinic_to_slot_selected: pct(events.slot_selected,   events.clinic_viewed),
        slot_to_book_started:    pct(events.book_started,    events.slot_selected),
        book_to_completed:       pct(events.book_completed,  events.book_started),
        overall:                 pct(events.book_completed,  events.search_performed),
      },
    };

    const altsProposed = Number(redirections.alternatives_proposed) || 0;
    const altsAccepted = Number(redirections.patient_accepted) || 0;
    const altsRejected = Number(redirections.patient_rejected) || 0;

    return NextResponse.json({
      range: rangeKey,
      label: range.label,
      generatedAt: new Date().toISOString(),

      sales: {
        total: Number(ventas.total_bookings) || 0,
        confirmed: Number(ventas.confirmed) || 0,
        refunded: Number(ventas.refunded) || 0,
        inOps: Number(ventas.in_ops) || 0,
        grossEur: Math.round((Number(ventas.gross_eur) || 0) * 100) / 100,
        platformFeeEur: Math.round((Number(ventas.platform_fee_eur) || 0) * 100) / 100,
        avgAmountEur: Math.round((Number(ventas.avg_amount) || 0) * 100) / 100,
      },

      today: {
        total: Number(ventasToday.total_bookings) || 0,
        grossEur: Math.round((Number(ventasToday.gross_eur) || 0) * 100) / 100,
        platformFeeEur: Math.round((Number(ventasToday.platform_fee_eur) || 0) * 100) / 100,
      },

      funnel,

      referrals,

      ops: {
        breakdown: opsBreakdown,
        openInWindow: Object.entries(opsBreakdown)
          .filter(([s]) => !['confirmed','refunded','expired','cancelled'].includes(s))
          .reduce((sum, [, n]) => sum + Number(n), 0),
        redirections: {
          alternativesProposed: altsProposed,
          patientAccepted: altsAccepted,
          patientRejected: altsRejected,
          noAlternative: Number(redirections.no_alternative) || 0,
          expiredNoResponse: Number(redirections.expired_no_response) || 0,
          refunded: Number(redirections.refunded) || 0,
          acceptanceRate: altsProposed ? Math.round((altsAccepted / altsProposed) * 100) : 0,
        },
      },

      outreach: {
        total: Number(outreach.total) || 0,
        notContacted: Number(outreach.not_contacted) || 0,
        contacted: Number(outreach.contacted) || 0,
        followUp: Number(outreach.follow_up) || 0,
        noAnswer: Number(outreach.no_answer) || 0,
        accepted: Number(outreach.accepted) || 0,
        rejected: Number(outreach.rejected) || 0,
      },

      clinicsOnboard,

      topBreakdowns: {
        bySpecialty: topSpecialtyRes.recordset.map((r) => ({
          specialty: r.specialty,
          bookings: Number(r.cnt),
          grossEur: Math.round(Number(r.gross_eur) * 100) / 100,
        })),
        bySearchedCity: topCityRes.recordset.map((r) => ({
          city: r.city,
          searches: Number(r.searches),
        })),
      },

      dailySeries: bookingsSeriesRes.recordset.map((r) => ({
        day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
        bookings: Number(r.cnt),
        grossEur: Math.round(Number(r.gross_eur) * 100) / 100,
      })),
    });
  } catch (err) {
    return internalError(err, '[GET /api/exec/business-kpis]');
  }
}
