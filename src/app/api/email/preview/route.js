import { NextResponse } from 'next/server';
import * as templates from '@/lib/emailTemplates';

/**
 * GET /api/email/preview?template=<name>&data=<base64-json>
 *
 * Renders the HTML body of an email template so the pro dashboard can
 * embed it as an iframe preview before firing the real send. We keep
 * server-side because email templates pull `process.env.NEXT_PUBLIC_BASE_URL`
 * to build deep-links and we don't want to leak the BASE_URL fallback
 * logic into the client bundle.
 *
 * Allowlisted templates (only safe ones the pro flow actually previews):
 *   - lockInInvitation
 *   - derivadorReferralCreated
 *   - lockInReminder
 *
 * The data payload comes base64-encoded so we can keep the URL clean
 * even with the long arguments object.
 */

const ALLOWED = new Set([
  'lockInInvitation',
  'derivadorReferralCreated',
  'lockInReminder',
]);

function decodeData(b64) {
  if (!b64) return {};
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const template = searchParams.get('template') || '';
  const dataB64 = searchParams.get('data') || '';

  if (!ALLOWED.has(template)) {
    return NextResponse.json(
      { error: `template "${template}" not allowed for preview` },
      { status: 400 },
    );
  }

  const fn = templates[template];
  if (typeof fn !== 'function') {
    return NextResponse.json({ error: 'template not found' }, { status: 404 });
  }

  try {
    const { html } = fn(decodeData(dataB64));
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Disallow framing from cross-origin to avoid the preview being
        // embedded outside our own dashboard.
        'X-Frame-Options': 'SAMEORIGIN',
        // No need to cache — preview content is request-specific.
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[GET /api/email/preview]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
