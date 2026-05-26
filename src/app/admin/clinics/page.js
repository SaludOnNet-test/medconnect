'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken, getAdminUser } from '@/lib/adminClient';
import '../ops/ops.css';
import './clinics.css';

// /admin/clinics
//
// Manages per-clinic notification config:
//   - notification_email (where the sale + cancellation emails go)
//   - notifications_enabled (paused/active toggle)
//
// Edit-in-place table — each row has its own draft state + Save button
// so a wrong tab-away doesn't lose work and ops can edit multiple rows
// in parallel. Mutations require admin role on the backend; ops can view
// the list but the Save button is disabled for non-admins.

export default function AdminClinicsPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyConfig, setOnlyConfig] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);

  // Per-row draft + busy + last-saved state. Keyed by clinic id.
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({});
  const [savedAt, setSavedAt] = useState({});

  useEffect(() => {
    if (!getAdminToken()) router.replace('/admin/login');
    else setMe(getAdminUser());
  }, [router]);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('q', search.trim());
      if (onlyConfig) qs.set('onlyConfig', 'true');
      const res = await adminFetch(`/api/admin/clinics?${qs.toString()}`);
      const j = await res.json();
      setClinics(j.clinics || []);
      setMigrationPending(!!j.migrationPending);
      // Seed drafts from server state so unchanged rows render the current value.
      const seed = {};
      (j.clinics || []).forEach((c) => {
        seed[c.id] = {
          notificationEmail: c.notificationEmail || '',
          notificationsEnabled: c.notificationsEnabled,
        };
      });
      setDrafts(seed);
    } catch (err) {
      console.error('[admin/clinics] load', err);
    }
    setLoading(false);
  };

  useEffect(() => { if (me) load(); }, [me]);

  // Live filter on top of the server response — server filters at name
  // level via @q; we additionally filter by city locally for snappier UX.
  const visibleClinics = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clinics;
    return clinics.filter((c) =>
      (c.name || '').toLowerCase().includes(term) ||
      (c.city || '').toLowerCase().includes(term),
    );
  }, [clinics, search]);

  const updateDraft = (id, field, value) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [field]: value } }));
    setRowError((e) => ({ ...e, [id]: null }));
  };

  const save = async (clinic) => {
    const id = clinic.id;
    const draft = drafts[id] || {};
    setBusyId(id);
    setRowError((e) => ({ ...e, [id]: null }));
    try {
      const res = await adminFetch(`/api/admin/clinics/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          notificationEmail: draft.notificationEmail ? draft.notificationEmail : null,
          notificationsEnabled: !!draft.notificationsEnabled,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setRowError((e) => ({ ...e, [id]: j.error || 'Error al guardar' }));
      } else {
        // Reflect canonical server state back.
        setClinics((prev) => prev.map((c) => (c.id === id ? { ...c, ...j.clinic } : c)));
        setSavedAt((s) => ({ ...s, [id]: Date.now() }));
        setTimeout(() => setSavedAt((s) => ({ ...s, [id]: null })), 2500);
      }
    } catch (err) {
      setRowError((e) => ({ ...e, [id]: err.message }));
    }
    setBusyId(null);
  };

  if (!me) return null;
  const isAdmin = me.role === 'admin';

  return (
    <div className="ops-page">
      <header className="ops-header">
        <div>
          <h1>Notificaciones a clínicas</h1>
          <p className="ops-subtitle">
            Cuando una venta se deriva a una clínica, el correo indicado abajo recibe
            los datos del paciente, la consulta y los importes. Aplica también a
            cancelaciones y reembolsos.
          </p>
        </div>
        <div className="ops-header-right">
          <Link href="/admin/ops" className="ops-link-btn">← Casos</Link>
        </div>
      </header>

      {migrationPending && (
        <div className="clinics-banner clinics-banner-warn">
          La base de datos todavía no tiene las columnas de configuración. Llama a
          <code> /api/db/setup</code> con <code>DB_SETUP_SECRET</code> para activarlas.
        </div>
      )}

      {!isAdmin && (
        <div className="clinics-banner clinics-banner-info">
          Solo el rol <strong>admin</strong> puede modificar la configuración. Tu rol es <strong>{me.role}</strong>.
        </div>
      )}

      <div className="clinics-toolbar">
        <input
          type="search"
          placeholder="Buscar por nombre o ciudad…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="clinics-search"
        />
        <label className="clinics-toggle-only-config">
          <input
            type="checkbox"
            checked={onlyConfig}
            onChange={(e) => { setOnlyConfig(e.target.checked); }}
            onBlur={load}
          />
          Solo con correo configurado
        </label>
        <button type="button" className="ops-action-btn" onClick={load} disabled={loading}>
          {loading ? 'Cargando…' : 'Refrescar'}
        </button>
      </div>

      <div className="ops-table-wrap" style={{ marginTop: 16 }}>
        <table className="ops-table clinics-table">
          <thead>
            <tr>
              <th>Clínica</th>
              <th>Ciudad</th>
              <th>Email de notificación</th>
              <th>Activado</th>
              <th>Guardar</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 16, color: '#9ca3af' }}>Cargando…</td></tr>
            ) : visibleClinics.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 16, color: '#9ca3af' }}>
                No hay resultados.
              </td></tr>
            ) : visibleClinics.map((c) => {
              const draft = drafts[c.id] || {};
              const dirty =
                (draft.notificationEmail || '') !== (c.notificationEmail || '') ||
                !!draft.notificationsEnabled !== !!c.notificationsEnabled;
              return (
                <tr key={c.id} className={c.notificationEmail ? 'clinics-row-configured' : ''}>
                  <td><strong>{c.name}</strong><div className="clinics-row-meta">ID {c.id}</div></td>
                  <td>{c.city || '—'}</td>
                  <td>
                    <input
                      type="email"
                      placeholder="ej. recepcion@clinica.es"
                      value={draft.notificationEmail || ''}
                      onChange={(e) => updateDraft(c.id, 'notificationEmail', e.target.value)}
                      disabled={!isAdmin || busyId === c.id}
                      className="clinics-email-input"
                    />
                    {rowError[c.id] && (
                      <div className="clinics-row-error">{rowError[c.id]}</div>
                    )}
                  </td>
                  <td>
                    <label className="clinics-toggle">
                      <input
                        type="checkbox"
                        checked={!!draft.notificationsEnabled}
                        onChange={(e) => updateDraft(c.id, 'notificationsEnabled', e.target.checked)}
                        disabled={!isAdmin || busyId === c.id}
                      />
                      <span>{draft.notificationsEnabled ? 'ON' : 'OFF'}</span>
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ops-action-btn ops-action-success"
                      disabled={!isAdmin || !dirty || busyId === c.id}
                      onClick={() => save(c)}
                    >
                      {busyId === c.id ? 'Guardando…' : savedAt[c.id] ? '✓ Guardado' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
