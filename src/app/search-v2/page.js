'use client';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import SearchBarV2 from '@/components/SearchBarV2';
import ClinicCardV2 from '@/components/ClinicCardV2';
import ClinicBookingModal from '@/components/ClinicBookingModal';
import { providers, insuranceCompanies, services, specialties } from '@/data/mock';
import './search-v2.css';

// Mock lat/lng per city for map centering
const CITY_COORDS = {
  'Madrid':    { lat: 40.4168, lng: -3.7038, bbox: '-3.85,40.30,-3.55,40.55' },
  'Barcelona': { lat: 41.3851, lng: 2.1734,  bbox: '2.05,41.30,2.30,41.47' },
  'Valencia':  { lat: 39.4699, lng: -0.3763, bbox: '-0.50,39.40,-0.25,39.54' },
  'Sevilla':   { lat: 37.3891, lng: -5.9845, bbox: '-6.10,37.30,-5.85,37.48' },
  'Málaga':    { lat: 36.7213, lng: -4.4214, bbox: '-4.55,36.66,-4.30,36.78' },
};
const DEFAULT_BBOX = '-3.85,40.30,-3.55,40.55'; // Madrid fallback

// Mock map pin positions per provider id (% of map width/height)
const PIN_POSITIONS = {
  1: { top: '28%', left: '42%' },
  2: { top: '55%', left: '62%' },
  3: { top: '38%', left: '25%' },
  4: { top: '65%', left: '38%' },
  5: { top: '20%', left: '70%' },
  6: { top: '72%', left: '55%' },
};

function SearchV2Content() {
  const searchParams = useSearchParams();
  const specialtyId   = searchParams.get('specialty') || '';
  const serviceId     = searchParams.get('service') || '';
  const city          = searchParams.get('city') || '';
  const providerNameParam = searchParams.get('providerName') || '';

  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState(0); // 0=all, 3, 4, 4.5
  const [sortBy, setSortBy] = useState('rating');
  const [highlightedId, setHighlightedId] = useState(null);
  const [modalProvider, setModalProvider] = useState(null);
  const [showMap, setShowMap] = useState(true);

  const currentService = useMemo(() => {
    if (serviceId) return services.find((s) => s.id === Number(serviceId));
    if (specialtyId) return services.find((s) => s.specialtyId === Number(specialtyId));
    return null;
  }, [serviceId, specialtyId]);

  const basePrice = currentService?.basePrice || 0;
  const isSinSeguro = insuranceFilter === 'Sin seguro - SaludOnNet';

  const filteredProviders = useMemo(() => {
    let result = providers.filter((p) => {
      if (specialtyId && !p.specialtyIds.includes(Number(specialtyId))) return false;
      if (city && p.city !== city) return false;
      if (insuranceFilter && !p.acceptedInsurance.includes(insuranceFilter)) return false;
      if (providerNameParam && !p.name.toLowerCase().includes(providerNameParam.toLowerCase())) return false;
      if (ratingFilter && p.rating < ratingFilter) return false;
      return true;
    });

    if (sortBy === 'rating')  result.sort((a, b) => b.rating - a.rating);
    if (sortBy === 'reviews') result.sort((a, b) => b.reviewCount - a.reviewCount);

    return result;
  }, [specialtyId, city, insuranceFilter, providerNameParam, ratingFilter, sortBy]);

  // Specialty label for title
  const specialtyLabel = specialtyId
    ? (specialties.find((s) => String(s.id) === String(specialtyId))?.name || '')
    : '';

  const mapBbox = city && CITY_COORDS[city] ? CITY_COORDS[city].bbox : DEFAULT_BBOX;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${mapBbox}&layer=mapnik&marker=40.4168,-3.7038`;

  return (
    <>
      <Header />

      {/* Sticky compact search bar */}
      <div className="sv2-topbar">
        <div className="sv2-topbar-inner">
          <SearchBarV2
            compact
            initialSpecialty={specialtyId}
            initialService={serviceId}
            initialCity={city}
          />
        </div>
      </div>

      <main className="sv2-page">

        {/* ── Page title ────────────────────────────────────────────── */}
        <div className="sv2-title-row container">
          <div>
            <h1 className="sv2-title">
              {specialtyLabel ? `${specialtyLabel} en ${city || 'España'}` : `Centros médicos${city ? ` en ${city}` : ''}`}
            </h1>
            <p className="sv2-subtitle">
              Centros médicos privados · Cita disponible hoy
            </p>
          </div>
        </div>

        <div className="sv2-layout container">

          {/* ── Left panel ──────────────────────────────────────────── */}
          <div className="sv2-left">

            {/* Filter bar */}
            <div className="sv2-filters">
              {/* Insurance dropdown */}
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

              {/* Rating chips */}
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

              {/* Sort */}
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

              {/* Count + map toggle (mobile) */}
              <div className="sv2-filter-group sv2-filter-group--right">
                <span className="sv2-count">
                  <strong>{filteredProviders.length}</strong> centros
                </span>
                <button
                  className="sv2-map-toggle"
                  onClick={() => setShowMap((v) => !v)}
                >
                  {showMap ? '🗺️ Ocultar mapa' : '🗺️ Ver mapa'}
                </button>
              </div>
            </div>

            {/* Results list */}
            <div className="sv2-results">
              {filteredProviders.length > 0 ? (
                filteredProviders.map((provider, i) => (
                  <ClinicCardV2
                    key={provider.id}
                    provider={provider}
                    index={i}
                    serviceId={serviceId}
                    basePrice={basePrice}
                    isSinSeguro={isSinSeguro}
                    highlighted={highlightedId === provider.id}
                    onOpenModal={(p) => setModalProvider(p)}
                  />
                ))
              ) : (
                <div className="sv2-empty">
                  <p>😕 No encontramos centros con estos filtros.</p>
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                    Prueba a cambiar la aseguradora o la valoración mínima.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Map panel ────────────────────────────────────────────── */}
          {showMap && (
            <div className="sv2-map-panel">
              <div className="sv2-map-wrap">
                <iframe
                  src={mapUrl}
                  className="sv2-map-iframe"
                  title="Mapa de centros médicos"
                  loading="lazy"
                />
                {/* Numbered pins for each provider */}
                {filteredProviders.map((p, i) => {
                  const pos = PIN_POSITIONS[p.id] || { top: `${20 + i * 10}%`, left: `${30 + i * 8}%` };
                  return (
                    <button
                      key={p.id}
                      className={`sv2-map-pin ${highlightedId === p.id ? 'sv2-map-pin--active' : ''}`}
                      style={{ top: pos.top, left: pos.left }}
                      onMouseEnter={() => setHighlightedId(p.id)}
                      onMouseLeave={() => setHighlightedId(null)}
                      onClick={() => {
                        setModalProvider(p);
                      }}
                      title={p.name}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Booking modal */}
      {modalProvider && (
        <ClinicBookingModal
          provider={modalProvider}
          serviceId={serviceId}
          basePrice={basePrice}
          isSinSeguro={isSinSeguro}
          onClose={() => setModalProvider(null)}
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
