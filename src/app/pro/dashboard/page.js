'use client';

// Authenticated page — never statically prerendered
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ReferralModal from '@/components/ReferralModal';
import LockInTimer from '@/components/LockInTimer';
import { createReferral, generateReferralId, REFERRAL_STATES, getReferralStatusDisplay, isSlotAvailable } from '@/data/mock';

const HAS_CLERK_KEYS = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
import './dashboard.css';

// Bridge component — renders nothing, just reads Clerk user and passes data up.
// Only mounted when ClerkProvider is present (HAS_CLERK_KEYS === true).
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

const sendEmail = (templateName, data) =>
  fetch('/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateName, data }),
  }).catch(() => {});

export default function ProDashboard() {
  const [isVerified, setIsVerified] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'interna', 'externa'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDeriType, setModalDeriType] = useState('externa');
  const [newEmailInputId, setNewEmailInputId] = useState(null); // ref id for inline email input
  const [newEmailValue, setNewEmailValue] = useState('');
  const [timerOverrides, setTimerOverrides] = useState({}); // { [referralId]: isoString }
  const [referrals, setReferrals] = useState([]);
  const [serverCommissions, setServerCommissions] = useState(null);
  const [clerkUser, setClerkUser] = useState(null);
  // The pro user's clinic, fetched from /api/pro/me. null while loading or
  // when the user isn't yet attached (alta pendiente). The ReferralModal
  // uses this to gate "interna" derivation.
  const [myClinic, setMyClinic] = useState(null);
  // The wider onboarding state — drives the banner that nudges unattached
  // pros to /pro/onboarding. 'active' once myClinic resolves; 'pending' /
  // 'rejected' / 'none' otherwise.
  const [altaStatus, setAltaStatus] = useState(null);
  const handleClerkUser = useCallback((data) => setClerkUser(data), []);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const professionName = (HAS_CLERK_KEYS && clerkUser?.name) ? clerkUser.name : 'Centro Médico San José';
  const professionalEmail = (HAS_CLERK_KEYS && clerkUser?.email) ? clerkUser.email : 'info@centromedico.es';

  // Load referrals — API first, localStorage fallback
  useEffect(() => {
    async function loadReferrals() {
      try {
        const emailFilter = professionalEmail
          ? `?professionalEmail=${encodeURIComponent(professionalEmail)}`
          : '';
        const res = await fetch(`/api/referrals${emailFilter}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setReferrals(data);
            return;
          }
        }
      } catch { /* network error — fall through */ }

      // Fallback: localStorage (works offline / if DB down)
      const stored = localStorage.getItem('referrals');
      if (stored) {
        try { setReferrals(JSON.parse(stored)); } catch {}
      }
    }
    loadReferrals();
  }, [professionalEmail]);

  // F3 — load authoritative commission stats from the server. Falls through
  // silently when the API isn't reachable; the local `stats` block computed
  // from `referrals` is still used as a fallback.
  useEffect(() => {
    if (!professionalEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pro/commissions?email=${encodeURIComponent(professionalEmail)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setServerCommissions(data);
      } catch { /* ignore — fallback to local stats */ }
    })();
    return () => { cancelled = true; };
  }, [professionalEmail]);

  // Resolve the pro user's clinic. The endpoint returns
  // { clinicId, clinicName, clinicCity, altaStatus } — when the user has no
  // mapping yet, clinicId is null and the modal shows the alta-pendiente
  // gate for "interna" derivation.
  useEffect(() => {
    if (!professionalEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pro/me?email=${encodeURIComponent(professionalEmail)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data?.clinicId) {
          setMyClinic({ id: data.clinicId, name: data.clinicName, city: data.clinicCity });
        } else {
          setMyClinic(null);
        }
        setAltaStatus(data?.altaStatus || 'none');
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [professionalEmail]);

  const handleCreateReferral = async ({ provider, procedure, slot, patientEmail }) => {
    const id = generateReferralId();
    const lockInWarningAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Tier-based priority fee — same scale the patient flow charges in
    // /search-v2 + /book (see PRICING_TIERS in src/lib/slot-validation.js):
    // 4,99 / 9,99 / 19 / 29 € depending on time-to-appointment. The slot
    // object that ReferralModal hands us already carries `slot.fee` (it
    // copies `slot.price` through). The legacy 25 € hardcode meant every
    // derivation email said the same number regardless of urgency — which
    // didn't match what the patient ends up paying when they reach /book.
    const fee = Number(slot?.fee ?? slot?.price ?? 0);
    // Use the procedure as the specialty label so the patient email reads
    // the actual acto médico instead of a generic "Consulta médica".
    const specialty = procedure?.specialtyName || procedure?.name || 'Consulta médica';

    // Persist to DB via API; fall back to local mock if unavailable
    let newReferral;
    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          patientEmail,
          professionalEmail,
          professionName,
          providerId: provider.id,
          providerName: provider.name,
          slotDate: slot.date,
          slotTime: slot.time,
          fee,
          specialty,
          lockInWarningAt,
        }),
      });
      if (res.ok) newReferral = await res.json();
    } catch { /* fall through */ }

    if (!newReferral) {
      newReferral = createReferral({
        type: modalDeriType, professionalEmail, professionName, patientEmail,
        providerId: provider.id, serviceId: 1, slotDate: slot.date,
        slotTime: slot.time, providerName: provider.name, fee,
      });
    }

    setReferrals((prev) => [...prev, newReferral]);

    const emailData = {
      patientEmail,
      professionalEmail,
      clinicName: professionName,
      specialty,
      providerName: provider.name,
      slotDate: slot.date,
      slotTime: slot.time,
      fee,
      lockInId: newReferral.id,
    };

    sendEmail('lockInInvitation', emailData);
    sendEmail('derivadorReferralCreated', { ...emailData, to: professionalEmail });
  };

  const handleCancelReferral = async (referralId) => {
    try {
      await fetch(`/api/referrals/${referralId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: REFERRAL_STATES.EXPIRED }),
      });
    } catch { /* ignore — state update below still applies locally */ }
    setReferrals((prev) =>
      prev.map((ref) => ref.id === referralId ? { ...ref, state: REFERRAL_STATES.EXPIRED } : ref)
    );
  };

  const handleResendEmail = (referralId, patientEmail) => {
    const referral = referrals.find((r) => r.id === referralId);
    sendEmail('lockInInvitation', {
      patientEmail: patientEmail || referral?.patientEmail,
      professionalEmail,
      clinicName: professionName,
      specialty: referral?.specialty || 'Consulta médica',
      providerName: referral?.providerName || '',
      slotDate: referral?.slotDate || '',
      slotTime: referral?.slotTime || '',
      fee: referral?.fee ?? 0,
      lockInId: referralId,
    });
  };

  const handleSendNewEmail = (referralId) => {
    if (!newEmailValue.trim()) return;
    const referral = referrals.find((r) => r.id === referralId);
    sendEmail('lockInInvitation', {
      patientEmail: newEmailValue.trim(),
      professionalEmail,
      clinicName: professionName,
      specialty: referral?.specialty || 'Consulta médica',
      providerName: referral?.providerName || '',
      slotDate: referral?.slotDate || '',
      slotTime: referral?.slotTime || '',
      fee: referral?.fee ?? 0,
      lockInId: referralId,
    });
    setNewEmailInputId(null);
    setNewEmailValue('');
  };

  const handleExtend60 = (referralId) => {
    const newExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setTimerOverrides(prev => ({ ...prev, [referralId]: newExpiry }));
    setReferrals(prev => prev.map(r => r.id === referralId
      ? { ...r, lockInWarningAt: newExpiry, state: REFERRAL_STATES.PENDING }
      : r
    ));
    alert('⏱️ Temporizador extendido 60 minutos');
  };

  const handleChangeSlot = () => {
    setModalDeriType('externa');
    setIsModalOpen(true);
  };

  const handleReferralExpire = (referralId) => {
    console.log(`🔔 Lock-in expirado para ${referralId}. Slot liberado.`);
    setReferrals((prev) =>
      prev.map((ref) =>
        ref.id === referralId
          ? { ...ref, state: REFERRAL_STATES.EXPIRED }
          : ref
      )
    );
  };

  // Filter referrals based on active tab
  const getPendingReferrals = () => referrals.filter((r) => r.state === REFERRAL_STATES.PENDING);
  const getInternaReferrals = () => referrals.filter((r) => r.type === 'interna');
  const getExternaReferrals = () => referrals.filter((r) => r.type === 'externa' && r.state !== REFERRAL_STATES.PENDING);

  const displayedReferrals = {
    pending: getPendingReferrals(),
    interna: getInternaReferrals(),
    externa: getExternaReferrals(),
  };

  // Prefer authoritative server numbers when available (matches the central
  // commission rate from PRO_COMMISSION_PER_REFERRAL). Fall back to the
  // in-memory referrals list otherwise so the page is still useful offline.
  const localExitosas = referrals.filter((r) => r.state === REFERRAL_STATES.CONFIRMED).length;
  const stats = {
    acumuladas: serverCommissions
      ? Number(serverCommissions.totalEarned || 0)
      : referrals
          .filter((r) => r.state === REFERRAL_STATES.CONFIRMED)
          .reduce((sum, r) => sum + (r.fee || 0), 0),
    last30: serverCommissions ? Number(serverCommissions.last30dEarned || 0) : null,
    exitosas: serverCommissions?.byState?.confirmed ?? localExitosas,
    pendientes: getPendingReferrals().length,
  };

  return (
    <>
      {isMounted && HAS_CLERK_KEYS && <ClerkUserBridge onUser={handleClerkUser} />}
      <Header />
      <main className="pro-dashboard">
        <div className="container">
          <div className="pro-dash-header animate-fade-in">
            <h1 className="pro-dash-title">
              Panel Profesional
              <span>{professionName}</span>
            </h1>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn btn-outline"
                onClick={() => { setModalDeriType('interna'); setIsModalOpen(true); }}
              >
                + Derivación Interna
              </button>
              <button
                className="btn btn-primary"
                onClick={() => { setModalDeriType('externa'); setIsModalOpen(true); }}
              >
                + Derivación Externa
              </button>
            </div>
          </div>

          {!isVerified && (
            <div className="pro-alert animate-fade-in-up">
              <div className="pro-alert-text">
                <strong>⚠️ Cuenta pendiente de verificación</strong>
                Sube tu licencia médica o habilitación de clínica para poder solicitar el pago de tus comisiones.
              </div>
              <button className="btn btn-navy btn-sm" onClick={() => alert('WIP: Abrir modal de subida de documentos')}>
                Verificar cuenta ahora
              </button>
            </div>
          )}

          {/* Onboarding nudge — only shown once /api/pro/me has resolved
              and the user isn't yet mapped to a clinic. Each altaStatus
              gets a distinct copy so the user knows where they are in the
              flow. */}
          {altaStatus && altaStatus !== 'active' && (
            <div className="pro-alert animate-fade-in-up" style={{ marginTop: '0.5rem' }}>
              <div className="pro-alert-text">
                {altaStatus === 'none' && (
                  <>
                    <strong>🏥 Vincula tu clínica a Med Connect</strong>
                    Solo necesitamos saber a qué clínica perteneces para activar las
                    derivaciones internas. Tarda menos de 2 minutos.
                  </>
                )}
                {altaStatus === 'pending' && (
                  <>
                    <strong>⏳ Tu solicitud de alta está en revisión</strong>
                    Nuestro equipo de operaciones la revisará en menos de 48 h hábiles.
                    Mientras tanto las derivaciones externas siguen funcionando.
                  </>
                )}
                {altaStatus === 'rejected' && (
                  <>
                    <strong>⚠️ No pudimos completar tu alta</strong>
                    Revisa el email que enviamos o vuelve a enviar la solicitud
                    desde el panel de onboarding.
                  </>
                )}
              </div>
              <Link href="/pro/onboarding" className="btn btn-primary btn-sm">
                {altaStatus === 'pending' ? 'Ver estado' : 'Ir al onboarding'}
              </Link>
            </div>
          )}

          <div className="pro-stats">
            <div className="pro-stat-card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="pro-stat-label">Comisiones acumuladas</div>
              <div className="pro-stat-value highlight">{stats.acumuladas.toFixed(2)}€</div>
            </div>
            {stats.last30 != null && (
              <div className="pro-stat-card animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
                <div className="pro-stat-label">Últimos 30 días</div>
                <div className="pro-stat-value">{stats.last30.toFixed(2)}€</div>
              </div>
            )}
            <div className="pro-stat-card animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="pro-stat-label">Derivaciones exitosas</div>
              <div className="pro-stat-value">{stats.exitosas}</div>
            </div>
            <div className="pro-stat-card animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <div className="pro-stat-label">En curso (pendientes)</div>
              <div className="pro-stat-value">{stats.pendientes}</div>
            </div>
          </div>
          {serverCommissions && (
            <p style={{ fontSize: '0.78rem', color: '#8892A4', margin: '0.5rem 0 1.25rem', textAlign: 'right' }}>
              Tarifa actual: {serverCommissions.commissionPerReferral?.toFixed(2)}€ por derivación confirmada.
            </p>
          )}

          {/* Tabs Navigation */}
          <div className="pro-tabs animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <button
              className={`tab-button ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              <span className="tab-icon">⏱️</span>
              Lock-ins Pendientes
              {stats.pendientes > 0 && <span className="tab-badge">{stats.pendientes}</span>}
            </button>
            <button
              className={`tab-button ${activeTab === 'interna' ? 'active' : ''}`}
              onClick={() => setActiveTab('interna')}
            >
              <span className="tab-icon">🏥</span>
              Derivación Interna
            </button>
            <button
              className={`tab-button ${activeTab === 'externa' ? 'active' : ''}`}
              onClick={() => setActiveTab('externa')}
            >
              <span className="tab-icon">🌐</span>
              Derivación Externa
            </button>
          </div>

          {/* Tab Content */}
          <div className="pro-table-wrapper animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
            {/* Lock-ins Pendientes */}
            {activeTab === 'pending' && (
              <div className="tab-content">
                <h2 className="tab-title">Lock-ins Pendientes (⏱️ Con Contador)</h2>
                {displayedReferrals.pending.length > 0 ? (
                  <div className="lock-ins-list">
                    {displayedReferrals.pending.map((ref) => {
                      const slotAvailable = isSlotAvailable(ref.providerId, ref.slotDate, ref.slotTime);
                      const isPending = ref.state === REFERRAL_STATES.PENDING;
                      return (
                      <div key={ref.id} className="lock-in-item">
                        <LockInTimer
                          referralId={ref.id}
                          expiresAt={ref.lockInWarningAt}
                          patientEmail={ref.patientEmail}
                          patientName={ref.patientName || 'Paciente'}
                          onExpire={handleReferralExpire}
                          onResend={handleResendEmail}
                          showResendButton={false}
                          expiresAtOverride={timerOverrides[ref.id] || null}
                        />
                        <div className="lock-in-details">
                          <div className="detail-row">
                            <span className="detail-label">Email del Paciente:</span>
                            <span className="detail-value">{ref.patientEmail}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Centro:</span>
                            <span className="detail-value">{ref.providerName}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Fecha/Hora:</span>
                            <span className="detail-value">
                              {new Date(ref.slotDate + 'T00:00:00').toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}{' '}
                              a las {ref.slotTime}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                            {slotAvailable && (
                              <button className="btn btn-sm btn-outline" onClick={() => handleResendEmail(ref.id, ref.patientEmail)}>
                                Reenviar al mismo correo
                              </button>
                            )}
                            {slotAvailable && (
                              <button className="btn btn-sm btn-outline" onClick={() => {
                                setNewEmailInputId(newEmailInputId === ref.id ? null : ref.id);
                                setNewEmailValue('');
                              }}>
                                Enviar a nuevo correo
                              </button>
                            )}
                            {slotAvailable && isPending && (
                              <button className="btn btn-sm btn-outline" onClick={() => handleExtend60(ref.id)}>
                                Extender 60 min
                              </button>
                            )}
                            <button className="btn btn-sm btn-outline" onClick={handleChangeSlot}>
                              Cambiar hueco
                            </button>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleCancelReferral(ref.id)}>
                              Cancelar
                            </button>
                          </div>
                          {newEmailInputId === ref.id && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                              <input
                                type="email"
                                className="form-input"
                                placeholder="nuevo@email.com"
                                value={newEmailValue}
                                onChange={e => setNewEmailValue(e.target.value)}
                                style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                              />
                              <button className="btn btn-sm btn-primary" onClick={() => handleSendNewEmail(ref.id)}>
                                Enviar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">✅</div>
                    <p>No hay lock-ins pendientes. ¡Excelente gestión!</p>
                  </div>
                )}
              </div>
            )}

            {/* Derivación Interna */}
            {activeTab === 'interna' && (
              <div className="tab-content">
                <h2 className="tab-title">Derivación Interna</h2>
                {displayedReferrals.interna.length > 0 ? (
                  <table className="pro-table">
                    <thead>
                      <tr>
                        <th>Referencia</th>
                        <th>Email Paciente</th>
                        <th>Centro</th>
                        <th>Fecha</th>
                        <th>Comisión</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedReferrals.interna.map((ref) => {
                        const status = getReferralStatusDisplay(ref.state);
                        return (
                          <tr key={ref.id}>
                            <td>
                              <strong>{ref.id}</strong>
                            </td>
                            <td>{ref.patientEmail}</td>
                            <td>{ref.providerName}</td>
                            <td>{ref.slotDate}</td>
                            <td style={{ fontWeight: 600 }}>{ref.fee.toFixed(2)}€</td>
                            <td>
                              <span className={`status-badge status-${ref.state}`}>
                                {status.icon} {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <p>No hay derivaciones internas aún.</p>
                  </div>
                )}
              </div>
            )}

            {/* Derivación Externa */}
            {activeTab === 'externa' && (
              <div className="tab-content">
                <div className="pro-table-header">
                  <h2 className="tab-title">Derivación Externa</h2>
                  <button className="btn btn-outline btn-sm" disabled={!isVerified}>
                    Solicitar Liquidación
                  </button>
                </div>
                {displayedReferrals.externa.length > 0 ? (
                  <table className="pro-table">
                    <thead>
                      <tr>
                        <th>Referencia</th>
                        <th>Email Paciente</th>
                        <th>Centro</th>
                        <th>Fecha</th>
                        <th>Comisión</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedReferrals.externa.map((ref) => {
                        const status = getReferralStatusDisplay(ref.state);
                        return (
                          <tr key={ref.id}>
                            <td>
                              <strong>{ref.id}</strong>
                            </td>
                            <td>{ref.patientEmail}</td>
                            <td>{ref.providerName}</td>
                            <td>{ref.slotDate}</td>
                            <td style={{ fontWeight: 600 }}>{ref.fee.toFixed(2)}€</td>
                            <td>
                              <span className={`status-badge status-${ref.state}`}>
                                {status.icon} {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">🌐</div>
                    <p>No hay derivaciones externas aún.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Referral Modal */}
      <ReferralModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleCreateReferral}
        derivationType={modalDeriType}
        professionName={professionName}
        professionalEmail={professionalEmail}
        myClinic={myClinic}
      />

      <Footer />
    </>
  );
}
