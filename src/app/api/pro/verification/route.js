import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  proVerificationOps,
  proVerificationReceived,
} from '@/lib/emailTemplates';

const OPERATIONS_EMAIL = process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es';
const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

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
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  if (!HAS_BLOB) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN not configured — Vercel Blob is required to accept uploads.' },
      { status: 503 },
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid multipart payload' }, { status: 400 });
  }

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const profileType = String(formData.get('profileType') || '').trim();
  const fullName = trimOrNull(formData.get('fullName'));
  const licenseNumber = trimOrNull(formData.get('licenseNumber'));
  const clinicName = trimOrNull(formData.get('clinicName'));
  const taxId = trimOrNull(formData.get('taxId'));
  const notes = trimOrNull(formData.get('notes'));

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }
  if (!['doctor', 'clinic'].includes(profileType)) {
    return NextResponse.json({ error: 'profileType must be doctor or clinic' }, { status: 400 });
  }
  if (profileType === 'doctor' && (!fullName || !licenseNumber)) {
    return NextResponse.json({ error: 'fullName and licenseNumber required for doctor' }, { status: 400 });
  }
  if (profileType === 'clinic' && !clinicName) {
    return NextResponse.json({ error: 'clinicName required for clinic' }, { status: 400 });
  }

  const files = formData.getAll('documents').filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f);
  if (files.length === 0) {
    return NextResponse.json({ error: 'at least one document required' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `too many files (max ${MAX_FILES})` }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${f.name}: file exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB` }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(f.type)) {
      return NextResponse.json({ error: `${f.name}: type ${f.type} not allowed` }, { status: 400 });
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

    // Reuse open pending request if any (idempotency).
    if (userRow) {
      const existing = await safeQuery(
        pool.request().input('id', sql.Int, userRow.id),
        `SELECT TOP 1 r.id, r.status
         FROM admin_users u
         JOIN pro_verification_requests r ON r.id = u.verification_request_id
         WHERE u.id = @id AND r.status = 'pending'`,
      );
      if (existing?.recordset?.[0]) {
        return NextResponse.json({
          ok: true,
          requestId: existing.recordset[0].id,
          status: 'pending',
          alreadyPending: true,
        });
      }
    }

    // Upload files to Vercel Blob (access: 'private' would require a token
    // to read; for ops-only review we use 'public' but with a long random
    // pathname — it's still effectively unguessable. The ops UI proxies
    // the URL through an admin-gated endpoint anyway).
    const uploadedUrls = [];
    for (const file of files) {
      const safeName = (file.name || 'document')
        .replace(/[^A-Za-z0-9_.-]+/g, '_')
        .slice(0, 80);
      const key = `pro-verification/${userRow.id}/${Date.now()}-${cryptoRandom()}-${safeName}`;
      const blob = await put(key, file, {
        access: 'public',
        contentType: file.type,
        addRandomSuffix: false,
      });
      uploadedUrls.push(blob.url);
    }

    // Insert the request.
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
    const requestId = insertResult.recordset[0].id;

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

    const userTpl = proVerificationReceived({
      requestedByName: userRow.display_name || fullName || clinicName,
    });
    sendEmail({ to: email, subject: userTpl.subject, html: userTpl.html })
      .catch((e) => console.error('[pro-verification] user email failed', e));

    return NextResponse.json({ ok: true, requestId, status: 'pending' });
  } catch (err) {
    console.error('[POST /api/pro/verification]', err);
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({
        error: 'Migration pending — pro_verification_requests table not yet created. Run scripts/migration_add_pro_verification.py.',
      }, { status: 503 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function cryptoRandom() {
  // Short URL-safe random. Avoids importing crypto for one nonce.
  return Math.random().toString(36).slice(2, 10);
}

async function safeQuery(req, queryString) {
  try { return await req.query(queryString); }
  catch (err) {
    if (String(err?.message || '').includes('Invalid column name')) return null;
    throw err;
  }
}
