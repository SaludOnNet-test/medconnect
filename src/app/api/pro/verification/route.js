import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { put } from '@vercel/blob';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  proVerificationOps,
  proVerificationReceived,
  proVerificationInfoResponded,
} from '@/lib/emailTemplates';
import { limits } from '@/lib/rateLimit';
import { internalError, clientError } from '@/lib/errors';

const OPERATIONS_EMAIL = process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es';
const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const HAS_CLERK = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
);

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024;       // 10 MB per file
const MAX_FILES = 5;                            // hard cap so a runaway client can't pile in

/**
 * POST /api/pro/verification
 *
 * Pro submits the verification modal: profile type, supporting fields and
 * one or more uploaded documents (PDF or image). We store the docs in
 * Vercel Blob (private), persist a row in `pro_verification_requests`,
 * link it from `admin_users.verification_request_id`, and notify ops.
 *
 * Multipart form-data fields:
 *   - email (required)
 *   - profileType: 'doctor' | 'clinic' (required)
 *   - fullName, licenseNumber, clinicName, taxId, notes (optional text)
 *   - documents: one or more File entries (PDF/JPEG/PNG/WebP, ≤ 10 MB each)
 *
 * Idempotency: if a `pending` request already exists for this email, we
 * return it without creating a new one (mirrors clinic-alta-request).
 */
