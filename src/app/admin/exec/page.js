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
  const [waLeads, setWaLeads] = useState(null);
  const [waFilter, setWaFilter] = useState('all');

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace('/admin/login');
      return;
    }
    setUser(getAdminUser());
  }, [router]);

  const loadWaLeads = useCallback(async (status) => {
    try {
      const res = await adminFetch(`/api/exec/whatsapp-leads?status=${status}&limit=50`);
      const data = await res.json();
      if (!data.error) setWaLeads(data);
    } catch {
      // non-fatal
    }
  }, []);

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
    loadWaLeads(waFilter);
    const handle = setInterval(load, REFRESH_MS);
    return () => clearInterval(handle);
  }, [user, load, loadWaLeads, waFilter]);

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
        <h2 style={sectionTitle}>WhatsApp IA · leads y escalados</h2>
        <WhatsAppLeads
          data={waLeads}
          filter={waFilter}
          onFilterChange={(f) => { setWaFilter(f); loadWaLeads(f); }}
          onStatusChange={async (id, status, table) => {
            await adminFetch('/api/exec/whatsapp-leads', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, status, table }),
            });
            loadWaLeads(waFilter);
          }}
        />
      </section>

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

const URGENCY_COLOR = { normal: '#10b981', urgent: '#f59e0b', emergency: '#ef4444' };
const STATUS_LABEL = {
  link_sent: 'Link enviado', paid: 'Pagado', expired: 'Expirado', discarded: 'Descartado',
  pending: 'Pendiente', called: 'Llamado', resolved: 'Resuelto',
};

function TranscriptModal({ phoneNumber, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, transcript: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch(`/api/exec/whatsapp-leads?phone=${encodeURIComponent(phoneNumber)}&transcript=1`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) setState({ loading: false, error: data.error, transcript: [] });
        else setState({ loading: false, error: null, transcript: data.transcript || [] });
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message, transcript: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [phoneNumber]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 10, padding: 20, width: '100%', maxWidth: 560,
          maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: '#1a3c5e' }}>Conversación con {phoneNumber}</h3>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}
          >
            ✕
          </button>
        </div>
        {state.loading && <p style={{ fontSize: 13, color: '#9ca3af' }}>Cargando…</p>}
        {state.error && <p style={{ fontSize: 13, color: '#ef4444' }}>Error: {state.error}</p>}
        {!state.loading && !state.error && state.transcript.length === 0 && (
          <p style={{ fontSize: 13, color: '#9ca3af' }}>Sin mensajes registrados.</p>
        )}
        {!state.loading && !state.error && state.transcript.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state.transcript.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end',
                maxWidth: '80%',
                background: m.role === 'user' ? '#f3f4f6' : '#eff6ff',
                borderRadius: 8, padding: '6px 10px',
              }}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>
                  {m.role === 'user' ? 'Paciente' : 'Asistente'} · {new Date(m.created_at).toLocaleString('es-ES')}
                </div>
                <div style={{ fontSize: 13, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WhatsAppLeads({ data, filter, onFilterChange, onStatusChange }) {
  const [transcriptPhone, setTranscriptPhone] = useState(null);

  if (!data) return <div style={{ color: '#9ca3af' }}>Cargando leads WhatsApp…</div>;

  const { leads = [], summary = {}, pendingEscalations = [] } = data;

  return (
    <>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Kpi label="Leads totales" value={fmtNum(summary.total)} />
        <Kpi label="Última semana" value={fmtNum(summary.last_7d)} color="#1e40af" />
        <Kpi label="Pagados" value={fmtNum(summary.paid)} color="#10b981" />
        <Kpi label="Urgencias" value={fmtNum(summary.emergencies)} color="#ef4444" />
      </div>

      {/* Filter + table */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Estado:</span>
        {['all', 'link_sent', 'paid', 'expired', 'discarded'].map((s) => (
          <button
            key={s}
            onClick={() => onFilterChange(s)}
            style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
              background: filter === s ? '#1e40af' : '#f3f4f6',
              color: filter === s ? '#fff' : '#374151',
              border: 'none',
            }}
          >
            {STATUS_LABEL[s] || 'Todos'}
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>No hay leads con este filtro.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Fecha', 'Teléfono', 'Nombre', 'Especialidad', 'Seguro', 'Urgencia', 'Estado', 'Acciones'].map((h) => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: '7px 10px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                  {new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <a href={`https://wa.me/${lead.phone_number}`} target="_blank" rel="noreferrer" style={{ color: '#1e40af' }}>
                    {lead.phone_number}
                  </a>
                </td>
                <td style={{ padding: '7px 10px' }}>{lead.patient_name || '—'}</td>
                <td style={{ padding: '7px 10px' }}>{lead.specialty_requested || '—'}</td>
                <td style={{ padding: '7px 10px' }}>{lead.insurance_company || '—'}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ color: URGENCY_COLOR[lead.urgency_level] || '#9ca3af', fontWeight: 600, fontSize: 11 }}>
                    {lead.urgency_level?.toUpperCase() || 'NORMAL'}
                  </span>
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <select
                    value={lead.status}
                    onChange={(e) => onStatusChange(lead.id, e.target.value, 'lead')}
                    style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}
                  >
                    <option value="link_sent">Link enviado</option>
                    <option value="paid">Pagado</option>
                    <option value="expired">Expirado</option>
                    <option value="discarded">Descartado</option>
                  </select>
                </td>
                <td style={{ padding: '7px 10px' }}>
                  {lead.checkout_link && (
                    <a href={lead.checkout_link} target="_blank" rel="noreferrer"
                       style={{ fontSize: 11, color: '#1e40af', marginRight: 8 }}>
                      Búsqueda →
                    </a>
                  )}
                  <button
                    onClick={() => setTranscriptPhone(lead.phone_number)}
                    style={{
                      fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #d1d5db',
                      borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                    }}
                  >
                    Ver conversación
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pending escalations */}
      {pendingEscalations.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>
            🔶 Escalados pendientes de llamada ({pendingEscalations.length})
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fffbeb' }}>
                {['Fecha', 'Teléfono WA', 'Nombre', 'Horario preferido', 'Tel. contacto', 'Estado'].map((h) => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingEscalations.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid #fef3c7' }}>
                  <td style={{ padding: '7px 10px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    {new Date(e.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <a href={`https://wa.me/${e.phone_number}`} target="_blank" rel="noreferrer" style={{ color: '#1e40af' }}>
                      {e.phone_number}
                    </a>
                  </td>
                  <td style={{ padding: '7px 10px' }}>{e.patient_name || '—'}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{e.preferred_contact_time || '—'}</td>
                  <td style={{ padding: '7px 10px' }}>{e.contact_phone || e.phone_number}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <select
                      value={e.status}
                      onChange={(ev) => onStatusChange(e.id, ev.target.value, 'escalation')}
                      style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}
                    >
                      <option value="pending">Pendiente</option>
                      <option value="called">Llamado</option>
                      <option value="resolved">Resuelto</option>
                    </select>
                    <button
                      onClick={() => setTranscriptPhone(e.phone_number)}
                      style={{
                        fontSize: 11, color: '#92400e', background: 'none', border: '1px solid #fde68a',
                        borderRadius: 4, padding: '2px 6px', cursor: 'pointer', marginLeft: 6,
                      }}
                    >
                      Ver conversación
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transcriptPhone && (
        <TranscriptModal phoneNumber={transcriptPhone} onClose={() => setTranscriptPhone(null)} />
      )}
    </>
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
