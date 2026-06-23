'use client';
/**
 * SearchResults — client component for /especialistas/[especialidad]/[ciudad].
 *
 * Mirrors the data flow of /search-v2 instead of the legacy mock-driven path
 * that this file used to contain (which only knew about 6 hardcoded clinics
 * in 4 cities and rendered an iframe-OSM map with absolutely-positioned fake
 * pins). Now: real DB clinics via `/api/clinics/search`, real interactive
 * map via the Leaflet-backed `<ClinicMap>` component, real slots via
 * `/api/clinics/batch-slots`.
 *
 * Differences from /search-v2:
 *   - No SearchBarV2 at the top — SEO landings already have the breadcrumb
 *     + hero as navigation, the duplicate search box was the source of the
 *     "starts edge-to-edge but content below sits in .container"
 *     misalignment the user flagged on 2026-04-29.
 *   - specialty + city are FIXED by the route, so this component doesn't
 *     own those filters — only insurance / rating / sort live here.
 *   - No URL-state syncing or infinite scroll: the SEO landing wants to
 *     show the natural set for that specialty+city without forcing the
 *     user to page through. One-shot fetch (limit 30) covers the long
 *     tail of clinics per specialty/city pair.
 */
import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ClinicCardV2 from '@/components/ClinicCardV2';
import ClinicBookingModal from '@/components/ClinicBookingModal';
import MobileStickyBar from '@/components/MobileStickyBar';
import Icon from '@/components/icons/Icon';
import { insuranceCompanies } from '@/data/mock';
import { PARTNER_CLINIC_IDS } from '@/lib/partnerClinics';
// SaludOnNet video-consultation pilot — the Modalidad filter on
// /especialistas only renders when the landing's specialty is in the
// pilot scope. Outside the scope the search returns zero video
// providers anyway, so showing the filter would be misleading.
// Cleanup: drop this import + the chip-group conditional below.
import { PILOT_SPECIALTIES } from '@/lib/videoPilot';
import '../../../search-v2/search-v2.css';

// Per-(specialty, city) tier caps: how many non-partner clinics can
// surface a slot in each tier window. Same caps as /search-v2 so the
// scarcity feel is consistent across both listings. Partners
// (PARTNER_CLINIC_IDS) bypass the cap.
//
// 2026-06-12 — Loosened in lockstep with /search-v2 so the SON-priced
// inventory (clinics with priced procedures but no clinic_schedules)
// reaches the SEO landing page. Same numbers as /search-v2 — keep them
// in sync so a clinic that's visible on /search-v2 is also visible on
// /especialistas/[esp]/[city] and vice versa.
const TIER_CAPS = { 1: 6, 2: 5, 3: 12, 4: 30 };

const TIER_CHIPS = [
  { tier: 1, label: 'Esta semana' },
  { tier: 2, label: '8-15 días' },
  { tier: 3, label: '16-30 días' },
  { tier: 4, label: 'Más adelante' },
];

// ssr:false so Leaflet (which touches window) never participates in SSG.
const ClinicMap = dynamic(() => import('@/components/ClinicMap'), { ssr: false });

const PAGE_SIZE = 30;

/**
 * Props (passed by page.js after resolving the route params):
 *   specialtySlug        — URL slug, e.g. "cardiologia". Used directly as
 *                          the `specialtySlug` query param of /api/clinics/search.
 *   city                 — display name, e.g. "Madrid". Forwarded to both
 *                          /api/clinics/search and to <ClinicMap city={...}>.
 *   expectedClinicCount  — server-side estimate of how many clinics the
 *                          patient will see here (specialty + schedule
 *                          available). Used ONLY to render the right
 *                          number of skeleton cards during loading so the
 *                          container doesn't shrink when real cards
 *                          arrive (Bilbao gineco CLS 0.37 fix). Null when
 *                          DB is unavailable → fallback to 6 skeletons.
 */
