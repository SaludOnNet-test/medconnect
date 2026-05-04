// Authenticated proxy for Vercel Blob downloads.
//
// Why this exists:
//   pro_verification_requests stores full Vercel Blob URLs that point to
//   identity documents (DNI, colegiado, NIF). The blobs are uploaded as
//   `access: 'public'` because the @vercel/blob SDK doesn't yet expose
//   short-lived signed reads end-to-end. That means anyone holding the
//   URL — leaked through a screenshot, a Slack paste, the browser
//   history — can fetch the file directly.
//
// What this fixes:
//   The admin GET endpoints now return proxy URLs of the form
//   /api/admin/blob?u=<encoded vercel blob url>. Reads go through this
//   route, which (a) validates an admin/ops session, (b) restricts the
//   target to hostnames we expect (no SSRF to internal endpoints), and
//   (c) streams the bytes back. A leaked admin URL still requires a
//   valid bearer token to dereference.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/adminAuth';
import { fetchWithTimeout } from '@/lib/http';
import { internalError } from '@/lib/errors';

// Hostnames we'll proxy. Restricting to vercel-storage.com prevents this
// route from being used as an open redirect / SSRF gadget against any URL
// an attacker can submit.
const ALLOWED_HOST_SUFFIXES = ['.public.blob.vercel-storage.com'];

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = requireRole(request, ['admin', 'ops']);
  if (auth instanceof Response) return auth;

  const target = new URL(request.url).searchParams.get('u');
  if (!target) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'https required' }, { status: 400 });
  }
  if (!ALLOWED_HOST_SUFFIXES.some((s) => parsed.hostname.endsWith(s))) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 400 });
  }

  try {
    const upstream = await fetchWithTimeout(parsed.toString(), {
      method: 'GET',
      timeoutMs: 30_000,
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'upstream', status: upstream.status }, { status: 502 });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const len = upstream.headers.get('content-length');
    if (len) headers.set('content-length', len);
    headers.set('cache-control', 'private, no-store');
    const filename = decodeURIComponent(parsed.pathname.split('/').pop() || 'document');
    headers.set('content-disposition', `inline; filename="${filename.replace(/"/g, '')}"`);

    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    return internalError(err, '[admin/blob proxy]');
  }
}
