'use client';

// Executive dashboard — single page that aggregates business KPIs, funnel,
// operations, outreach status and provider quotas. Source of truth for the
// daily and weekly emails. Designed to be glanceable, not interactive — for
// drill-down you go to /admin/ops, /admin/outreach, etc.
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken, getAdminUser } from '@/lib/adminClient';
import '../ops/ops.css';

const REFRESH_MS = 5 * 60 * 1000; // 5 min

function fmtEur(n) {
  return `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
function fmtNum(n) {
  return (Number(n) || 0).toLocaleString('es-ES');
}

function StatusDot({ status }) {
  const color = status === 'critical' ? '#ef4444' :
                status === 'warn' ? '#f59e0b' :
                status === 'ok' ? '#10b981' : '#9ca3af';
  return <span style={{
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: color, marginRight: 6, verticalAlign: 'middle',
  }} />;
}

export default function ExecDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [range, setRange] = useState('7d');
  const [kpis, setKpis] = useState(null);
  const [quotas, setQuotas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState(null);

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace('/admin/login');
      return;
    }
    setUser(getAdminUser());
  }, [router]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [kpisRes, quotasRes] = await Promise.all([
        adminFetch(`/api/exec/business-kpis?range=${range}`).then((r) => r.json()),
        adminFetch(`/api/exec/quotas`).then((r) => r.json()),
      ]);
      if (kpisRes?.error) throw new Error(`KPIs: ${kpisRes.error}`);
      if (quotasRes?.error) throw new Error(`Quotas: ${quotasRes.error}`);
      setKpis(kpisRes);
      setQuotas(quotasRes);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (!user) return;
    load();
    const handle = setInterval(load, REFRESH_MS);
    return () => clearInterval(handle);
  }, [user, load]);

  async function triggerDailyEmail() {
    setSendingEmail(true);
    setEmailFeedback(null);
    try {
      const res = await adminFetch('/api/exec/daily-email');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error');
      setEmailFeedback(`✓ Email enviado a ${data.sentTo}${data.mock ? ' (modo mock — sin RESEND_API_KEY)' : ''}`);
    } catch (err) {
      setEmailFeedback(`✕ ${err.message}`);
    } finally {
      setSendingEmail(false);
      setTimeout(() => setEmailFeedback(null), 8000);
    }
  }

  if (!user) return null;

  return (
    <div className="ops-page">
      <header className="ops-header">
        <div>
          <h1>Executive dashboard</h1>
          <p className="ops-subtitle">
            Vista ejecutiva en tiempo real · refresh cada 5 min
            {lastUpdated && (
              <span style={{ marginLeft: 12, color: '#9ca3af', fontSize: 12 }}>
                Última actualización: {lastUpdated.toLocaleTimeString('es-ES')}
              </span>
            )}
          </p>
        </div>
        <div className="ops-header-right">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          >
            <option value="today">Hoy</option>
            <option value="yesterday">Ayer</option>
            <option value="7d">Últimos 7 días</option>
            <option value="28d">Últimos 28 días</option>
            <option value="all">Todo el histórico</option>
          </select>
          <button
            className="ops-link-btn"
            onClick={triggerDailyEmail}
            disabled={sendingEmail}
            title="Envía el daily email ahora a la dirección configurada en EXEC_REPORT_TO_EMAIL"
          >
            {sendingEmail ? '…' : '✉ Enviar daily ahora'}
          </button>
          <button className="ops-link-btn" onClick={load}>↻ Refresh</button>
          <Link href="/admin" className="ops-link-btn">← Admin</Link>
        </div>
      </header>

      {error && (
        <div style={{ background: '#fee2e2', color: '#7f1d1d', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}
      {emailFeedback && (
        <div style={{
          background: emailFeedback.startsWith('✓') ? '#d1fae5' : '#fee2e2',
          color: emailFeedback.startsWith('✓') ? '#065f46' : '#7f1d1d',
          padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13,
        }}>
          {emailFeedback}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: '#9ca3af' }}>Cargando KPIs…</div>
      ) : kpis ? (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionTitle}>Ventas · {kpis.label}</h2>
            <div style={kpiGrid}>
              <Kpi label="Bookings totales" value={fmtNum(kpis.sales.total)} />
              <Kpi label="Confirmadas" value={fmtNum(kpis.sales.confirmed)} color="#10b981" />
              <Kpi label="En operaciones" value={fmtNum(kpis.sales.inOps)} color="#f59e0b" />
              <Kpi label="Reembolsadas" value={fmtNum(kpis.sales.refunded)} color="#ef4444" />
              <Kpi label="Ingresos brutos" value={fmtEur(kpis.sales.grossEur)} />
              <Kpi label="Priority fee" value={fmtEur(kpis.sales.platformFeeEur)} sub="margen Med Connect" />
              <Kpi label="Ticket medio" value={fmtEur(kpis.sales.avgAmountEur)} />
              <Kpi label="Hoy" value={`${fmtNum(kpis.today.total)} · ${fmtEur(kpis.today.grossEur)}`} sub="día en curso" />
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionTitle}>Funnel web · {kpis.label}</h2>
            <FunnelTable funnel={kpis.funnel} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionTitle}>Operaciones (estado actual)</h2>
            <OpsBreakdown ops={kpis.ops} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionTitle}>Redirecciones (creadas en la ventana)</h2>
            <RedirectionStats redir={kpis.ops.redirections} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionTitle}>Outreach a clínicas</h2>
            <OutreachStats outreach={kpis.outreach} clinicsOnboard={kpis.clinicsOnboard} />
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <Link href="/admin/outreach" style={{ color: '#1e40af' }}>Abrir pipeline de outreach →</Link>
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionTitle}>Top breakdowns · {kpis.label}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <TopList title="Top especialidades (bookings)" items={kpis.topBreakdowns.bySpecialty || []}
                       renderRow={(s) => `${s.specialty} · ${fmtNum(s.bookings)} · ${fmtEur(s.grossEur)}`} />
              <TopList title="Top ciudades buscadas" items={kpis.topBreakdowns.bySearchedCity || []}
                       renderRow={(s) => `${s.city} · ${fmtNum(s.searches)} búsquedas`} />
            </div>
          </section>
        </>
      ) : null}

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Salud técnica · cuotas de proveedores</h2>
        {quotas ? (
          <QuotaList quotas={quotas} />
        ) : (
          <div style={{ color: '#9ca3af' }}>Cargando cuotas…</div>
        )}
      </section>

      <footer style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #e5e7eb', fontSize: 12, color: '#9ca3af' }}>
        Inventario completo de proveedores: <code>docs/PROVIDERS_INVENTORY.md</code> ·
        Runbook de incidentes: <code>docs/INCIDENT_RUNBOOK.md</code>
      </footer>
    </div>
  );
}

const sectionTitle = {
  fontSize: 13, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
};

const kpiGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 12,
};

function Kpi({ label, value, sub, color = '#1a3c5e' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, color, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FunnelTable({ funnel }) {
  const stages = [
    { key: 'search_performed', label: 'Búsquedas' },
    { key: 'clinic_viewed', label: 'Clínica vista' },
    { key: 'slot_selected', label: 'Slot seleccionado' },
    { key: 'book_started', label: 'Booking iniciado' },
    { key: 'book_completed', label: 'Booking completado' },
  ];
  const conv = funnel.conversion || {};
  const convMap = {
    clinic_viewed: conv.search_to_clinic_view,
    slot_selected: conv.clinic_to_slot_selected,
    book_started: conv.slot_to_book_started,
    book_completed: conv.book_to_completed,
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ background: '#f9fafb' }}>
          <tr>
            <th style={th}>Etapa</th>
            <th style={{ ...th, textAlign: 'right' }}>Cantidad</th>
            <th style={{ ...th, textAlign: 'right' }}>Conv. desde la anterior</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s) => {
            const count = funnel.events?.[s.key] || 0;
            const convPct = convMap[s.key];
            return (
              <tr key={s.key} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={td}>{s.label}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtNum(count)}</td>
                <td style={{ ...td, textAlign: 'right', color: '#6b7280' }}>
                  {convPct != null ? `${convPct}%` : '—'}
                </td>
              </tr>
            );
          })}
          <tr style={{ borderTop: '2px solid #e5e7eb', background: '#fafbfc' }}>
            <td style={td}><strong>Conversión total</strong></td>
            <td style={td}></td>
            <td style={{ ...td, textAlign: 'right', color: '#1a3c5e', fontWeight: 700 }}>{conv.overall || 0}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function OpsBreakdown({ ops }) {
  const breakdown = ops.breakdown || {};
  const labels = {
    pending_call: 'Pendiente de llamar',
    clinic_accepted: 'Clínica aceptó',
    clinic_proposed_alternative: 'Clínica propuso alternativa',
    clinic_rejected_searching: 'Clínica rechazó, buscando',
    alternative_clinic_proposed: 'Alternativa propuesta a paciente',
    patient_accepted: 'Paciente aceptó alternativa',
    patient_rejected_refunding: 'Paciente rechazó, reembolsando',
    no_alternative_refunding: 'Sin alternativa, reembolsando',
    confirmed: 'Confirmado',
    refunded: 'Reembolsado',
    expired: 'Expirado',
    cancelled: 'Cancelado',
  };
  const rows = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 13 }}>Sin casos registrados aún.</div>;
  }
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <table style={{ width: '100%', fontSize: 13 }}>
        <tbody>
          {rows.map(([status, count]) => (
            <tr key={status}>
              <td style={{ padding: 4, color: '#4b5563' }}>{labels[status] || status}</td>
              <td style={{ padding: 4, textAlign: 'right', fontWeight: 600, color: '#1a3c5e' }}>{fmtNum(count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        <Link href="/admin/ops" style={{ color: '#1e40af' }}>Abrir casos operativos →</Link>
      </div>
    </div>
  );
}

function RedirectionStats({ redir }) {
  return (
    <div style={kpiGrid}>
      <Kpi label="Alternativas propuestas" value={fmtNum(redir.alternativesProposed)} />
      <Kpi label="Aceptadas" value={fmtNum(redir.patientAccepted)} color="#10b981"
           sub={`${redir.acceptanceRate}% de las propuestas`} />
      <Kpi label="Rechazadas" value={fmtNum(redir.patientRejected)} color="#ef4444" />
      <Kpi label="Sin respuesta (expired)" value={fmtNum(redir.expiredNoResponse)} color="#9333ea" />
    </div>
  );
}

function OutreachStats({ outreach, clinicsOnboard }) {
  const target = 2960;
  const onboardPct = Math.round((clinicsOnboard / target) * 100);
  return (
    <div style={kpiGrid}>
      <Kpi label="Clínicas en catálogo" value={fmtNum(clinicsOnboard)} sub={`${onboardPct}% del objetivo (2.960)`} />
      <Kpi label="Pipeline total" value={fmtNum(outreach.total)} />
      <Kpi label="Contactadas" value={fmtNum(outreach.contacted)} color="#0ea5e9" />
      <Kpi label="Aceptadas vía outreach" value={fmtNum(outreach.accepted)} color="#10b981" />
      <Kpi label="En seguimiento" value={fmtNum(outreach.followUp)} color="#f59e0b" />
      <Kpi label="Sin respuesta" value={fmtNum(outreach.noAnswer)} color="#9333ea" />
      <Kpi label="Rechazadas" value={fmtNum(outreach.rejected)} color="#ef4444" />
      <Kpi label="Sin contactar" value={fmtNum(outreach.notContacted)} color="#9ca3af" />
    </div>
  );
}

function TopList({ title, items, renderRow }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 8 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Sin datos.</div>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#4b5563', lineHeight: 1.8 }}>
          {items.slice(0, 10).map((it, i) => <li key={i}>{renderRow(it)}</li>)}
        </ol>
      )}
    </div>
  );
}

function QuotaList({ quotas }) {
  const providers = quotas.providers || [];
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ background: '#f9fafb' }}>
          <tr>
            <th style={th}>Proveedor</th>
            <th style={{ ...th, textAlign: 'right' }}>%</th>
            <th style={th}>Estado</th>
            <th style={th}>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.provider} style={{ borderTop: '1px solid #f3f4f6' }}>
              <td style={{ ...td, fontWeight: 600 }}>{p.provider}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                {p.percentage != null ? `${p.percentage}%` : '—'}
              </td>
              <td style={td}>
                <StatusDot status={p.ok ? (p.status || 'ok') : 'critical'} />
                {p.ok ? (p.status || 'ok') : 'error'}
              </td>
              <td style={{ ...td, color: '#6b7280', fontSize: 12 }}>
                {p.ok ? (p.note || '—') : `⚠ ${p.error}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {quotas.cached && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: '#9ca3af', borderTop: '1px solid #e5e7eb' }}>
          Cache hit · refresca cada 1h en el servidor · ↻ Refresh fuerza nuevo cómputo.
        </div>
      )}
    </div>
  );
}

const th = { textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151' };
const td = { padding: '10px 12px' };
