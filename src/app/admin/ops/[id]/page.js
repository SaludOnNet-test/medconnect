'use client';

import { useEffect, useState, useMemo, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken } from '@/lib/adminClient';
import CopyableValue from '@/components/admin/CopyableValue';
import '../ops.css';

// Spain operates on Europe/Madrid (CET in winter, CEST in summer). All
// our DB timestamps are stored as ISO UTC; rendering them naively shows
// UTC clock time and Raquel reported the 2 h drift. Centralise the
// locale + timeZone here so every callsite agrees.
const MADRID_TZ = 'Europe/Madrid';

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: MADRID_TZ,
  });
}

function fmtCitaDate(date, time) {
  if (!date) return '—';
  const d = new Date(date + 'T00:00:00');
  return `${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · ${time || ''}`;
}

/**
 * Re-renders the raw `call_log` string by parsing each line. Lines look
 * like `[2026-05-14T14:30:00.000Z] author: entry`. We replace the ISO
 * timestamp with the localised Madrid representation so Raquel sees the
 * actual time she did the action (item 1 of the latest report).
 *
 * Lines that don't match the format pass through unchanged — older logs
 * persisted in different shapes stay readable.
 */
function formatCallLog(raw) {
  if (!raw) return 'Sin registros aún.';
  return raw.split('\n').map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!m) return line;
    const ts = m[1];
    const rest = m[2];
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) return line;
    const formatted = parsed.toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: MADRID_TZ,
    });
    return `[${formatted}] ${rest}`;
  }).join('\n');
}

