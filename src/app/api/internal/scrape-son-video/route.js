// GET /api/internal/scrape-son-video
//
// Weekly cron (Mondays 03:00 UTC ≈ 04:00 Madrid winter / 05:00
// Madrid summer) that refreshes the SaludOnNet video-consultation
// manifest in Vercel Blob.
//
// Pilot scope: dermatology, urology + gynaecology in Madrid only.
//
// STATUS (2026-06-23 pilot launch): the HTML parser for SaludOnNet's
// /video-consulta-agendas pages is NOT yet implemented — `cheerio`
// isn't a project dependency and the page's structure is still being
// reverse-engineered. For the pilot launch this route:
//   1. Authenticates the call (CRON_SECRET).
//   2. Verifies connectivity to SaludOnNet for each pilot specialty
//      (HEAD request) so we know the upstream isn't dark.
//   3. Re-uploads the committed example manifest to Blob if no
//      manifest exists there yet — so the runtime loader picks it
//      up from Blob on the next 5-minute cache miss and we exercise
//      the read path end-to-end.
//   4. Reports counts to Sentry so a silent break is visible.
//
// When the HTML parser ships, replace `scrapeProvidersFromHtml` below
// with the real cheerio-driven extraction. Everything else (auth,
// blob upload, telemetry) stays.

import { NextResponse } from 'next/server';
import { put as blobPut, list as blobList } from '@vercel/blob';
import {
  VIDEO_PILOT_ENABLED,
  PILOT_SPECIALTIES,
  MANIFEST_BLOB_KEY,
} from '@/lib/videoPilot';
import { captureException } from '@/lib/sentry';
import exampleManifest from '@/data/videoProviders.example.json';

export const dynamic = 'force-dynamic';

const UPSTREAM_BASE = 'https://www.saludonnet.com/video-consulta-agendas';
const USER_AGENT = 'MedconnectBot/1.0 (+https://www.medconnect.es/bot)';

function authorize(request) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const secret = bearer || request.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'development') return { ok: true };
  if (!expected) return { ok: false, status: 503, error: 'cron_not_configured' };
  if (secret !== expected) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

async function probeUpstream(specialty) {
  // HEAD request — cheap connectivity check. We rate-limit ourselves
  // to ≤ 1 req/sec against SaludOnNet (sister property; stakeholder
  // sign-off is in place per the pilot plan).
  const url = `${UPSTREAM_BASE}?specialty=${encodeURIComponent(specialty)}`;
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': USER_AGENT } });
    return { specialty, ok: r.ok, status: r.status };
  } catch (err) {
    return { specialty, ok: false, status: 0, error: err?.message };
  }
}

// TODO (post-pilot): implement actual HTML parsing here.
// For the pilot, return null → the route uses the committed example
// when no Blob manifest exists yet, and skips the upload otherwise.
async function scrapeProvidersFromHtml(/* html, specialty */) {
  return null; // parser not implemented yet
}

async function blobAlreadyHasManifest() {
  try {
    const { blobs } = await blobList({ prefix: MANIFEST_BLOB_KEY });
    return (blobs || []).some((b) => b.pathname === MANIFEST_BLOB_KEY);
  } catch {
    return false;
  }
}

export async function GET(request) {
  if (!VIDEO_PILOT_ENABLED) {
    return NextResponse.json({ ok: true, skipped: 'pilot_disabled' });
  }

  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const probes = [];
  for (const specialty of PILOT_SPECIALTIES) {
    // sequential, with a 1 s pause between requests to stay polite
    // even though we only ping 3 URLs.
    // eslint-disable-next-line no-await-in-loop
    probes.push(await probeUpstream(specialty));
    // eslint-disable-next-line no-await-in-loop
    await new Promise((res) => setTimeout(res, 1000));
  }
  const allUpstreamOk = probes.every((p) => p.ok);

  // Aggregate scrape — currently always returns null because the
  // parser isn't shipped yet (see TODO above). Once implemented,
  // merge per-specialty results and write to Blob.
  let scrapedProviders = null;
  try {
    scrapedProviders = await scrapeProvidersFromHtml();
  } catch (err) {
    captureException(err, { feature: 'video-pilot', step: 'scrape' });
  }

  let uploaded = false;
  let uploadReason = 'no_parser_yet';
  try {
    if (Array.isArray(scrapedProviders) && scrapedProviders.length > 0) {
      // Real scrape succeeded — write it.
      const manifest = {
        scrapedAt: new Date().toISOString(),
        providers: scrapedProviders,
      };
      await blobPut(MANIFEST_BLOB_KEY, JSON.stringify(manifest, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      uploaded = true;
      uploadReason = 'scrape_ok';
    } else if (!(await blobAlreadyHasManifest())) {
      // First-run bootstrap — seed Blob with the committed example so
      // the loader's primary path is exercised on the next request.
      await blobPut(MANIFEST_BLOB_KEY, JSON.stringify(exampleManifest, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      uploaded = true;
      uploadReason = 'bootstrap_example';
    }
  } catch (err) {
    captureException(err, { feature: 'video-pilot', step: 'blob_upload' });
    uploadReason = `upload_error:${err?.message || 'unknown'}`;
  }

  if (!allUpstreamOk) {
    // No captureMessage helper in the lite Sentry transport; fake it
    // with a plain Error so the scraper failure still surfaces.
    captureException(new Error('video-pilot scraper: upstream connectivity degraded'), {
      feature: 'video-pilot',
      probes,
    });
  }

  return NextResponse.json({
    ok: true,
    upstream: probes,
    uploaded,
    uploadReason,
    parserImplemented: false,
  });
}
