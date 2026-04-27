'use client';

import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// Patient self-service page reached via the link in the booking confirmation
// email. Shows the booking details and lets the patient cancel (with refund)
// or request a reschedule. The token in the URL IS the auth — no login.

export default function BookingTokenPage({ params }) {
  // Next.js 16 — params is a promise.
  const { token } = usePromise(params);

  const [state, setState] = useState({ phase: 'loading' });
  const [reschedulePrefs, setReschedulePrefs] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bookings/by-token/${token}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ phase: 'error', message: data.error || 'No encontrado' });
          return;
        }
        setState({ phase: 'loaded', booking: data });
      } catch (e) {
        if (!cancelled) setState({ phase: 'error', message: 'Error de red' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleCancel() {
    if (!confirm('¿Cancelar la cita y solicitar el reembolso?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/by-token/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'patient_self_service' }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'No se pudo cancelar.');
        return;
      }
      setState({ phase: 'cancelled', refundAmount: data.refundAmount });
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/by-token/${token}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredDates: reschedulePrefs, notes: rescheduleNotes }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'No se pudo enviar la solicitud.');
        return;
      }
      setState((s) => ({ ...s, phase: 'reschedule_sent' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: 'clamp(2rem, 5vw, 3rem) 1.25rem', color: '#374151' }}>
        {state.phase === 'loading' && <p style={{ textAlign: 'center', color: '#8892A4' }}>Cargando…</p>}

        {state.phase === 'error' && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1F2937', marginBottom: '0.5rem' }}>
              Enlace no válido
            </h1>
            <p style={{ color: '#6B7280', marginBottom: '1.5rem' }}>{state.message}</p>
            <Link href="/" style={{ color: '#1F2937', fontWeight: 600 }}>← Volver a la portada</Link>
          </div>
        )}

        {state.phase === 'cancelled' && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }} aria-hidden="true">✓</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0D5E42', marginBottom: '0.75rem' }}>
              Cita cancelada
            </h1>
            <p style={{ color: '#374151', marginBottom: '0.5rem' }}>
              Hemos iniciado el reembolso{state.refundAmount ? ` de €${state.refundAmount.toFixed(2)}` : ''}.
              Verás el cargo revertido en tu tarjeta en 5–10 días hábiles.
            </p>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Te hemos enviado un email con la confirmación.
            </p>
            <Link href="/" style={{ color: '#1F2937', fontWeight: 600 }}>← Volver a la portada</Link>
          </div>
        )}

        {state.phase === 'reschedule_sent' && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }} aria-hidden="true">📨</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1F2937', marginBottom: '0.75rem' }}>
              Solicitud recibida
            </h1>
            <p style={{ color: '#374151', marginBottom: '1.5rem' }}>
              Nuestro equipo te contactará en las próximas <strong>6 horas hábiles</strong> para
              proponerte una nueva fecha que se ajuste a tu disponibilidad.
            </p>
            <Link href="/" style={{ color: '#1F2937', fontWeight: 600 }}>← Volver a la portada</Link>
          </div>
        )}

        {state.phase === 'loaded' && (
          <BookingDetail
            booking={state.booking}
            busy={busy}
            onCancel={handleCancel}
            onReschedule={handleReschedule}
            reschedulePrefs={reschedulePrefs}
            setReschedulePrefs={setReschedulePrefs}
            rescheduleNotes={rescheduleNotes}
            setRescheduleNotes={setRescheduleNotes}
          />
        )}
      </main>
      <Footer />
    </>
  );
}

function BookingDetail({ booking, busy, onCancel, onReschedule, reschedulePrefs, setReschedulePrefs, rescheduleNotes, setRescheduleNotes }) {
  const formattedDate = booking.slotDate
    ? new Date(`${booking.slotDate}T00:00:00`).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—';

  const isTerminal = ['cancelled_by_patient', 'cancelled', 'refunded', 'expired'].includes(booking.status);

  return (
    <>
      <h1 style={{ fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 800, color: '#1F2937', marginBottom: '0.25rem' }}>
        Tu cita
      </h1>
      <p style={{ color: '#8892A4', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Referencia: <code>{booking.id}</code>
      </p>

      <div style={{ background: '#F9FAFB', borderRadius: '12px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <Row k="Centro" v={booking.providerName} />
        <Row k="Fecha" v={formattedDate} />
        <Row k="Hora" v={booking.slotTime || '—'} />
        {booking.procedureName && <Row k="Servicio" v={booking.procedureName} />}
        {booking.amount != null && <Row k="Importe" v={`€${booking.amount.toFixed(2)}`} />}
        <Row k="Estado" v={statusLabel(booking.status)} />
      </div>

      {isTerminal ? (
        <p style={{ color: '#6B7280', fontStyle: 'italic' }}>
          Esta cita ya está {statusLabel(booking.status).toLowerCase()}. Si necesitas algo más,
          escribe a <a href="mailto:operaciones@medconnect.es" style={{ color: '#1F2937', fontWeight: 600 }}>operaciones@medconnect.es</a>.
        </p>
      ) : (
        <>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1F2937', marginBottom: '0.75rem' }}>Cancelar</h2>
          <p style={{ color: '#6B7280', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
            Te devolvemos el importe completo a tu tarjeta. El reembolso aparece en 5–10 días hábiles.
          </p>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '0.7rem 1.25rem', borderRadius: '999px', background: '#C44536',
              color: '#FFFFFF', fontWeight: 600, fontSize: '0.95rem', border: 'none',
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, marginBottom: '2rem',
            }}
          >
            {busy ? 'Procesando…' : 'Cancelar y solicitar reembolso'}
          </button>

          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1F2937', marginBottom: '0.75rem' }}>Cambiar fecha</h2>
          <p style={{ color: '#6B7280', fontSize: '0.95rem', marginBottom: '1rem' }}>
            Cuéntanos qué fechas u horarios te vienen bien y te llamamos en menos de 6 h hábiles para
            coordinar con la clínica.
          </p>
          <form onSubmit={onReschedule}>
            <input
              type="text"
              placeholder="Fechas/horarios preferidos (p.ej. semana del 15, mañanas)"
              value={reschedulePrefs}
              onChange={(e) => setReschedulePrefs(e.target.value)}
              style={{
                width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px',
                border: '1px solid #D0CBC4', fontSize: '0.95rem', marginBottom: '0.75rem',
              }}
            />
            <textarea
              placeholder="Comentarios (opcional)"
              value={rescheduleNotes}
              onChange={(e) => setRescheduleNotes(e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px',
                border: '1px solid #D0CBC4', fontSize: '0.95rem', marginBottom: '0.75rem',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: '0.7rem 1.25rem', borderRadius: '999px', background: '#1F2937',
                color: '#FFFFFF', fontWeight: 600, fontSize: '0.95rem', border: 'none',
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Enviando…' : 'Solicitar nueva fecha'}
            </button>
          </form>
        </>
      )}
    </>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #E8E4DF', fontSize: '0.95rem' }}>
      <span style={{ color: '#6B7280' }}>{k}</span>
      <span style={{ color: '#1F2937', fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function statusLabel(s) {
  const map = {
    confirmed: 'Confirmada',
    awaiting_voucher: 'Pendiente de voucher',
    voucher_sent: 'Voucher enviado',
    cancelled_by_patient: 'Cancelada',
    cancelled: 'Cancelada',
    refunded: 'Reembolsada',
    expired: 'Expirada',
    reschedule_requested: 'Reprogramación solicitada',
    pending_patient_approval: 'Esperando confirmación',
  };
  return map[s] || s;
}