const TERMINAL = ['confirmed', 'refunded', 'cancelled', 'expired'];
// Estados donde el refund manual sigue siendo emitible (el resto de
// acciones — aceptar, rechazar, proponer alternativa — desaparecen al
// llegar a un estado terminal, pero el reembolso sí debe permitirse en
// 'confirmed' por si la clínica cancela después o el paciente reclama).
const REFUND_BLOCKED = ['refunded', 'cancelled', 'expired'];

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

  // Voucher upload form (sin seguro). Three input paths, any one is
  // sufficient: external URL, manual SaludOnNet order ref code, or PDF
  // file upload (uploads to Vercel Blob and the resulting URL becomes the
  // voucher_pdf_path linked from the patient's email).
  const [voucherUrl, setVoucherUrl] = useState('');
  const [sonOrderRef, setSonOrderRef] = useState('');
  const [voucherPdfFile, setVoucherPdfFile] = useState(null);
  const [voucherBusy, setVoucherBusy] = useState(false);

  // Email override (any case, not just sin-seguro). Lets ops redirect
  // every future flow email for this booking to a different address —
  // typo recovery, redirect to a relative, etc. Every email-sending
  // surface (voucher, alternative proposals, refund confirms) reads
  // `bookings.patient_email`, so a single column update suffices.
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  // Clinic email override for the "✓ Aceptar" action. The acceptance
  // handler emails the clinic (best-effort) with the booking + an
  // onboarding CTA so they can register and collect their commission.
  // If admin_users already has a row for the clinic the backend uses
  // that address automatically; this input is for clinics that aren't
  // on Medconnect yet — without it the email goes nowhere.
  const [clinicEmailOverride, setClinicEmailOverride] = useState('');

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

  const submitVoucher = async () => {
    if (!voucherUrl.trim() && !sonOrderRef.trim() && !voucherPdfFile) return;
    if (!confirm('Subir la autorización y enviarla al paciente por email?')) return;
    setVoucherBusy(true);
    try {
      // Step 1 — if a PDF file was selected, upload it to Vercel Blob first
      // and grab the resulting URL. We do this BEFORE writing to the
      // vouchers table so a transient blob failure doesn't leave behind a
      // half-saved row.
      let pdfUrl = null;
      if (voucherPdfFile) {
        const formData = new FormData();
        formData.append('bookingId', c.booking_id);
        formData.append('file', voucherPdfFile);
        const uploadRes = await adminFetch('/api/admin/vouchers/pdf-upload', {
          method: 'POST',
          body: formData,
          // NOTE: don't set Content-Type — browser sets the multipart
          // boundary automatically. adminFetch already skips Content-Type
          // when the body is FormData.
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) {
          alert(uploadJson.error || 'Error subiendo el PDF al storage');
          setVoucherBusy(false);
          return;
        }
        pdfUrl = uploadJson.url;
      }

      // Step 2 — persist the voucher row + send the email.
      const res = await adminFetch('/api/admin/vouchers/upload', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: c.booking_id,
          voucherUrl: voucherUrl.trim() || null,
          sonOrderRef: sonOrderRef.trim() || null,
          voucherPdfPath: pdfUrl || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || 'Error subiendo la autorización');
      } else {
        await load();
        setVoucherUrl('');
        setSonOrderRef('');
        setVoucherPdfFile(null);
      }
    } catch (err) { alert(err.message); }
    setVoucherBusy(false);
  };

  const saveEmail = async () => {
    const next = emailDraft.trim();
    if (!next) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      alert('Formato de email inválido.');
      return;
    }
    if (next.toLowerCase() === (c.patient_email || '').toLowerCase()) {
      // No actual change — just close the editor.
      setEditingEmail(false);
      return;
    }
    if (!confirm(`Cambiar el email del paciente a ${next}? Todos los emails futuros del flujo (autorización, alternativas, reembolsos) se enviarán a esta nueva dirección.`)) return;
    setEmailBusy(true);
    try {
      const res = await adminFetch(`/api/admin/bookings/${encodeURIComponent(c.booking_id)}/email`, {
        method: 'POST',
        body: JSON.stringify({ patientEmail: next }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || 'Error cambiando email');
      } else {
        await load();
        setEditingEmail(false);
        setEmailDraft('');
      }
    } catch (err) { alert(err.message); }
    setEmailBusy(false);
  };

  const resendVoucher = async () => {
    if (!confirm('Reenviar el email de la autorización al paciente?')) return;
    setVoucherBusy(true);
    try {
      const res = await adminFetch('/api/admin/vouchers/upload', {
        method: 'POST',
        body: JSON.stringify({ bookingId: c.booking_id, resend: true }),
      });
      const j = await res.json();
      if (!res.ok) alert(j.error || 'Error reenviando');
      else await load();
    } catch (err) { alert(err.message); }
    setVoucherBusy(false);
  };

  if (loading || !c) return <div className="ops-detail"><p>Cargando…</p></div>;

  const isTerminal = TERMINAL.includes(c.status);

  return (
    <div className="ops-detail">
      <Link href="/admin/ops" className="ops-back-link">← Volver al listado</Link>
      <h1 style={{ margin: '4px 0 16px', fontSize: 24, color: '#1a3c5e', fontWeight: 800 }}>
        Caso #{c.id} — <span className={`ops-status ops-status-${c.status}`}>{c.status}</span>
        <PatientResponseBadge caso={c} />
      </h1>

      {c.referral_id && (
        <div
          style={{
            background: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            color: '#78350f',
          }}
        >
          <strong>🌐 Caso por derivación externa.</strong>{' '}
          {c.derivador_provider_name || c.derivador_email
            ? <>Derivado por <strong>{c.derivador_provider_name || c.derivador_email}</strong>.</>
            : 'Derivado por una clínica del marketplace.'}{' '}
          Tu trabajo es el mismo que en una compra directa: <strong>llama a la clínica receptora</strong>{' '}
          ({c.original_clinic_name || 'ver Cita original'}) para confirmar el hueco. Si no están dados de alta
          en Medconnect, el botón ✓ Aceptar les envía un email con los datos del paciente y un enlace de
          onboarding para que cobren la comisión.
        </div>
      )}

      <div className="ops-detail-grid">
        {/* LEFT — main info */}
        <div>
          <div className="ops-card">
            <h2>Paciente</h2>
            <dl className="ops-kv">
              <dt>Nombre</dt><dd><CopyableValue copy={c.patient_name || ''}>{c.patient_name || '—'}</CopyableValue></dd>
              <dt>Email</dt>
              <dd>
                {editingEmail ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      placeholder="nuevo.email@dominio.com"
                      style={{ flex: '1 1 200px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                      autoFocus
                    />
                    <button
                      className="ops-action-btn ops-action-success"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={saveEmail}
                      disabled={emailBusy || !emailDraft.trim()}
                    >
                      {emailBusy ? '…' : 'Guardar'}
                    </button>
                    <button
                      className="ops-action-btn ops-action-neutral"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => { setEditingEmail(false); setEmailDraft(''); }}
                      disabled={emailBusy}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <CopyableValue copy={c.patient_email || ''}>{c.patient_email || '—'}</CopyableValue>
                    <button
                      type="button"
                      onClick={() => { setEmailDraft(c.patient_email || ''); setEditingEmail(true); }}
                      style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: '#1a3c5e' }}
                      title="Cambiar el email del paciente para esta solicitud"
                    >
                      ✎ Cambiar
                    </button>
                  </span>
                )}
              </dd>
              <dt>Teléfono</dt><dd><CopyableValue copy={c.patient_phone || ''}>{c.patient_phone || '—'}</CopyableValue></dd>
              <dt>Aseguradora</dt><dd><CopyableValue copy={c.insurance_company || ''}>{c.insurance_company || (c.has_insurance ? 'Sí' : 'Sin seguro')}</CopyableValue></dd>
              <dt>Especialidad</dt><dd><CopyableValue copy={c.specialty || ''}>{c.specialty || '—'}</CopyableValue></dd>
            </dl>
            <p style={{ marginTop: 10, fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
              Cambiar el email redirige <strong>todos</strong> los emails futuros del flujo (autorización, alternativas, reembolsos) a la nueva dirección. Queda registrado en el log del caso.
            </p>
          </div>

          <div className="ops-card">
            <h2>Cita original</h2>
            <dl className="ops-kv">
              <dt>Clínica</dt><dd><CopyableValue copy={c.original_clinic_name || ''}>{c.original_clinic_name || '—'}</CopyableValue></dd>
              <dt>ID clínica</dt><dd><CopyableValue copy={String(c.original_clinic_id || '')}>{c.original_clinic_id || '—'}</CopyableValue></dd>
              <dt>Fecha</dt><dd><CopyableValue copy={fmtCitaDate(c.original_slot_date, c.original_slot_time)}>{fmtCitaDate(c.original_slot_date, c.original_slot_time)}</CopyableValue></dd>
              <dt>Cobrado</dt><dd><CopyableValue copy={`€${Number(c.amount_paid || 0).toFixed(2)}`}>€{Number(c.amount_paid || 0).toFixed(2)} (T{c.tier || '—'})</CopyableValue></dd>
              <dt>A pagar a clínica</dt><dd><CopyableValue copy={`€${Number(c.payment_to_clinic || 0).toFixed(2)}`}>€{Number(c.payment_to_clinic || 0).toFixed(2)}</CopyableValue></dd>
              <dt>Booking ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}><CopyableValue copy={c.booking_id || ''}>{c.booking_id}</CopyableValue></dd>
              <dt>Payment Intent</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}><CopyableValue copy={c.payment_intent_id || ''}>{c.payment_intent_id || '—'}</CopyableValue></dd>
            </dl>
          </div>

          {/* Voucher SaludOnNet — only relevant for sin-seguro bookings */}
          {!c.has_insurance && (
            <div className="ops-card">
              <h2>Autorización SaludOnNet</h2>
              <dl className="ops-kv">
                <dt>Acto médico</dt><dd><CopyableValue copy={c.procedure_name || c.procedure_slug || ''}>{c.procedure_name || c.procedure_slug || '—'}</CopyableValue></dd>
                <dt>Precio acto</dt><dd><CopyableValue copy={`€${Number(c.service_price || 0).toFixed(2)}`}>€{Number(c.service_price || 0).toFixed(2)}</CopyableValue></dd>
                <dt>Tarifa de prioridad</dt><dd><CopyableValue copy={`€${Number(c.platform_fee || 0).toFixed(2)}`}>€{Number(c.platform_fee || 0).toFixed(2)}</CopyableValue></dd>
                <dt>Estado autorización</dt>
                <dd>
                  <span className={`ops-status ops-status-${c.voucher_status || 'awaiting_voucher'}`}>
                    {c.voucher_status || 'awaiting_voucher'}
                  </span>
                </dd>
                {c.son_order_ref && (<><dt>Ref. SON</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}><CopyableValue copy={c.son_order_ref}>{c.son_order_ref}</CopyableValue></dd></>)}
                {c.voucher_url && (<><dt>URL de la autorización</dt><dd><a href={c.voucher_url} target="_blank" rel="noopener noreferrer">Ver autorización</a></dd></>)}
                {c.voucher_pdf_path && (<><dt>PDF subido</dt><dd><a href={c.voucher_pdf_path} target="_blank" rel="noopener noreferrer">Abrir PDF</a></dd></>)}
                {c.voucher_uploaded_at && (<><dt>Subido</dt><dd>{fmtDateTime(c.voucher_uploaded_at)} {c.voucher_uploaded_by ? `por ${c.voucher_uploaded_by}` : ''}</dd></>)}
                {c.voucher_sent_at && (<><dt>Enviado al paciente</dt><dd>{fmtDateTime(c.voucher_sent_at)}</dd></>)}
              </dl>

              {(!c.voucher_status || c.voucher_status === 'awaiting_voucher') && (
                <div style={{ marginTop: 12, padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#78350f' }}>
                    Subí la autorización tras comprar el acto en SaludOnNet:
                  </p>
                  <p style={{ margin: '0 0 10px', fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
                    Cualquiera de los tres campos es suficiente. Podés combinar (e.g. ref + PDF) si tenés ambos.
                  </p>
                  <label style={{ display: 'block', fontSize: 11, color: '#78350f', fontWeight: 600, marginBottom: 4 }}>URL de la autorización (link a SON)</label>
                  <input
                    type="url"
                    placeholder="https://saludonnet.com/autorizacion/…"
                    value={voucherUrl}
                    onChange={(e) => setVoucherUrl(e.target.value)}
                    style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, marginBottom: 8 }}
                  />
                  <label style={{ display: 'block', fontSize: 11, color: '#78350f', fontWeight: 600, marginBottom: 4 }}>Código de la autorización / Ref. orden SaludOnNet</label>
                  <input
                    type="text"
                    placeholder="ABC-12345"
                    value={sonOrderRef}
                    onChange={(e) => setSonOrderRef(e.target.value)}
                    style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, marginBottom: 8 }}
                  />
                  <label style={{ display: 'block', fontSize: 11, color: '#78350f', fontWeight: 600, marginBottom: 4 }}>O subí un PDF con la autorización</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setVoucherPdfFile(e.target.files?.[0] || null)}
                    style={{ width: '100%', fontSize: 12, marginBottom: 4 }}
                  />
                  {voucherPdfFile && (
                    <p style={{ margin: '0 0 8px', fontSize: 11, color: '#78350f' }}>
                      Adjunto: <strong>{voucherPdfFile.name}</strong> ({(voucherPdfFile.size / 1024).toFixed(0)} KB)
                      {' '}
                      <button
                        type="button"
                        onClick={() => setVoucherPdfFile(null)}
                        style={{ background: 'none', border: 0, color: '#7f1d1d', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}
                      >
                        quitar
                      </button>
                    </p>
                  )}
                  <button
                    className="ops-action-btn ops-action-success"
                    onClick={submitVoucher}
                    disabled={voucherBusy || (!voucherUrl.trim() && !sonOrderRef.trim() && !voucherPdfFile)}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    {voucherBusy ? 'Subiendo…' : 'Subir autorización y enviar al paciente'}
                  </button>
                </div>
              )}

              {c.voucher_status === 'voucher_sent' && (
                <button
                  className="ops-action-btn ops-action-neutral"
                  onClick={resendVoucher}
                  disabled={voucherBusy}
                  style={{ marginTop: 12, width: '100%' }}
                >
                  {voucherBusy ? 'Enviando…' : '↻ Reenviar autorización al paciente'}
                </button>
              )}
            </div>
          )}

          {(c.alternative_clinic_name || c.alternative_slot_date) && (
            <div className="ops-card">
              <h2>Alternativa propuesta</h2>
              <dl className="ops-kv">
                <dt>Clínica</dt><dd><CopyableValue copy={c.alternative_clinic_name || c.original_clinic_name || ''}>{c.alternative_clinic_name || c.original_clinic_name}</CopyableValue></dd>
                <dt>Fecha</dt><dd><CopyableValue copy={fmtCitaDate(c.alternative_slot_date, c.alternative_slot_time)}>{fmtCitaDate(c.alternative_slot_date, c.alternative_slot_time)}</CopyableValue></dd>
                <dt>Motivo</dt><dd><CopyableValue copy={c.alternative_reason || ''}>{c.alternative_reason || '—'}</CopyableValue></dd>
                <dt>Decisión paciente</dt><dd><CopyableValue copy={c.patient_decision || ''}>{c.patient_decision || 'Esperando'}</CopyableValue></dd>
              </dl>
            </div>
          )}

          {c.refund_id && (
            <div className="ops-card">
              <h2>Reembolso</h2>
              <dl className="ops-kv">
                <dt>Refund ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}><CopyableValue copy={c.refund_id || ''}>{c.refund_id}</CopyableValue></dd>
                <dt>Importe</dt><dd><CopyableValue copy={`€${Number(c.refund_amount || 0).toFixed(2)}`}>€{Number(c.refund_amount || 0).toFixed(2)}</CopyableValue></dd>
                <dt>Motivo</dt><dd><CopyableValue copy={c.refund_reason || ''}>{c.refund_reason || '—'}</CopyableValue></dd>
              </dl>
            </div>
          )}

          <div className="ops-card">
            <h2>Registro de gestiones</h2>
            <pre className="ops-call-log">{formatCallLog(c.call_log)}</pre>
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
              <dt>Asignado a</dt><dd><CopyableValue copy={c.assigned_to || ''}>{c.assigned_to || '—'}</CopyableValue></dd>
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
            {!isTerminal && (
              <div className="ops-actions">
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Email de la clínica (opcional, para enviar la confirmación + onboarding)
                  <input
                    type="email"
                    value={clinicEmailOverride}
                    onChange={(e) => setClinicEmailOverride(e.target.value)}
                    placeholder="rellena solo si la clínica no está dada de alta aún"
                    style={{ width: '100%', marginTop: 4, padding: '6px 8px', fontSize: 13 }}
                  />
                  <span style={{ display: 'block', marginTop: 4, fontSize: 11, fontWeight: 400, color: '#6b7280' }}>
                    Si la clínica ya está en Medconnect, el sistema usa su email automáticamente. Si no,
                    rellena aquí y le llegará un email con los datos del paciente y el enlace para darse de
                    alta y cobrar la comisión.
                  </span>
                </label>
                <button
                  className="ops-action-btn ops-action-success"
                  onClick={() => doAction('clinic_accepted', { clinicEmail: clinicEmailOverride.trim() || null })}
                  disabled={busy}
                >
                  ✓ La clínica aceptó el slot original<br />
                  <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Confirma cita y notifica al paciente + a la clínica</span>
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
                    <ClinicTypeahead
                      cityFilter={c.original_clinic_city}
                      specialtyFilter={c.specialty}
                      preferClinicName="Centro Médico Cea Bermúdez"
                      onPick={(clinic) => {
                        setAltClinicName(clinic.name);
                        setAltClinicId(String(clinic.id));
                      }}
                      selectedId={altClinicId ? Number(altClinicId) : null}
                      selectedName={altClinicName}
                      onClear={() => { setAltClinicName(''); setAltClinicId(''); }}
                    />
                    <div className="ops-form-row" style={{ marginTop: 6 }}>
                      <input type="date" value={altDate} onChange={(e) => setAltDate(e.target.value)} />
                      <input type="time" value={altTime} onChange={(e) => setAltTime(e.target.value)} />
                    </div>
                    <input type="text" placeholder="Motivo del cambio (opcional)" value={altReason} onChange={(e) => setAltReason(e.target.value)} />
                    <button
                      className="ops-action-btn ops-action-warn"
                      style={{ marginTop: 8, width: '100%' }}
                      disabled={busy || !altClinicId || !altClinicName || !altDate || !altTime}
                      onClick={() => doAction('alternative_clinic_proposed', {
                        altClinicId: altClinicId ? Number(altClinicId) : null,
                        altClinicName, altDate, altTime, reason: altReason,
                      })}
                    >
                      {altClinicId ? 'Mandar email al paciente con la nueva clínica' : 'Selecciona una clínica de la lista'}
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

                <RefundFormSection c={c} busy={busy} doAction={doAction} />
              </div>
            )}
            {/* Caso confirmado: el resto de acciones desaparecen pero el
                refund sigue siendo necesario por si la clínica cancela
                después o el paciente reclama post-confirmación. */}
            {isTerminal && !REFUND_BLOCKED.includes(c.status) && (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 8 }}>
                  Caso ya en estado <strong>{c.status}</strong>. Sigue disponible el reembolso por si surge incidencia.
                </p>
                <RefundFormSection c={c} busy={busy} doAction={doAction} forceVisible />
              </div>
            )}
            {REFUND_BLOCKED.includes(c.status) && (
              <p style={{ color: '#6b7280', fontSize: 13 }}>
                Este caso ya está cerrado en estado <strong>{c.status}</strong>. No hay acciones disponibles.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Refund manual form — extraída para reusar entre la sección de acciones
 * (cuando el caso aún no llegó a un estado terminal) y la sección de caso
 * confirmado (donde solo queda esta acción disponible).
 *
 * Forza un motivo de >= 3 caracteres en el cliente (la API también lo
 * valida con 400, este gate es UX). Cuando la política de refund
 * (slot − 72 h) indica que el caso está fuera de cutoff, ofrece un
 * checkbox "Forzar reembolso completo aún fuera de cutoff" para que Ops
 * tenga que reconocer expresamente el override.
 */
function RefundFormSection({ c, busy, doAction, forceVisible }) {
  const [refundReason, setRefundReason] = useState('');
  const [overrideCutoff, setOverrideCutoff] = useState(false);

  // Calcula si el caso está dentro o fuera de cutoff (sin importar el helper
  // del servidor — esto es solo para guiar al operador).
  // Same purity treatment as PatientResponseBadge — read `Date.now()` via
  // a stateful tick so the render stays deterministic for React 19's
  // linter. The cutoff hint refreshes once a minute.
  const [nowMsRefund, setNowMsRefund] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMsRefund(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const slotAt = (() => {
    if (!c.original_slot_date) return null;
    const time = c.original_slot_time && /^\d{2}:\d{2}$/.test(c.original_slot_time) ? c.original_slot_time : '00:00';
    const d = new Date(`${c.original_slot_date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  })();
  const hoursUntilSlot = slotAt ? (slotAt.getTime() - nowMsRefund) / 3_600_000 : null;
  const withinCutoff = hoursUntilSlot !== null && hoursUntilSlot < 72;
  const hasInsurance = c.has_insurance == null ? null : !!c.has_insurance;

  const policyHint = (() => {
    if (slotAt === null) return 'Sin fecha de cita registrada — refund por defecto completo.';
    if (!withinCutoff) {
      return `Cita en ${hoursUntilSlot.toFixed(1)} h (>72 h). Dentro de cutoff: refund completo automático.`;
    }
    if (hasInsurance === false) {
      return `Cita en ${hoursUntilSlot.toFixed(1)} h (<72 h) y paciente sin seguro. La política reembolsa solo el valor del servicio. Marca el override para devolver todo.`;
    }
    return `Cita en ${hoursUntilSlot.toFixed(1)} h (<72 h) y paciente con seguro. La política NO reembolsa nada. Marca el override para forzar reembolso.`;
  })();

  const reasonOk = refundReason.trim().length >= 3;

  return (
    <details className="ops-form" open={forceVisible}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#7f1d1d' }}>
        💸 Emitir reembolso
      </summary>
      <div style={{ marginTop: 8 }}>
        <p style={{
          fontSize: 11, color: withinCutoff ? '#7f1d1d' : '#065f46',
          background: withinCutoff ? '#fef2f2' : '#ecfdf5',
          padding: '6px 8px', borderRadius: 4, margin: '0 0 8px',
        }}>
          {policyHint}
        </p>
        <input
          type="text"
          placeholder="Motivo del reembolso (obligatorio, mín. 3 caracteres)"
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
          required
          style={{ width: '100%' }}
        />
        {withinCutoff && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: '#374151' }}>
            <input
              type="checkbox"
              checked={overrideCutoff}
              onChange={(e) => setOverrideCutoff(e.target.checked)}
            />
            Forzar reembolso total fuera de cutoff (queda registrado en el log)
          </label>
        )}
        <button
          className="ops-action-btn ops-action-danger"
          style={{ marginTop: 8, width: '100%' }}
          disabled={busy || !reasonOk}
          onClick={() => {
            if (!reasonOk) return;
            if (confirm('¿Emitir reembolso ahora?')) {
              doAction('refund', { reason: refundReason.trim(), overrideCutoff });
            }
          }}
        >
          {reasonOk ? 'Emitir reembolso' : 'Escribe un motivo para continuar'}
        </button>
      </div>
    </details>
  );
}

// ─── Patient response badge ─────────────────────────────────────────
//
// Computes 4 states based on patient_decision + alternative_proposed_at:
//
//   - patient_decision === 'accepted'  → Aceptada (verde)
//   - patient_decision === 'rejected'  → Rechazada (rojo)
//   - decision NULL + dentro de 24h    → Sin respuesta (ámbar) + timer
//   - decision NULL + pasadas 24h      → Expirada (gris)
//
// Solo se renderiza cuando hay una propuesta alternativa pendiente, es
// decir cuando alternative_proposed_at no es null. Si el caso aún no
// llegó al estado de propuesta, el badge queda oculto.
function PatientResponseBadge({ caso }) {
  // Tick once a minute so the "queda X" countdown stays fresh without
  // forcing a full case refetch. Using state-with-interval also keeps
  // the render pure (Date.now() inside render trips React 19's purity
  // linter; reading from state is fine).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!caso?.alternative_proposed_at) return null;
  const proposedMs = new Date(caso.alternative_proposed_at).getTime();
  if (Number.isNaN(proposedMs)) return null;
  const elapsedH = (nowMs - proposedMs) / 3_600_000;
  const decision = caso.patient_decision;

  let label, color, bg;
  if (decision === 'accepted') {
    label = 'Paciente aceptó'; color = '#15803d'; bg = '#dcfce7';
  } else if (decision === 'rejected') {
    label = 'Paciente rechazó'; color = '#b91c1c'; bg = '#fee2e2';
  } else if (elapsedH >= 24) {
    label = 'Expirada (24 h sin respuesta)'; color = '#374151'; bg = '#e5e7eb';
  } else {
    const remainingH = Math.max(0, 24 - elapsedH);
    const remainingLabel = remainingH >= 1
      ? `quedan ${Math.floor(remainingH)} h`
      : `quedan ${Math.max(1, Math.floor(remainingH * 60))} min`;
    label = `Sin respuesta · ${remainingLabel}`; color = '#92400e'; bg = '#fef3c7';
  }
  return (
    <span style={{
      display: 'inline-block', marginLeft: 8, padding: '2px 10px',
      fontSize: 12, fontWeight: 600,
      borderRadius: 999, color, background: bg,
    }}>
      {label}
    </span>
  );
}

// ─── Clinic typeahead ───────────────────────────────────────────────
//
// Autocomplete sobre `clinics` filtrado por ciudad + especialidad del
// caso original. Buscamos al montar (un solo request, ~100 clínicas
// como techo) y filtramos client-side con normalización (tildes,
// mayúsculas, ñ→n) a medida que el operador tipea.
//
// Política de orden:
//   - Si `preferClinicName` (típicamente "Centro Médico Cea Bermúdez")
//     aparece en los resultados, va primero.
//   - El resto, alfabético por nombre normalizado.
//
// Solo permite seleccionar clínicas de la lista — Ops no puede inventar
// nombres libres. Eso garantiza que el email al paciente lleva la
// dirección real de la DB.
function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .trim();
}
// Picker UX: a button that opens a modal containing a search box + the
// filtered clinic list. Replaces the previous inline typeahead — the
// operator reported it looked too much like a free-text field, and worse
// the `fetch` calls weren't sending the admin Bearer token (the admin
// auth lives in localStorage, not cookies), so /api/admin/clinics
// returned 401 silently and the dropdown stayed empty.
//
// Two fixes in one component swap:
//   1. Use `adminFetch` so the admin token is attached → search works.
//   2. Modal UI makes it visually obvious this is a list picker. The
//      operator can NEVER submit a clinic name that isn't in the DB
//      because the modal is the only entry point — the `selectedId`
//      stays null until they click a real row.
function ClinicTypeahead({
  cityFilter, specialtyFilter, preferClinicName,
  onPick, onClear, selectedId, selectedName,
}) {
  const [open, setOpen] = useState(false);
  const summary = [cityFilter, specialtyFilter].filter(Boolean).join(' · ');

  return (
    <>
      {selectedId ? (
        <div style={{
          padding: '6px 8px', border: '1px solid #10b981', borderRadius: 4,
          background: '#ecfdf5', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, color: '#064e3b' }}>
            ✓ <strong>{selectedName}</strong> <span style={{ opacity: 0.7 }}>· id {selectedId}</span>
          </span>
          <button
            type="button"
            onClick={onClear}
            style={{ background: 'none', border: 0, color: '#065f46', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
          >
            cambiar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '8px 12px', border: '1.5px dashed #94a3b8',
            borderRadius: 6, background: '#f8fafc', cursor: 'pointer',
            fontSize: 13, fontFamily: 'inherit', color: '#1e293b',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            📋 Elegir clínica de la lista
            {summary ? <span style={{ fontWeight: 400, color: '#64748b' }}> · {summary}</span> : null}
          </span>
          <span style={{ color: '#64748b', fontSize: 16 }}>›</span>
        </button>
      )}
      {open && (
        <ClinicPickerModal
          cityFilter={cityFilter}
          specialtyFilter={specialtyFilter}
          preferClinicName={preferClinicName}
          onClose={() => setOpen(false)}
          onPick={(cl) => { onPick(cl); setOpen(false); }}
        />
      )}
    </>
  );
}

// Modal dialog: searchbox + scrollable clinic list. Backed by the same
// /api/admin/clinics endpoint as before, but called through `adminFetch`
// so the Bearer token from localStorage is attached. Without that header
// the endpoint returns 401 and the picker stays empty (was the root cause
// of the 2026-05 "dropdown no funciona" report).
function ClinicPickerModal({
  cityFilter, specialtyFilter, preferClinicName, onClose, onPick,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fuzzyHint, setFuzzyHint] = useState(false);
  const inputRef = useRef(null);
  const reqIdRef = useRef(0);

  // Auto-focus the searchbox when the modal opens and trap Esc to close.
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Build q. /api/admin/clinics searches name + city + province + address
  // only — it does NOT join clinic_specialties — so the case's specialty
  // string would never match anything if added as a token, and the
  // server-side AND would silently drop every result. We deliberately
  // skip specialtyFilter here. cityFilter is used only as a soft seed
  // when the operator hasn't typed anything yet, so the modal opens
  // showing clinics in the case's city; the moment they start typing,
  // the city seed is dropped — otherwise "centro m" + "Madrid" requires
  // BOTH tokens, and a Madrid clinic without "Madrid" in the address
  // would still be excluded.
  useEffect(() => {
    const handle = setTimeout(async () => {
      const typed = query.trim();
      const q = typed || (cityFilter ? String(cityFilter).trim() : '');
      const myId = ++reqIdRef.current;
      setLoading(true);
      setFuzzyHint(false);
      try {
        // adminFetch attaches the Bearer token from localStorage and 401s
        // are routed to /admin/login. The previous plain fetch() never
        // sent the token, so the endpoint always returned 401.
        let res = await adminFetch(`/api/admin/clinics?q=${encodeURIComponent(q)}&limit=50`);
        let j = await res.json();
        let list = Array.isArray(j?.clinics) ? j.clinics : [];
        // Typo fallback — when the user has typed something AND the full
        // query returned nothing AND the typed value is ≥ 5 chars, retry
        // with the LAST token shortened by one character. Catches
        // "Bermudz" → "Bermud" → "Bermúdez".
        if (myId === reqIdRef.current && typed && list.length === 0 && typed.length >= 5) {
          const parts = typed.split(/\s+/).filter(Boolean);
          if (parts.length > 0) {
            parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1);
            const shortened = parts.join(' ');
            res = await adminFetch(`/api/admin/clinics?q=${encodeURIComponent(shortened)}&limit=50`);
            j = await res.json();
            list = Array.isArray(j?.clinics) ? j.clinics : [];
            if (list.length > 0) setFuzzyHint(true);
          }
        }
        if (myId === reqIdRef.current) setResults(list);
      } catch (err) {
        if (myId === reqIdRef.current) {
          console.error('[ClinicPickerModal] fetch error', err);
          setResults([]);
        }
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [cityFilter, query]);

  const filtered = useMemo(() => {
    const preferKey = preferClinicName ? normalize(preferClinicName) : null;
    return [...results].sort((a, b) => {
      const an = normalize(a.name);
      const bn = normalize(b.name);
      if (preferKey) {
        const ap = an.includes(preferKey);
        const bp = bn.includes(preferKey);
        if (ap && !bp) return -1;
        if (bp && !ap) return 1;
      }
      return an.localeCompare(bn);
    }).slice(0, 50);
  }, [results, preferClinicName]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elegir clínica alternativa"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '40px 16px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560, background: '#fff',
        borderRadius: 12, boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 80px)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                Elegir clínica alternativa
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Solo puedes seleccionar clínicas de esta lista. Si la clínica que buscas no aparece, emite reembolso.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                background: '#f1f5f9', border: 0, borderRadius: '50%',
                width: 28, height: 28, cursor: 'pointer', fontSize: 16,
                color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              cityFilter
                ? `Buscar en ${cityFilter}${specialtyFilter ? ` · ${specialtyFilter}` : ''}…`
                : 'Buscar por nombre, ciudad, provincia o dirección…'
            }
            autoComplete="off"
            style={{
              width: '100%', marginTop: 12, padding: '10px 12px',
              border: '1.5px solid #cbd5e1', borderRadius: 6,
              fontSize: 14, fontFamily: 'inherit', outline: 'none',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#1a3c5e'; }}
            onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 100 }}>
          {loading ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#64748b', textAlign: 'center' }}>
              Buscando…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#64748b', textAlign: 'center' }}>
              Sin resultados{cityFilter ? ` en ${cityFilter}` : ''}.
              <br />Prueba a buscar por otro nombre o emite reembolso si no hay alternativa.
            </div>
          ) : (
            <>
              {fuzzyHint && (
                <div style={{
                  padding: '8px 20px', fontSize: 12, color: '#92400e',
                  background: '#fef3c7', borderBottom: '1px solid #fde68a',
                }}>
                  Mostrando coincidencias aproximadas (posible typo en la búsqueda).
                </div>
              )}
              {filtered.map((cl) => (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => onPick(cl)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '12px 20px', background: 'none', border: 0,
                    borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{cl.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {cl.city || ''}{cl.address ? ` · ${cl.address}` : ''}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
        <div style={{
          padding: '10px 20px', borderTop: '1px solid #e2e8f0',
          fontSize: 11, color: '#94a3b8', background: '#f8fafc',
        }}>
          {filtered.length > 0 ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'} · ` : ''}
          Pulsa <kbd style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 3, padding: '0 4px', fontSize: 10 }}>Esc</kbd> para cerrar
        </div>
      </div>
    </div>
  );
}
