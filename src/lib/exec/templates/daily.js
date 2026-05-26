// HTML template para el daily digest del owner.
// Email-safe: inline styles, table-based layout, sin webfonts ni JS.
// Probado mentalmente en Gmail web + Outlook + iOS Mail.

function fmtEur(n) {
  return `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function fmtNum(n) {
  return (Number(n) || 0).toLocaleString('es-ES');
}

function statusBadge(status) {
  if (status === 'critical') return '<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">CRÍTICO</span>';
  if (status === 'warn') return '<span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">ATENCIÓN</span>';
  if (status === 'ok') return '<span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">OK</span>';
  return '<span style="background:#9ca3af;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">—</span>';
}

function card({ label, value, delta, sub }) {
  return `
    <td style="padding:0 8px 16px 0;vertical-align:top;width:50%;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${label}</div>
        <div style="font-size:22px;color:#1a3c5e;font-weight:700;margin:6px 0 2px;">${value}</div>
        ${delta ? `<div style="font-size:12px;color:${delta.color || '#6b7280'};">${delta.text}</div>` : ''}
        ${sub ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;">${sub}</div>` : ''}
      </div>
    </td>
  `;
}

/**
 * @param {object} input
 * @param {object} input.kpis      — Output de /api/exec/business-kpis (range=yesterday)
 * @param {object} input.kpis7d    — Output de /api/exec/business-kpis (range=7d) para media
 * @param {object} input.quotas    — Output de /api/exec/quotas
 * @param {string} input.dashboardUrl — URL absoluto a /admin/exec
 */
export function dailyHtml({ kpis, kpis7d, quotas, dashboardUrl, dateLabel }) {
  const sales = kpis.sales || {};
  const today = kpis.today || {};
  const funnel = kpis.funnel || { conversion: {} };
  const ops = kpis.ops || { redirections: {}, breakdown: {} };
  const outreach = kpis.outreach || {};

  // Media diaria de los últimos 7d para comparativa "ayer vs media".
  const avg7d = (kpis7d?.sales?.total || 0) / 7;
  const grossAvg7d = (kpis7d?.sales?.grossEur || 0) / 7;
  const yesterdayBookings = sales.total || 0;
  const yesterdayGross = sales.grossEur || 0;
  const deltaBookings = avg7d > 0
    ? Math.round(((yesterdayBookings - avg7d) / avg7d) * 100)
    : null;
  const deltaGross = grossAvg7d > 0
    ? Math.round(((yesterdayGross - grossAvg7d) / grossAvg7d) * 100)
    : null;

  const opsOpen = ops.openInWindow || 0;
  const redir = ops.redirections || {};

  const worstQuota = quotas?.worst;
  const quotaProviders = quotas?.providers || [];
  const quotaCritical = quotaProviders.filter((p) => p.status === 'critical');
  const quotaWarn = quotaProviders.filter((p) => p.status === 'warn');

  const headlineSubject = `MedConnect daily · ${dateLabel} · ${yesterdayBookings} bookings · ${fmtEur(yesterdayGross)}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${headlineSubject}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:#f3f4f6;">

      <!-- Header -->
      <tr><td style="padding:0 0 16px;">
        <div style="font-size:13px;color:#6b7280;">MedConnect · resumen del día</div>
        <div style="font-size:20px;color:#1a3c5e;font-weight:700;margin-top:4px;">Ayer (${dateLabel})</div>
      </td></tr>

      <!-- KPI grid -->
      <tr><td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${card({
              label: 'Bookings ayer',
              value: fmtNum(yesterdayBookings),
              delta: deltaBookings != null
                ? { text: `${deltaBookings >= 0 ? '▲' : '▼'} ${Math.abs(deltaBookings)}% vs media 7d`,
                    color: deltaBookings >= 0 ? '#10b981' : '#ef4444' }
                : { text: 'sin histórico aún', color: '#9ca3af' },
              sub: `Hoy en curso: ${today.total || 0}`,
            })}
            ${card({
              label: 'Ingresos ayer',
              value: fmtEur(yesterdayGross),
              delta: deltaGross != null
                ? { text: `${deltaGross >= 0 ? '▲' : '▼'} ${Math.abs(deltaGross)}% vs media 7d`,
                    color: deltaGross >= 0 ? '#10b981' : '#ef4444' }
                : null,
              sub: `Priority fee: ${fmtEur(sales.platformFeeEur)}`,
            })}
          </tr>
          <tr>
            ${card({
              label: 'Conversión web',
              value: `${funnel.conversion.overall || 0}%`,
              sub: `search → book completed`,
            })}
            ${card({
              label: 'Operations',
              value: `${opsOpen} casos abiertos`,
              sub: `${redir.alternativesProposed || 0} alternativas · ${redir.acceptanceRate || 0}% aceptación`,
            })}
          </tr>
          <tr>
            ${card({
              label: 'Refunds ayer',
              value: fmtNum(sales.refunded),
              delta: sales.refunded > 0
                ? { text: 'requiere review', color: '#ef4444' }
                : { text: 'sin reembolsos', color: '#10b981' },
            })}
            ${card({
              label: 'Outreach clínicas',
              value: `${outreach.accepted || 0}/${outreach.contacted || 0}`,
              sub: `aceptadas / contactadas · ${outreach.followUp || 0} en seguimiento`,
            })}
          </tr>
          <tr>
            ${card({
              label: 'Cuota más cargada',
              value: worstQuota
                ? `${worstQuota.provider} ${worstQuota.percentage}%`
                : '—',
              delta: worstQuota
                ? { text: worstQuota.status === 'critical' ? 'CRÍTICO — actuar' :
                           worstQuota.status === 'warn' ? 'cerca del límite' : 'ok',
                    color: worstQuota.status === 'critical' ? '#ef4444' :
                           worstQuota.status === 'warn' ? '#f59e0b' : '#10b981' }
                : null,
              sub: `${quotaCritical.length} críticas · ${quotaWarn.length} en alerta`,
            })}
            ${card({
              label: 'Clínicas activas',
              value: fmtNum(kpis.clinicsOnboard),
              sub: `objetivo: 2.960`,
            })}
          </tr>
        </table>
      </td></tr>

      <!-- Alerts panel (only if anything critical) -->
      ${quotaCritical.length > 0 ? `
      <tr><td style="padding:16px 0;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;">
          <div style="font-weight:700;color:#7f1d1d;font-size:14px;margin-bottom:8px;">⚠ Cuotas en estado crítico</div>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#7f1d1d;">
            ${quotaCritical.map((p) => `<li><strong>${p.provider}</strong> — ${p.note || `${p.percentage}%`}</li>`).join('')}
          </ul>
          <div style="font-size:12px;color:#7f1d1d;margin-top:8px;">Acción: revisar <a href="${dashboardUrl}" style="color:#7f1d1d;">dashboard</a> + escalar plan si procede.</div>
        </div>
      </td></tr>
      ` : ''}

      <!-- Top breakdowns -->
      ${kpis.topBreakdowns?.bySpecialty?.length > 0 ? `
      <tr><td style="padding:16px 0;">
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
          <div style="font-weight:700;color:#1a3c5e;font-size:14px;margin-bottom:8px;">Top especialidades ayer</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;">
            ${kpis.topBreakdowns.bySpecialty.slice(0, 5).map((s) => `
              <tr>
                <td style="padding:4px 0;color:#4b5563;">${s.specialty}</td>
                <td style="padding:4px 0;color:#4b5563;text-align:right;width:60px;">${fmtNum(s.bookings)}</td>
                <td style="padding:4px 0;color:#1a3c5e;font-weight:600;text-align:right;width:90px;">${fmtEur(s.grossEur)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </td></tr>
      ` : ''}

      <!-- CTA -->
      <tr><td style="padding:24px 0;text-align:center;">
        <a href="${dashboardUrl}"
           style="display:inline-block;background:#1a3c5e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
          Abrir dashboard live →
        </a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:12px 0 0;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
        Generado ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} ·
        MedConnect daily executive digest ·
        Ver <a href="${dashboardUrl}" style="color:#9ca3af;">dashboard</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject: headlineSubject, html };
}
