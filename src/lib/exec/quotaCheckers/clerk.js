import { fetchWithTimeout } from '@/lib/http';

// Clerk Free tier: 10,000 MAU (Monthly Active Users). The free tier doesn't
// expose MAU via API. We use total users as a *proxy* — it's a strict upper
// bound on MAU, so if total < 10k we're safely under cap. Once total ≥ 8k we
// flag warn (the upgrade to Pro is $25/mes which makes sense at that volume
// regardless of how MAU actually distributes).
//
// We could also count `last_sign_in_at >= 30 days ago` for a real MAU but
// that requires paginating /v1/users and is expensive on the cold path of a
// 5-minute dashboard refresh. Total is good enough until launch.
export async function checkClerk() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const cap = Number(process.env.CLERK_MAU_CAP) || 10000;

  if (!secretKey) {
    return { provider: 'clerk', ok: false, error: 'CLERK_SECRET_KEY not configured' };
  }

  try {
    const res = await fetchWithTimeout('https://api.clerk.com/v1/users/count', {
      headers: { Authorization: `Bearer ${secretKey}` },
      timeoutMs: 5000,
    });
    if (!res.ok) {
      return { provider: 'clerk', ok: false, error: `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => ({}));
    const total = Number(body?.total_count ?? body?.object?.total_count) || 0;
    const percentage = Math.round((total / cap) * 100);

    return {
      provider: 'clerk',
      ok: true,
      used: total,
      limit: cap,
      percentage,
      status: classify(percentage),
      note: `${total.toLocaleString('es-ES')} usuarios totales (proxy de MAU) · cap ${cap.toLocaleString('es-ES')}`,
    };
  } catch (err) {
    return { provider: 'clerk', ok: false, error: err.message };
  }
}

function classify(p) {
  if (p >= 90) return 'critical';
  if (p >= 80) return 'warn';
  return 'ok';
}
