// Centralised error response helper for API routes.
//
// Why this exists:
//   1. Returning raw `err.message` to the client leaks SQL table names,
//      hostnames, parameterized values, and stack lines — easy info-leak
//      for an attacker probing endpoints.
//   2. Without Sentry the original error vanishes the moment the Lambda
//      shuts down. Pairing the sanitised response with `captureException`
//      keeps the stack accessible to operators.
//   3. Returning a `requestId` lets a user paste an ID into support and
//      we can grep it in logs/Sentry instead of re-hunting the error.
//
// Usage:
//   try { ... } catch (err) {
//     return internalError(err, '[POST /api/bookings]');
//   }

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { captureException } from '@/lib/sentry';

function newRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Build a sanitised 500 response and ship the original error to Sentry.
 *
 * @param {unknown} err   The thrown error.
 * @param {string}  scope A short tag identifying the route, e.g. '[POST /api/bookings]'.
 * @param {object}  [extra] Free-form extra context to attach to the Sentry event.
 * @returns {Response}
 */
export function internalError(err, scope, extra = {}) {
  const requestId = newRequestId();
  console.error(scope, { requestId, message: err?.message, name: err?.name });
  captureException(err instanceof Error ? err : new Error(String(err)), {
    scope,
    requestId,
    ...extra,
  }).catch(() => {});

  return NextResponse.json(
    { error: 'internal_error', requestId },
    { status: 500 },
  );
}

/**
 * 4xx counterpart — the request itself was malformed/forbidden, not a
 * server bug. Doesn't ship to Sentry by default (would be too noisy from
 * scanners).
 */
export function clientError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