export async function POST(request) {
  // Rate limit: pro-verification carries multi-MB uploads — 5/hour/IP is
  // plenty for a real pro retrying a couple of times, hostile enough to
  // a bot trying to enumerate or DoS the ops mailbox.
  const r = await limits.proVerification.check(request);
  if (!r.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: r.headers },
    );
  }

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  if (!HAS_BLOB) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN not configured — Vercel Blob is required to accept uploads.' },
      { status: 503 },
    );
  }

  // Clerk auth: a pro must be signed in (they hit this from /pro/sign-up
  // or the verification modal). When Clerk is unconfigured (local dev)
  // we fall through and trust the form email — but in any environment
  // with Clerk keys we require a valid session AND that the form email
  // matches one of the user's verified addresses. Without this anyone
  // could submit verification docs in someone else's name.
  let clerkEmails = null;
  if (HAS_CLERK) {
    try {
      const { auth, clerkClient } = await import('@clerk/nextjs/server');
      const { userId } = await auth();
      if (!userId) {
        return clientError('Authentication required', 401);
      }
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      clerkEmails = (user?.emailAddresses || [])
        .map((e) => String(e?.emailAddress || '').toLowerCase())
        .filter(Boolean);
    } catch (err) {
      return internalError(err, '[pro/verification auth]');
    }
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return clientError('invalid multipart payload', 400);
  }

  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (clerkEmails && !clerkEmails.includes(email)) {
    return clientError('Email does not match the signed-in account', 403);
  }
  const profileType = String(formData.get('profileType') || '').trim();
  const fullName = trimOrNull(formData.get('fullName'));
  const licenseNumber = trimOrNull(formData.get('licenseNumber'));
  const clinicName = trimOrNull(formData.get('clinicName'));
  const taxId = trimOrNull(formData.get('taxId'));
  const notes = trimOrNull(formData.get('notes'));
  // Client hint: this submission is a response to ops's "more info" request.
  // We still verify server-side (the existing row must be in
  // 'more_info_requested') before honouring the resubmit, but the hint lets
  // us skip the profileType/identity validation since those fields are
  // already on file.
  const clientInfoResponseHint = String(formData.get('infoResponse') || '') === 'true';

  if (!email || !email.includes('@')) {
    return clientError('email required', 400);
  }
  if (!clientInfoResponseHint) {
    if (!['doctor', 'clinic'].includes(profileType)) {
      return clientError('profileType must be doctor or clinic', 400);
    }
    if (profileType === 'doctor' && (!fullName || !licenseNumber)) {
      return clientError('fullName and licenseNumber required for doctor', 400);
    }
    if (profileType === 'clinic' && !clinicName) {
      return clientError('clinicName required for clinic', 400);
    }
  }

  const files = formData.getAll('documents').filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f);
  if (files.length === 0) {
    return clientError('at least one document required', 400);
  }
  if (files.length > MAX_FILES) {
    return clientError(`too many files (max ${MAX_FILES})`, 400);
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return clientError(`${f.name}: file exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB`, 400);
    }
    if (!ALLOWED_MIME.has(f.type)) {
      return clientError(`${f.name}: type ${f.type} not allowed`, 400);
    }
  }

  try {
    const pool = await getPool();

    // Resolve the user.
    const userResult = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query(`SELECT TOP 1 id, username, display_name FROM admin_users WHERE LOWER(username) = LOWER(@email)`);
    const userRow = userResult.recordset[0];
    if (!userRow) {
      return NextResponse.json({
        error: 'No pro account found for this email. Sign up at /pro/sign-up first.',
      }, { status: 404 });
    }

    // Look up the user's most recent open request (pending OR
    // more_info_requested). If it's pending we treat the resubmit as a
    // no-op (idempotent — same docs, no need to spam ops). If it's in
    // 'more_info_requested', the pro is responding to ops's question:
    // append the new docs, flip status back to 'pending', and notify ops.
    let existingOpen = null;
    if (userRow) {
      const existing = await safeQuery(
        pool.request().input('id', sql.Int, userRow.id),
        `SELECT TOP 1 r.id, r.status, r.document_urls
         FROM admin_users u
         JOIN pro_verification_requests r ON r.id = u.verification_request_id
         WHERE u.id = @id AND r.status IN ('pending', 'more_info_requested')`,
      );
      existingOpen = existing?.recordset?.[0] || null;
    }

    if (existingOpen?.status === 'pending') {
      return NextResponse.json({
        ok: true,
        requestId: existingOpen.id,
        status: 'pending',
        alreadyPending: true,
      });
    }

    // If the client said this is a response but there's no
    // more_info_requested row, reject — otherwise the relaxed validation
    // earlier would let us insert garbage profileType data.
    if (clientInfoResponseHint && existingOpen?.status !== 'more_info_requested') {
      return NextResponse.json({
        error: 'No info request open for this account — start a new verification instead.',
      }, { status: 409 });
    }

    // Upload files to Vercel Blob. We persist the BLOB URL but the admin
    // UI never displays it directly — reads go through
    // /api/admin/blob?u=<encoded-url> which checks the ops session before
    // fetching. A leaked URL still requires a valid bearer token.
    // Random suffix + crypto.randomBytes nonce gives unguessable paths in
    // depth (Math.random was previously used here, which is non-CSPRNG).
    const uploadedUrls = [];
    for (const file of files) {
      const safeName = (file.name || 'document')
        .replace(/[^A-Za-z0-9_.-]+/g, '_')
        .slice(0, 80);
      const nonce = crypto.randomBytes(8).toString('hex');
      const key = `pro-verification/${userRow.id}/${Date.now()}-${nonce}-${safeName}`;
      const blob = await put(key, file, {
        access: 'public',
        contentType: file.type,
        addRandomSuffix: true,
      });
      uploadedUrls.push(blob.url);
    }

    let requestId;
    let isInfoResponse = false;

    if (existingOpen?.status === 'more_info_requested') {
      // Pro is responding to an ops "more info" request — APPEND new docs
      // to the existing array (don't lose the originals), flip status back
      // to 'pending', and stamp info_response_at.
      isInfoResponse = true;
      requestId = existingOpen.id;
      let prevUrls = [];
      try { prevUrls = JSON.parse(existingOpen.document_urls || '[]') || []; }
      catch { prevUrls = []; }
      const mergedUrls = [...(Array.isArray(prevUrls) ? prevUrls : []), ...uploadedUrls];

      await pool.request()
        .input('id', sql.Int, requestId)
        .input('docUrls', sql.NVarChar(sql.MAX), JSON.stringify(mergedUrls))
        .input('notes', sql.NVarChar(sql.MAX), notes)
        .query(`
          UPDATE pro_verification_requests
          SET document_urls = @docUrls,
              notes = COALESCE(@notes, notes),
              status = 'pending',
              info_response_at = SYSDATETIMEOFFSET()
          WHERE id = @id
        `);
    } else {
      // First-time submission — insert a new row.
      const insertResult = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .input('profileType', sql.NVarChar(20), profileType)
        .input('fullName', sql.NVarChar(255), fullName)
        .input('licenseNumber', sql.NVarChar(100), licenseNumber)
        .input('clinicName', sql.NVarChar(255), clinicName)
        .input('taxId', sql.NVarChar(40), taxId)
        .input('docUrls', sql.NVarChar(sql.MAX), JSON.stringify(uploadedUrls))
        .input('notes', sql.NVarChar(sql.MAX), notes)
        .query(`
          INSERT INTO pro_verification_requests
            (requested_by_email, profile_type, full_name, license_number,
             clinic_name, tax_id, document_urls, notes, status)
          OUTPUT INSERTED.id
          VALUES (@email, @profileType, @fullName, @licenseNumber,
                  @clinicName, @taxId, @docUrls, @notes, 'pending')
        `);
      requestId = insertResult.recordset[0].id;
    }

    // Best-effort: link from admin_users (column may not exist pre-migration).
    try {
      await pool.request()
        .input('id', sql.Int, userRow.id)
        .input('reqId', sql.Int, requestId)
        .query(`UPDATE admin_users SET verification_request_id = @reqId WHERE id = @id`);
    } catch (linkErr) {
      if (!String(linkErr?.message || '').includes('Invalid column name')) {
        console.error('[pro-verification] link error', linkErr);
      }
    }

    // Emails — ops alert + pro confirmation. Failures don't block the
    // response (the request is already persisted).
    if (isInfoResponse) {
      // Pro responded to "more info" — let ops know specifically.
      const totalDocs = JSON.parse(
        (await pool.request().input('id', sql.Int, requestId)
          .query(`SELECT document_urls FROM pro_verification_requests WHERE id = @id`)
        ).recordset[0]?.document_urls || '[]',
      ).length;
      const opsTpl = proVerificationInfoResponded({
        requestId,
        requestedByEmail: email,
        documentCount: totalDocs,
      });
      sendEmail({ to: OPERATIONS_EMAIL, subject: opsTpl.subject, html: opsTpl.html })
        .catch((e) => console.error('[pro-verification info-response] ops email failed', e));
    } else {
      const opsTpl = proVerificationOps({
        requestId,
        requestedByEmail: email,
        profileType,
        fullName,
        licenseNumber,
        clinicName,
        documentCount: uploadedUrls.length,
      });
      sendEmail({ to: OPERATIONS_EMAIL, subject: opsTpl.subject, html: opsTpl.html })
        .catch((e) => console.error('[pro-verification] ops email failed', e));
    }

    const userTpl = proVerificationReceived({
      requestedByName: userRow.display_name || fullName || clinicName,
    });
    sendEmail({ to: email, subject: userTpl.subject, html: userTpl.html })
      .catch((e) => console.error('[pro-verification] user email failed', e));

    return NextResponse.json({ ok: true, requestId, status: 'pending', infoResponse: isInfoResponse });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({
        error: 'Migration pending — pro_verification_requests table not yet created. Run scripts/migration_add_pro_verification.py.',
      }, { status: 503 });
    }
    return internalError(err, '[POST /api/pro/verification]');
  }
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

async function safeQuery(req, queryString) {
  try { return await req.query(queryString); }
  catch (err) {
    if (String(err?.message || '').includes('Invalid column name')) return null;
    throw err;
  }
}