const SKELETON_CARD_HEIGHT_PX = 280;
const FALLBACK_SKELETON_COUNT = 6;
const MAX_SKELETON_COUNT = 30; // matches API page-size cap

export default function SearchResults({ specialtySlug, city, expectedClinicCount = null }) {
  // ── Filters that live on this page ──
  // Rating filter + "Ordenar" dropdown removed 2026-06 — listing now
  // differentiates clinics by availability window (tier filter below)
  // + insurance. Server-side ordering inside /api/clinics/search
  // (partner-first → rating DESC → name ASC) is the default.
  const [insuranceFilter, setInsuranceFilter] = useState('');
  // Tier window filter (multi-select). Empty Set = no filter (show all).
  // SEO landings don't currently URL-sync this — they keep the patient
  // on the same page after toggling. Add ?tier= sync later if it becomes
  // a shared-link use case.
  const [tierFilter, setTierFilter] = useState(new Set());
  // SaludOnNet video-consultation pilot — modality filter. Only the
  // chip group renders when the landing's specialty is in pilot scope
  // (see `videoPilotInScope` below). State lives unconditionally so the
  // displayClinics predicate stays simple; on out-of-scope landings the
  // filter is always '' so the predicate is a no-op.
  const videoPilotInScope = PILOT_SPECIALTIES.has(specialtySlug);
  const [modalityFilter, setModalityFilter] = useState('');
  // Desktop opens the map by default, mobile keeps it hidden until toggled.
  const [showMap, setShowMap] = useState(false);
  // 2026-06-16 — Mobile filter drawer state.
  // Previously the Filtros button on MobileStickyBar only scrollIntoView'd
  // an anchor that was already at the top of the viewport → no visible
  // change → Clarity flagged it as a dead click. The 15-jun conversion
  // session recorded exactly this dead click before continuing. We now
  // mirror /search-v2's slide-up sheet pattern: same `.sv2-filters-row--open`
  // CSS already exists, we just need the state + markup wrapper here.
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches) {
      setShowMap(true);
    }
  }, []);

  // ── Real DB clinics (initially null = still loading; [] = nothing found) ──
  const [clinics, setClinics]   = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Slot batch-loading ──
  const [slotsMap, setSlotsMap] = useState({});

  // ── Map bbox refresh (user pan/zoom) ──
  const [mapBounds, setMapBounds] = useState(null);

  // ── Booking modal ──
  const [highlightedId, setHighlightedId]       = useState(null);
  const [modalProvider, setModalProvider]       = useState(null);
  const [modalInitialSlot, setModalInitialSlot] = useState(null);

  // Build the search URL. Includes bbox when the user has panned the map.
  const searchUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (specialtySlug) params.set('specialtySlug', specialtySlug);
    if (city)          params.set('city', city);
    if (mapBounds) {
      const { south, west, north, east } = mapBounds;
      params.set('bbox', `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`);
    }
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', '0');
    return `/api/clinics/search?${params.toString()}`;
  }, [specialtySlug, city, mapBounds]);

  // Load clinics whenever specialty/city/bbox change.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setClinics(null);
    setSlotsMap({});

    fetch(searchUrl)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setClinics(Array.isArray(data.clinics) ? data.clinics : []);
      })
      .catch(() => { if (!cancelled) setClinics([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [searchUrl]);

  // Insurance filter (client-side, API doesn't filter on it) + partner-first
  // hoist. The API already returns partner clinics first
  // (PARTNER_CLINIC_IDS_SQL inside /api/clinics/search) ordered by rating
  // DESC then name; we just re-hoist partners here defensively in case
  // the server order ever drifts.
  const displayClinics = useMemo(() => {
    let list = Array.isArray(clinics) ? [...clinics] : [];
    if (insuranceFilter) {
      list = list.filter((c) =>
        Array.isArray(c.acceptedInsurance) && c.acceptedInsurance.includes(insuranceFilter)
      );
    }
    // SaludOnNet video-consultation pilot — modality predicate. Same
    // semantics as on /search-v2. No-op when modalityFilter is ''.
    if (modalityFilter === 'video') {
      list = list.filter((c) => c.deliveryMode === 'video');
    } else if (modalityFilter === 'in_person') {
      list = list.filter((c) => c.deliveryMode !== 'video');
    }
    // SaludOnNet video-consultation pilot — video providers ranked
    // between partners and the rest so they survive the tier cap
    // below. See the matching comment in /search-v2/page.js.
    list.sort((a, b) => {
      const aIsPartner = !!a.isPartner;
      const bIsPartner = !!b.isPartner;
      if (aIsPartner !== bIsPartner) return aIsPartner ? -1 : 1;
      const aIsVideo = a.deliveryMode === 'video';
      const bIsVideo = b.deliveryMode === 'video';
      if (aIsVideo !== bIsVideo) return aIsVideo ? -1 : 1;
      return 0;
    });
    return list;
  }, [clinics, insuranceFilter, modalityFilter]);

  // Tier filter + cap pass — mirrors /search-v2. See the comment block
  // there for the full semantics. Partners bypass caps.
  const { visibleTiersByClinic, cappedClinics } = useMemo(() => {
    const userTiers = tierFilter.size > 0 ? tierFilter : null;
    const budget = { 1: TIER_CAPS[1], 2: TIER_CAPS[2], 3: TIER_CAPS[3], 4: TIER_CAPS[4] };
    const tiersByClinic = new Map();
    const result = [];
    for (const p of displayClinics) {
      const cs = slotsMap[p.id];
      const slotTiers = cs === undefined
        ? new Set([1, 2, 3, 4])
        : new Set((cs || []).filter((s) => s.available).map((s) => s.tier));
      const candidateTiers = userTiers
        ? new Set([...slotTiers].filter((t) => userTiers.has(t)))
        : slotTiers;
      const isPartner = !!p.isPartner || PARTNER_CLINIC_IDS.has(p.id);
      // Video providers bypass the tier cap — see /search-v2 page.
      const isVideoProvider = p.deliveryMode === 'video';
      const bypassCap = isPartner || isVideoProvider;
      const allowedTiers = new Set();
      for (const t of candidateTiers) {
        if (bypassCap) allowedTiers.add(t);
        else if (budget[t] > 0) { allowedTiers.add(t); budget[t] -= 1; }
      }
      if (allowedTiers.size === 0) continue;
      tiersByClinic.set(p.id, allowedTiers);
      result.push(p);
    }
    return { visibleTiersByClinic: tiersByClinic, cappedClinics: result };
  }, [displayClinics, slotsMap, tierFilter]);

  const toggleTier = (tier) => {
    setTierFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  // Batch-load slots for visible cards. Mirrors search-v2's pattern:
  // staggered batches of 10 (300 ms gap), no preview placeholders (cards
  // show their built-in shimmer until the real slot data lands).
  useEffect(() => {
    if (displayClinics.length === 0) return;
    const unloaded = displayClinics.filter((p) => !(p.id in slotsMap));
    if (unloaded.length === 0) return;

    const BATCH = 10;
    let cancelled = false;
    const ids = unloaded.map((p) => p.id);

    // "Top ranked" non-partner ids — first 3 non-partner clinics in
    // the partner-first display order. Mirror of search-v2; these get
    // tier-1 capped to 1 slot so the "última cita…" pill fires.
    const topRankedIds = displayClinics
      .filter((p) => !p.isPartner)
      .slice(0, 3)
      .map((p) => p.id);
    const topRankedQs = topRankedIds.length
      ? `&topRankedIds=${topRankedIds.join(',')}`
      : '';

    const fetchBatch = (batchIds, delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs))
        .then(() => {
          if (cancelled) return null;
          return fetch(`/api/clinics/batch-slots?ids=${batchIds.join(',')}&preview=true&days=7${topRankedQs}`);
        })
        .then((r) => (r ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.slots) return;
          setSlotsMap((prev) => ({ ...prev, ...data.slots }));
        })
        .catch(() => {});

    for (let i = 0; i < ids.length; i += BATCH) {
      fetchBatch(ids.slice(i, i + BATCH), i === 0 ? 0 : 300);
    }

    // 2026-06-04 — watchdog. Same fix as search-v2: if a clinic's batch
    // gets cancelled mid-delay (300 ms gap on 2nd+ batches) and never
    // fires its fetch, the card stays on shimmer forever. After 8 s,
    // mark any still-missing id as empty array so the card stops
    // shimmering and shows "Sin disponibilidad próxima · Ver opciones"
    // instead of looking broken.
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      setSlotsMap((prev) => {
        const next = { ...prev };
        let touched = false;
        for (const id of ids) {
          if (!(id in next)) {
            next[id] = [];
            touched = true;
          }
        }
        return touched ? next : prev;
      });
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayClinics]);

  const isSinSeguro = insuranceFilter === 'Sin seguro - SaludOnNet';

  return (
    <>
      {/* Filter bar + result count + map toggle.
          Wrapped in `.container` so its left/right edges line up with
          the layout below — the original code had the search bar in
          `.sv2-topbar` (full-width) which made the search field overflow
          the `.container`-bound content underneath. The user flagged
          this on 2026-04-29: "El search box lo alinearía que empiece
          alineado a las fichas de clínicas de abajo y termine alineado
          al final del mapa". This wraps drops the dedicated SearchBarV2
          since the SEO breadcrumb + hero already serve as navigation
          and that's what was producing the misalignment. */}
      {/* Filter row — inline on desktop, slide-up drawer on mobile (<=640px).
          Drawer is triggered by MobileStickyBar's Filtros button below.
          CSS for `.sv2-filters-row--open` already lives in
          src/app/search-v2/search-v2.css (the same drawer used on the
          /search-v2 page) — we just mirror the markup structure here so
          /especialistas pages get the same affordance. */}
      <div
        className={`sv2-filters-row container ${filtersOpen ? 'sv2-filters-row--open' : ''}`}
        aria-hidden={filtersOpen ? 'false' : undefined}
      >
        <div className="sv2-filters" id="esp-filters-anchor" role="group" aria-label="Filtros de búsqueda">
          {/* Drawer header — visible only on mobile when the sheet is open,
              hidden inline on desktop (CSS handles the visibility). */}
          <div className="sv2-filters-header">
            <span className="sv2-filters-title">Filtros</span>
            <button
              type="button"
              className="sv2-filters-close"
              onClick={() => setFiltersOpen(false)}
              aria-label="Cerrar filtros"
            >
              ✕
            </button>
          </div>

          <div className="sv2-filter-group">
            <label className="sv2-filter-label">Aseguradora</label>
            <select
              className="sv2-select"
              value={insuranceFilter}
              onChange={(e) => setInsuranceFilter(e.target.value)}
            >
              <option value="">Todas las aseguradoras</option>
              {insuranceCompanies.map((ins) => (
                <option key={ins} value={ins}>{ins}</option>
              ))}
            </select>
          </div>

          {/* SaludOnNet video-consultation pilot — only renders for
              derma / uro / gine landings. On other landings the
              search returns zero video providers so the filter would
              do nothing. Cleanup: drop this entire <div>. */}
          {videoPilotInScope && (
            <div className="sv2-filter-group">
              <label className="sv2-filter-label">Modalidad</label>
              <div className="sv2-tier-chips" role="group" aria-label="Filtrar por modalidad de consulta">
                {[
                  { value: '',          label: 'Todos' },
                  { value: 'in_person', label: 'Presencial' },
                  { value: 'video',     label: 'Videoconsulta' },
                ].map(({ value, label }) => {
                  const active = modalityFilter === value;
                  return (
                    <button
                      key={value || 'all'}
                      type="button"
                      aria-pressed={active}
                      className={`sv2-tier-chip ${active ? 'sv2-tier-chip--active' : ''}`}
                      onClick={() => setModalityFilter(value)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sv2-filter-group">
            <label className="sv2-filter-label">Disponibilidad</label>
            <div className="sv2-tier-chips" role="group" aria-label="Filtrar por ventana de disponibilidad">
              {TIER_CHIPS.map(({ tier, label }) => {
                const active = tierFilter.has(tier);
                return (
                  <button
                    key={tier}
                    type="button"
                    aria-pressed={active}
                    className={`sv2-tier-chip ${active ? 'sv2-tier-chip--active' : ''}`}
                    onClick={() => toggleTier(tier)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* "Valoración" filter + "Ordenar" dropdown removed 2026-06.
              Sort is partner-first → server default (rating DESC / name). */}

          <div className="sv2-filter-group sv2-filter-group--right">
            <span className="sv2-count">
              <strong>{cappedClinics.length}</strong> centros
            </span>
            <button
              type="button"
              className="sv2-map-toggle"
              onClick={() => setShowMap((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {/* Lucide `map` instead of 🗺️ — the emoji doesn't render on
                  Edge/Chromium on Windows without a colour-emoji font, so
                  the toggle looked unlabelled in production. */}
              <Icon name="map" size={16} />
              {showMap ? 'Ocultar mapa' : 'Ver mapa'}
            </button>
          </div>

          {/* Apply button — visible only inside the mobile drawer (CSS).
              Closes the sheet; filter changes are already applied live via
              useState so there's no separate "submit" semantics. */}
          <div className="sv2-filters-apply-wrap">
            <button type="button" className="sv2-filters-apply" onClick={() => setFiltersOpen(false)}>
              Aplicar
            </button>
          </div>
        </div>
        {filtersOpen && (
          <div
            className="sv2-filters-backdrop"
            onClick={() => setFiltersOpen(false)}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Two-column layout (single column when map is hidden).
          Same `.sv2-layout container` shell as /search-v2 so the visuals
          match what the user already knows from the main search page. */}
      <div className={`sv2-layout container ${showMap ? '' : 'sv2-layout--list-only'}`}>
        {/* Left: cards.
            2026-06-16 — CLS hard fix for low-inventory cities.
            Previously this reserved a flat 1800 px while loading. For
            Bilbao gineco (1 real clinic ~280 px) that collapsed to ~280 px
            after fetch — a 1500 px upward shift of the FAQ / testimonials
            below = CLS 0.37 in a real 14-jun Clarity session. We now
            render exactly `expectedClinicCount` skeleton cards (from the
            server-side count, same query as the noindex threshold), so
            the container size during loading matches the size after load.
            Falls back to 6 skeletons when expectedClinicCount is null
            (DB unavailable in dev / preview). */}
        <div className="sv2-left">
          <div className="sv2-results">
            {cappedClinics.length > 0 ? (
              cappedClinics.map((provider, i) => (
                <ClinicCardV2
                  key={provider.id}
                  provider={provider}
                  index={i}
                  basePrice={0}
                  isSinSeguro={isSinSeguro}
                  highlighted={highlightedId === provider.id}
                  onOpenModal={(p, slot) => {
                    setModalProvider(p);
                    setModalInitialSlot(slot ?? null);
                  }}
                  slots={slotsMap[provider.id]}
                  visibleTiers={visibleTiersByClinic.get(provider.id) || null}
                />
              ))
            ) : isLoading ? (
              // 2026-06-16 — Replace flat "Cargando centros…" with N skeleton
              // cards that match the expected size of the real listing, so
              // when real cards arrive there's no upward shift (bilbao CLS
              // 0.37 fix). Skeletons are styled as muted cv2-card silhouettes.
              (() => {
                const skeletonCount = Math.min(
                  MAX_SKELETON_COUNT,
                  Math.max(
                    1,
                    Number.isFinite(expectedClinicCount) && expectedClinicCount > 0
                      ? expectedClinicCount
                      : FALLBACK_SKELETON_COUNT,
                  ),
                );
                return Array.from({ length: skeletonCount }).map((_, i) => (
                  <div
                    key={`skel-${i}`}
                    className="cv2-card cv2-card--skeleton"
                    style={{ minHeight: SKELETON_CARD_HEIGHT_PX }}
                    aria-hidden="true"
                  />
                ));
              })()
            ) : (
              <div className="sv2-empty">
                <p>No encontramos centros con estos filtros.</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
                  Prueba a cambiar la aseguradora o la valoración mínima.
                </p>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => { setInsuranceFilter(''); setTierFilter(new Set()); setModalityFilter(''); }}
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: real Leaflet map. Re-mounted on city change (key=city)
            so the inner user-interaction flag resets and the map recenters
            on the new city instead of staying stuck on a previous pan. */}
        {/* Right: real Leaflet map. The wrap reserves 500 px so Leaflet's
            late hydration doesn't push neighbouring content (sv2-left)
            around. ClinicMap is dynamic({ ssr: false }) so without this
            the wrap is 0 px until Leaflet mounts. */}
        {showMap && (
          <div className="sv2-map-panel">
            <div className="sv2-map-wrap" style={{ minHeight: '500px' }}>
              <ClinicMap
                key={city || 'all'}
                providers={cappedClinics.filter((p) => p.lat && p.lng)}
                highlightedId={highlightedId}
                city={city}
                onPinClick={(p) => {
                  // 2026-06-12 — Pin click → scroll listing to the
                  // clinic + highlight. Same behaviour as /search-v2 so
                  // map ⇄ listing interaction is consistent. See the
                  // matching comment in src/app/search-v2/page.js for
                  // the Clarity-session rationale.
                  setHighlightedId(p.id);
                  if (typeof document !== 'undefined') {
                    const el = document.getElementById(`clinic-card-${p.id}`);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }
                }}
                onBoundsChange={setMapBounds}
              />
            </div>
          </div>
        )}
      </div>

      {/* Booking modal */}
      {modalProvider && (
        <ClinicBookingModal
          provider={modalProvider}
          isSinSeguro={isSinSeguro}
          initialSlot={modalInitialSlot}
          initialSpecialtySlug={specialtySlug}
          initialInsurance={isSinSeguro ? '' : insuranceFilter}
          /* Same scarcity-cap forward as /search-v2 — see comment there. */
          isTopRanked={
            !modalProvider.isPartner
            && displayClinics.filter((p) => !p.isPartner).slice(0, 3).some((p) => p.id === modalProvider.id)
          }
          onClose={() => {
            setModalProvider(null);
            setModalInitialSlot(null);
          }}
        />
      )}

      {/* Mobile sticky bottom bar — only visible <=900px (CSS-controlled).
          Filtros button scrolls to the inline filter row; Ver mapa toggles
          the dynamic ClinicMap panel that's hidden by default on mobile. */}
      <MobileStickyBar
        filterCount={
          (insuranceFilter ? 1 : 0)
          + (tierFilter.size > 0 ? 1 : 0)
          + (modalityFilter ? 1 : 0)
        }
        onOpenFilters={() => {
          // 2026-06-16 — Previously a no-op scrollIntoView on an anchor
          // that was usually already in view (Clarity flagged this as
          // dead click in the 15-jun conversion session). Now opens
          // the slide-up drawer via the .sv2-filters-row--open class,
          // mirroring /search-v2's pattern.
          setFiltersOpen(true);
        }}
        isMapOpen={showMap}
        onToggleMap={() => setShowMap((v) => !v)}
      />
    </>
  );
}
