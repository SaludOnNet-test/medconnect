'use client';

// Auth-gated onboarding page — never statically prerendered.
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/icons/Icon';
import './onboarding.css';

const HAS_CLERK_KEYS = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Bridge component — only mounted when Clerk is configured.
function ClerkUserBridge({ onUser }) {
  const { useUser } = require('@clerk/nextjs');
  const { user, isLoaded } = useUser();
  useEffect(() => {
    if (isLoaded && user) {
      onUser({
        email: user.primaryEmailAddress?.emailAddress || '',
        name: user.fullName || user.firstName || '',
      });
    }
  }, [user, isLoaded, onUser]);
  return null;
}

/**
 * /pro/onboarding — clinic mapping flow for pro users.
 *
 * Two paths:
 *   1. "Mi clínica ya está en Med Connect" — search the live DB and
 *      self-attach via POST /api/pro/attach-clinic. Instant.
 *   2. "Quiero darla de alta" — fill the form and submit via POST
 *      /api/pro/clinic-alta-request. Goes to ops review (max 48 h).
 *
 * The page polls /api/pro/me on mount so users who already have a clinic
 * mapped (or a pending alta) see the right state and don't duplicate work.
 */
export default function ProOnboarding() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const [clerkUser, setClerkUser] = useState(null);
  const handleClerkUser = useCallback((data) => setClerkUser(data), []);

  const professionalEmail = (HAS_CLERK_KEYS && clerkUser?.email)
    ? clerkUser.email
    : 'info@centromedico.es';
  const professionalName = (HAS_CLERK_KEYS && clerkUser?.name)
    ? clerkUser.name
    : '';

  const [meStatus, setMeStatus] = useState(null); // { altaStatus, clinicName, clinicCity, ... }
  const [meLoading, setMeLoading] = useState(true);

  const [mode, setMode] = useState(null); // null | 'pick' | 'alta'

  // ── Picker state ──
  const [pickerCity, setPickerCity] = useState('');
  const [pickerName, setPickerName] = useState('');
  const [pickerResults, setPickerResults] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [picking, setPicking] = useState(null); // clinicId being attached
  const [pickerError, setPickerError] = useState(null);

  // ── Alta form state ──
  const [altaForm, setAltaForm] = useState({
    clinicName: '',
    city: '',
    province: '',
    address: '',
    telephone: '',
    contactEmail: '',
    specialties: '',
    aseguradoras: '',
    notes: '',
  });
  const [altaSubmitting, setAltaSubmitting] = useState(false);
  const [altaError, setAltaError] = useState(null);
  const [altaSuccess, setAltaSuccess] = useState(false);

  // Load /api/pro/me once we know the email.
  useEffect(() => {
    if (!professionalEmail) return;
    let cancelled = false;
    (async () => {
      setMeLoading(true);
      try {
        const res = await fetch(`/api/pro/me?email=${encodeURIComponent(professionalEmail)}`);
        if (!res.ok) throw new Error('me failed');
        const data = await res.json();
        if (!cancelled) setMeStatus(data);
      } catch {
        if (!cancelled) setMeStatus(null);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [professionalEmail]);

  // Search clinics (debounced via blur / button — keep it simple).
  const handleSearch = useCallback(async () => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const params = new URLSearchParams({ limit: '24' });
      if (pickerCity.trim()) params.set('city', pickerCity.trim());
      if (pickerName.trim()) params.set('name', pickerName.trim());
      const res = await fetch(`/api/clinics/search?${params.toString()}`);
      const data = await res.json();
      setPickerResults(Array.isArray(data?.clinics) ? data.clinics : []);
    } catch (err) {
      setPickerError('No pudimos cargar las clínicas. Inténtalo de nuevo.');
    } finally {
      setPickerLoading(false);
    }
  }, [pickerCity, pickerName]);

  // First load of clinics when the user opens the picker.
  useEffect(() => {
    if (mode === 'pick' && pickerResults.length === 0 && !pickerLoading) {
      handleSearch();
    }
  }, [mode, pickerResults.length, pickerLoading, handleSearch]);

  async function handleAttach(clinic) {
    setPicking(clinic.id);
    setPickerError(null);
    try {
      const res = await fetch('/api/pro/attach-clinic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: professionalEmail, clinicId: clinic.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo vincular la clínica.');
      }
      // Refresh /me so the page shows the success state.
      setMeStatus({
        clinicId: data.clinicId,
        clinicName: data.clinicName,
        clinicCity: data.clinicCity,
        altaStatus: 'active',
      });
      setMode(null);
    } catch (err) {
      setPickerError(err.message || 'Error inesperado');
    } finally {
      setPicking(null);
    }
  }

  function setAltaField(name, value) {
    setAltaForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleAltaSubmit(e) {
    e.preventDefault();
    if (!altaForm.clinicName.trim()) {
      setAltaError('El nombre de la clínica es obligatorio.');
      return;
    }
    setAltaSubmitting(true);
    setAltaError(null);
    try {
      const res = await fetch('/api/pro/clinic-alta-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedByEmail: professionalEmail,
          requestedByName: professionalName,
          ...altaForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo enviar la solicitud.');
      }
      setAltaSuccess(true);
      setMeStatus((prev) => ({
        ...(prev || {}),
        altaStatus: 'pending',
        altaRequestId: data.requestId,
      }));
    } catch (err) {
      setAltaError(err.message || 'Error inesperado');
    } finally {
      setAltaSubmitting(false);
    }
  }

  const altaStatus = meStatus?.altaStatus || 'none';

  return (
    <>
      {isMounted && HAS_CLERK_KEYS && <ClerkUserBridge onUser={handleClerkUser} />}
      <Header />
      <main className="pro-onboarding">
        <div className="container narrow">
          <header className="onboarding-header">
            <span className="eyebrow">Panel profesional</span>
            <h1>
              Vincula <em>tu clínica</em> a Med Connect
            </h1>
            <p className="onboarding-lede">
              Necesitamos saber a qué clínica perteneces para activar las derivaciones internas y
              empezar a recibir pacientes a través de tu panel.
            </p>
          </header>

          {meLoading && (
            <div className="onboarding-card onboarding-card--neutral">
              <p>Comprobando tu cuenta…</p>
            </div>
          )}

          {!meLoading && altaStatus === 'active' && meStatus?.clinicName && (
            <div className="onboarding-card onboarding-card--success">
              <div className="onboarding-card-icon"><Icon name="check-circle-2" size={28} /></div>
              <h2>Tu clínica ya está vinculada</h2>
              <p>
                Estás operando como <strong>{meStatus.clinicName}</strong>
                {meStatus.clinicCity ? ` (${meStatus.clinicCity})` : ''}. Ya puedes crear
                derivaciones internas y externas desde tu panel.
              </p>
              <Link href="/pro/dashboard" className="btn btn-primary">
                Ir al panel profesional
              </Link>
            </div>
          )}

          {!meLoading && altaStatus === 'pending' && (
            <div className="onboarding-card onboarding-card--pending">
              <div className="onboarding-card-icon"><Icon name="clock" size={28} /></div>
              <h2>Tu solicitud está en revisión</h2>
              <p>
                Hemos recibido tu solicitud de alta. Nuestro equipo de operaciones la revisará en
                las próximas <strong>48 horas hábiles</strong> y te avisará por email en cuanto la
                clínica esté activa.
              </p>
              <p className="onboarding-pending-meta">
                Mientras tanto puedes seguir creando <strong>derivaciones externas</strong> a otras
                clínicas de la red desde tu panel.
              </p>
              <Link href="/pro/dashboard" className="btn btn-outline">
                Ir al panel profesional
              </Link>
            </div>
          )}

          {!meLoading && altaStatus === 'rejected' && (
            <div className="onboarding-card onboarding-card--rejected">
              <div className="onboarding-card-icon"><Icon name="alert-triangle" size={28} /></div>
              <h2>No hemos podido completar tu alta</h2>
              <p>
                Revisa el email que enviamos para más detalles. Puedes volver a intentarlo
                completando el formulario de alta de nuevo o contactando con
                <a href="mailto:operaciones@medconnect.es"> operaciones@medconnect.es</a>.
              </p>
              <button className="btn btn-primary" onClick={() => setMode('alta')}>
                Volver a enviar el formulario
              </button>
            </div>
          )}

          {!meLoading && altaStatus === 'none' && !mode && (
            <div className="onboarding-options">
              <button
                type="button"
                className="onboarding-option"
                onClick={() => setMode('pick')}
              >
                <div className="onboarding-option-icon"><Icon name="search" size={24} /></div>
                <h3>Mi clínica ya está en Med Connect</h3>
                <p>Búscala en nuestra red y vincúlala a tu cuenta al instante.</p>
              </button>
              <button
                type="button"
                className="onboarding-option"
                onClick={() => setMode('alta')}
              >
                <div className="onboarding-option-icon"><Icon name="plus-circle" size={24} /></div>
                <h3>Quiero dar de alta mi clínica</h3>
                <p>Completa unos datos y nuestro equipo la revisará en menos de 48 h.</p>
              </button>
            </div>
          )}

          {!meLoading && altaStatus === 'none' && mode === 'pick' && (
            <section className="onboarding-card onboarding-card--neutral">
              <button className="btn-back" onClick={() => setMode(null)}>
                <Icon name="arrow-left" size={14} /> Volver
              </button>
              <h2>Busca tu clínica</h2>
              <div className="onboarding-search-row">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nombre de la clínica"
                  value={pickerName}
                  onChange={(e) => setPickerName(e.target.value)}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ciudad"
                  value={pickerCity}
                  onChange={(e) => setPickerCity(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleSearch}
                  disabled={pickerLoading}
                >
                  {pickerLoading ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
              {pickerError && <p className="onboarding-error">{pickerError}</p>}
              <div className="onboarding-results">
                {pickerResults.length === 0 && !pickerLoading && (
                  <p className="onboarding-empty">
                    No encontramos coincidencias. Si tu clínica no aparece,
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => { setMode('alta'); }}
                    > pide su alta aquí</button>.
                  </p>
                )}
                {pickerResults.map((clinic) => (
                  <div key={clinic.id} className="onboarding-result-row">
                    <div>
                      <div className="onboarding-result-name">{clinic.name}</div>
                      <div className="onboarding-result-meta">
                        <Icon name="map-pin" size={12} /> {clinic.city || clinic.province || '—'}
                      </div>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleAttach(clinic)}
                      disabled={picking === clinic.id}
                    >
                      {picking === clinic.id ? 'Vinculando…' : 'Es la mía'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!meLoading && altaStatus === 'none' && mode === 'alta' && !altaSuccess && (
            <section className="onboarding-card onboarding-card--neutral">
              <button className="btn-back" onClick={() => setMode(null)}>
                <Icon name="arrow-left" size={14} /> Volver
              </button>
              <h2>Solicita el alta de tu clínica</h2>
              <p className="onboarding-form-lede">
                Cuanta más información nos des, más rápido podremos activar tu clínica. Solo el
                nombre es obligatorio — el resto nos ayuda a configurarla mejor.
              </p>
              <form onSubmit={handleAltaSubmit} className="onboarding-form">
                <div className="form-group">
                  <label htmlFor="clinic-name">Nombre de la clínica *</label>
                  <input
                    id="clinic-name"
                    className="form-input"
                    value={altaForm.clinicName}
                    onChange={(e) => setAltaField('clinicName', e.target.value)}
                    required
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="clinic-city">Ciudad</label>
                    <input
                      id="clinic-city"
                      className="form-input"
                      value={altaForm.city}
                      onChange={(e) => setAltaField('city', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="clinic-province">Provincia</label>
                    <input
                      id="clinic-province"
                      className="form-input"
                      value={altaForm.province}
                      onChange={(e) => setAltaField('province', e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="clinic-address">Dirección</label>
                  <input
                    id="clinic-address"
                    className="form-input"
                    value={altaForm.address}
                    onChange={(e) => setAltaField('address', e.target.value)}
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="clinic-tel">Teléfono</label>
                    <input
                      id="clinic-tel"
                      className="form-input"
                      value={altaForm.telephone}
                      onChange={(e) => setAltaField('telephone', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="clinic-contact">Email de contacto</label>
                    <input
                      id="clinic-contact"
                      type="email"
                      className="form-input"
                      value={altaForm.contactEmail}
                      onChange={(e) => setAltaField('contactEmail', e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="clinic-specs">Especialidades principales</label>
                  <input
                    id="clinic-specs"
                    className="form-input"
                    placeholder="Cardiología, traumatología, dermatología…"
                    value={altaForm.specialties}
                    onChange={(e) => setAltaField('specialties', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="clinic-aseguradoras">Aseguradoras con las que trabajáis</label>
                  <input
                    id="clinic-aseguradoras"
                    className="form-input"
                    placeholder="Adeslas, Sanitas, DKV, Asisa…"
                    value={altaForm.aseguradoras}
                    onChange={(e) => setAltaField('aseguradoras', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="clinic-notes">Notas para el equipo</label>
                  <textarea
                    id="clinic-notes"
                    className="form-input"
                    rows={4}
                    value={altaForm.notes}
                    onChange={(e) => setAltaField('notes', e.target.value)}
                  />
                </div>
                {altaError && <p className="onboarding-error">{altaError}</p>}
                <div className="onboarding-form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={altaSubmitting}
                  >
                    {altaSubmitting ? 'Enviando…' : 'Enviar solicitud'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {altaSuccess && (
            <div className="onboarding-card onboarding-card--success">
              <div className="onboarding-card-icon"><Icon name="check-circle-2" size={28} /></div>
              <h2>Solicitud enviada</h2>
              <p>
                Hemos recibido tu solicitud y te avisaremos por email en cuanto la clínica esté
                activa. Mientras tanto puedes derivar pacientes a otras clínicas de la red.
              </p>
              <Link href="/pro/dashboard" className="btn btn-primary">
                Ir al panel profesional
              </Link>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
