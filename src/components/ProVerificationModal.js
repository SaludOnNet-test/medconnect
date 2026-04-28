'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
// Reuses the existing ReferralModal CSS for the chrome (overlay/header/
// footer); the local additions live in ./ProVerificationModal.css.
import './ReferralModal.css';
import './ProVerificationModal.css';

/**
 * ProVerificationModal — pro dashboard verification flow.
 *
 * Replaces the WIP `alert(...)` that used to back the "Verificar cuenta
 * ahora" banner button. Steps:
 *
 *   1. Profile type — doctor or clinic.
 *   2. Identity data — name + license (doctor) or razón social + CIF
 *      (clinic). Both can attach a free-form note.
 *   3. Document upload — license / clinic docs. PDF / JPEG / PNG / WebP,
 *      max 10 MB each, max 5 files. Validated client-side before POST.
 *   4. Confirmation — success screen, the actual review happens in
 *      /admin/pro-verifications.
 *
 * The modal POSTs multipart/form-data to /api/pro/verification which
 * uploads the files to Vercel Blob and persists the request row.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_FILES = 5;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

export default function ProVerificationModal({ isOpen, onClose, onSubmitted, professionalEmail }) {
  const [step, setStep] = useState(1); // 1=type, 2=data, 3=docs, 4=success
  const [profileType, setProfileType] = useState(null); // 'doctor' | 'clinic'
  const [data, setData] = useState({
    fullName: '',
    licenseNumber: '',
    clinicName: '',
    taxId: '',
    notes: '',
  });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  function handleProfileSelect(type) {
    setProfileType(type);
    setStep(2);
  }

  function setField(name, value) {
    setData((prev) => ({ ...prev, [name]: value }));
  }

  function canAdvanceFromData() {
    if (profileType === 'doctor') {
      return data.fullName.trim().length > 0 && data.licenseNumber.trim().length > 0;
    }
    if (profileType === 'clinic') {
      return data.clinicName.trim().length > 0;
    }
    return false;
  }

  function handleFilesPicked(e) {
    const incoming = Array.from(e.target.files || []);
    setError(null);
    if (incoming.length === 0) return;

    const combined = [...files, ...incoming];
    if (combined.length > MAX_FILES) {
      setError(`Como máximo ${MAX_FILES} archivos.`);
      return;
    }
    for (const f of incoming) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name}: supera el límite de 10 MB.`);
        return;
      }
    }
    setFiles(combined);
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = '';
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (files.length === 0) {
      setError('Sube al menos un archivo.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const fd = new FormData();
    fd.append('email', professionalEmail || '');
    fd.append('profileType', profileType);
    fd.append('fullName', data.fullName);
    fd.append('licenseNumber', data.licenseNumber);
    fd.append('clinicName', data.clinicName);
    fd.append('taxId', data.taxId);
    fd.append('notes', data.notes);
    for (const f of files) fd.append('documents', f);

    try {
      const res = await fetch('/api/pro/verification', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Error inesperado');
        setSubmitting(false);
        return;
      }
      setStep(4);
      if (onSubmitted) onSubmitted({ requestId: json.requestId, status: json.status });
    } catch (err) {
      setError(err?.message || 'No pudimos enviar la verificación. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setStep(1);
    setProfileType(null);
    setData({ fullName: '', licenseNumber: '', clinicName: '', taxId: '', notes: '' });
    setFiles([]);
    setError(null);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-referral" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Verificar cuenta</h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', margin: '2px 0 0' }}>
              {step < 4 ? `Paso ${step} de 3` : '¡Solicitud enviada!'}
            </p>
          </div>
          <button className="modal-close" onClick={handleClose} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* ── Step 1 — pick profile type ── */}
          {step === 1 && (
            <div className="referral-step">
              <h3>1. ¿Qué tipo de cuenta verificas?</h3>
              <p className="pv-step-lede">
                Necesitamos validar quién eres para desbloquear la solicitud de liquidación.
                Elige la opción que mejor te describa.
              </p>
              <div className="pv-type-grid">
                <button
                  type="button"
                  className={`pv-type-card ${profileType === 'doctor' ? 'pv-type-card--selected' : ''}`}
                  onClick={() => handleProfileSelect('doctor')}
                >
                  <Icon name="stethoscope" size={28} className="pv-type-icon" />
                  <h4>Soy un médico individual</h4>
                  <p>Subes tu licencia médica (colegiado).</p>
                </button>
                <button
                  type="button"
                  className={`pv-type-card ${profileType === 'clinic' ? 'pv-type-card--selected' : ''}`}
                  onClick={() => handleProfileSelect('clinic')}
                >
                  <Icon name="building-2" size={28} className="pv-type-icon" />
                  <h4>Represento una clínica</h4>
                  <p>Subes la habilitación / docs societarios de la clínica.</p>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2 — identity data ── */}
          {step === 2 && profileType && (
            <div className="referral-step">
              <button className="btn-back" onClick={() => setStep(1)}>← Atrás</button>
              <h3>2. Datos de {profileType === 'doctor' ? 'tu cuenta' : 'la clínica'}</h3>

              {profileType === 'doctor' && (
                <>
                  <div className="form-group">
                    <label htmlFor="pv-full-name">Nombre completo *</label>
                    <input
                      id="pv-full-name"
                      className="form-input"
                      placeholder="Lucía Fernández García"
                      value={data.fullName}
                      onChange={(e) => setField('fullName', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="pv-license">Nº de colegiado *</label>
                    <input
                      id="pv-license"
                      className="form-input"
                      placeholder="280123456"
                      value={data.licenseNumber}
                      onChange={(e) => setField('licenseNumber', e.target.value)}
                    />
                  </div>
                </>
              )}

              {profileType === 'clinic' && (
                <>
                  <div className="form-group">
                    <label htmlFor="pv-clinic-name">Razón social *</label>
                    <input
                      id="pv-clinic-name"
                      className="form-input"
                      placeholder="Centro Médico Cea Bermúdez S.L."
                      value={data.clinicName}
                      onChange={(e) => setField('clinicName', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="pv-tax-id">CIF / NIF</label>
                    <input
                      id="pv-tax-id"
                      className="form-input"
                      placeholder="B12345678"
                      value={data.taxId}
                      onChange={(e) => setField('taxId', e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label htmlFor="pv-notes">Algo que añadir para el equipo (opcional)</label>
                <textarea
                  id="pv-notes"
                  className="form-input"
                  rows={3}
                  value={data.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── Step 3 — document upload ── */}
          {step === 3 && profileType && (
            <div className="referral-step">
              <button className="btn-back" onClick={() => setStep(2)}>← Atrás</button>
              <h3>3. Sube la documentación</h3>
              <p className="pv-step-lede">
                {profileType === 'doctor'
                  ? 'Adjunta tu licencia médica (PDF o foto). Aceptamos PDF, JPEG, PNG y WebP, hasta 10 MB por archivo.'
                  : 'Adjunta la documentación de la clínica: escritura/CIF, registro sanitario, foto fachada. Hasta 5 archivos, 10 MB cada uno.'}
              </p>

              <label className="pv-file-trigger" htmlFor="pv-files">
                <Icon name="upload-cloud" size={20} />
                <span>{files.length === 0 ? 'Seleccionar archivos' : 'Añadir más archivos'}</span>
              </label>
              <input
                id="pv-files"
                type="file"
                multiple
                accept={ACCEPT}
                onChange={handleFilesPicked}
                style={{ display: 'none' }}
              />

              {files.length > 0 && (
                <ul className="pv-file-list">
                  {files.map((f, i) => (
                    <li key={i} className="pv-file-row">
                      <Icon name="file-text" size={16} className="pv-file-icon" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pv-file-name">{f.name}</div>
                        <div className="pv-file-meta">{(f.size / 1024 / 1024).toFixed(2)} MB · {f.type || 'desconocido'}</div>
                      </div>
                      <button
                        type="button"
                        className="pv-file-remove"
                        onClick={() => removeFile(i)}
                        aria-label={`Quitar ${f.name}`}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {error && <div className="pv-error">{error}</div>}
            </div>
          )}

          {/* ── Step 4 — success ── */}
          {step === 4 && (
            <div className="referral-step referral-success">
              <div className="referral-success-icon">
                <Icon name="check" size={28} />
              </div>
              <h3>Documentación recibida</h3>
              <p>
                Tu solicitud está en revisión. Te avisamos por email en cuanto el equipo de
                operaciones la apruebe — normalmente en menos de 48&nbsp;h hábiles.
              </p>
              <div className="referral-success-actions">
                <button className="btn btn-primary" onClick={handleClose}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>

        {step !== 4 && (
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={handleClose}>Cancelar</button>
            {step === 2 && (
              <button
                className="btn btn-primary"
                onClick={() => setStep(3)}
                disabled={!canAdvanceFromData()}
              >
                Siguiente
              </button>
            )}
            {step === 3 && (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={files.length === 0 || submitting}
              >
                {submitting ? 'Subiendo…' : 'Subir documentos y enviar'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
