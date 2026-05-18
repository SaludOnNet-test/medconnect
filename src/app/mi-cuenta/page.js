'use client';

/**
 * /mi-cuenta
 *
 * Patient self-service home. Lists every booking linked to the signed-in
 * Clerk account — see /api/bookings/mine for how the link is resolved
 * (clerk_user_id OR verified-email match).
 *
 * This page is the destination of the "Crear mi cuenta" CTA on /book's
 * success screen. When a patient signs up after a guest checkout, the
 * Clerk webhook backfills any existing bookings with their verified
 * email, so the first /mi-cuenta visit is never empty.
 *
 * Auth gate: when the user is not signed in we render a friendly
 * sign-in / sign-up prompt instead of bouncing — patients often arrive
 * here by following an email link without knowing they need to log in.
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/icons/Icon';
import { formatEUR } from '@/lib/format';
import { useUserSafe } from '@/lib/clerkSafe';

function MiCuentaInner() {
  const { isSignedIn, user, isLoaded } = useUserSafe();
  const [bookings, setBookings] = useState(null); // null = loading, [] = empty, [...] = data
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setBookings([]);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/bookings/mine');
        if (!res.ok) {
          if (!cancelled) setError(`Error ${res.status}`);
          return;
        }
        const json = await res.json();
        if (!cancelled) setBookings(json.bookings || []);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Network error');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  // ── Not signed in ────────────────────────────────────────────────
  if (isLoaded && !isSignedIn) {
    return (
      <>
        <Header />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-7) var(--space-md)' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-md)' }}>
            Mi cuenta
          </h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: '1rem', lineHeight: 1.6, marginBottom: 'var(--space-md)' }}>
            Inicia sesión para ver todas las reservas que has hecho con tu email.
            Si reservaste como invitado, las verás aquí en cuanto crees una cuenta
            con el mismo email que usaste para la reserva.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <Link href="/sign-in" className="btn btn-gold btn-lg">Iniciar sesión</Link>
            <Link href="/sign-up" className="btn btn-outline btn-lg">Crear cuenta</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // ── Loading / not yet loaded ─────────────────────────────────────
  if (!isLoaded || bookings === null) {
    return (
      <>
        <Header />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-7) var(--space-md)' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-md)' }}>
            Mi cuenta
          </h1>
          <p style={{ color: 'var(--fg-muted)' }}>Cargando tus reservas…</p>
        </main>
        <Footer />
      </>
    );
  }

  const userName =
    user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || '';

  return (
    <>
      <Header />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-7) var(--space-md)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-sm)' }}>
          Hola{userName ? `, ${userName}` : ''}
        </h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: '0.95rem', marginBottom: 'var(--space-lg)' }}>
          Estas son las reservas que tienes asociadas a tu email.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: 'var(--space-md)' }}>
            No pudimos cargar tus reservas: {error}. Por favor recarga la página.
          </div>
        )}

        {bookings.length === 0 ? (
          <div className="book-summary-card" style={{ textAlign: 'center', padding: 'var(--space-7)' }}>
            <p style={{ marginBottom: 'var(--space-md)', color: 'var(--fg-muted)' }}>
              Aún no tienes reservas con este email.
            </p>
            <Link href="/search-v2" className="btn btn-gold">
              Buscar una cita prioritaria
            </Link>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-md)' }}>
            {bookings.map((b) => {
              const dateLabel = b.slotDate
                ? new Date(b.slotDate + 'T00:00:00').toLocaleDateString('es-ES', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })
                : '';
              return (
                <li
                  key={b.id}
                  className="book-summary-card"
                  style={{ padding: 'var(--space-md) var(--space-lg)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--fg)' }}>
                        {b.providerName || 'Centro médico'}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--fg-muted)', marginTop: 4 }}>
                        {b.procedureName || b.specialty || 'Consulta médica'}
                      </div>
                    </div>
                    <StatusChip status={b.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', marginTop: 'var(--space-sm)', fontSize: '0.92rem', color: 'var(--fg)' }}>
                    <span><Icon name="calendar" size={14} /> {dateLabel}</span>
                    <span><Icon name="clock" size={14} /> {b.slotTime}</span>
                    {b.amount != null && (
                      <span><Icon name="info" size={14} /> {formatEUR(b.amount)}</span>
                    )}
                  </div>
                  {b.selfServiceToken && (
                    <div style={{ marginTop: 'var(--space-sm)' }}>
                      <Link
                        href={`/booking/${b.selfServiceToken}`}
                        style={{ fontSize: '0.85rem', color: 'var(--gold)', textDecoration: 'underline' }}
                      >
                        Gestionar (cancelar o pedir cambio)
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <Footer />
    </>
  );
}

function StatusChip({ status }) {
  const map = {
    confirmed: { label: 'Confirmada', bg: '#dcfce7', fg: '#15803d' },
    awaiting_voucher: { label: 'Pendiente voucher', bg: '#fef3c7', fg: '#92400e' },
    cancelled: { label: 'Cancelada', bg: '#f3f4f6', fg: '#6b7280' },
    cancelled_refunded: { label: 'Cancelada · reembolso emitido', bg: '#f3f4f6', fg: '#6b7280' },
    cancelled_partial_refund: { label: 'Cancelada · reembolso parcial', bg: '#fef3c7', fg: '#92400e' },
    no_show: { label: 'No show', bg: '#fee2e2', fg: '#991b1b' },
  };
  const cfg = map[status] || { label: status || '—', bg: '#f3f4f6', fg: '#6b7280' };
  return (
    <span style={{
      background: cfg.bg,
      color: cfg.fg,
      padding: '4px 10px',
      borderRadius: 999,
      fontSize: '0.75rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    }}>
      {cfg.label}
    </span>
  );
}

export default function MiCuentaPage() {
  return (
    <Suspense fallback={null}>
      <MiCuentaInner />
    </Suspense>
  );
}
