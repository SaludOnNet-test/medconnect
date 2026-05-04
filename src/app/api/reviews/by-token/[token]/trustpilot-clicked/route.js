import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reviews/by-token/:token/trustpilot-clicked
 *
 * Fire-and-forget endpoint hit by `/review/[token]` when the user clicks
 * the Trustpilot bridge button after submitting a 5-star Med Connect
 * rating. Sets `reviews.trustpilot_clicked = 1` so we can track the
 * conversion rate of inline-CTA → Trustpilot review (the click leaves
 * our domain; we won't see the eventual review unless Trustpilot's
 * verified-reviews integration matches by email).
 *
 * Idempotent: clicking twice flips 0→1→1 with no-op semantics, no error.
 * Returns 204 (no body) so the front can ignore the response.
 */
export async function POST(request, { params }) {
  if (!DB_AVAILABLE) {
    // Don't 503 — the click should always feel instant. Soft-fail.
    return new NextResponse(null, { status: 204 });
  }
  const { token } = await params;
  if (!token || token.length < 16) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('token', sql.NVarChar(64), token)
      .query(`
        UPDATE r
        SET r.trustpilot_clicked = 1
        FROM reviews r
        INNER JOIN bookings b ON b.id = r.booking_id
        WHERE b.self_service_token = @token
          AND r.trustpilot_clicked = 0
      `);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    // Log but don't block the user — they're already on Trustpilot's
    // domain by the time this round-trip resolves. Capture the error
    // for ops visibility and return 204 anyway (the click counter just
    // misses one bump; not user-visible).
    console.error('[POST /api/reviews/.../trustpilot-clicked]', err?.message);
    captureException(err instanceof Error ? err : new Error(String(err)), {
      scope: '[POST /api/reviews/.../trustpilot-clicked]',
    }).catch(() => {});
    return new NextResponse(null, { status: 204 });
  }
}
