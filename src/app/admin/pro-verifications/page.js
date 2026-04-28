'use client';

// Auth-gated admin page — never statically prerendered.
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken, getAdminUser } from '@/lib/adminClient';
import '../ops/ops.css';

const STATUS_LABEL = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'all', label: 'Todas' },
];

const PROFILE_LABEL = {
  doctor: 'Médico individual',
  clinic: 'Clínica',
};

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fileNameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').pop() || 'documento';
    return decodeURIComponent(last);
  } catch {
    return 'documento';
  }
}

export default function ProVerificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);

  // Per-row UI state
  const [actingId, setActingId] = useState(null);
  const [opsNotesById, setOpsNotesById] = useState({});
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace('/admin/login');
      return;
    }
    setUser(getAdminUser());
  }, [router]);

  const load = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await adminFetch(`/api/admin/pro-verifications?status=${filter}`);
      const data = await res.json();
      setRequests(Array.isArray(data?.requests) ? data.requests : []);
      setCounts(data?.counts || {});
      setMigrationPending(!!data?.migrationPending);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); }, [filter, user]);

  async function handleAction(id, action) {
    setActingId(id);
    setActionError(null);
    try {
      const opsNotes = opsNotesById[id] || null;
      const res = await adminFetch(`/api/admin/pro-verifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, opsNotes }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Error procesando la solicitud');
      }
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  const totalsBadge = useMemo(() => {
    const pending = counts.pending || 0;
    return pending > 0 ? `${pending} pendiente${pending === 1 ? '' : 's'}` : null;
  }, [counts]);

  if (!user) return null;

  return (
    <div className="ops-page">
      <header className="ops-header">
        <div>
          <h1>Verificaciones de pros</h1>
          <p className="ops-subtitle">
            Pros que enviaron documentación para verificar su cuenta.
            {totalsBadge && <strong> {totalsBadge}.</strong>}
          </p>
        </div>
        <div className="ops-header-right">
          <Link href="/admin/ops" className="ops-link-btn">← Casos</Link>
          <Link href="/admin/clinic-alta" className="ops-link-btn">Altas clínicas</Link>
        </div>
      </header>

      {migrationPending && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ La tabla <code>pro_verification_requests</code> aún no existe.
          Ejecuta <code>scripts/migration_add_pro_verification.py</code> contra Azure SQL para activarla.
        </div>
      )}

      <div className="ops-filters">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`ops-filter ${filter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {f.value !== 'all' && counts[f.value] != null && counts[f.value] > 0 && (
              <span className="ops-count">{counts[f.value]}</span>
            )}
          </button>
        ))}
      </div>

      {actionError && (
        <div style={{ background: '#fee2e2', color: '#7f1d1d', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {actionError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: '#9ca3af' }}>Cargando…</div>
      ) : requests.length === 0 ? (
        <div className="ops-empty">No hay solicitudes con este filtro.</div>
      ) : (
        <div className="ops-grid">
          {requests.map((req) => (
            <article key={req.id} className="ops-card">
              <header className="ops-card-header">
                <div>
                  <h3>{req.full_name || req.clinic_name || req.requested_by_email}</h3>
                  <p className="ops-card-meta">
                    {PROFILE_LABEL[req.profile_type] || req.profile_type}
                    <br />
                    <span style={{ color: '#6b7280' }}>{req.requested_by_email}</span>
                  </p>
                </div>
                <span className={`ops-status status-${req.status}`}>{STATUS_LABEL[req.status] || req.status}</span>
              </header>

              <dl className="ops-detail-grid">
                {req.profile_type === 'doctor' && req.full_name && (<><dt>Nombre completo</dt><dd>{req.full_name}</dd></>)}
                {req.profile_type === 'doctor' && req.license_number && (<><dt>Nº colegiado</dt><dd>{req.license_number}</dd></>)}
                {req.profile_type === 'clinic' && req.clinic_name && (<><dt>Razón social</dt><dd>{req.clinic_name}</dd></>)}
                {req.tax_id && (<><dt>CIF/NIF</dt><dd>{req.tax_id}</dd></>)}
                {req.notes && (<><dt>Notas pro</dt><dd>{req.notes}</dd></>)}
                <dt>Documentos</dt>
                <dd>
                  {Array.isArray(req.documentUrls) && req.documentUrls.length > 0 ? (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {req.documentUrls.map((url, i) => (
                        <li key={i}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#1a3c5e', fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }}
                          >
                            📎 {fileNameFromUrl(url)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>Sin archivos</span>
                  )}
                </dd>
                <dt>Creada</dt><dd>{fmtDate(req.created_at)}</dd>
                {req.resolved_at && (<><dt>Resuelta</dt><dd>{fmtDate(req.resolved_at)} {req.resolved_by ? `(${req.resolved_by})` : ''}</dd></>)}
                {req.ops_notes && (<><dt>Notas ops</dt><dd>{req.ops_notes}</dd></>)}
              </dl>

              {req.status === 'pending' && (
                <div className="ops-action-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <textarea
                    placeholder="Notas internas (visibles para el solicitante si rechazas)"
                    value={opsNotesById[req.id] || ''}
                    onChange={(e) => setOpsNotesById((prev) => ({ ...prev, [req.id]: e.target.value }))}
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      fontFamily: 'inherit',
                      fontSize: 13,
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="ops-action-btn ops-action-success"
                      disabled={actingId === req.id}
                      onClick={() => handleAction(req.id, 'approve')}
                    >
                      {actingId === req.id ? '…' : '✓ Aprobar verificación'}
                    </button>
                    <button
                      className="ops-action-btn ops-action-danger"
                      disabled={actingId === req.id}
                      onClick={() => handleAction(req.id, 'reject')}
                    >
                      {actingId === req.id ? '…' : '✕ Rechazar'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
