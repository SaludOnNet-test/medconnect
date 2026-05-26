import { NextResponse } from 'next/server';

// Auth shared por todos los endpoints /api/exec/*.
//
// Tres vías de acceso aceptadas, en este orden:
//
//   1. Header `Authorization: Bearer ${CRON_SECRET}` — esto es lo que Vercel
//      inyecta automáticamente en cada llamada de cron job. Documentado en
//      https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
//   2. `?secret=<EXEC_REPORT_SECRET>` en la query string. Útil para
//      disparadores manuales desde el navegador o curl.
//
//   3. Sesión admin válida (token Bearer en Authorization header). Sirve para
//      que el dashboard `/admin/exec` consuma estos endpoints con la misma
//      sesión que ya tiene de admin, sin tener que cargar el secret en el
//      cliente.
//
// Devolver `null` cuando la autenticación es válida (continuar el handler),
// o un `NextResponse` 401 listo para devolver al cliente.
export function requireExecAuth(request) {
  // 1) Vercel Cron Bearer token.
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  if (cronSecret && auth.startsWith('Bearer ')) {
    const presented = auth.slice(7);
    if (timingSafeEqualStr(cronSecret, presented)) return null;
  }

  // 2) Query-string secret (manual triggers / cron path alt).
  const expected = process.env.EXEC_REPORT_SECRET;
  const url = new URL(request.url);
  const provided = url.searchParams.get('secret');
  if (expected && provided && timingSafeEqualStr(expected, provided)) {
    return null;
  }

  // 3) Admin session token (dashboard reuse). Importamos dentro de la
  // función para evitar ciclos de import en módulos que reutilicen este
  // helper.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireRole } = require('@/lib/adminAuth');
    const rr = requireRole(request, ['admin', 'ops']);
    if (!(rr instanceof Response)) return null;
  } catch {
    // ignore — fall through to 401
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Equality without short-circuit on length differences. Useful when comparing
// secrets — the typical `===` check leaks length via timing. Pure JS, no
// dependency on `crypto.timingSafeEqual` (which requires buffers of equal
// length and would itself leak length).
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
