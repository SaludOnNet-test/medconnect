'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken, getAdminUser } from '@/lib/adminClient';
import '../ops/ops.css';
import './clinics.css';

// Strip accents/diacritics so the local fallback filter matches the
// backend's accent-insensitive search (`Bermúdez` ≈ `bermudez`, `Médico`
// ≈ `medico`). NFD splits each accented char into base + combining mark;
// the regex strips the combining marks.
const stripDiacritics = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
  const [total, setTotal] = useState(0);
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

  // Wrapped in useCallback so the debounce effect below has a stable
  // reference even though the closure reads `search` and `onlyConfig`.
  const load = useCallback(async (q, onlyConfigFlag) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q && q.trim()) qs.set('q', q.trim());
      if (onlyConfigFlag) qs.set('onlyConfig', 'true');
      const res = await adminFetch(`/api/admin/clinics?${qs.toString()}`);
      const j = await res.json();
      setClinics(j.clinics || []);
      setTotal(typeof j.total === 'number' ? j.total : (j.clinics || []).length);
      setMigrationPending(!!j.migrationPending);
      // Seed drafts from server state so unchanged rows render the current
      // value but DON'T overwrite drafts the user is actively editing.
      setDrafts((prev) => {
        const next = { ...prev };
        (j.clinics || []).forEach((c) => {
          if (next[c.id] == null) {
            next[c.id] = {
              notificationEmail: c.notificationEmail || '',
              notificationsEnabled: c.notificationsEnabled,
              partnershipStatus: c.partnershipStatus || 'pending',
              partnershipNotes: c.partnershipNotes || '',
            };
          }
        });
        return next;
      });
    } catch (err) {
      console.error('[admin/clinics] load', err);
    }
    setLoading(false);
  }, []);

  // Debounced server-side refetch on every keystroke. The server runs an
  // accent-insensitive multi-token AND search across name/city/province/
  // address — see /api/admin/clinics for details. 300 ms balances "feels
  // live" against "don't hammer the DB while the user is still typing".
  const debounceRef = useRef(null);
  useEffect(() => {
    if (!me) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load(search, onlyConfig);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [me, search, onlyConfig, load]);

  // Local fallback filter. The server already filtered, but if the user
  // is mid-typing (debounce pending) we render an instant local pre-filter
  // using the same accent-insensitive semantics so the UI never feels stale.
  const visibleClinics = useMemo(() => {
    const term = stripDiacritics(search.trim());
    if (!term) return clinics;
    const tokens = term.split(/\s+/).filter(Boolean);
    return clinics.filter((c) => {
      const haystack = stripDiacritics(
        `${c.name || ''} ${c.city || ''} ${c.province || ''} ${c.address || ''}`,
      );
      return tokens.every((t) => haystack.includes(t));
    });
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
          partnershipStatus: draft.partnershipStatus || 'pending',
          partnershipNotes: draft.partnershipNotes ? draft.partnershipNotes : null,
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
          placeholder="Buscar por nombre, ciudad, provincia o dirección…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="clinics-search"
          autoFocus
        />
        <label className="clinics-toggle-only-config">
          <input
            type="checkbox"
            checked={onlyConfig}
            onChange={(e) => setOnlyConfig(e.target.checked)}
          />
          Solo con correo configurado
        </label>
        <div className="clinics-toolbar-meta">
          {loading ? 'Buscando…' : (
            search.trim()
              ? `${visibleClinics.length} resultado${visibleClinics.length === 1 ? '' : 's'}`
              : `${total.toLocaleString('es-ES')} clínica${total === 1 ? '' : 's'} en total`
          )}
        </div>
      </div>

      <div className="ops-table-wrap" style={{ marginTop: 16 }}>
        <table className="ops-table clinics-table">
          <thead>
            <tr>
              <th>Clínica</th>
              <th>Ciudad</th>
              <th>Email de notificación</th>
              <th>Activado</th>
              <th>Partnership</th>
              <th>Guardar</th>
            </tr>
          </thead>
          <tbody>
            {loading && visibleClinics.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 16, color: '#9ca3af' }}>Cargando…</td></tr>
            ) : visibleClinics.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 16, color: '#9ca3af' }}>
                No hay resultados para <strong>{search}</strong>. Probá con menos palabras o sin tildes.
              </td></tr>
            ) : visibleClinics.map((c) => {
              const draft = drafts[c.id] || {};
              const draftPartnership = draft.partnershipStatus || 'pending';
              const dirty =
                (draft.notificationEmail || '') !== (c.notificationEmail || '') ||
                !!draft.notificationsEnabled !== !!c.notificationsEnabled ||
                draftPartnership !== (c.partnershipStatus || 'pending') ||
                (draft.partnershipNotes || '') !== (c.partnershipNotes || '');
              const partnershipBadgeStyle = (() => {
                if (draftPartnership === 'accepted') return { background: '#dcfce7', color: '#166534' };
                if (draftPartnership === 'rejected') return { background: '#fee2e2', color: '#991b1b' };
                return { background: '#f3f4f6', color: '#374151' };
              })();
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                      <select
                        value={draftPartnership}
                        onChange={(e) => updateDraft(c.id, 'partnershipStatus', e.target.value)}
                        disabled={!isAdmin || busyId === c.id}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid #d1d5db',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          ...partnershipBadgeStyle,
                        }}
                      >
                        <option value="pending">Pendiente</option>
                        <option value="accepted">Aceptó acuerdo</option>
                        <option value="rejected">Rechazó acuerdo</option>
                      </select>
                      <textarea
                        placeholder="Notas (opcional): por qué aceptó/rechazó, próximos pasos…"
                        value={draft.partnershipNotes || ''}
                        onChange={(e) => updateDraft(c.id, 'partnershipNotes', e.target.value)}
                        disabled={!isAdmin || busyId === c.id}
                        rows={2}
                        style={{
                          fontSize: '0.78rem',
                          padding: '4px 6px',
                          borderRadius: 4,
                          border: '1px solid #e5e7eb',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          minHeight: 32,
                        }}
                      />
                      {c.partnershipDecidedAt && (
                        <div className="clinics-row-meta" style={{ fontSize: '0.7rem' }}>
                          Decidido: {new Date(c.partnershipDecidedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      )}
                    </div>
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
