#!/usr/bin/env node
/**
 * One-off provisioning script · Create Arita's Clerk professional account.
 *
 * Steps:
 *   1. Creates a Clerk user with the given email + a generated password.
 *      publicMetadata.role = 'professional' so the /pro/* routes treat them
 *      as a verified professional from day one.
 *   2. Skips the Clerk webhook (we're inserting the admin_users row
 *      ourselves in scripts/provision/attach-to-cea-bermudez.js).
 *
 * Idempotent: if a Clerk user with that email already exists, prints the
 * existing user and exits 0 (does NOT overwrite the password).
 *
 * Run locally with:
 *   CEA_PROF_EMAIL=<arita-email> \
 *   node --env-file=.env.local scripts/provision/create-clerk-arita.js
 *
 * Optional env overrides:
 *   CEA_PROF_PASSWORD   default: random 20-char password (printed at the end)
 *   CEA_PROF_FIRSTNAME  default: 'Arita'
 *   CEA_PROF_LASTNAME   default: 'Cea Bermúdez'
 *
 * Required env (read from .env.local):
 *   CLERK_SECRET_KEY  — from Clerk dashboard
 */

import crypto from 'crypto';

const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };
const log = (c, ...a) => console.log(`${c}${a.join(' ')}${C.reset}`);

function randomPassword() {
  // Clerk requires at least 8 chars with some entropy; 20 base64url chars is plenty.
  return crypto.randomBytes(15).toString('base64url').slice(0, 20);
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY) {
    log(C.red, 'CLERK_SECRET_KEY missing — check .env.local');
    process.exit(1);
  }

  const email = (process.env.CEA_PROF_EMAIL || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    log(C.red, 'CEA_PROF_EMAIL required — pass as env var or set in .env.local');
    log(C.yellow, '\nExample:');
    console.log('  CEA_PROF_EMAIL=arita@centroceabermudez.es node --env-file=.env.local scripts/provision/create-clerk-arita.js\n');
    process.exit(1);
  }

  const password = (process.env.CEA_PROF_PASSWORD || randomPassword()).trim();
  const firstName = (process.env.CEA_PROF_FIRSTNAME || 'Arita').trim();
  const lastName = (process.env.CEA_PROF_LASTNAME || 'Cea Bermúdez').trim();

  log(C.cyan, `\n=== Provisioning Clerk user for '${email}' ===\n`);

  // Use the same import path as the rest of the codebase
  // (src/app/api/clerk/webhook/route.js) so we share Clerk version + auth wiring.
  const { clerkClient } = await import('@clerk/nextjs/server');
  const clerk = await clerkClient();

  // Check whether the user already exists.
  const listed = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
  // The v7 SDK returns { data, totalCount }; older shapes return an array directly.
  const existingUser = Array.isArray(listed) ? listed[0] : listed?.data?.[0];

  if (existingUser) {
    log(C.yellow, `Clerk user with email '${email}' already exists:`);
    console.log(`  Clerk user id:  ${existingUser.id}`);
    console.log(`  First name:     ${existingUser.firstName || '—'}`);
    console.log(`  Last name:      ${existingUser.lastName || '—'}`);
    console.log(`  Public meta:    ${JSON.stringify(existingUser.publicMetadata)}`);

    // Make sure the role is set, even on an existing user.
    if (existingUser.publicMetadata?.role !== 'professional') {
      log(C.cyan, "\nPromoting existing user to publicMetadata.role = 'professional' ...");
      await clerk.users.updateUserMetadata(existingUser.id, {
        publicMetadata: { ...(existingUser.publicMetadata || {}), role: 'professional' },
      });
      log(C.green, 'Promoted.');
    }

    log(C.yellow, '\nSkipping password reset on existing user. To rotate, do it from the Clerk dashboard.');
    log(C.cyan, '\nNext step: run scripts/provision/attach-to-cea-bermudez.js to map this email to the clinic.\n');
    return;
  }

  // Create the user.
  const user = await clerk.users.createUser({
    emailAddress: [email],
    password,
    firstName,
    lastName,
    publicMetadata: { role: 'professional' },
    unsafeMetadata: { signupSource: 'pro' },
    skipPasswordChecks: false,
  });

  log(C.green, `\n✓ Created Clerk user`);
  console.log(`  Clerk user id:  ${user.id}`);
  console.log(`  Email:          ${email}`);
  console.log(`  Password:       ${password}`);
  console.log(`  Public meta:    role=professional`);

  log(C.cyan, '\nNext steps:');
  console.log(`  1. Copy this password to Vercel env var: CEA_PROF_PASSWORD=${password}`);
  console.log(`  2. Set CEA_PROF_EMAIL=${email} in Vercel.`);
  console.log(`  3. Run:  node --env-file=.env.local scripts/provision/attach-to-cea-bermudez.js`);
  console.log(`  4. Generate handbook secret + set CEA_BERMUDEZ_HANDBOOK_SECRET in Vercel.`);
  console.log(`  5. Share with Arita:  https://medconnect.es/internal/cea-bermudez?k=<CEA_BERMUDEZ_HANDBOOK_SECRET>\n`);
}

main().catch((err) => {
  log(C.red, '\nFAILED:', err.message);
  console.error(err);
  process.exit(1);
});
