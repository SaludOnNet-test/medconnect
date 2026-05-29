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
import '../../../search-v2/search-v2.css';

// ssr:false so Leaflet (which touches window) never participates in SSG.
const ClinicMap = dynamic(() => import('@/components/ClinicMap'), { ssr: false });

const PAGE_SIZE = 30;

/**
 * Props (passed by page.js after resolving the route params):
 *   specialtySlug   — URL slug, e.g. "cardiologia". Used directly as the
 *                     `specialtySlug` query param of /api/clinics/search.
 *   city            — display name, e.g. "Madrid". Forwarded to both
 *                     /api/clinics/search and to <ClinicMap city={...}>.
 */
export default function SearchResults({ specialtySlug, city }) {
  // ── Filters that live on this page ──
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [ratingFilter, setRatingFilter]       = useState(0);
  const [sortBy, setSortBy]                   = useState('rating');
  // Desktop opens the map by default, mobile keeps it hidden until toggled.
  const [showMap, setShowMap] = useState(false);
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
    if (ratingFilter > 0) params.set('rating', String(ratingFilter));
    if (mapBounds) {
      const { south, west, north, east } = mapBounds;
      params.set('bbox', `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`);
    }
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', '0');
    return `/api/clinics/search?${params.toString()}`;
  }, [specialtySlug, city, ratingFilter, mapBounds]);

  // Load clinics whenever specialty/city/rating/bbox change.
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

  // Apply client-side filters (insurance) + sort. Insurance lives client-side
  // because the API doesn't filter on it — it returns the per-clinic list.
  //
  // 2026-05-29 — mirror search-v2's partner-first sort. The API returns
  // partners first (PARTNER_CLINIC_IDS_SQL in /api/clinics/search), but the
  // client-side `rating` / `reviews` sort below would otherwise bury partner
  // clinics (e.g. Centro Médico Cea Bermúdez, id=1) below higher-rated
  // non-partner ones. Critical for /especialistas/cardiologia/madrid and
  // /especialistas/ginecologia/madrid — both linked from active SEM
  // campaigns and where Cea Bermúdez is the operationally-vetted destination.
  const displayClinics = useMemo(() => {
    let list = Array.isArray(clinics) ? [...clinics] : [];
    if (insuranceFilter) {
      list = list.filter((c) =>
        Array.isArray(c.acceptedInsurance) && c.acceptedInsurance.includes(insuranceFilter)
      );
    }
    list.sort((a, b) => {
      // 1. Partner clinics always first, regardless of sort selection.
      if (!!a.isPartner !== !!b.isPartner) return a.isPartner ? -1 : 1;
      // 2. Then by the user's chosen criterion.
      if (sortBy === 'rating')  return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'reviews') return (b.reviewCount || 0) - (a.reviewCount || 0);
      return 0;
    });
    return list;
  }, [clinics, insuranceFilter, sortBy]);

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

    const fetchBatch = (batchIds, delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs))
        .then(() => {
          if (cancelled) return null;
          return fetch(`/api/clinics/batch-slots?ids=${batchIds.join(',')}&preview=true&days=7`);
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

    return () => { cancelled = true; };
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
      <div className="container">
        <div className="sv2-filters" id="esp-filters-anchor">
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

          <div className="sv2-filter-group">
            <label className="sv2-filter-label">Valoración</label>
            <div className="sv2-rating-chips">
              {[
                { v: 0,   label: 'Todos' },
                { v: 3,   label: '★ 3+' },
                { v: 4,   label: '★ 4+' },
                { v: 4.5, label: '★ 4.5+' },
              ].map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  className={`sv2-chip ${ratingFilter === v ? 'sv2-chip--active' : ''}`}
                  onClick={() => setRatingFilter(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="sv2-filter-group">
            <label className="sv2-filter-label">Ordenar</label>
            <select
              className="sv2-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="rating">Mejor valorados</option>
              <option value="reviews">Más opiniones</option>
            </select>
          </div>

          <div className="sv2-filter-group sv2-filter-group--right">
            <span className="sv2-count">
              <strong>{displayClinics.length}</strong> centros
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
        </div>
      </div>

      {/* Two-column layout (single column when map is hidden).
          Same `.sv2-layout container` shell as /search-v2 so the visuals
          match what the user already knows from the main search page. */}
      <div className={`sv2-layout container ${showMap ? '' : 'sv2-layout--list-only'}`}>
        {/* Left: cards */}
        <div className="sv2-left">
          <div className="sv2-results">
            {displayClinics.length > 0 ? (
              displayClinics.map((provider, i) => (
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
                />
              ))
            ) : isLoading ? (
              <div className="sv2-empty">
                <p style={{ color: 'var(--fg-muted)' }}>Cargando centros…</p>
              </div>
            ) : (
              <div className="sv2-empty">
                <p>No encontramos centros con estos filtros.</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
                  Prueba a cambiar la aseguradora o la valoración mínima.
                </p>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => { setInsuranceFilter(''); setRatingFilter(0); }}
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
        {showMap && (
          <div className="sv2-map-panel">
            <div className="sv2-map-wrap">
              <ClinicMap
                key={city || 'all'}
                providers={displayClinics.filter((p) => p.lat && p.lng)}
                highlightedId={highlightedId}
                city={city}
                onPinClick={(p) => {
                  setHighlightedId(p.id);
                  setModalProvider(p);
                  setModalInitialSlot(null);
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
          (insuranceFilter ? 1 : 0) + (ratingFilter > 0 ? 1 : 0) + (sortBy !== 'rating' ? 1 : 0)
        }
        onOpenFilters={() => {
          const anchor = document.getElementById('esp-filters-anchor');
          if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        isMapOpen={showMap}
        onToggleMap={() => setShowMap((v) => !v)}
      />
    </>
  );
}
