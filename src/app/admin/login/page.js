'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminLogin, getAdminToken } from '@/lib/adminClient';
import '../admin.css';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (getAdminToken()) router.replace('/admin/ops');
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await adminLogin(username, password);
      router.replace('/admin/ops');
    } catch (err) {
      setError(err.message || 'Credenciales inválidas');
      setPassword('');
    }
    setIsLoading(false);
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <h1>Med Connect — Operaciones</h1>
          <p>Panel de control</p>
        </div>

        <form onSubmit={handleLogin} className="admin-login-form">
          <div className="form-group">
            <label htmlFor="username">Usuario</label>
            {/* No `placeholder` here on purpose — the previous "Admin"
                placeholder leaked the seed credentials to anyone who
                opened the page in a fresh browser. The label above the
                input is enough orientation. */}
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
              required
              disabled={isLoading}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              required
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="admin-error-message">{error}</div>}

          <button type="submit" className="btn-primary admin-login-btn" disabled={isLoading}>
            {isLoading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        {/* The previous version of this page rendered a grey hint block
            with the literal default credentials ("Admin / ADMIN") for
            convenience during development. That's a credential leak in
            production — anyone who navigates to /admin/login could log
            in. Hint removed. The seed credentials themselves were
            rotated to a strong username + scrypt-hashed password on
            2026-04-30 (see the corresponding plan-file entry). */}
      </div>
    </div>
  );
}
