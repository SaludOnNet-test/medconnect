import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireRole } from '@/lib/adminAuth';

/**
 * POST /api/admin/vouchers/pdf-upload
 *
 * Multipart upload for voucher PDFs. The operator picks a PDF that the
 * clinic / SaludOnNet has provided as proof of the prepaid acto médico,
 * we drop it into Vercel Blob (private bucket), and return the URL so the
 * caller can hand it to `/api/admin/vouchers/upload` as `voucherPdfPath`.
 *
 * Two-step shape (vs. doing the whole thing in one request) keeps the
 * existing JSON-based upload endpoint clean and lets us reuse the same
 * blob-bucket pattern that pro-verification already uses.
 *
 * Multipart form fields:
 *   - bookingId (required) — used to namespace the blob path so PDFs from
 *                            different bookings can't collide and so audits
 *                            tie a specific PDF back to a specific booking.
 *   - file (required)      — application/pdf, ≤ 10 MB.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(request) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;

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

  const bookingId = String(formData.get('bookingId') || '').trim();
  const file = formData.get('file');

  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
  }
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'only PDF files are accepted' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `file exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  // Sanitize the original filename so it can never confuse the blob key —
  // strips path traversal, restricts to a safe character set, and keeps
  // the .pdf extension. The bookingId prefix already namespaces the upload
  // so collisions across bookings are impossible.
  const safeName = String(file.name || 'voucher.pdf')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'voucher.pdf';

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `vouchers/${encodeURIComponent(bookingId)}/${stamp}-${safeName}`;

  try {
    const buffer = await file.arrayBuffer();
    const blob = await put(key, buffer, {
      access: 'public', // not indexed (no /robots), but readable by URL.
                       // The voucher email links the patient to this URL,
                       // so it must be retrievable without auth. Mirrors
                       // how `voucherUrl` already works for SON-hosted
                       // vouchers — the URL itself is the access token.
      contentType: 'application/pdf',
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (err) {
    console.error('[vouchers/pdf-upload] blob put failed', err);
    return NextResponse.json({ error: err.message || 'upload failed' }, { status: 500 });
  }
}
