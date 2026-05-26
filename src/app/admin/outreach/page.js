'use client';

// Outreach pipeline: proactively contacting clinics to onboard them.
// Separate from /admin/clinic-alta (inbound requests from pros).
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken, getAdminUser } from '@/lib/adminClient';
import { ClinicSelector } from '@/components/admin/ClinicPicker';
import '../ops/ops.css';

const STATUS_LABEL = {
  not_contacted: 'Sin contactar',
  contacted: 'Contactada',
  follow_up: 'En seguimiento',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  no_answer: 'Sin respuesta',
  do_not_contact: 'No contactar',
};

const STATUS_COLOR = {
  not_contacted: '#9ca3af',
  contacted: '#0ea5e9',
  follow_up: '#f59e0b',
  accepted: '#10b981',
  rejected: '#ef4444',
  no_answer: '#9333ea',
  do_not_contact: '#6b7280',
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'not_contacted', label: 'Sin contactar' },
  { value: 'contacted', label: 'Contactadas' },
  { value: 'follow_up', label: 'En seguimiento' },
  { value: 'no_answer', label: 'Sin respuesta' },
  { value: 'accepted', label: 'Aceptadas' },
  { value: 'rejected', label: 'Rechazadas' },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function toCsv(rows) {
  const headers = [
    'id', 'clinic_name', 'city', 'province', 'specialties',
    'contact_name', 'contact_phone', 'contact_email',
    'status', 'priority', 'assigned_to',
    'last_contacted_at', 'next_followup_at', 'accepted_at',
    'rejection_reason', 'notes',
  ];
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','));
  }
  return lines.join('\n');
}

