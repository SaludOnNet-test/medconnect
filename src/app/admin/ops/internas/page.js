'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken, getAdminUser } from '@/lib/adminClient';
import '../ops.css';

const STATUS_LABEL = {
  pending: 'Lock-in pendiente',
  data_completed: 'Datos completados',
  payment_pending: 'Esperando pago',
  confirmed: 'Confirmada',
  expired: 'Expirada',
  cancelled: 'Cancelada',
  incident: 'Incidencia',
};

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'pending', label: 'Lock-in pendiente' },
  { value: 'expired', label: 'Expiradas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'incident', label: 'Incidencias' },
];

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtCita(date, time) {
  if (!date) return '—';
  const d = new Date(date + 'T00:00:00');
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${time || ''}`;
}

export default function InternalReferralsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [marking, setMarking] = useState(null); // referral id being marked as incident

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace('/admin/login');
      return;
    }
    setUser(getAdminUser());
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/admin/referrals/internal?status=${filter}` : '/api/admin/referrals/internal';
      const res = await adminFetch(url);
      const j = await res.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { if (user) load(); }, [filter, user, load]);

  const markIncident = async (id) => {
    if (!window.confirm('Marcar esta derivación como incidencia? Aparecerá en el filtro "Incidencias".')) return;
    setMarking(id);
    try {
      const res = await adminFetch(`/api/referrals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'incident' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || 'No se pudo marcar como incidencia');
      } else {
        await load();
      }
    } catch (err) {
      alert(err.message);
    }
    setMarking(null);
  };

  if (!user) return null;

  return (
    <div className="ops-page">
      <header className="ops-header">
        <div>
          <h1>Derivaciones internas</h1>
          <p className="ops-subtitle">
            Estas derivaciones <strong>no requieren acción de Ops</strong> — la clínica deriva y atiende a la vez.
            Las listamos aquí por si surge incidencia (paciente cancela, clínica no atiende, paciente
            reclama). Para marcar una como incidencia, pulsa el botón al final de la fila.
          </p>
        </div>
        <div className="ops-header-right">
          <span className="ops-user">👤 {user.displayName || user.username}</span>
          <Link href="/admin/ops" className="ops-link-btn">← Casos directos</Link>
        </div>
      </header>

      <div className="ops-filters">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`ops-filter ${filter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
        <button className="ops-link-btn" onClick={load} style={{ marginLeft: 'auto' }}>↻ Refrescar</button>
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', padding: 24 }}>Cargando derivaciones internas…</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#9ca3af', padding: 24 }}>No hay derivaciones internas en este filtro.</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Paciente</th>
                <th>Derivador (clínica · pro)</th>
                <th>Destino</th>
                <th>Cita</th>
                <th>Prioridad</th>
                <th>Actualizada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="ops-row">
                  <td>
                    <span className={`ops-status ops-status-${r.state}`}>
                      {STATUS_LABEL[r.state] || r.state}
                    </span>
                  </td>
                  <td><div className="ops-patient-meta">{r.patient_email || '—'}</div></td>
                  <td>
                    <div>{r.derivador_clinic_name || '—'}</div>
                    <div className="ops-patient-meta">{r.professional_email}</div>
                  </td>
                  <td>
                    <div>{r.provider_name || `#${r.provider_id || '—'}`}</div>
                    <div className="ops-patient-meta">{r.specialty || ''}</div>
                  </td>
                  <td>{fmtCita(r.slot_date, r.slot_time)}</td>
                  <td>€{Number(r.fee || 0).toFixed(2)}</td>
                  <td>{fmtDate(r.updated_at || r.created_at)}</td>
                  <td>
                    {r.state !== 'incident' && (
                      <button
                        className="ops-link-btn"
                        onClick={() => markIncident(r.id)}
                        disabled={marking === r.id}
                        style={{ fontSize: 12, color: '#7c2d12' }}
                      >
                        {marking === r.id ? '…' : '⚠️ Marcar incidencia'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
