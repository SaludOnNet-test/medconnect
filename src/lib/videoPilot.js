// SaludOnNet video-consultation pilot — feature flag + scope.
//
// Single source of truth for the pilot. Flip VIDEO_PILOT_ENABLED to
// false and the entire feature disappears from the UI and APIs. To
// REMOVE the pilot completely: delete this file, the matching
// `src/lib/videoProviders.js`, the example manifest, the scraper
// route, and revert the three small injection blocks that import
// from here (search route, batch-slots route, ClinicCardV2,
// search-v2 page, especialistas SearchResults, vercel.json cron).

export const VIDEO_PILOT_ENABLED = true;

// Specialties in scope for the pilot. Anything outside this set will
// not receive video providers, even if the manifest contains entries
// for it. Pilot launched 2026-06-23 with derma + uro + gine.
export const PILOT_SPECIALTIES = new Set(['dermatologia', 'urologia', 'ginecologia']);

// Cities in scope.
export const PILOT_CITIES = new Set(['Madrid']);

// Provider ids live in a separate ID-space so they cannot collide
// with DB clinic ids (which are numeric INTs). Card rendering and
// slot fetching dispatch on this prefix.
export const VIDEO_PROVIDER_ID_PREFIX = 'video-';
export const isVideoProviderId = (id) =>
  typeof id === 'string' && id.startsWith(VIDEO_PROVIDER_ID_PREFIX);

// Blob key. The weekly cron writes here; the runtime endpoints read
// here. Lives in the same `medconnect-pro-verification` Blob store
// (BLOB_READ_WRITE_TOKEN already wired in the project env).
export const MANIFEST_BLOB_KEY = 'video-pilot/saludonnet-video-providers.json';

// UTM for the outbound redirect — so SaludOnNet-side analytics tag
// traffic coming from this pilot and we can correlate clicks with
// downstream conversions.
export function utmFor(specialty) {
  const tag = (specialty || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `utm_source=medconnect&utm_medium=marketplace&utm_campaign=video-pilot&utm_content=${tag}`;
}
