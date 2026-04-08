'use client';

import { useState } from 'react';
import { providers, availability, specialties, services, getConvenienceFee } from '@/data/mock';
import './ReferralModal.css';

// TODO: Filter based on authenticated user's clinic ID from database
const MY_CLINIC_PROVIDER_ID = 1;

export default function ReferralModal({
  isOpen,
  onClose,
  onConfirm,
  derivationType = 'externa', // 'interna' | 'externa'
  professionName,
  professionalEmail,
}) {
  const [step, setStep] = useState(1); // 1 = provider select, 2 = slot select, 3 = patient email
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [patientEmail, setPatientEmail] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Filter providers based on derivation type
  const visibleProviders = derivationType === 'interna'
    ? providers.filter(p => p.id === MY_CLINIC_PROVIDER_ID)
    : providers;

  const handleProviderSelect = (provider) => {
    setSelectedProvider(provider);
    setSelectedSpecialty(null);
    setStep(2);
  };

  const handleSlotSelect = (slot) => {
    setSelectedSlot(slot);
    setStep(3);
  };

  const handleSendLockIn = async () => {
    if (!patientEmail.trim() || !selectedSlot) {
      alert('Por favor completa todos los campos');
      return;
    }

    setIsConfirming(true);

    // Send lock-in invitation email to patient
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: 'lockInInvitation',
        data: {
          patientEmail,
          clinicName: professionName,
          specialty: selectedProvider?.specialty || 'Consulta médica',
          providerName: selectedProvider?.name || '',
          slotDate: selectedSlot?.date || '',
          slotTime: selectedSlot?.time || '',
          fee: selectedSlot?.fee || 0,
          lockInId: null, // will be set after referral is created in dashboard
        },
      }),
    }).catch(() => {});

    // Call callback
    if (onConfirm) {
      await onConfirm({
        provider: selectedProvider,
        slot: selectedSlot,
        patientEmail,
      });
    }

    setIsConfirming(false);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setStep(1);
    setSelectedProvider(null);
    setSelectedSpecialty(null);
    setSelectedSlot(null);
    setPatientEmail('');
  };

  if (!isOpen) return null;

  const providerSlots = selectedProvider ? availability[selectedProvider.id] || [] : [];
  const availableSlots = providerSlots.filter((s) => s.available);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-referral" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Nueva Derivación</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '2px 0 0' }}>
              {derivationType === 'interna'
                ? `Derivación Interna — ${professionName}`
                : 'Derivación Externa — Toda la red'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Step 1: Provider Selection */}
          {step === 1 && (
            <div className="referral-step">
              <h3>1. Selecciona un Centro Médico</h3>
              <div className="provider-grid">
                {visibleProviders.map((provider) => (
                  <button
                    key={provider.id}
                    className={`provider-card ${selectedProvider?.id === provider.id ? 'selected' : ''}`}
                    onClick={() => handleProviderSelect(provider)}
                  >
                    <div className="provider-name">{provider.name}</div>
                    <div className="provider-city">{provider.city}</div>
                    <div className="provider-rating">⭐ {provider.rating}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Slot Selection */}
          {step === 2 && selectedProvider && (
            <div className="referral-step">
              <button className="btn-back" onClick={() => setStep(1)}>← Atrás</button>
              <h3>2. Selecciona una Cita</h3>
              <div className="provider-info">
                <strong>{selectedProvider.name}</strong> - {selectedProvider.city}
              </div>

              {availableSlots.length > 0 ? (
                <div className="slots-grid">
                  {availableSlots.slice(0, 12).map((slot, idx) => {
                    const fee = getConvenienceFee(slot.date);
                    const isSelected = selectedSlot === slot;
                    return (
                      <button
                        key={idx}
                        className={`slot-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSlotSelect(slot)}
                      >
                        <div className="slot-date">
                          {new Date(slot.date).toLocaleDateString('es-ES', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        <div className="slot-time">{slot.time}</div>
                        <div className="slot-fee">{fee.amount.toFixed(2)}€</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="no-slots">No hay citas disponibles</div>
              )}
            </div>
          )}

          {/* Step 3: Patient Email */}
          {step === 3 && selectedProvider && selectedSlot && (
            <div className="referral-step">
              <button className="btn-back" onClick={() => setStep(2)}>← Atrás</button>
              <h3>3. Datos del Paciente</h3>

              <div className="referral-summary">
                <div className="summary-row">
                  <span>Centro:</span>
                  <strong>{selectedProvider.name}</strong>
                </div>
                <div className="summary-row">
                  <span>Fecha:</span>
                  <strong>
                    {new Date(selectedSlot.date).toLocaleDateString('es-ES', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Hora:</span>
                  <strong>{selectedSlot.time}</strong>
                </div>
                <div className="summary-row">
                  <span>Tarifa:</span>
                  <strong>{getConvenienceFee(selectedSlot.date).amount.toFixed(2)}€</strong>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="patient-email">Email del Paciente *</label>
                <input
                  id="patient-email"
                  type="email"
                  placeholder="paciente@ejemplo.com"
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  className="form-input"
                />
                <small>El paciente recibirá un email con un link para confirmar sus datos en 60 minutos</small>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          {step === 3 && (
            <button
              className="btn btn-primary"
              onClick={handleSendLockIn}
              disabled={isConfirming || !patientEmail.trim()}
            >
              {isConfirming ? 'Enviando...' : 'Enviar Lock-in'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
