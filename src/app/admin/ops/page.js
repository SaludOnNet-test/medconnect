'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken, getAdminUser, clearAdminSession } from '@/lib/adminClient';
import './ops.css';

const STATUS_LABEL = {
  pending_call: 'Pendiente de llamada',
  clinic_accepted: 'Clínica aceptó',
  clinic_proposed_alternative: 'Clínica propuso alternativa',
  clinic_rejected_searching: 'Buscando otra clínica',
  alternative_clinic_proposed: 'Alternativa propuesta',
  patient_accepted: 'Paciente aceptó',
  patient_rejected_refunding: 'Reembolsando',
  no_alternative_refunding: 'Reembolsando',
  confirmed: 'Confirmada',
  refunded: 'Reembolsada',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending_call', label: 'Pendientes' },
  { value: 'clinic_proposed_alternative', label: 'Esperando paciente (alt. clínica)' },
  { value: 'alternative_clinic_proposed', label: 'Esperando paciente (alt. nueva)' },
  { value: 'clinic_rejected_searching', label: 'Buscando alternativa' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'refunded', label: 'Reembolsados' },
];

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function OpsDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending_call');

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace('/admin/login');
      return;
    }
    setUser(getAdminUser());
  }, [router]);

  const load = async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/ops/cases?status=${filter}` : '/api/ops/cases';
      const res = await adminFetch(url);
      const j = await res.json();
      setCases(j.cases || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [filter, user]);

  const counts = useMemo(() => {
    const c = {};
    cases.forEach((x) => { c[x.status] = (c[x.status] || 0) + 1; });
    return c;
  }, [cases]);

  const handleLogout = () => { clearAdminSession(); router.replace('/admin/login'); };

  if (!user) return null;

  return (
    <div className="ops-page">
      <header className="ops-header">
        <div>
          <h1>Operaciones — Casos</h1>
          <p className="ops-subtitle">Gestiona cada venta llamando a la clínica.</p>
        </div>
        <div className="ops-header-right">
          <span className="ops-user">👤 {user.displayName || user.username}</span>
          {user.role === 'admin' && <Link href="/admin/users" className="ops-link-btn">Usuarios</Link>}
          <button className="ops-link-btn" onClick={handleLogout}>Salir</button>
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
            {f.value && counts[f.value] != null ? <span className="ops-count">{counts[f.value]}</span> : null}
          </button>
        ))}
        <button className="ops-link-btn" onClick={load} style={{ marginLeft: 'auto' }}>↻ Refrescar</button>
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', padding: 24 }}>Cargando casos…</p>
      ) : cases.length === 0 ? (
        <p style={{ color: '#9ca3af', padding: 24 }}>No hay casos en este filtro.</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Estado</th>
                <th>Paciente</th>
                <th>Clínica</th>
                <th>Cita</th>
                <th>Importe / Pago clínica</th>
                <th>Asignado</th>
                <th>Creado</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} onClick={() => router.push(`/admin/ops/${c.id}`)} className="ops-row">
                  <td>{c.id}</td>
                  <td><span className={`ops-status ops-status-${c.status}`}>{STATUS_LABEL[c.status] || c.status}</span></td>
                  <td>
                    <div className="ops-patient-name">{c.patient_name || '—'}</div>
                    <div className="ops-patient-meta">{c.insurance_company || (c.has_insurance ? 'Asegurado' : 'Sin seguro')}</div>
                  </td>
                  <td>
                    <div>{c.original_clinic_name}</div>
                    <div className="ops-patient-meta">{c.specialty || ''}</div>
                  </td>
                  <td>{c.original_slot_date} · {c.original_slot_time}</td>
                  <td>€{Number(c.amount_paid || 0).toFixed(2)} / €{Number(c.payment_to_clinic || 0).toFixed(2)} · T{c.tier || '—'}</td>
                  <td>{c.assigned_to || '—'}</td>
                  <td>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
