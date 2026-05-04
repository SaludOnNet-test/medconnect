'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken } from '@/lib/adminClient';
import '../ops/ops.css';

/**
 * /admin/reviews — read-only audit view of post-cita reviews.
 *
 * Mirrors the visual pattern of /admin/users + /admin/ops. Stats strip
 * up top (count, 5-star %, Trustpilot click-through, averages). Filters
 * by rating bucket + time window. Table rows link to the booking's
 * underlying ops case so an admin can jump from a bad review back to
 * the case that produced it.
 *
 * Per the plan: this is read-only for MVP. Edits / takedowns happen via
 * SQL with audit log (out of scope for MVP UI).
 */
export default function AdminReviewsPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | positive | negative
  const [since, setSince] = useState('all');   // all | week | month

  useEffect(() => {
    if (!getAdminToken()) router.replace('/admin/login');
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ filter, since, limit: '100' });
        const res = await adminFetch(`/api/admin/reviews?${params.toString()}`);
        const j = await res.json();
        if (cancelled) return;
        setStats(j.stats || null);
        setReviews(j.reviews || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter, since]);

  return (
    <div className="ops-detail">
      <Link href="/admin/ops" className="ops-back-link">← Volver al panel</Link>
      <h1 style={{ margin: '4px 0 16px', fontSize: 24, color: '#1a3c5e', fontWeight: 800 }}>
        Reseñas de pacientes
      </h1>

      {stats && (
        <div className="ops-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Stat label="Total reseñas" value={stats.total} />
          <Stat label="5 estrellas Med Connect" value={`${stats.fiveStarMc} (${pct(stats.fiveStarMc, stats.total)})`} />
          <Stat label="Click a Trustpilot" value={`${stats.trustpilotClicked} (${pct(stats.trustpilotClicked, stats.fiveStarMc)} de 5★)`} />
          <Stat label="Promedio Med Connect" value={stats.avgMc != null ? `${stats.avgMc.toFixed(2)} / 5` : '—'} />
          <Stat label="Promedio clínica" value={stats.avgClinic != null ? `${stats.avgClinic.toFixed(2)} / 5` : '—'} />
        </div>
      )}

      <div className="ops-filters" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select label="Rating" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'Todas' },
          { value: 'positive', label: '4-5 estrellas' },
          { value: 'negative', label: '1-2 estrellas' },
        ]} />
        <Select label="Período" value={since} onChange={setSince} options={[
          { value: 'all', label: 'Todo' },
          { value: 'week', label: 'Última semana' },
          { value: 'month', label: 'Último mes' },
        ]} />
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : reviews.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Sin reseñas con estos filtros.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="ops-table" style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <Th>Fecha</Th>
                <Th>MC</Th>
                <Th>Clínica</Th>
                <Th>Comentario MC</Th>
                <Th>Comentario clínica</Th>
                <Th>Clínica</Th>
                <Th>Especialidad</Th>
                <Th>Cita</Th>
                <Th>TP</Th>
                <Th>Caso</Th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <Td>{fmtDate(r.submittedAt)}</Td>
                  <Td><Stars value={r.ratingMedconnect} /></Td>
                  <Td>{r.ratingClinic ? <Stars value={r.ratingClinic} /> : <span style={{ color: '#9ca3af' }}>—</span>}</Td>
                  <Td><Truncate text={r.commentMedconnect} max={80} /></Td>
                  <Td><Truncate text={r.commentClinic} max={80} /></Td>
                  <Td>{r.providerName}</Td>
                  <Td>{r.specialty || '—'}</Td>
                  <Td>{r.slotDate ? `${r.slotDate} ${r.slotTime || ''}` : '—'}</Td>
                  <Td>{r.trustpilotClicked ? '✓' : <span style={{ color: '#9ca3af' }}>—</span>}</Td>
                  <Td>
                    <Link
                      href={`/admin/ops?bookingId=${encodeURIComponent(r.bookingId)}`}
                      style={{ color: '#1a3c5e', fontFamily: 'monospace', fontSize: 11 }}
                    >
                      {r.bookingId.slice(0, 12)}…
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="ops-card" style={{ padding: 12 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.05, color: '#6b7280', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1a3c5e', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6b7280' }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Th({ children }) {
  return <th style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#374151' }}>{children}</th>;
}

function Td({ children }) {
  return <td style={{ padding: '8px 10px', fontSize: 13, verticalAlign: 'top' }}>{children}</td>;
}

function Stars({ value }) {
  return (
    <span style={{ color: '#c9a84c', letterSpacing: 1, fontSize: 14, whiteSpace: 'nowrap' }}>
      {'★'.repeat(value)}<span style={{ color: '#e5e7eb' }}>{'★'.repeat(5 - value)}</span>
    </span>
  );
}

function Truncate({ text, max }) {
  if (!text) return <span style={{ color: '#9ca3af' }}>—</span>;
  if (text.length <= max) return <span>{text}</span>;
  return <span title={text}>{text.slice(0, max)}…</span>;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function pct(num, total) {
  if (!total) return '0%';
  return `${Math.round((num / total) * 100)}%`;
}
