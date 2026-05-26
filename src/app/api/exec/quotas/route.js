import { NextResponse } from 'next/server';
import { internalError } from '@/lib/errors';
import { requireExecAuth } from '@/lib/exec/auth';
import { runAllCheckers } from '@/lib/exec/quotaCheckers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/exec/quotas?secret=...
 *
 * Mide uso vs límite de cada proveedor. Cada checker es independiente —
 * fallos aislados no rompen la respuesta agregada.
 *
 * Cache: 1h en memoria del Lambda. La caché entre Lambdas no se comparte,
 * pero como un dashboard refresca cada 5 min y los daily/weekly emails se
 * lanzan 1-2 veces al día, el ahorro es real. Si se necesita cache cross-
 * Lambda, migrar a Upstash (que tiene su propio checker — ojo con bucles).
 */
let cache = null;

export async function GET(request) {
  const authError = requireExecAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const force = searchParams.get('refresh') === '1';

  if (!force && cache && Date.now() - cache.at < 60 * 60 * 1000) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  try {
    const { providers, worst } = await runAllCheckers();

    const data = {
      generatedAt: new Date().toISOString(),
      providers,
      worst: worst
        ? { provider: worst.provider, percentage: worst.percentage, status: worst.status }
        : null,
      counts: {
        ok: providers.filter((p) => p.ok && p.status === 'ok').length,
        warn: providers.filter((p) => p.ok && p.status === 'warn').length,
        critical: providers.filter((p) => p.ok && p.status === 'critical').length,
        errored: providers.filter((p) => !p.ok).length,
      },
    };

    cache = { at: Date.now(), data };
    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    return internalError(err, '[GET /api/exec/quotas]');
  }
}
