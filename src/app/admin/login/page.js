'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import '../admin.css';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  // Check if already logged in
  useEffect(() => {
    if (hasClerkKeys) {
      router.replace('/sign-in?redirect_url=/admin');
      return;
    }
    const adminToken = localStorage.getItem('adminToken');
    if (adminToken) {
      router.push('/admin');
    }
  }, [router, hasClerkKeys]);

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Hardcoded credentials
    if (email === 'Admin' && password === 'ADMIN') {
      localStorage.setItem('adminToken', 'admin-token-' + Date.now());
      localStorage.setItem('adminLoggedIn', 'true');
      router.push('/admin');
    } else {
      setError('Invalid credentials. Use Admin / ADMIN');
      setPassword('');
    }
    setIsLoading(false);
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <h1>Med Connect Admin</h1>
          <p>Operations Dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="admin-login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Admin"
              className="form-input"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
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

          <button
            type="submit"
            className="btn-primary admin-login-btn"
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="admin-credentials-hint">
          <p><strong>Demo Credentials:</strong></p>
          <p>Email: <code>Admin</code></p>
          <p>Password: <code>ADMIN</code></p>
        </div>
      </div>
    </div>
  );
}
