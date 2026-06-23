// Server-only loader for the SaludOnNet video-consultation pilot.
//
// Reads the manifest published by the weekly scraper to Vercel Blob
// (key = MANIFEST_BLOB_KEY) and caches it for 5 minutes per
// serverless instance. On any failure (Blob unavailable, no manifest
// uploaded yet, fetch error) the loader falls back to the committed
// example JSON so the pilot UI keeps working — worst case stale
// slots, never a 500.

import { list as blobList } from '@vercel/blob';
import {
  VIDEO_PILOT_ENABLED,
  MANIFEST_BLOB_KEY,
  PILOT_SPECIALTIES,
  PILOT_CITIES,
} from './videoPilot';
import { PRICING_TIERS } from './slot-validation';
import exampleManifest from '@/data/videoProviders.example.json';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null; // { fetchedAt, providers }

async function loadManifest() {
  // 1. Try Vercel Blob — written weekly by the scrape-son-video cron.
  try {
    const { blobs } = await blobList({ prefix: MANIFEST_BLOB_KEY });
    const match = (blobs || []).find((b) => b.pathname === MANIFEST_BLOB_KEY);
    if (match?.url) {
      const r = await fetch(match.url, { cache: 'no-store' });
      if (r.ok) {
        const json = await r.json();
        if (Array.isArray(json?.providers)) return json.providers;
      }
    }
  } catch (err) {
    console.warn('[videoProviders] Blob read failed, using example fallback:', err?.message);
  }
  // 2. Fall back to committed example. Always valid, possibly stale.
  return Array.isArray(exampleManifest?.providers) ? exampleManifest.providers : [];
}

/**
 * Returns the list of pilot providers, optionally filtered by
 * specialty + city. Empty list when the flag is off or when the
 * requested specialty/city is out of pilot scope — so the inject
 * sites (search route, batch-slots) can call this unconditionally
 * and let scope decide whether anything comes back.
 */
export async function getVideoProviders({ specialtySlug, city } = {}) {
  if (!VIDEO_PILOT_ENABLED) return [];
  if (specialtySlug && !PILOT_SPECIALTIES.has(specialtySlug)) return [];
  if (city && !PILOT_CITIES.has(city)) return [];

  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    cache = { fetchedAt: Date.now(), providers: await loadManifest() };
  }
  let list = cache.providers;
  if (specialtySlug) {
    list = list.filter((p) => Array.isArray(p.specialtySlugs) && p.specialtySlugs.includes(specialtySlug));
  }
  if (city) {
    list = list.filter((p) => p.city === city);
  }
  return list;
}

/**
 * Single-id lookup. Convenience for batch-slots when it needs the
 * provider's availability + price for a specific `video-…` id.
 */
export async function getVideoProviderById(id) {
  if (!VIDEO_PILOT_ENABLED) return null;
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    cache = { fetchedAt: Date.now(), providers: await loadManifest() };
  }
  return cache.providers.find((p) => p.id === id) || null;
}

/**
 * Map a manifest provider into the clinic-card shape that
 * ClinicCardV2 expects. Fields that don't apply to a video provider
 * (acceptedInsurance, allowsFreeCancel, lat/lng, telephone) collapse
 * to safe defaults so the card renders normally. `deliveryMode` and
 * `externalBookingUrl` are the two pilot-specific extras the card
 * branches on.
 */
export function toClinicCardShape(p) {
  return {
    id: p.id,
    name: p.name,
    city: p.city || '',
    province: p.province || p.city || '',
    address: p.address || 'Videoconsulta',
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviewCount: typeof p.reviewCount === 'number' ? p.reviewCount : 0,
    // No insurance pills on video cards — SaludOnNet handles billing
    // their own way and we don't have the data to claim a coverage
    // mapping here. Empty array → the card simply skips the insurance
    // tags row.
    acceptedInsurance: [],
    allowsFreeCancel: false,
    isPartner: false,
    isPreferential: false,
    specialtyIds: [],
    lat: null,
    lng: null,
    description: null,
    telephone: null,
    smallPictureId: null,
    mediumPictureId: null,
    hasRealSchedule: false,
    // Pilot-specific extras consumed by ClinicCardV2.
    deliveryMode: 'video',
    externalBookingUrl: p.bookingUrl || null,
    specialtyDisplay: p.specialtyDisplay || '',
    servicePrice: p.servicePrice || 0,
    currency: p.currency || 'EUR',
  };
}

/**
 * Convert the manifest's `availability` array into the slot shape
 * the batch-slots endpoint produces for real clinics. Each slot is
 * classified into a PRICING_TIER (1-4) by days-from-now so the
 * card's chip colour + tier-filter behaviour works without
 * branching. Past slots and slots > 45 days out are dropped.
 *
 * Pricing: video providers don't charge our priority fee in the
 * pilot — we display the SaludOnNet service price as the slot
 * price. The card's "tarifa de prioridad" copy is suppressed for
 * video providers (see ClinicCardV2.js).
 */
export function buildSlotsFromAvailability(availability, servicePrice, now = new Date()) {
  if (!Array.isArray(availability)) return [];
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const out = [];
  for (const a of availability) {
    if (!a?.date || !a?.time) continue;
    const slotDate = new Date(`${a.date}T${a.time}:00`);
    if (Number.isNaN(slotDate.getTime())) continue;
    if (slotDate < now) continue; // drop past slots
    const daysOut = Math.floor((slotDate - todayStart) / oneDayMs);
    const tier = PRICING_TIERS.find((t) => daysOut >= t.dayMin && daysOut <= t.dayMax);
    if (!tier) continue; // > 45 days out — dropped
    out.push({
      date: a.date,
      time: a.time,
      available: true,
      tier: tier.tier,
      tierName: tier.name,
      tierLabel: tier.label,
      price: Number(servicePrice) || 0,
      paymentToClinic: 0,
      // marker so getPricingDisplay et al. can branch if needed
      isVideoSlot: true,
    });
  }
  out.sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
  );
  return out;
}

/**
 * For test / debug only. Force the in-memory cache to refresh on the
 * next call.
 */
export function _clearVideoProviderCache() {
  cache = null;
}
