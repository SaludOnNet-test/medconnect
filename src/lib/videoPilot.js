// SaludOnNet video-consultation pilot — feature flag + scope.
//
// Single source of truth for the pilot. Flip VIDEO_PILOT_ENABLED to
// false and the entire feature disappears from the UI and APIs. To
// REMOVE the pilot completely: delete this file, the matching
// `src/lib/videoProviders.js`, the example manifest, the scraper
// route, and revert the three small injection blocks that import
// from here (search route, batch-slots route, ClinicCardV2,
// search-v2 page, especialistas SearchResults, vercel.json cron).

// 2026-06-24 — Back ON with authentic SaludOnNet data. The
// committed manifest now mirrors 29 doctors transcribed by hand
// from screenshots of saludonnet.com/video-consulta-agendas (real
// names, colegiado numbers, prices, languages, weekly patterns).
// The `weeklyPattern` field on each provider is replayed by
// buildSlotsFromWeeklyPattern() in src/lib/videoProviders.js for
// the next ~8 weeks at request time, so we don't need to update
// dated slots until SaludOnNet's own schedule changes.
export const VIDEO_PILOT_ENABLED = true;

// Specialties in scope for the pilot. Anything outside this set will
// not receive video providers, even if the manifest contains entries
// for it.
//   2026-06-23 — launched with derma + uro + gine
//   2026-06-24 — expanded to 11 specialties.
// The two with existing /especialistas landings (traumatologia +
// cardiologia, plus the original 3) surface video providers on the
// landing AND on /search-v2. The six without landings
// (endocrinologia, medicina-general, nutricion, pediatria,
// psicologia, psiquiatria) surface only on /search-v2 when filtered
// by the slug — the modality + specialty filter combination there
// works as the de-facto landing during the pilot.
export const PILOT_SPECIALTIES = new Set([
  'dermatologia',
  'urologia',
  'ginecologia',
  'traumatologia',
  'cardiologia',
  'endocrinologia',
  'medicina-general',
  'nutricion',
  'pediatria',
  'psicologia',
  'psiquiatria',
]);

// 2026-06-24 — Cities are intentionally NOT gated. Videoconsultations
// are remote, so a Vigo patient on `/especialistas/dermatologia/vigo`
// can consult Ana López who is based in Madrid via video. Listing the
// same video doctors on every city landing for a pilot specialty
// matches the actual delivery model. The constant is retained as
// `null` for backwards-compatibility with any imports — the loader
// no longer reads it.
export const PILOT_CITIES = null;

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

// UTM for the SaludOnNet booking URL that Ops forwards to the patient
// after manually reserving the slot. Lets SaludOnNet attribute the
// traffic to this pilot in their own analytics.
export function utmFor(specialty) {
  const tag = (specialty || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `utm_source=medconnect&utm_medium=marketplace&utm_campaign=video-pilot&utm_content=${tag}`;
}
