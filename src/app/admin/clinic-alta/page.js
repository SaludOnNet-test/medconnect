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
  cancelled: 'Cancelada',
  more_info_requested: 'Esperando al pro',
};

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'more_info_requested', label: 'Esperando pro' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'all', label: 'Todas' },
];

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ClinicAltaPage() {
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
  const [infoMessageById, setInfoMessageById] = useState({});
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
      const res = await adminFetch(`/api/admin/clinic-alta-requests?status=${filter}`);
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
      const payload = { action };
      if (action === 'request_info') {
        const message = (infoMessageById[id] || '').trim();
        if (!message) {
          throw new Error('Escribe el mensaje al pro antes de solicitar más información.');
        }
        payload.message = message;
      } else {
        payload.opsNotes = opsNotesById[id] || null;
      }
      const res = await adminFetch(`/api/admin/clinic-alta-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
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
          <h1>Solicitudes de alta de clínicas</h1>
          <p className="ops-subtitle">
            Pros que pidieron dar de alta su clínica desde el panel profesional.
            {totalsBadge && <strong> {totalsBadge}.</strong>}
          </p>
        </div>
        <div className="ops-header-right">
          <Link href="/admin/ops" className="ops-link-btn">← Casos</Link>
          <Link href="/admin/users" className="ops-link-btn">Usuarios</Link>
        </div>
      </header>

      {migrationPending && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ La tabla <code>clinic_alta_requests</code> aún no existe.
          Ejecuta <code>scripts/migration_add_clinic_alta_requests.py</code> contra Azure SQL para activarla.
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
                  <h3>{req.clinic_name}</h3>
                  <p className="ops-card-meta">
                    Solicitado por <strong>{req.requested_by_name || req.requested_by_email}</strong>
                    <br />
                    <span style={{ color: '#6b7280' }}>{req.requested_by_email}</span>
                  </p>
                </div>
                <span className={`ops-status status-${req.status}`}>{STATUS_LABEL[req.status] || req.status}</span>
              </header>

              <dl className="ops-detail-grid">
                {req.city && (<><dt>Ciudad</dt><dd>{req.city}</dd></>)}
                {req.province && (<><dt>Provincia</dt><dd>{req.province}</dd></>)}
                {req.address && (<><dt>Dirección</dt><dd>{req.address}</dd></>)}
                {req.telephone && (<><dt>Teléfono</dt><dd>{req.telephone}</dd></>)}
                {req.contact_email && (<><dt>Contacto</dt><dd>{req.contact_email}</dd></>)}
                {req.specialties && (<><dt>Especialidades</dt><dd>{req.specialties}</dd></>)}
                {req.aseguradoras && (<><dt>Aseguradoras</dt><dd>{req.aseguradoras}</dd></>)}
                {req.iban && (<><dt>IBAN</dt><dd style={{ fontFamily: 'monospace' }}>{req.iban}</dd></>)}
                {req.notes && (<><dt>Notas</dt><dd>{req.notes}</dd></>)}
                <dt>Creada</dt><dd>{fmtDate(req.created_at)}</dd>
                {req.resolved_at && (<><dt>Resuelta</dt><dd>{fmtDate(req.resolved_at)} {req.resolved_by ? `(${req.resolved_by})` : ''}</dd></>)}
                {req.linked_clinic_id && (<><dt>Clinic ID</dt><dd>#{req.linked_clinic_id}</dd></>)}
                {req.ops_notes && (<><dt>Notas ops</dt><dd>{req.ops_notes}</dd></>)}
                {req.info_request_message && (
                  <>
                    <dt>Más info pedida</dt>
                    <dd style={{ whiteSpace: 'pre-line', color: '#1e3a8a' }}>
                      {req.info_request_message}
                      {req.info_request_at && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Enviado: {fmtDate(req.info_request_at)}</div>}
                    </dd>
                  </>
                )}
              </dl>

              {(req.status === 'pending' || req.status === 'more_info_requested') && (
                <div className="ops-action-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>
                      Notas para rechazo (visibles al pro si rechazas)
                    </label>
                    <textarea
                      placeholder="Motivo del rechazo…"
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
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>
                      Mensaje al pro (para "Solicitar más información")
                    </label>
                    <textarea
                      placeholder="Ej.: ¿podrías confirmar la dirección exacta y el número de licencia sanitaria?"
                      value={infoMessageById[req.id] || req.info_request_message || ''}
                      onChange={(e) => setInfoMessageById((prev) => ({ ...prev, [req.id]: e.target.value }))}
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
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="ops-action-btn ops-action-success"
                      disabled={actingId === req.id}
                      onClick={() => handleAction(req.id, 'approve')}
                    >
                      {actingId === req.id ? '…' : '✓ Aprobar y crear clínica'}
                    </button>
                    <button
                      className="ops-action-btn"
                      disabled={actingId === req.id}
                      onClick={() => handleAction(req.id, 'request_info')}
                      style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' }}
                    >
                      {actingId === req.id ? '…' : '🔁 Solicitar más información'}
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
