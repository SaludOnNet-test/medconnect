'use client';
import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import ClinicCardV2 from '@/components/ClinicCardV2';
import ClinicBookingModal from '@/components/ClinicBookingModal';
import { insuranceCompanies } from '@/data/mock';
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

  // Filter state
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [ratingFilter, setRatingFilter]       = useState(0);
  const [sortBy, setSortBy]                   = useState('rating');
  const [showMap, setShowMap]                 = useState(false);
  const [filtersOpen, setFiltersOpen]         = useState(false);

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
    if (ratingFilter > 0)  params.set('rating', ratingFilter);
    if (providerNameParam) params.set('name', providerNameParam);
    params.set('limit', limit);
    params.set('offset', offset);
    return `/api/clinics/search?${params.toString()}`;
  }, [cityFilter, specialtySlug, specialtyIdParam, procedureSlug, ratingFilter, providerNameParam]);

  // Initial load / filter change — also reset slot state
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDbClinics(null);
    setLoadedCount(0);
    setHasMore(false);
    setSlotsMap({});

    fetch(buildUrl(0, PAGE_SIZE_INITIAL))
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
          setLoadedCount((c) => c + data.clinics.length);
          setHasMore((data.total || 0) > loadedCount + data.clinics.length);
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
    if (sortBy === 'rating')  list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sortBy === 'reviews') list.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
    return list;
  }, [baseProviders, insuranceFilter, sortBy]);

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

    const fetchBatch = (batchIds, delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs))
        .then(() => { if (cancelled) return null; return fetch(`/api/clinics/batch-slots?ids=${batchIds.join(',')}&preview=true&days=7`); })
        .then((r) => (r ? r.json() : null))
        .then((data) => { if (cancelled || !data?.slots) return; setSlotsMap((prev) => ({ ...prev, ...data.slots })); })
        .catch(() => {});

    for (let i = 0; i < ids.length; i += BATCH) {
      fetchBatch(ids.slice(i, i + BATCH), i === 0 ? 0 : 300);
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayProviders]);

  const filteredProcedures = useMemo(() => {
    if (!specialtySlug) return dbProcedures;
    return dbProcedures.filter((p) => p.specialtySlug === specialtySlug);
  }, [dbProcedures, specialtySlug]);

  const isSinSeguro = insuranceFilter === 'Sin seguro - SaludOnNet';
  const cityLabel   = cityFilter || cityParam || 'España';

  return (
    <>
      <Header />

      <main className="sv2-page">
        {/* Title */}
        <div className="sv2-title-row container">
          <div>
            <h1 className="sv2-title">
              {specialtySlug
                ? `${dbSpecialties.find((s) => s.slug === specialtySlug)?.name || specialtySlug} en ${cityLabel}`
                : `Centros médicos en ${cityLabel}`}
            </h1>
            <p className="sv2-subtitle">Centros médicos privados · Cita disponible hoy</p>
          </div>
        </div>

        {/* Insurance disclaimer banner */}
        <div className="container" style={{ paddingTop: '0.75rem', paddingBottom: '0.5rem' }}>
          <div style={{
            background: '#fffaeb',
            border: '1px solid #f0d97a',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            fontSize: '0.85rem',
            color: '#5b4400',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span aria-hidden style={{ fontSize: '1rem' }}>ℹ️</span>
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
              <strong>{dbClinics ? loadedCount : displayProviders.length}</strong>
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
              <label className="sv2-filter-label">Ciudad</label>
              <select className="sv2-select" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                <option value="">Todas las ciudades</option>
                {dbCities.map((c) => (
                  <option key={c.city} value={c.city}>{c.city}{c.province && c.province !== c.city ? ` (${c.province})` : ''}</option>
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
              <label className="sv2-filter-label">Valoración</label>
              <div className="sv2-rating-chips">
                {[{ v: 0, label: 'Todos' }, { v: 3, label: '★ 3+' }, { v: 4, label: '★ 4+' }, { v: 4.5, label: '★ 4.5+' }].map(({ v, label }) => (
                  <button
                    key={v}
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
              <select className="sv2-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="rating">Mejor valorados</option>
                <option value="reviews">Más opiniones</option>
              </select>
            </div>

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
              {displayProviders.length > 0 ? (
                displayProviders.map((provider, i) => (
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
              {isLoading && dbClinics !== null && (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                  Cargando más centros...
                </div>
              )}
            </div>
          </div>

          {/* Right: map */}
          {showMap && (
            <div className="sv2-map-panel">
              <div className="sv2-map-wrap">
                <ClinicMap
                  providers={displayProviders.filter((p) => p.lat && p.lng)}
                  highlightedId={highlightedId}
                  city={cityFilter || cityParam}
                  onPinClick={(p) => {
                    setHighlightedId(p.id);
                    setModalProvider(p);
                    setModalInitialSlot(null);
                  }}
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
