'use client';
import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import Icon from '@/components/icons/Icon';
import Eyebrow from '@/components/brand/Eyebrow';
import ClinicCardV2 from '@/components/ClinicCardV2';
import ClinicBookingModal from '@/components/ClinicBookingModal';
import { insuranceCompanies } from '@/data/mock';
import { normalizeText } from '@/lib/text';
import { PARTNER_CLINIC_IDS } from '@/lib/partnerClinics';

// Caps per (specialty, city) search — how many non-partner clinics may
// surface a slot in each tier window. Creates the scarcity feeling
// requested in 2026-06. Partner clinics (Cea Bermúdez and any others in
// PARTNER_CLINIC_IDS) bypass the cap entirely so they always show every
// tier they have.
//
// 2026-06-12 — Loosened to absorb the SON-priced inventory. Yesterday's
// clinic_specialties backfill from clinic_procedures grew the pool from
// ~9 to ~74 candidates per top page (e.g. ginecologia/Madrid), but the
// previous caps {1:3,2:2,3:4,4:8} kept only ~9 visible. Bumping tier-4
// to 30 — the API page size — effectively removes the catch-all cap so
// every clinic the API returns can surface; tiers 1-3 stay capped to
// preserve the "esta semana" scarcity bite at the top of the list.
const TIER_CAPS = { 1: 6, 2: 5, 3: 12, 4: 30 };

// Tier-window filter chip definitions. The user picks one or more
// windows; cards then only show slot chips whose tier is in the set.
// dayMin/dayMax are documentation only — the actual mapping happens
// via slot.tier in the slot generator.
const TIER_CHIPS = [
  { tier: 1, label: 'Esta semana' },
  { tier: 2, label: '8-15 días' },
  { tier: 3, label: '16-30 días' },
  { tier: 4, label: 'Más adelante' },
];

// 2026-04-28 — Clerk auto-detection pulled. Deep-linking with
// `?asProfessional=true` still flips the booking-modal flag, and once we
// understand why the inline `require('@clerk/nextjs')` bridge breaks
// production hydration on this route specifically (it works fine on
// /pro/dashboard) we can re-add a guarded version. Item 1 stays usable
// for now via the URL param — pros that come from a referral entry-point
// keep the pre-checked toggle.
// First-paint fallback: real (possibly stale) clinics snapshotted from DB.
// Regenerate with `python scripts/snapshot_clinics_for_search.py`.
import clinicsSnapshot from '@/data/clinics-snapshot.json';
import './search-v2.css';

const ClinicMap = dynamic(() => import('@/components/ClinicMap'), { ssr: false });

const PAGE_SIZE_INITIAL = 20;
const PAGE_SIZE_MORE = 10;

const SNAPSHOT_CLINICS = clinicsSnapshot.clinics || [];

