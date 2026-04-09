'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LockInTimer from '@/components/LockInTimer';
import { REFERRAL_STATES } from '@/data/mock';
import './lock-in.css';

export default function LockInPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lockInId = params.lockInId;

  const [referral, setReferral] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    patientAddress: '',
    acceptTerms: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('referrals');
    let found = null;

    // 1. Try localStorage first (same browser as professional)
    if (stored) {
      try {
        found = JSON.parse(stored).find((r) => r.id === lockInId) || null;
      } catch (e) {
        console.error('Error parsing referrals from localStorage:', e);
      }
    }

    // 2. Fallback: reconstruct from URL ?data= param (cross-browser / email link)
    if (!found) {
      const dataParam = searchParams.get('data');
      if (dataParam) {
        try {
          const decoded = JSON.parse(atob(dataParam));
          found = {
            id: lockInId,
            patientEmail: decoded.patientEmail,
            professionalEmail: decoded.professionalEmail,
            providerName: decoded.providerName,
            slotDate: decoded.slotDate,
            slotTime: decoded.slotTime,
            fee: decoded.fee,
            clinicName: decoded.clinicName,
            specialty: decoded.specialty,
            lockInWarningAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            state: 'PENDING',
          };
          // Save to localStorage so subsequent operations (submit, timer) work
          const existing = stored ? JSON.parse(stored) : [];
          existing.push(found);
          localStorage.setItem('referrals', JSON.stringify(existing));
        } catch (e) {
          console.error('Error decoding referral from URL:', e);
        }
      }
    }

    if (found) {
      setReferral(found);
      setForm((prev) => ({
        ...prev,
        patientName: found.patientName || '',
        patientPhone: found.patientPhone || '',
        patientAddress: found.patientAddress || '',
      }));
    } else {
      setIsExpired(true);
    }
    setIsLoading(false);
  }, [lockInId, searchParams]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleExpire = () => {
    setIsExpired(true);
    console.log(`🔔 Lock-in expirado: ${lockInId}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.patientName.trim() || !form.patientPhone.trim() || !form.patientAddress.trim()) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    if (!form.acceptTerms) {
      alert('Debes aceptar los términos y autorización de pago');
      return;
    }

    setIsSubmitting(true);

    // Update referral state
    const stored = localStorage.getItem('referrals');
    if (stored) {
      try {
        const referrals = JSON.parse(stored);
        const updated = referrals.map((r) =>
          r.id === lockInId
            ? {
                ...r,
                patientName: form.patientName,
                patientPhone: form.patientPhone,
                patientAddress: form.patientAddress,
                state: REFERRAL_STATES.DATA_COMPLETED,
                completedAt: new Date().toISOString(),
              }
            : r
        );
        localStorage.setItem('referrals', JSON.stringify(updated));

        // Notify clinic that patient completed data
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateName: 'clinicPatientCompleted',
            data: {
              clinicEmail: referral?.professionalEmail,
              patientName: form.patientName,
              patientPhone: form.patientPhone,
              providerName: referral?.providerName || 'Centro médico',
              slotDate: referral?.slotDate,
              slotTime: referral?.slotTime,
              referralId: lockInId,
            },
          }),
        }).catch(() => {});

        // Redirect to payment page
        router.push(
          `/book?lockInId=${lockInId}&patientName=${encodeURIComponent(
            form.patientName
          )}&patientEmail=${encodeURIComponent(referral?.patientEmail)}&step=payment`
        );
      } catch (e) {
        console.error('Error updating referral:', e);
        alert('Error al guardar los datos');
      }
    }

    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <>
        <Header />
        <main className="lock-in-page">
          <div className="lock-in-container">
            <div className="loading-spinner">Cargando...</div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (isExpired || !referral) {
    return (
      <>
        <Header />
        <main className="lock-in-page">
          <div className="lock-in-container">
            <div className="error-state">
              <div className="error-icon">❌</div>
              <h1>Lock-in Expirado o No Encontrado</h1>
              <p>
                Lamentablemente, el lock-in ha expirado o no existe. Por favor, solicita un nuevo slot con tu
                profesional.
              </p>
              <a href="/" className="btn btn-primary">
                Volver al Inicio
              </a>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="lock-in-page">
        <div className="lock-in-container">
          <div className="lock-in-header">
            <div className="lock-in-title-section">
              <h1 className="lock-in-title">Completa tus Datos</h1>
              <p className="lock-in-subtitle">
                Tu cita ha sido reservada. Completa la información para confirmarla.
              </p>
            </div>
          </div>

          <div className="lock-in-content">
            {/* Timer */}
            <LockInTimer
              referralId={lockInId}
              expiresAt={referral.lockInWarningAt}
              patientEmail={referral.patientEmail}
              patientName={form.patientName || 'Paciente'}
              onExpire={handleExpire}
              showResendButton={false}
            />

            {/* Referral Details Card */}
            <div className="referral-details-card">
              <h2>Detalles de tu Cita</h2>
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">Centro Médico</span>
                  <span className="detail-value">{referral.providerName}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Fecha</span>
                  <span className="detail-value">
                    {new Date(referral.slotDate).toLocaleDateString('es-ES', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Hora</span>
                  <span className="detail-value">{referral.slotTime}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Tarifa</span>
                  <span className="detail-value highlight">{referral.fee.toFixed(2)}€</span>
                </div>
              </div>
            </div>

            {/* Patient Data Form */}
            <form className="lock-in-form" onSubmit={handleSubmit}>
              <h2>Información del Paciente</h2>

              <div className="form-group">
                <label htmlFor="patient-name">
                  Nombre Completo *
                  <span className="required">Requerido</span>
                </label>
                <input
                  id="patient-name"
                  type="text"
                  placeholder="Ej: Juan García López"
                  value={form.patientName}
                  onChange={(e) => handleFormChange('patientName', e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="patient-phone">
                  Teléfono *
                  <span className="required">Requerido</span>
                </label>
                <input
                  id="patient-phone"
                  type="tel"
                  placeholder="Ej: +34 612 345 678"
                  value={form.patientPhone}
                  onChange={(e) => handleFormChange('patientPhone', e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="patient-address">
                  Dirección *
                  <span className="required">Requerido</span>
                </label>
                <input
                  id="patient-address"
                  type="text"
                  placeholder="Ej: Calle Principal 123, 28001 Madrid"
                  value={form.patientAddress}
                  onChange={(e) => handleFormChange('patientAddress', e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group checkbox">
                <input
                  id="accept-terms"
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={(e) => handleFormChange('acceptTerms', e.target.checked)}
                  required
                />
                <label htmlFor="accept-terms">
                  Confirmo que los datos son correctos y autorizo el cobro de {referral.fee.toFixed(2)}€
                  para esta cita.
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-large"
                disabled={isSubmitting || !form.acceptTerms}
              >
                {isSubmitting ? 'Guardando...' : 'Confirmar y Proceder al Pago'}
              </button>

              <p className="form-note">
                Al hacer clic en "Confirmar", serás redirigido a la pasarela de pago segura para completar
                la transacción.
              </p>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
