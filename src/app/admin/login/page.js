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
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Admin"
              className="form-input"
              required
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ADMIN"
              className="form-input"
              required
              disabled={isLoading}
            />
          </div>

          {error && <div className="admin-error-message">{error}</div>}

          <button type="submit" className="btn-primary admin-login-btn" disabled={isLoading}>
            {isLoading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="admin-credentials-hint">
          <p><strong>Credenciales por defecto:</strong></p>
          <p>Usuario: <code>Admin</code> · Contraseña: <code>ADMIN</code></p>
          <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            Cámbialas y crea operadores adicionales desde el dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
