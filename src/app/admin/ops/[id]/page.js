'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken } from '@/lib/adminClient';
import '../ops.css';

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtCitaDate(date, time) {
  if (!date) return '—';
  const d = new Date(date + 'T00:00:00');
  return `${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · ${time || ''}`;
}

const TERMINAL = ['confirmed', 'refunded', 'cancelled', 'expired'];

export default function OpsCaseDetail({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [callNote, setCallNote] = useState('');

  // Forms for actions
  const [altDate, setAltDate] = useState('');
  const [altTime, setAltTime] = useState('');
  const [altReason, setAltReason] = useState('');
  const [altClinicName, setAltClinicName] = useState('');
  const [altClinicId, setAltClinicId] = useState('');

  useEffect(() => {
    if (!getAdminToken()) router.replace('/admin/login');
  }, [router]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/ops/cases/${id}`);
      const j = await res.json();
      setC(j.case);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const doAction = async (action, payload = {}) => {
    setBusy(true);
    try {
      const res = await adminFetch(`/api/ops/cases/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, ...payload }),
      });
      const j = await res.json();
      if (!res.ok) alert(j.error || 'Error');
      else setC(j.case);
    } catch (err) { alert(err.message); }
    setBusy(false);
  };

  const saveCallLog = async () => {
    if (!callNote.trim()) return;
    setBusy(true);
    try {
      const res = await adminFetch(`/api/ops/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ callLogEntry: callNote.trim() }),
      });
      const j = await res.json();
      setC(j.case);
      setCallNote('');
    } catch (err) { alert(err.message); }
    setBusy(false);
  };

  if (loading || !c) return <div className="ops-detail"><p>Cargando…</p></div>;

  const isTerminal = TERMINAL.includes(c.status);

  return (
    <div className="ops-detail">
      <Link href="/admin/ops" className="ops-back-link">← Volver al listado</Link>
      <h1 style={{ margin: '4px 0 16px', fontSize: 24, color: '#1a3c5e', fontWeight: 800 }}>
        Caso #{c.id} — <span className={`ops-status ops-status-${c.status}`}>{c.status}</span>
      </h1>

      <div className="ops-detail-grid">
        {/* LEFT — main info */}
        <div>
          <div className="ops-card">
            <h2>Paciente</h2>
            <dl className="ops-kv">
              <dt>Nombre</dt><dd>{c.patient_name || '—'}</dd>
              <dt>Email</dt><dd>{c.patient_email || '—'}</dd>
              <dt>Teléfono</dt><dd>{c.patient_phone || '—'}</dd>
              <dt>Aseguradora</dt><dd>{c.insurance_company || (c.has_insurance ? 'Sí' : 'Sin seguro')}</dd>
              <dt>Especialidad</dt><dd>{c.specialty || '—'}</dd>
            </dl>
          </div>

          <div className="ops-card">
            <h2>Cita original</h2>
            <dl className="ops-kv">
              <dt>Clínica</dt><dd>{c.original_clinic_name || '—'}</dd>
              <dt>ID clínica</dt><dd>{c.original_clinic_id || '—'}</dd>
              <dt>Fecha</dt><dd>{fmtCitaDate(c.original_slot_date, c.original_slot_time)}</dd>
              <dt>Cobrado</dt><dd>€{Number(c.amount_paid || 0).toFixed(2)} (T{c.tier || '—'})</dd>
              <dt>A pagar a clínica</dt><dd>€{Number(c.payment_to_clinic || 0).toFixed(2)}</dd>
              <dt>Booking ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.booking_id}</dd>
              <dt>Payment Intent</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.payment_intent_id || '—'}</dd>
            </dl>
          </div>

          {(c.alternative_clinic_name || c.alternative_slot_date) && (
            <div className="ops-card">
              <h2>Alternativa propuesta</h2>
              <dl className="ops-kv">
                <dt>Clínica</dt><dd>{c.alternative_clinic_name || c.original_clinic_name}</dd>
                <dt>Fecha</dt><dd>{fmtCitaDate(c.alternative_slot_date, c.alternative_slot_time)}</dd>
                <dt>Motivo</dt><dd>{c.alternative_reason || '—'}</dd>
                <dt>Decisión paciente</dt><dd>{c.patient_decision || 'Esperando'}</dd>
              </dl>
            </div>
          )}

          {c.refund_id && (
            <div className="ops-card">
              <h2>Reembolso</h2>
              <dl className="ops-kv">
                <dt>Refund ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.refund_id}</dd>
                <dt>Importe</dt><dd>€{Number(c.refund_amount || 0).toFixed(2)}</dd>
                <dt>Motivo</dt><dd>{c.refund_reason || '—'}</dd>
              </dl>
            </div>
          )}

          <div className="ops-card">
            <h2>Registro de gestiones</h2>
            <pre className="ops-call-log">{c.call_log || 'Sin registros aún.'}</pre>
            {!isTerminal && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  rows={2}
                  placeholder="Añadir nota de la llamada (lo que dijo la clínica, intento de contacto, etc.)"
                  value={callNote}
                  onChange={(e) => setCallNote(e.target.value)}
                  style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
                />
                <button className="ops-action-btn ops-action-neutral" onClick={saveCallLog} disabled={busy || !callNote.trim()} style={{ marginTop: 6 }}>
                  Añadir nota
                </button>
              </div>
            )}
          </div>

          <div className="ops-card">
            <h2>Metadatos</h2>
            <dl className="ops-kv">
              <dt>Asignado a</dt><dd>{c.assigned_to || '—'}</dd>
              <dt>Creado</dt><dd>{fmtDateTime(c.created_at)}</dd>
              <dt>Actualizado</dt><dd>{fmtDateTime(c.updated_at)}</dd>
              <dt>Resuelto</dt><dd>{fmtDateTime(c.resolved_at)}</dd>
            </dl>
          </div>
        </div>

        {/* RIGHT — actions */}
        <div>
          <div className="ops-card" style={{ position: 'sticky', top: 16 }}>
            <h2>Acciones</h2>
            {isTerminal ? (
              <p style={{ color: '#6b7280', fontSize: 13 }}>Este caso ya está cerrado. No hay acciones disponibles.</p>
            ) : (
              <div className="ops-actions">
                <button
                  className="ops-action-btn ops-action-success"
                  onClick={() => doAction('clinic_accepted')}
                  disabled={busy}
                >
                  ✓ La clínica aceptó el slot original<br />
                  <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Confirma cita y notifica al paciente</span>
                </button>

                <details className="ops-form">
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#c2410c' }}>
                    🕐 La clínica propone otro día/hora
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <div className="ops-form-row">
                      <input type="date" value={altDate} onChange={(e) => setAltDate(e.target.value)} />
                      <input type="time" value={altTime} onChange={(e) => setAltTime(e.target.value)} />
                    </div>
                    <input type="text" placeholder="Motivo (opcional)" value={altReason} onChange={(e) => setAltReason(e.target.value)} />
                    <button
                      className="ops-action-btn ops-action-warn"
                      style={{ marginTop: 8, width: '100%' }}
                      disabled={busy || !altDate || !altTime}
                      onClick={() => doAction('clinic_proposed_alternative', { altDate, altTime, reason: altReason })}
                    >
                      Mandar email al paciente con la alternativa
                    </button>
                  </div>
                </details>

                <button
                  className="ops-action-btn ops-action-danger"
                  onClick={() => doAction('clinic_rejected')}
                  disabled={busy || c.status === 'clinic_rejected_searching'}
                >
                  ✕ La clínica rechazó<br />
                  <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Marcar para buscar otra clínica</span>
                </button>

                <details className="ops-form">
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#c2410c' }}>
                    🔁 Encontré una clínica alternativa
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <input type="text" placeholder="Nombre de la nueva clínica" value={altClinicName} onChange={(e) => setAltClinicName(e.target.value)} />
                    <input type="number" placeholder="ID clínica (opcional)" value={altClinicId} onChange={(e) => setAltClinicId(e.target.value)} style={{ marginTop: 6 }} />
                    <div className="ops-form-row" style={{ marginTop: 6 }}>
                      <input type="date" value={altDate} onChange={(e) => setAltDate(e.target.value)} />
                      <input type="time" value={altTime} onChange={(e) => setAltTime(e.target.value)} />
                    </div>
                    <input type="text" placeholder="Motivo del cambio (opcional)" value={altReason} onChange={(e) => setAltReason(e.target.value)} />
                    <button
                      className="ops-action-btn ops-action-warn"
                      style={{ marginTop: 8, width: '100%' }}
                      disabled={busy || !altClinicName || !altDate || !altTime}
                      onClick={() => doAction('alternative_clinic_proposed', {
                        altClinicId: altClinicId ? Number(altClinicId) : null,
                        altClinicName, altDate, altTime, reason: altReason,
                      })}
                    >
                      Mandar email al paciente con la nueva clínica
                    </button>
                  </div>
                </details>

                <button
                  className="ops-action-btn ops-action-danger"
                  onClick={() => {
                    if (confirm('¿Confirmas que NO hay alternativa y se reembolsa el caso completo?')) {
                      doAction('no_alternative_refund', { reason: 'Sin alternativa disponible' });
                    }
                  }}
                  disabled={busy}
                >
                  💸 Sin alternativa — emitir reembolso<br />
                  <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Devuelve €{Number(c.amount_paid || 0).toFixed(2)} y notifica</span>
                </button>

                <details className="ops-form">
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#7f1d1d' }}>
                    Reembolso manual
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <input type="text" placeholder="Motivo del reembolso" value={altReason} onChange={(e) => setAltReason(e.target.value)} />
                    <button
                      className="ops-action-btn ops-action-danger"
                      style={{ marginTop: 8, width: '100%' }}
                      disabled={busy}
                      onClick={() => {
                        if (confirm('¿Emitir reembolso ahora?')) doAction('refund', { reason: altReason });
                      }}
                    >
                      Emitir reembolso
                    </button>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
