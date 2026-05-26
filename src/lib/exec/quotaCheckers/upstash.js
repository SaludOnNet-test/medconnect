import { fetchWithTimeout } from '@/lib/http';

// Upstash Redis (free) caps at 10,000 commands per day. The `/info` REST
// endpoint returns the Redis INFO output as a multi-section text dump; we
// extract the `total_commands_processed` counter.
//
// Important nuance: INFO returns the lifetime counter, not today's. For an
// accurate daily figure we'd need to snapshot at midnight and diff. For MVP
// we use the daily counter that Upstash exposes in `db_size` / dashboard —
// not via API. So we fall back to "alive" status only and surface the
// lifetime number as informational.
export async function checkUpstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return { provider: 'upstash', ok: false, error: 'env not configured' };
  }

  const cap = Number(process.env.UPSTASH_DAILY_CAP) || 10000;

  try {
    const res = await fetchWithTimeout(`${url}/info`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 5000,
    });
    if (!res.ok) {
      return { provider: 'upstash', ok: false, error: `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => ({}));
    const text = String(body?.result || '');
    const totalMatch = text.match(/total_commands_processed:(\d+)/);
    const lifetime = totalMatch ? Number(totalMatch[1]) : null;

    return {
      provider: 'upstash',
      ok: true,
      used: null,
      limit: cap,
      percentage: null,
      status: 'ok',
      note: lifetime != null
        ? `Lifetime: ${lifetime.toLocaleString('es-ES')} cmds · Cap diario: ${cap.toLocaleString('es-ES')} (no expuesto vía API — revisar consola).`
        : 'Alive — sin métrica diaria expuesta por API.',
    };
  } catch (err) {
    return { provider: 'upstash', ok: false, error: err.message };
  }
}
