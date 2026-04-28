'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import './ReferralModal.css';

/**
 * ReferralModal — pro dashboard derivación flow.
 *
 * Lives off the live DB now (was hardcoded against the mock providers /
 * services / availability arrays). Reads:
 *   - GET /api/clinics/search       — list of clinics (network for externa,
 *                                     filtered to the user's clinic for
 *                                     interna).
 *   - GET /api/clinics/[id]/procedures — procedure catalogue + SON price.
 *   - GET /api/clinics/[id]/available-slots — real slots with tier prices.
 *
 * Props new in this version:
 *   - myClinic: { id, name } | null   the pro user's clinic. When derivation
 *                                     type is 'interna' and myClinic is null,
 *                                     the modal renders an "alta pendiente"
 *                                     gate explaining the situation (the
 *                                     wider onboarding flow lands in PR G2).
 */
export default function ReferralModal({
  isOpen,
  onClose,
  onConfirm,
  derivationType = 'externa', // 'interna' | 'externa'
  professionName,
  professionalEmail,
  myClinic = null,
}) {
  const [step, setStep] = useState(1); // 1=provider, 2=procedure, 3=slot, 4=patient email, 5=success
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedProcedure, setSelectedProcedure] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [patientEmail, setPatientEmail] = useState('');
  const [lastSentEmail, setLastSentEmail] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(false);

  const [procedures, setProcedures] = useState([]);
  const [proceduresLoading, setProceduresLoading] = useState(false);

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [searchCity, setSearchCity] = useState('');

  // Internal derivation must have a clinic — if the pro user isn't yet
  // attached to one, gate the flow with an explanatory message.
  const internalGated = derivationType === 'interna' && !myClinic;

  // ── Step 1 — load clinics (DB) ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen || internalGated) return;
    if (derivationType === 'interna' && myClinic) {
      // Internal: only show the user's clinic (no fetch needed).
      setProviders([{ id: myClinic.id, name: myClinic.name, city: myClinic.city || '', rating: myClinic.rating ?? null }]);
      return;
    }
    setProvidersLoading(true);
    const params = new URLSearchParams({ limit: '24' });
    if (searchCity) params.set('city', searchCity);
    fetch(`/api/clinics/search?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setProviders(Array.isArray(data?.clinics) ? data.clinics : []))
      .catch(() => setProviders([]))
      .finally(() => setProvidersLoading(false));
  }, [isOpen, derivationType, myClinic, searchCity, internalGated]);

  // ── Step 2 — load procedures for the selected clinic ─────────────────
  useEffect(() => {
    if (!selectedProvider) return;
    setProceduresLoading(true);
    fetch(`/api/clinics/${selectedProvider.id}/procedures`)
      .then((r) => r.json())
      .then((data) => setProcedures(Array.isArray(data?.procedures) ? data.procedures : []))
      .catch(() => setProcedures([]))
      .finally(() => setProceduresLoading(false));
  }, [selectedProvider]);

  // ── Step 3 — load available slots for the selected clinic ────────────
  useEffect(() => {
    if (!selectedProvider) return;
    setSlotsLoading(true);
    fetch(`/api/clinics/${selectedProvider.id}/available-slots`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.slots) ? data.slots.filter((s) => s.available) : [];
        setSlots(list);
      })
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedProvider]);

  // Slots grouped by date so the calendar renders in days.
  const dates = useMemo(
    () => [...new Set(slots.map((s) => s.date))].slice(0, 7),
    [slots],
  );

  function handleProviderSelect(provider) {
    setSelectedProvider(provider);
    setSelectedProcedure(null);
    setSelectedSlot(null);
    setStep(2);
  }

  function handleProcedureSelect(proc) {
    setSelectedProcedure(proc);
    setStep(3);
  }

  function handleSlotSelect(slot) {
    setSelectedSlot(slot);
    setStep(4);
  }

  async function handleSendLockIn() {
    if (!patientEmail.trim() || !selectedSlot || !selectedProvider) {
      alert('Por favor completa todos los campos');
      return;
    }
    setIsConfirming(true);

    const slotFee = Number(selectedSlot.price ?? 0);
    if (onConfirm) {
      await onConfirm({
        provider: selectedProvider,
        procedure: selectedProcedure,
        slot: { ...selectedSlot, fee: slotFee },
        patientEmail,
      });
    }

    setIsConfirming(false);
    setLastSentEmail(patientEmail);
    setShowPreview(false);
    setStep(5);
  }

  // Reuse the same provider/procedure/slot to invite a second patient —
  // the dashboard audit flagged this as a recurring need (one referral
  // sometimes goes to several family members).
  function handleDuplicate() {
    setLastSentEmail('');
    setPatientEmail('');
    setShowPreview(false);
    setStep(4);
  }

  function handleReset() {
    setStep(1);
    setSelectedProvider(null);
    setSelectedProcedure(null);
    setSelectedSlot(null);
    setPatientEmail('');
    setLastSentEmail('');
    setShowPreview(false);
    setSearchCity('');
  }

  function handleCloseAndReset() {
    handleReset();
    onClose();
  }

  // Preview URL — feeds /api/email/preview the same args the real
  // sendEmail() call uses, so the iframe is exactly what the patient
  // would receive (modulo the lockInId, which we render as 'preview-id'
  // since the real one only exists after submission).
  const previewSrc = (() => {
    if (!selectedProvider || !selectedSlot) return null;
    const slotFee = Number(selectedSlot.price ?? 0);
    const payload = {
      patientEmail: patientEmail || 'paciente@ejemplo.com',
      professionalEmail,
      clinicName: professionName,
      specialty: selectedProcedure?.specialtyName || selectedProcedure?.name || 'Consulta médica',
      providerName: selectedProvider.name,
      slotDate: selectedSlot.date,
      slotTime: selectedSlot.time,
      fee: slotFee,
      lockInId: 'preview',
    };
    const b64 = typeof window !== 'undefined'
      ? btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      : '';
    return `/api/email/preview?template=lockInInvitation&data=${b64}`;
  })();

  if (!isOpen) return null;

  // Gate for unattached pros trying internal derivation
  if (internalGated) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-referral" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>Tu clínica está en proceso de alta</h2>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Cerrar">
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="modal-body">
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', lineHeight: 'var(--leading-loose)', color: 'var(--fg)' }}>
              Necesitas una clínica activa en Med Connect para crear derivaciones internas. Ahora mismo tu solicitud de alta está en revisión por nuestro equipo de operaciones — lo normal es que la respondamos en menos de 48 h hábiles.
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', lineHeight: 'var(--leading-loose)', color: 'var(--fg-muted)' }}>
              Mientras tanto puedes <strong>derivar pacientes a otras clínicas</strong> de la red y cobrar tu comisión por cada derivación que se confirme.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={onClose}>Entendido</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-referral" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Nueva derivación</h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', margin: '2px 0 0' }}>
              {derivationType === 'interna'
                ? `Derivación interna — ${myClinic?.name || professionName}`
                : 'Derivación externa — toda la red'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* ── Step 1 — pick a provider ── */}
          {step === 1 && (
            <div className="referral-step">
              {/* Mode explainer — same copy lives on the dashboard CTAs;
                  reproducing it here keeps the pro oriented even if they
                  jumped straight into the modal from a deep-link. */}
              <div className="referral-mode-card">
                <Icon
                  name={derivationType === 'interna' ? 'building-2' : 'share-2'}
                  size={18}
                  className="referral-mode-icon"
                />
                <div>
                  {derivationType === 'interna' ? (
                    <>
                      <strong>Derivación interna.</strong> A un colega de tu propia clínica.
                      Cobras tu tarifa concertada habitual + nuestra compensación por cubrir el
                      hueco prioritario.
                    </>
                  ) : (
                    <>
                      <strong>Derivación externa.</strong> A otra clínica de la red Med Connect
                      cuando no cubres esa especialidad. Cobras una comisión por cada derivación
                      que el paciente confirma.
                    </>
                  )}
                </div>
              </div>
              <h3>1. Selecciona un centro médico</h3>
              {derivationType === 'externa' && (
                <input
                  type="text"
                  className="form-input"
                  placeholder="Filtrar por ciudad…"
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  style={{ marginBottom: 'var(--space-3)' }}
                />
              )}
              {providersLoading ? (
                <div className="no-slots">Cargando clínicas…</div>
              ) : providers.length === 0 ? (
                <div className="no-slots">No hay clínicas disponibles con ese filtro.</div>
              ) : (
                <div className="provider-grid">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      className={`provider-card ${selectedProvider?.id === provider.id ? 'selected' : ''}`}
                      onClick={() => handleProviderSelect(provider)}
                    >
                      <div className="provider-name">{provider.name}</div>
                      <div className="provider-city">
                        <Icon name="map-pin" size={12} /> {provider.city || provider.province || ''}
                      </div>
                      {provider.rating != null && (
                        <div className="provider-rating">
                          <Icon name="star" size={12} /> {Number(provider.rating).toFixed(1)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2 — pick procedure (acto médico) ── */}
          {step === 2 && selectedProvider && (
            <div className="referral-step">
              <button className="btn-back" onClick={() => setStep(1)}>← Atrás</button>
              <h3>2. Selecciona el acto médico</h3>
              <div className="provider-info">
                <strong>{selectedProvider.name}</strong>
                {selectedProvider.city ? ` — ${selectedProvider.city}` : ''}
              </div>
              {proceduresLoading ? (
                <div className="no-slots">Cargando catálogo…</div>
              ) : procedures.length === 0 ? (
                <div className="no-slots">Esta clínica aún no tiene catálogo en el sistema.</div>
              ) : (
                <div className="procedure-list">
                  {procedures.map((p) => (
                    <button
                      key={p.slug}
                      className={`procedure-row ${selectedProcedure?.slug === p.slug ? 'selected' : ''}`}
                      onClick={() => handleProcedureSelect(p)}
                    >
                      <div>
                        <div className="procedure-name">{p.name}</div>
                        {p.specialtyName && <div className="procedure-spec">{p.specialtyName}</div>}
                      </div>
                      {p.price != null && (
                        <div className="procedure-price">{formatEUR(p.price)}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3 — pick a slot ── */}
          {step === 3 && selectedProvider && selectedProcedure && (
            <div className="referral-step">
              <button className="btn-back" onClick={() => setStep(2)}>← Atrás</button>
              <h3>3. Selecciona una cita</h3>
              <div className="provider-info">
                <strong>{selectedProvider.name}</strong> · {selectedProcedure.name}
              </div>

              {slotsLoading ? (
                <div className="no-slots">Cargando huecos…</div>
              ) : slots.length === 0 ? (
                <div className="no-slots">No hay citas disponibles próximamente.</div>
              ) : (
                <div className="slots-grid">
                  {slots.slice(0, 12).map((slot, idx) => {
                    const fee = Number(slot.price ?? 0);
                    const isSelected = selectedSlot === slot;
                    return (
                      <button
                        key={idx}
                        className={`slot-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSlotSelect(slot)}
                      >
                        <div className="slot-date">
                          {new Date(slot.date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                        </div>
                        <div className="slot-time">{slot.time}</div>
                        {fee > 0 && <div className="slot-fee">{formatEUR(fee)}</div>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4 — patient email ── */}
          {step === 4 && selectedProvider && selectedSlot && (
            <div className="referral-step">
              <button className="btn-back" onClick={() => setStep(3)}>← Atrás</button>
              <h3>4. Datos del paciente</h3>

              <div className="referral-summary">
                <div className="summary-row">
                  <span>Centro:</span>
                  <strong>{selectedProvider.name}</strong>
                </div>
                <div className="summary-row">
                  <span>Acto médico:</span>
                  <strong>{selectedProcedure?.name}</strong>
                </div>
                <div className="summary-row">
                  <span>Fecha:</span>
                  <strong>
                    {new Date(selectedSlot.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Hora:</span>
                  <strong>{selectedSlot.time}</strong>
                </div>
                <div className="summary-row">
                  <span>Tarifa de prioridad:</span>
                  <strong>{formatEUR(Number(selectedSlot.price ?? 0))}</strong>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="patient-email">Email del paciente *</label>
                <input
                  id="patient-email"
                  type="email"
                  placeholder="paciente@ejemplo.com"
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  className="form-input"
                />
                <small>El paciente recibirá un email con un enlace para confirmar sus datos en 60 minutos.</small>
              </div>

              {/* Email preview — collapsible iframe rendered server-side
                  by /api/email/preview using the same template the patient
                  will receive. Lets the pro see exactly what's sent before
                  hitting the button. */}
              {previewSrc && (
                <div className="referral-preview">
                  <button
                    type="button"
                    className="referral-preview-toggle"
                    onClick={() => setShowPreview((v) => !v)}
                    aria-expanded={showPreview}
                  >
                    <span>Vista previa del email</span>
                    <Icon name={showPreview ? 'chevron-up' : 'chevron-down'} size={14} />
                  </button>
                  {showPreview && (
                    <iframe
                      src={previewSrc}
                      title="Vista previa del email al paciente"
                      className="referral-preview-frame"
                      sandbox="allow-same-origin"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 5 — success state with duplicate-to-another-patient ── */}
          {step === 5 && selectedProvider && selectedSlot && (
            <div className="referral-step referral-success">
              <div className="referral-success-icon">
                <Icon name="check" size={28} />
              </div>
              <h3>Lock-in enviado</h3>
              <p>
                Hemos enviado el email a <strong>{lastSentEmail}</strong>. El paciente tiene 60
                minutos para confirmar y pagar. Recibirás un email cuando complete la reserva.
              </p>
              <div className="referral-success-actions">
                <button className="btn btn-outline" onClick={handleDuplicate}>
                  Enviar a otro paciente
                </button>
                <button className="btn btn-primary" onClick={handleCloseAndReset}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step !== 5 && (
            <button className="btn btn-outline" onClick={handleCloseAndReset}>Cancelar</button>
          )}
          {step === 4 && (
            <button
              className="btn btn-primary"
              onClick={handleSendLockIn}
              disabled={isConfirming || !patientEmail.trim()}
            >
              {isConfirming ? 'Enviando…' : 'Enviar lock-in'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
