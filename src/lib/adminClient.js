// Browser-side helpers for the ops dashboard.
// Token lives in localStorage under "adminToken".

export function getAdminToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('adminToken');
}

export function clearAdminSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  localStorage.removeItem('adminLoggedIn');
}

export async function adminFetch(url, options = {}) {
  const token = getAdminToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearAdminSession();
    if (typeof window !== 'undefined') window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }
  return res;
}

export async function adminLogin(username, password) {
  const res = await fetch('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  localStorage.setItem('adminToken', data.token);
  localStorage.setItem('adminUser', JSON.stringify(data.user));
  localStorage.setItem('adminLoggedIn', 'true');
  return data.user;
}

export function getAdminUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('adminUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
