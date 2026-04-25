'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, getAdminToken, getAdminUser } from '@/lib/adminClient';
import '../ops/ops.css';

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('ops');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getAdminToken()) router.replace('/admin/login');
    else setMe(getAdminUser());
  }, [router]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/users');
      const j = await res.json();
      setUsers(j.users || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };
  useEffect(() => { if (me) load(); }, [me]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, displayName, role }),
      });
      const j = await res.json();
      if (!res.ok) setError(j.error || 'Error creando usuario');
      else {
        setUsername(''); setPassword(''); setDisplayName(''); setRole('ops');
        await load();
      }
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  if (!me) return null;

  return (
    <div className="ops-page">
      <header className="ops-header">
        <div>
          <h1>Usuarios del panel</h1>
          <p className="ops-subtitle">Gestiona quién puede entrar al dashboard.</p>
        </div>
        <div className="ops-header-right">
          <Link href="/admin/ops" className="ops-link-btn">← Casos</Link>
        </div>
      </header>

      {me.role !== 'admin' && (
        <div style={{ background: '#fee2e2', color: '#7f1d1d', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          Solo el rol "admin" puede crear usuarios. Tu rol es <strong>{me.role}</strong>.
        </div>
      )}

      {me.role === 'admin' && (
        <div className="ops-card" style={{ maxWidth: 560 }}>
          <h2>Crear nuevo usuario</h2>
          <form onSubmit={create} className="ops-form" style={{ background: 'transparent', border: 0, padding: 0 }}>
            <div className="ops-form-row">
              <input type="text" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
              <input type="password" placeholder="Contraseña (mín. 6)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="ops-form-row">
              <input type="text" placeholder="Nombre visible" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="ops">ops (operador)</option>
                <option value="admin">admin (puede crear usuarios)</option>
              </select>
            </div>
            {error && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 6 }}>{error}</div>}
            <button type="submit" className="ops-action-btn ops-action-success" disabled={busy} style={{ marginTop: 8 }}>
              {busy ? 'Creando…' : 'Crear usuario'}
            </button>
          </form>
        </div>
      )}

      <div className="ops-table-wrap" style={{ marginTop: 24 }}>
        <table className="ops-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Activo</th>
              <th>Creado</th>
              <th>Último login</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 16, color: '#9ca3af' }}>Cargando…</td></tr>
            ) : users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.username}</strong></td>
                <td>{u.display_name || '—'}</td>
                <td>{u.role}</td>
                <td>{u.is_active ? '✓' : '✕'}</td>
                <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES') : '—'}</td>
                <td>{u.last_login ? new Date(u.last_login).toLocaleString('es-ES') : 'Nunca'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
