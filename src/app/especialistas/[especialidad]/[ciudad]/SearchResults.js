'use client';
/**
 * SearchResults — client component for specialty/city landing pages.
 *
 * Reuses the same filter / card / map logic as search-v2 but accepts
 * specialtyId and city as props (already resolved server-side from the
 * route params) instead of reading them from URL searchParams.
 */
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ClinicCardV2 from '@/components/ClinicCardV2';
import ClinicBookingModal from '@/components/ClinicBookingModal';
import SearchBarV2 from '@/components/SearchBarV2';
import { providers, insuranceCompanies, services } from '@/data/mock';
import '../../search-v2/search-v2.css'; // reuse existing styles

const CITY_COORDS = {
  'Madrid':    { bbox: '-3.85,40.30,-3.55,40.55' },
  'Barcelona': { bbox: '2.05,41.30,2.30,41.47' },
  'Valencia':  { bbox: '-0.50,39.40,-0.25,39.54' },
  'Sevilla':   { bbox: '-6.10,37.30,-5.85,37.48' },
  'Málaga':    { bbox: '-4.55,36.66,-4.30,36.78' },
};
const DEFAULT_BBOX = '-3.85,40.30,-3.55,40.55';

const PIN_POSITIONS = {
  1: { top: '28%', left: '42%' },
  2: { top: '55%', left: '62%' },
  3: { top: '38%', left: '25%' },
  4: { top: '65%', left: '38%' },
  5: { top: '20%', left: '70%' },
  6: { top: '72%', left: '55%' },
};

export default function SearchResults({ specialtyId, city }) {
  const router = useRouter();
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [ratingFilter, setRatingFilter]       = useState(0);
  const [sortBy, setSortBy]                   = useState('rating');
  const [highlightedId, setHighlightedId]     = useState(null);
  const [modalProvider, setModalProvider]     = useState(null);
  const [modalInitialSlot, setModalInitialSlot] = useState(null);
  const [showMap, setShowMap]                 = useState(true);

  const currentService = useMemo(
    () => services.find((s) => s.specialtyId === specialtyId) || null,
    [specialtyId]
  );
  const basePrice  = currentService?.basePrice || 0;
  const isSinSeguro = insuranceFilter === 'Sin seguro - SaludOnNet';

  const filteredProviders = useMemo(() => {
    let result = providers.filter((p) => {
      if (specialtyId && !p.specialtyIds.includes(specialtyId)) return false;
      if (city && p.city !== city) return false;
      if (insuranceFilter && !p.acceptedInsurance.includes(insuranceFilter)) return false;
      if (ratingFilter && p.rating < ratingFilter) return false;
      return true;
    });
    if (sortBy === 'rating')  result.sort((a, b) => b.rating - a.rating);
    if (sortBy === 'reviews') result.sort((a, b) => b.reviewCount - a.reviewCount);
    return result;
  }, [specialtyId, city, insuranceFilter, ratingFilter, sortBy]);

  const mapBbox = city && CITY_COORDS[city] ? CITY_COORDS[city].bbox : DEFAULT_BBOX;
  const mapUrl  = `https://www.openstreetmap.org/export/embed.html?bbox=${mapBbox}&layer=mapnik`;

  return (
    <div className="sv2-page" style={{ paddingTop: 0 }}>
      {/* Compact search bar for navigation */}
      <div className="sv2-topbar">
        <div className="sv2-topbar-inner">
          <SearchBarV2
            compact
            initialSpecialty={String(specialtyId)}
            initialCity={city}
          />
        </div>
      </div>

      <div className="sv2-layout container">

        {/* ── Left panel ──────────────────────────────────────────────── */}
        <div className="sv2-left">

          {/* Filter bar */}
          <div className="sv2-filters">
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

          {/* Results */}
          <div className="sv2-results">
            {filteredProviders.length > 0 ? (
              filteredProviders.map((provider, i) => (
                <ClinicCardV2
                  key={provider.id}
                  provider={provider}
                  index={i + 1}
                  isHighlighted={highlightedId === provider.id}
                  onHover={setHighlightedId}
                  onOpenModal={(p, slot) => {
                    setModalProvider(p);
                    setModalInitialSlot(slot ?? null);
                  }}
                  serviceId={currentService?.id}
                  basePrice={basePrice}
                  isSinSeguro={isSinSeguro}
                />
              ))
            ) : (
              <div className="sv2-empty">
                <p>No hay centros que coincidan con los filtros seleccionados.</p>
                <button
                  className="btn btn-gold"
                  onClick={() => {
                    setInsuranceFilter('');
                    setRatingFilter(0);
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Map panel ───────────────────────────────────────────────── */}
        {showMap && (
          <div className="sv2-map-panel">
            <div className="sv2-map-wrapper">
              <iframe
                title={`Mapa de centros médicos en ${city}`}
                src={mapUrl}
                className="sv2-map-iframe"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              {filteredProviders.map((p, i) => {
                const pos = PIN_POSITIONS[p.id];
                if (!pos) return null;
                return (
                  <button
                    key={p.id}
                    className={`sv2-pin ${highlightedId === p.id ? 'sv2-pin--active' : ''}`}
                    style={{ top: pos.top, left: pos.left }}
                    onClick={() => setHighlightedId(p.id === highlightedId ? null : p.id)}
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

      {/* Booking modal */}
      {modalProvider && (
        <ClinicBookingModal
          provider={modalProvider}
          serviceId={currentService?.id}
          basePrice={basePrice}
          isSinSeguro={isSinSeguro}
          initialSlot={modalInitialSlot}
          onClose={() => {
            setModalProvider(null);
            setModalInitialSlot(null);
          }}
        />
      )}
    </div>
  );
}
