'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function BookingRespondInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const decision = searchParams.get('decision');
  const [state, setState] = useState({ loading: true, ok: false, payload: null, error: null });

  useEffect(() => {
    if (!token || !decision) {
      setState({ loading: false, ok: false, error: 'Enlace inválido. Falta token o decisión.', payload: null });
      return;
    }
    fetch(`/api/ops/respond?token=${encodeURIComponent(token)}&decision=${encodeURIComponent(decision)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setState({ loading: false, ok: false, error: j.error || 'Error procesando tu respuesta', payload: null });
        } else {
          setState({ loading: false, ok: true, error: null, payload: j });
        }
      })
      .catch((err) => setState({ loading: false, ok: false, error: err.message, payload: null }));
  }, [token, decision]);

  const card = (title, body, color = '#1a3c5e') => (
    <div style={{
      maxWidth: 560, margin: '60px auto', padding: '32px 28px', background: '#fff',
      borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      fontFamily: '"Segoe UI",Arial,sans-serif',
    }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 24, color, fontWeight: 800 }}>{title}</h1>
      <div style={{ fontSize: 15, color: '#374151', lineHeight: 1.6 }}>{body}</div>
    </div>
  );

  if (state.loading) {
    return card('Procesando tu respuesta…', <p>Un momento, estamos actualizando tu cita.</p>);
  }
  if (state.error) {
    return card('No pudimos procesar tu enlace', <p>{state.error}</p>, '#b91c1c');
  }

  const p = state.payload || {};

  if (p.already === 'confirmed') {
    return card('Esta cita ya estaba confirmada', <p>Te esperamos en la clínica. Si tienes dudas, escríbenos a <a href="mailto:operaciones@medconnect.es">operaciones@medconnect.es</a>.</p>, '#0d5e42');
  }
  if (p.already === 'refunded') {
    return card('Esta cita ya fue reembolsada', <p>El importe ya fue devuelto a tu tarjeta. Verás el ingreso en 1–2 días hábiles.</p>, '#7c2d12');
  }

  if (p.decision === 'accepted') {
    const dt = p.date ? new Date(p.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : p.date;
    return card('¡Cita confirmada! ✓', <>
      <p>Te confirmamos tu cita con <strong>{p.clinic}</strong> el <strong>{dt} a las {p.time}</strong>.</p>
      <p style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>Te enviamos un email de confirmación con todos los detalles.</p>
    </>, '#0d5e42');
  }
  if (p.decision === 'rejected') {
    return card('Reembolso emitido', <>
      <p>Hemos iniciado el reembolso de <strong>€{Number(p.refundAmount || 0).toFixed(2)}</strong> a tu tarjeta.</p>
      <p>Verás el ingreso en 1–2 días hábiles. Lamentamos las molestias.</p>
    </>, '#7c2d12');
  }

  return card('Recibido', <p>Tu respuesta fue registrada.</p>);
}

export default function BookingRespondPage() {
  return (
    <Suspense fallback={null}>
      <BookingRespondInner />
    </Suspense>
  );
}
