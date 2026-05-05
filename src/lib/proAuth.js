// Shared Clerk-backed auth helper for /api/pro/* and /api/referrals routes.
//
// Why this exists:
//   The pro endpoints used to identify the calling pro purely by the email
//   carried in the request (`?email=…` query param, `professionalEmail`
//   field, etc.) without verifying that the request actually came from
//   that user's Clerk session. That left every pro endpoint vulnerable to
//   IDOR — anyone could read another pro's commissions, recent referrals
//   (with patient PII), clinic mapping, or attach themselves to an
//   arbitrary clinic by guessing the email.
//
//   `/api/pro/verification` already had the right pattern (Clerk `auth()`
//   → load user → cross-check candidate email is one of the user's
//   verified emails). This module extracts that pattern so every pro
//   route can apply it with one call.
//
// Two helpers:
//   - `requireProEmail(request, candidateEmail)` — the route trusts the
//     candidate email passed in the body/query but wants confirmation
//     that the signed-in user owns it. Returns either { ok: false, response }
//     (caller should `return response`) or { ok: true, email, userId, role }.
//   - `requireProSession(request)` — the route just wants any authenticated
//     pro/admin (no specific candidate to verify). Returns the canonical
//     primary email of the signed-in user, or an error response.
//
// Both helpers degrade gracefully when Clerk env keys are missing
// (`HAS_CLERK = false`) — local dev / preview without Clerk configured
// flows through with `ok: true` and a `relaxed: true` flag, mirroring
// the captcha helper. Production with Clerk keys set hard-fails when no
// session is present.

import { clientError, internalError } from '@/lib/errors';

const HAS_CLERK = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
);

/**
 * Look up the signed-in Clerk user. Returns null when no session, or an
 * object with the user's id, role, primary email, and the full set of
 * verified emails (lowercased).
 *
 * @returns {Promise<null | {
 *   userId: string,
 *   role: string | null,
 *   primaryEmail: string | null,
 *   emails: string[],
 * }>}
 */
async function loadClerkUser() {
  if (!HAS_CLERK) return null;
  const { auth, clerkClient } = await import('@clerk/nextjs/server');
  const { userId } = await auth();
  if (!userId) return null;
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primaryEmail = user?.primaryEmailAddress?.emailAddress
    ? String(user.primaryEmailAddress.emailAddress).toLowerCase()
    : null;
  const emails = (user?.emailAddresses || [])
    .map((e) => String(e?.emailAddress || '').toLowerCase())
    .filter(Boolean);
  return {
    userId,
    role: user?.publicMetadata?.role || null,
    primaryEmail,
    emails,
  };
}

/**
 * Verify the request comes from a signed-in Clerk user whose verified
 * emails include `candidateEmail`. Use this for every pro endpoint that
 * accepts an email in the body/query and would otherwise leak data on
 * IDOR.
 *
 * Behaviour:
 *   - HAS_CLERK = false: returns { ok: true, relaxed: true, email }. The
 *     caller decides whether to honour this in production (the calling
 *     env vars determine that — preview/local flows still work).
 *   - No Clerk session: returns { ok: false, response: 401 }.
 *   - Email doesn't match the user: returns { ok: false, response: 403 }.
 *   - Match: returns { ok: true, email, userId, role, relaxed: false }.
 */
export async function requireProEmail(request, candidateEmail) {
  const email = String(candidateEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, response: clientError('email required', 400) };
  }

  if (!HAS_CLERK) {
    return { ok: true, email, userId: null, role: null, relaxed: true };
  }

  let user;
  try {
    user = await loadClerkUser();
  } catch (err) {
    return { ok: false, response: internalError(err, '[proAuth.requireProEmail]') };
  }
  if (!user) {
    return { ok: false, response: clientError('Authentication required', 401) };
  }
  if (!user.emails.includes(email)) {
    return { ok: false, response: clientError('Email does not match the signed-in account', 403) };
  }
  return {
    ok: true,
    email,
    userId: user.userId,
    role: user.role,
    relaxed: false,
  };
}

/**
 * Variant for endpoints that don't accept a candidate email — just
 * require any authenticated pro/admin and return their primary email.
 *
 * The `roles` arg defaults to ['professional', 'admin']. Pass `null` to
 * skip role checking (any signed-in user passes).
 */
export async function requireProSession(request, roles = ['professional', 'admin']) {
  if (!HAS_CLERK) {
    return { ok: true, email: null, userId: null, role: null, relaxed: true };
  }
  let user;
  try {
    user = await loadClerkUser();
  } catch (err) {
    return { ok: false, response: internalError(err, '[proAuth.requireProSession]') };
  }
  if (!user) {
    return { ok: false, response: clientError('Authentication required', 401) };
  }
  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    return { ok: false, response: clientError('Insufficient role', 403) };
  }
  return {
    ok: true,
    email: user.primaryEmail,
    userId: user.userId,
    role: user.role,
    relaxed: false,
  };
}