function SearchV2Content() {
  const searchParams = useSearchParams();
  const specialtySlugParam = searchParams.get('specialtySlug') || '';
  const specialtyIdParam   = searchParams.get('specialty') || '';
  const serviceId          = searchParams.get('service') || '';
  const cityParam          = searchParams.get('city') || '';
  const providerNameParam  = searchParams.get('providerName') || '';
  // ?asProfessional=true — explicit deep-link from a "derivar un paciente"
  // entry-point. Forwarded to the booking modal so /book lands with the
  // pro toggle checked. Auto-detected pro Clerk users get the same flag.
  const asProfessionalParam = searchParams.get('asProfessional') === 'true';

  // Pro mode is now URL-only on this route — see the comment near the
  // top of the file for the rollback rationale.
  const isPro = asProfessionalParam;

  // Filter state. Rating filter + "Ordenar" dropdown removed 2026-06 —
  // the patient-facing listing now only differentiates clinics by
  // availability window (tier filter below) and insurance. Ordering is
  // server-driven (partner-first → rating DESC → name) inside
  // /api/clinics/search, which is the right default for both the SEO
  // landing pages and the in-app search.
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [showMap, setShowMap]                 = useState(false);
  const [filtersOpen, setFiltersOpen]         = useState(false);
  // Tier window filter (multi-select). Empty Set = no filter (show all).
  // URL hydrates from `tier=1,2`; mirrors back on toggle so a shared link
  // preserves the patient's "esta semana" choice. Set semantics are easier
  // to .has() check against than an array.
  const [tierFilter, setTierFilter] = useState(() => {
    const raw = searchParams.get('tier') || '';
    return new Set(raw.split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 4));
  });

  // Desktop (>900px) opens the map by default; mobile keeps it hidden.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches) {
      setShowMap(true);
    }
  }, []);

  // Real DB filter options
  const [dbSpecialties, setDbSpecialties] = useState([]);
  const [dbCities, setDbCities]           = useState([]);
  const [dbProcedures, setDbProcedures]   = useState([]);

  // Active filter values
  const [specialtySlug, setSpecialtySlug] = useState(specialtySlugParam);
  const [procedureSlug, setProcedureSlug] = useState('');
  const [cityFilter, setCityFilter]       = useState(cityParam);

  // Results state
  const [dbClinics, setDbClinics]     = useState(null);
  const [totalCount, setTotalCount]   = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [isLoading, setIsLoading]     = useState(false);
  const [hasMore, setHasMore]         = useState(false);

  // Highlight & modal
  const [highlightedId, setHighlightedId]     = useState(null);
  const [modalProvider, setModalProvider]     = useState(null);
  const [modalInitialSlot, setModalInitialSlot] = useState(null);

  // Map-driven bbox refresh — once the user pans / zooms, the map fires
  // onBoundsChange with the visible rectangle. We persist that into
  // mapBounds, which buildUrl appends to the search query so both the
  // list and the bubbles re-snap to what's visible. null = no bbox active
  // (initial load or filter reset).
  const [mapBounds, setMapBounds] = useState(null);

  // Slot batch-loading — one request per group of cards, fired from the page (not per-card)
  const [slotsMap, setSlotsMap] = useState({});

  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  // Sync filter states when URL params change (e.g. after SearchBarV2 navigation)
  useEffect(() => { setCityFilter(cityParam); }, [cityParam]);
  useEffect(() => {
    if (specialtySlugParam) {
      setSpecialtySlug(specialtySlugParam);
    } else if (specialtyIdParam && dbSpecialties.length > 0) {
      const sp = dbSpecialties.find((s) => String(s.id) === specialtyIdParam);
      setSpecialtySlug(sp ? sp.slug : '');
    } else if (!specialtySlugParam && !specialtyIdParam) {
      setSpecialtySlug('');
    }
  }, [specialtySlugParam, specialtyIdParam, dbSpecialties]);

  // Load filter options once
  useEffect(() => {
    fetch('/api/clinics/filters')
      .then((r) => r.json())
      .then((data) => {
        if (data.specialties) setDbSpecialties(data.specialties);
        if (data.cities)      setDbCities(data.cities);
        if (data.procedures)  setDbProcedures(data.procedures);
      })
      .catch(() => {});
  }, []);

  const buildUrl = useCallback((offset, limit) => {
    const params = new URLSearchParams();
    if (cityFilter)        params.set('city', cityFilter);
    if (specialtySlug)     params.set('specialtySlug', specialtySlug);
    else if (specialtyIdParam) params.set('specialty', specialtyIdParam);
    if (procedureSlug)     params.set('procedureSlug', procedureSlug);
    if (providerNameParam) params.set('name', providerNameParam);
    if (mapBounds) {
      const { south, west, north, east } = mapBounds;
      params.set('bbox', `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`);
    }
    params.set('limit', limit);
    params.set('offset', offset);
    return `/api/clinics/search?${params.toString()}`;
  }, [cityFilter, specialtySlug, specialtyIdParam, procedureSlug, providerNameParam, mapBounds]);

  // When the user picks a different city / specialty / procedure, wipe
  // any map-driven bbox — those filters override the spatial scope.
  // Insurance lives client-side and doesn't trigger a refetch, so it
  // doesn't need to clear bounds.
  useEffect(() => {
    setMapBounds(null);
  }, [cityFilter, specialtySlug, procedureSlug]);

  // Initial load / filter change — also reset slot state.
  // Bumps page size to 50 when a bbox is active so the map can show every
  // clinic in the visible rectangle on the first paint without forcing the
  // user to scroll.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDbClinics(null);
    setLoadedCount(0);
    setHasMore(false);
    setSlotsMap({});

    const initialSize = mapBounds ? 50 : PAGE_SIZE_INITIAL;
    fetch(buildUrl(0, initialSize))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.clinics) {
          setDbClinics(data.clinics);
          setTotalCount(data.total || 0);
          setLoadedCount(data.clinics.length);
          setHasMore((data.total || 0) > data.clinics.length);
        }
      })
      .catch(() => { if (!cancelled) setDbClinics([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [buildUrl]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    fetch(buildUrl(loadedCount, PAGE_SIZE_MORE))
      .then((r) => r.json())
      .then((data) => {
        if (data.clinics) {
          setDbClinics((prev) => [...(prev || []), ...data.clinics]);
          // 2026-06-04 — single functional update that computes both the
          // new loadedCount and the corresponding hasMore in lock-step.
          // The previous code used `loadedCount` from closure when setting
          // hasMore, which after rapid scroll could be off by one PAGE_SIZE
          // and lock the listing at "no more" while real results remained.
          setLoadedCount((c) => {
            const next = c + data.clinics.length;
            setHasMore((data.total || 0) > next);
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isLoading, hasMore, buildUrl, loadedCount]);

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMore]);

  // Real DB result if loaded; otherwise fall back to a real (possibly stale)
  // snapshot so the first paint shows actual clinics, not the legacy mock.
  const baseProviders = dbClinics ?? SNAPSHOT_CLINICS;

  const displayProviders = useMemo(() => {
    let list = [...baseProviders];
    if (insuranceFilter) {
      list = list.filter((p) =>
        Array.isArray(p.acceptedInsurance) && p.acceptedInsurance.includes(insuranceFilter)
      );
    }
    // Partner-first stable sort. The API already returns the page in
    // (is_preferential DESC → rating DESC → name ASC) order, so the
    // only adjustment we make client-side is hoisting partner clinics
    // (PARTNER_CLINIC_IDS) above non-partners regardless of the API's
    // own ordering. Everything else stays in the server's order.
    list.sort((a, b) => {
      if (!!a.isPartner !== !!b.isPartner) return a.isPartner ? -1 : 1;
      return 0;
    });
    return list;
  }, [baseProviders, insuranceFilter]);

  // Per-clinic tier visibility map after applying the user's tier filter
  // AND the per-tier caps. The map is keyed by clinic id; the value is a
  // Set of tier numbers that clinic is allowed to surface on this view.
  // A clinic absent from the map shows no tiers and gets filtered out
  // of `cappedProviders` below.
  //
  // Cap walk order: providers are already partner-sorted (partner first,
  // then rating/reviews). We iterate and consume the cap budget per
  // tier; partner clinics bypass the cap entirely so Cea Bermúdez and
  // any other entry in PARTNER_CLINIC_IDS always keep every tier.
  const { visibleTiersByClinic, cappedProviders } = useMemo(() => {
    const userTiers = tierFilter.size > 0 ? tierFilter : null;
    const budget = { 1: TIER_CAPS[1], 2: TIER_CAPS[2], 3: TIER_CAPS[3], 4: TIER_CAPS[4] };
    const tiersByClinic = new Map();
    const result = [];
    for (const p of displayProviders) {
      const clinicSlots = slotsMap[p.id];
      // Slots haven't loaded yet → assume the clinic has all 4 tiers so
      // we don't accidentally hide it during the skeleton flash. Once
      // batch-slots resolves the memo re-runs with the real tier bag.
      const slotTiers = clinicSlots === undefined
        ? new Set([1, 2, 3, 4])
        : new Set((clinicSlots || []).filter((s) => s.available).map((s) => s.tier));
      // Intersect with user's chosen tiers if any are selected.
      const candidateTiers = userTiers
        ? new Set([...slotTiers].filter((t) => userTiers.has(t)))
        : slotTiers;
      const isPartner = !!p.isPartner || PARTNER_CLINIC_IDS.has(p.id);
      // Partners bypass cap. Non-partners consume budget tier-by-tier.
      const allowedTiers = new Set();
      for (const t of candidateTiers) {
        if (isPartner) {
          allowedTiers.add(t);
        } else if (budget[t] > 0) {
          allowedTiers.add(t);
          budget[t] -= 1;
        }
      }
      if (allowedTiers.size === 0) continue; // hide clinic entirely
      tiersByClinic.set(p.id, allowedTiers);
      result.push(p);
    }
    return { visibleTiersByClinic: tiersByClinic, cappedProviders: result };
  }, [displayProviders, slotsMap, tierFilter]);

  // Mirror tier filter back to URL so a shared link preserves it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (tierFilter.size > 0 && tierFilter.size < 4) {
      url.searchParams.set('tier', [...tierFilter].sort().join(','));
    } else {
      url.searchParams.delete('tier');
    }
    window.history.replaceState({}, '', url.toString());
  }, [tierFilter]);

  const toggleTier = (tier) => {
    setTierFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  // Load real slots for every card whenever the list changes.
  // We no longer pre-fill with deterministic fakes — cards show the
  // shimmer skeleton (built into ClinicCardV2 when slots === undefined)
  // until the real /api/clinics/batch-slots response arrives.
  useEffect(() => {
    if (displayProviders.length === 0) return;
    const unloaded = displayProviders.filter((p) => !(p.id in slotsMap));
    if (unloaded.length === 0) return;

    const BATCH = 10;
    let cancelled = false;
    const ids = unloaded.map((p) => p.id);

    // "Top ranked" non-partner ids in the current search ordering →
    // those get tier-1 capped to 1 slot at the batch-slots route so the
    // "última cita en menos de una semana" pill fires on their card.
    // Partners always have the cap regardless (handled server-side via
    // PARTNER_CLINIC_IDS). We take the first 3 non-partner ids from the
    // partner-first display order — matches the user's intent of
    // "primeros 2 o 3 resultados de cada búsqueda" (2026-06 review).
    const topRankedIds = displayProviders
      .filter((p) => !p.isPartner)
      .slice(0, 3)
      .map((p) => p.id);
    const topRankedQs = topRankedIds.length
      ? `&topRankedIds=${topRankedIds.join(',')}`
      : '';

    const fetchBatch = (batchIds, delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs))
        .then(() => { if (cancelled) return null; return fetch(`/api/clinics/batch-slots?ids=${batchIds.join(',')}&preview=true&days=7${topRankedQs}`); })
        .then((r) => (r ? r.json() : null))
        .then((data) => { if (cancelled || !data?.slots) return; setSlotsMap((prev) => ({ ...prev, ...data.slots })); })
        .catch(() => {});

    for (let i = 0; i < ids.length; i += BATCH) {
      fetchBatch(ids.slice(i, i + BATCH), i === 0 ? 0 : 300);
    }

    // 2026-06-04 — safety net. The 300 ms delay on the 2nd+ batch means
    // a fast scroll (which mutates displayProviders) can trigger the
    // effect cleanup BEFORE the delayed batch fires its fetch. That
    // clinic then never gets an entry in slotsMap and its card stays
    // on the shimmer skeleton forever (user-reported on the bottom of
    // the listing). If after 8 s an id we kicked off is still missing
    // from slotsMap, mark it as an empty array so the card stops
    // shimmering and renders "Sin disponibilidad próxima · Ver opciones"
    // — better than a hanging spinner. The follow-up effect tick will
    // re-request real slots if the clinic remains visible.
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
  }, [displayProviders]);

  const filteredProcedures = useMemo(() => {
    if (!specialtySlug) return dbProcedures;
    return dbProcedures.filter((p) => p.specialtySlug === specialtySlug);
  }, [dbProcedures, specialtySlug]);

  const isSinSeguro = insuranceFilter === 'Sin seguro - SaludOnNet';

  // Title city echo. The raw value can be anything the user typed (the
  // search box submits free text), so we only echo it in the page title
  // when it normalises to a real province in the catalogue. "madrid"
  // matches "Madrid", "malaga" matches "Málaga", but "asdfasdf" returns
  // null and we drop the "en X" suffix entirely. (Jesús's 2026-05 review.)
  const cityLabel = useMemo(() => {
    const raw = (cityFilter || cityParam || '').trim();
    if (!raw) return null;
    const needle = normalizeText(raw);
    const match = dbCities.find((c) => normalizeText(c.city) === needle);
    return match ? match.city : null;
  }, [cityFilter, cityParam, dbCities]);

  return (
    <>
      <Header />

      <main className="sv2-page">
        {/* Title — brand editorial: Eyebrow + Fraunces with italic emphasis */}
        <div className="sv2-title-row container">
          <div>
            <Eyebrow>Resultados de búsqueda</Eyebrow>
            <h1 className="sv2-title">
              {specialtySlug ? (
                <>
                  {dbSpecialties.find((s) => s.slug === specialtySlug)?.name || specialtySlug}
                  {cityLabel && <> <em>en {cityLabel}</em></>}
                </>
              ) : (
                <>
                  Centros médicos
                  {cityLabel && <> <em>en {cityLabel}</em></>}
                </>
              )}
            </h1>
            <p className="sv2-subtitle">Cita prioritaria · disponibilidad en tiempo real</p>
          </div>
        </div>

        {/* Insurance disclaimer banner */}
        <div className="container sv2-disclaimer-row">
          <div className="sv2-disclaimer">
            <Icon name="info" size={16} className="sv2-disclaimer-icon" />
            <span>
              Los precios mostrados son la <strong>tarifa de prioridad</strong> (lo que pagas por la reserva).
              Si tienes seguro, la consulta la cubre tu póliza.
            </span>
          </div>
        </div>

        {/* Actions bar — always visible (count, filters button on mobile, map toggle) */}
        <div className="sv2-actions-row container">
          <div className="sv2-actions-bar">
            <button
              type="button"
              className="sv2-actions-btn sv2-filters-trigger"
              onClick={() => setFiltersOpen(true)}
              aria-expanded={filtersOpen}
              aria-controls="sv2-filters"
            >
              ⚙ Filtros
            </button>
            <span className="sv2-count">
              <strong>{cappedProviders.length}</strong>
              {totalCount > 0 && dbClinics ? ` de ${totalCount}` : ''} centros
            </span>
            <button
              type="button"
              className="sv2-actions-btn sv2-map-toggle"
              onClick={() => setShowMap((v) => !v)}
            >
              {showMap ? 'Ocultar mapa' : 'Ver mapa'}
            </button>
          </div>
        </div>

        {/* Filters — inline on desktop, slide-up sheet on mobile */}
        <div
          className={`sv2-filters-row container ${filtersOpen ? 'sv2-filters-row--open' : ''}`}
          aria-hidden={!filtersOpen ? undefined : 'false'}
        >
          <div className="sv2-filters" id="sv2-filters" role="group" aria-label="Filtros de búsqueda">
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
              <label className="sv2-filter-label">Provincia</label>
              <select className="sv2-select" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                <option value="">Todas las provincias</option>
                {dbCities.map((c) => (
                  <option key={c.city} value={c.city}>{c.city}</option>
                ))}
              </select>
            </div>

            <div className="sv2-filter-group">
              <label className="sv2-filter-label">Especialidad</label>
              <select
                className="sv2-select"
                value={specialtySlug}
                onChange={(e) => { setSpecialtySlug(e.target.value); setProcedureSlug(''); }}
              >
                <option value="">Todas las especialidades</option>
                {dbSpecialties.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="sv2-filter-group">
              <label className="sv2-filter-label">Acto médico</label>
              <select className="sv2-select" value={procedureSlug} onChange={(e) => setProcedureSlug(e.target.value)}>
                <option value="">Todos los actos</option>
                {filteredProcedures.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="sv2-filter-group">
              <label className="sv2-filter-label" title="Solo mostramos clínicas concertadas con tu aseguradora.">
                Filtrar por mi seguro
              </label>
              <select className="sv2-select" value={insuranceFilter} onChange={(e) => setInsuranceFilter(e.target.value)}>
                <option value="">Todas las aseguradoras</option>
                {insuranceCompanies.map((ins) => (
                  <option key={ins} value={ins}>{ins}</option>
                ))}
              </select>
            </div>

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
                Sort is partner-first → server default (rating DESC / name).
                Reintroduce a user-facing sort if Clarity shows demand. */}

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

        {/* Two-column layout (single column when map is hidden) */}
        <div className={`sv2-layout container ${showMap ? '' : 'sv2-layout--list-only'}`}>

          {/* Left: results */}
          <div className="sv2-left">
            <div className="sv2-results">
              {cappedProviders.length > 0 ? (
                cappedProviders.map((provider, i) => (
                  <ClinicCardV2
                    key={provider.id}
                    provider={provider}
                    index={i}
                    serviceId={serviceId}
                    basePrice={0}
                    isSinSeguro={isSinSeguro}
                    highlighted={highlightedId === provider.id}
                    onOpenModal={(p, slot) => { setModalProvider(p); setModalInitialSlot(slot ?? null); }}
                    slots={slotsMap[provider.id]}
                    visibleTiers={visibleTiersByClinic.get(provider.id) || null}
                  />
                ))
              ) : isLoading ? (
                <div className="sv2-empty">
                  <p style={{ color: '#9ca3af' }}>Cargando centros...</p>
                </div>
              ) : (
                <div className="sv2-empty">
                  <p>No encontramos centros con estos filtros.</p>
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Prueba a cambiar la aseguradora o la valoración mínima.</p>
                </div>
              )}

              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
              {/* 2026-06-10 — CLS fix. Reserve fixed height so the
                  loader appearing during pagination doesn't push the
                  cards above when isLoading flips on/off. */}
              <div style={{ textAlign: 'center', padding: '1rem 0', color: '#9ca3af', fontSize: '0.85rem', minHeight: '48px', visibility: (isLoading && dbClinics !== null) ? 'visible' : 'hidden' }}>
                Cargando más centros...
              </div>
            </div>
          </div>

          {/* Right: map. We re-mount the map on city change (key=cityFilter)
              so the user-interaction flag inside ClinicMap resets and the
              map recenters on the new city — otherwise a previous pan would
              keep the viewport stuck on the old location. */}
          {showMap && (
            <div className="sv2-map-panel">
              <div className="sv2-map-wrap">
                <ClinicMap
                  key={cityFilter || cityParam || 'all'}
                  providers={cappedProviders.filter((p) => p.lat && p.lng)}
                  highlightedId={highlightedId}
                  city={cityFilter || cityParam}
                  filterSignature={`${specialtySlug}|${procedureSlug}|${insuranceFilter}`}
                  onPinClick={(p) => {
                    // 2026-06-12 — Pin click → scroll listing to the
                    // clinic + highlight. Previously the pin opened the
                    // booking modal directly, but Clarity recorded a SEM
                    // session that spent 10 minutes playing with the
                    // Leaflet zoom controls and never tapped a pin —
                    // pins didn't read as a discovery affordance, just
                    // as "another click that commits me". Now they read
                    // the listing card in context (rating, insurance,
                    // slots), then the patient decides to open the modal
                    // by clicking the card. The map is a discovery lens,
                    // not a one-step booking trigger.
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
      </main>

      {modalProvider && (
        <ClinicBookingModal
          provider={modalProvider}
          serviceId={serviceId}
          isSinSeguro={isSinSeguro}
          initialSlot={modalInitialSlot}
          initialProcedureSlug={procedureSlug}
          initialSpecialtySlug={specialtySlug}
          initialInsurance={isSinSeguro ? '' : insuranceFilter}
          asProfessional={isPro}
          /* Forward the scarcity-cap signal from the listing rank so
             the modal's slot fetch keeps tier-1 capped to 1. Partner
             clinics are always capped server-side, so the prop only
             matters for the top-3 non-partner clinics whose card
             showed the "última cita…" pill. Without this prop the
             modal would surface 2 tier-1 slots and the pill would
             disappear in step 2 — confusing the patient. */
          isTopRanked={
            !modalProvider.isPartner
            && displayProviders.filter((p) => !p.isPartner).slice(0, 3).some((p) => p.id === modalProvider.id)
          }
          onClose={() => { setModalProvider(null); setModalInitialSlot(null); }}
        />
      )}
    </>
  );
}

export default function SearchV2Page() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: '#9ca3af' }}>
        Cargando resultados...
      </div>
    }>
      <SearchV2Content />
    </Suspense>
  );
}