export default function ClinicOutreachPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [kpis, setKpis] = useState({});
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchCity, setSearchCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

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
      const qs = new URLSearchParams();
      if (filter !== 'all') qs.set('status', filter);
      if (priorityFilter !== 'all') qs.set('priority', priorityFilter);
      if (searchCity.trim()) qs.set('city', searchCity.trim());
      qs.set('limit', '200');
      const res = await adminFetch(`/api/admin/clinic-outreach?${qs.toString()}`);
      const data = await res.json();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setCounts(data?.counts || {});
      setKpis(data?.kpis || {});
      setTotal(data?.total || 0);
      setMigrationPending(!!data?.migrationPending);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); }, [filter, priorityFilter, user]);

  // Debounced city filter (300ms) so typing doesn't spam the API.
  useEffect(() => {
    if (!user) return;
    const handle = setTimeout(load, 300);
    return () => clearTimeout(handle);
  }, [searchCity]);

  async function patchRow(id, payload, optimistic) {
    setActingId(id);
    setActionError(null);
    try {
      if (optimistic) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...optimistic } : r)));
      }
      const res = await adminFetch(`/api/admin/clinic-outreach/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error');
      // Reload to keep KPIs in sync.
      await load();
    } catch (err) {
      setActionError(err.message);
      await load(); // revert optimistic if it failed
    } finally {
      setActingId(null);
    }
  }

  function downloadCsv() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outreach-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalKpi = Number(kpis.total) || 0;
  const reachedKpi = Number(kpis.reached) || 0;
  const acceptedKpi = Number(kpis.accepted) || 0;
  const rejectedKpi = Number(kpis.rejected) || 0;
  const followUpKpi = Number(kpis.follow_up) || 0;
  const dueNext7d = Number(kpis.due_next_7d) || 0;
  const reachedPct = totalKpi ? Math.round((reachedKpi / totalKpi) * 100) : 0;
  const acceptedPct = reachedKpi ? Math.round((acceptedKpi / reachedKpi) * 100) : 0;

  if (!user) return null;

  return (
    <div className="ops-page">
      <header className="ops-header">
        <div>
          <h1>Outreach a clínicas</h1>
          <p className="ops-subtitle">
            Pipeline proactivo: a quién hay que llamar, qué respondieron, próximos seguimientos.
            {' '}
            <Link href="/admin/clinic-alta" style={{ color: '#1e40af' }}>Solicitudes entrantes →</Link>
          </p>
        </div>
        <div className="ops-header-right">
          <button className="ops-link-btn" onClick={downloadCsv}>⬇ CSV</button>
          <button
            className="ops-link-btn"
            onClick={() => setShowAddModal(true)}
            style={{ background: '#1a3c5e', color: '#fff', borderColor: '#1a3c5e' }}
          >
            + Añadir clínica
          </button>
          <Link href="/admin" className="ops-link-btn">← Admin</Link>
        </div>
      </header>

      {migrationPending && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ La tabla <code>clinic_outreach</code> aún no existe.
          Llama a <code>GET /api/db/setup</code> con el header <code>x-setup-secret</code> para crearla.
        </div>
      )}

      <KpiStrip
        total={totalKpi}
        reached={reachedKpi}
        reachedPct={reachedPct}
        accepted={acceptedKpi}
        acceptedPct={acceptedPct}
        rejected={rejectedKpi}
        followUp={followUpKpi}
        dueNext7d={dueNext7d}
      />

      <div className="ops-filters" style={{ marginTop: 16 }}>
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
        <span style={{ flex: 1 }} />
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
        >
          <option value="all">Todas las prioridades</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>
        <input
          type="text"
          placeholder="Filtrar por ciudad…"
          value={searchCity}
          onChange={(e) => setSearchCity(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 180 }}
        />
      </div>

      {actionError && (
        <div style={{ background: '#fee2e2', color: '#7f1d1d', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {actionError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: '#9ca3af' }}>Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="ops-empty">No hay clínicas con este filtro.</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Clínica</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Ciudad</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Estado</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Prioridad</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Próximo</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Contacto</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#374151' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <OutreachRow
                    key={row.id}
                    row={row}
                    expanded={expandedId === row.id}
                    onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    onAction={(payload, optimistic) => patchRow(row.id, payload, optimistic)}
                    isActing={actingId === row.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280', borderTop: '1px solid #e5e7eb' }}>
            Mostrando {rows.length} de {total} clínicas.
          </div>
        </div>
      )}

      {showAddModal && (
        <AddOutreachModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); load(); }}
        />
      )}
    </div>
  );
}

function KpiStrip({ total, reached, reachedPct, accepted, acceptedPct, rejected, followUp, dueNext7d }) {
  const card = {
    flex: 1,
    minWidth: 140,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '12px 16px',
  };
  const num = { fontSize: 22, fontWeight: 700, color: '#1a3c5e', margin: 0 };
  const lbl = { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 4 };
  const sub = { fontSize: 11, color: '#10b981', marginTop: 2 };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <div style={card}>
        <p style={num}>{total.toLocaleString('es-ES')}</p>
        <p style={lbl}>Total objetivo</p>
      </div>
      <div style={card}>
        <p style={num}>{reached.toLocaleString('es-ES')}</p>
        <p style={lbl}>Contactadas</p>
        <p style={sub}>{reachedPct}% del objetivo</p>
      </div>
      <div style={card}>
        <p style={num}>{accepted.toLocaleString('es-ES')}</p>
        <p style={lbl}>Aceptadas</p>
        <p style={sub}>{acceptedPct}% de las contactadas</p>
      </div>
      <div style={card}>
        <p style={num}>{followUp.toLocaleString('es-ES')}</p>
        <p style={lbl}>En seguimiento</p>
      </div>
      <div style={card}>
        <p style={{ ...num, color: '#ef4444' }}>{rejected.toLocaleString('es-ES')}</p>
        <p style={lbl}>Rechazadas</p>
      </div>
      <div style={card}>
        <p style={{ ...num, color: '#f59e0b' }}>{dueNext7d.toLocaleString('es-ES')}</p>
        <p style={lbl}>Follow-ups próximos 7d</p>
      </div>
    </div>
  );
}

function OutreachRow({ row, expanded, onToggle, onAction, isActing }) {
  const statusBg = STATUS_COLOR[row.status] || '#6b7280';

  return (
    <>
      <tr style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={onToggle}>
        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.clinic_name}</td>
        <td style={{ padding: '10px 12px', color: '#6b7280' }}>{row.city || '—'}</td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{
            background: statusBg,
            color: '#fff',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}>
            {STATUS_LABEL[row.status] || row.status}
          </span>
        </td>
        <td style={{ padding: '10px 12px', color: '#6b7280' }}>
          {row.priority === 'high' ? '🔴 Alta' : row.priority === 'medium' ? '🟡 Media' : '⚪ Baja'}
        </td>
        <td style={{ padding: '10px 12px', color: '#6b7280' }}>
          {fmtDate(row.next_followup_at)}
        </td>
        <td style={{ padding: '10px 12px', color: '#6b7280' }}>
          {row.contact_phone || row.contact_email || '—'}
        </td>
        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
          <span style={{ color: '#9ca3af', fontSize: 11 }}>{expanded ? '▴' : '▾'}</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: 16, background: '#fafbfc', borderBottom: '1px solid #e5e7eb' }}>
            <ExpandedActions row={row} onAction={onAction} isActing={isActing} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedActions({ row, onAction, isActing }) {
  const [notes, setNotes] = useState(row.notes || '');
  const [rejectionReason, setRejectionReason] = useState(row.rejection_reason || '');
  const [followupDate, setFollowupDate] = useState(
    row.next_followup_at ? new Date(row.next_followup_at).toISOString().slice(0, 10) : ''
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>Datos</h4>
        <dl style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>
          <div><strong>Provincia:</strong> {row.province || '—'}</div>
          <div><strong>Especialidades:</strong> {row.specialties || '—'}</div>
          <div><strong>Contacto:</strong> {row.contact_name || '—'}</div>
          <div><strong>Teléfono:</strong> {row.contact_phone ? <a href={`tel:${row.contact_phone}`}>{row.contact_phone}</a> : '—'}</div>
          <div><strong>Email:</strong> {row.contact_email ? <a href={`mailto:${row.contact_email}`}>{row.contact_email}</a> : '—'}</div>
          <div><strong>Asignada a:</strong> {row.assigned_to || '—'}</div>
          <div><strong>Última llamada:</strong> {fmtDateTime(row.last_contacted_at)}</div>
          <div><strong>Aceptada:</strong> {fmtDateTime(row.accepted_at)}</div>
          <div><strong>Origen:</strong> {row.source || '—'}</div>
        </dl>
      </div>
      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>Acciones</h4>
        <label style={{ fontSize: 11, color: '#6b7280' }}>Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}
        />
        <label style={{ fontSize: 11, color: '#6b7280', marginTop: 8, display: 'block' }}>Próximo seguimiento</label>
        <input
          type="date"
          value={followupDate}
          onChange={(e) => setFollowupDate(e.target.value)}
          style={{ padding: 6, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            disabled={isActing}
            onClick={() => onAction({ markContactedNow: true, status: 'contacted', notes }, { status: 'contacted' })}
            style={btnStyle('#0ea5e9')}
          >
            ☎ Marcar contactada
          </button>
          <button
            disabled={isActing}
            onClick={() => onAction({
              status: 'follow_up',
              notes,
              nextFollowupAt: followupDate ? new Date(followupDate).toISOString() : null,
            }, { status: 'follow_up' })}
            style={btnStyle('#f59e0b')}
          >
            ⏰ En seguimiento
          </button>
          <button
            disabled={isActing}
            onClick={() => onAction({ status: 'no_answer', notes }, { status: 'no_answer' })}
            style={btnStyle('#9333ea')}
          >
            🔕 Sin respuesta
          </button>
          <button
            disabled={isActing}
            onClick={() => onAction({ markAcceptedNow: true, notes }, { status: 'accepted' })}
            style={btnStyle('#10b981')}
          >
            ✓ Aceptada
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: '#6b7280' }}>Motivo de rechazo (si rechazas)</label>
          <input
            type="text"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Ej.: ya tiene plataforma propia"
            style={{ width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}
          />
          <button
            disabled={isActing}
            onClick={() => onAction({ status: 'rejected', notes, rejectionReason }, { status: 'rejected' })}
            style={{ ...btnStyle('#ef4444'), marginTop: 6 }}
          >
            ✕ Rechazada
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(color) {
  return {
    background: color,
    color: '#fff',
    border: 'none',
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function AddOutreachModal({ onClose, onCreated }) {
  // Selected clinic from the catalog picker. Until this is non-null the
  // submit button stays disabled — outreach rows must point to a real
  // catalog entry, otherwise we'd be tracking ghost clinics that can never
  // get a `linked_clinic_id`.
  const [clinic, setClinic] = useState(null);
  const [form, setForm] = useState({
    specialties: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    source: 'catalog',
    priority: 'medium',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!clinic) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch('/api/admin/clinic-outreach', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          clinicName: clinic.name,
          city: clinic.city || '',
          province: clinic.province || '',
          linkedClinicId: clinic.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <form onSubmit={submit} style={{
        background: '#fff', borderRadius: 8, padding: 24, width: 'min(560px, 90vw)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Añadir clínica al outreach</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>
          Solo clínicas de nuestro catálogo (3.000+). Búsqueda tolera tildes, mayúsculas, orden de palabras y typos.
        </p>
        {error && <div style={{ background: '#fee2e2', color: '#7f1d1d', padding: 8, borderRadius: 6, marginBottom: 12, fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Clínica *
            </label>
            <ClinicSelector
              selected={clinic}
              onPick={setClinic}
              onClear={() => setClinic(null)}
              placeholder="Buscar en el catálogo de clínicas…"
              modalTitle="Buscar clínica en el catálogo"
              modalHint="Escribe nombre, ciudad o provincia. La búsqueda ignora tildes, mayúsculas y orden de palabras."
            />
          </div>
          <Field label="Especialidades (opcional, separadas por comas)" value={form.specialties} onChange={(v) => setForm({ ...form, specialties: v })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Contacto" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} />
            <Field label="Teléfono" value={form.contactPhone} onChange={(v) => setForm({ ...form, contactPhone: v })} />
          </div>
          <Field label="Email" type="email" value={form.contactEmail} onChange={(v) => setForm({ ...form, contactEmail: v })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Prioridad</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
              >
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
            </div>
            <Field label="Origen" value={form.source} onChange={(v) => setForm({ ...form, source: v })} />
          </div>
          <Field label="Notas" textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} className="ops-link-btn">Cancelar</button>
          <button
            type="submit"
            disabled={saving || !clinic}
            style={{
              background: clinic ? '#1a3c5e' : '#9ca3af',
              color: '#fff', border: 'none', padding: '8px 16px',
              borderRadius: 6, fontWeight: 600,
              cursor: clinic ? 'pointer' : 'not-allowed',
            }}
            title={clinic ? '' : 'Elige primero una clínica del catálogo'}
          >
            {saving ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, textarea = false }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
        />
      )}
    </div>
  );
}
