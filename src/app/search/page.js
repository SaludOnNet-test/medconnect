'use client';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SearchBar from '@/components/SearchBar';
import ProviderCard from '@/components/ProviderCard';
import { providers, insuranceCompanies, services, availability } from '@/data/mock';
import './search.css';

// Seeded pseudorandom — consistent per session per city+specialty
// TODO: Replace with real concurrent user tracking (WebSocket or analytics)
function getSeededConcurrentUsers(city, specialtyId) {
  const key = `personas_${city}_${specialtyId}`;
  if (typeof window !== 'undefined') {
    const cached = sessionStorage.getItem(key);
    if (cached) return Number(cached);
  }
  const cityRanges = {
    'Madrid': [18, 35],
    'Barcelona': [15, 28],
    'Valencia': [8, 20],
    'Sevilla': [8, 20],
    'Málaga': [8, 20],
  };
  const [min, max] = cityRanges[city] || [4, 12];
  const value = Math.floor(Math.random() * (max - min + 1)) + min;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(key, String(value));
  }
  return value;
}

function countSlotsNext7Days(providerList) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + 7);

  let count = 0;
  providerList.forEach((p) => {
    const slots = availability[p.id] || [];
    slots.forEach((s) => {
      const d = new Date(s.date + 'T00:00:00');
      if (d >= now && d <= cutoff && s.available) count++;
    });
  });
  return count;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const specialtyId = searchParams.get('specialty') || '';
  const serviceId = searchParams.get('service') || '';
  const city = searchParams.get('city') || '';
  const providerNameParam = searchParams.get('providerName') || '';

  const [concurrentUsers, setConcurrentUsers] = useState(null);

  useEffect(() => {
    setConcurrentUsers(getSeededConcurrentUsers(city, specialtyId));
  }, [city, specialtyId]);

  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [sortBy, setSortBy] = useState('rating');
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const handleGeolocation = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      setIsLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSortBy('distance');
        setIsLocating(false);
      },
      () => {
        alert('No pudimos obtener tu ubicación');
        setIsLocating(false);
      }
    );
  };

  const currentService = useMemo(() => {
    if (serviceId) return services.find(s => s.id === Number(serviceId));
    if (specialtyId) return services.find(s => s.specialtyId === Number(specialtyId));
    return null;
  }, [serviceId, specialtyId]);
  
  const basePrice = currentService ? currentService.basePrice : 0;
  const isSinSeguro = insuranceFilter === 'Sin seguro - SaludOnNet';

  const filteredProviders = useMemo(() => {
    let result = providers.filter((p) => {
      if (specialtyId && !p.specialtyIds.includes(Number(specialtyId))) return false;
      if (city && p.city !== city) return false;
      if (insuranceFilter && !p.acceptedInsurance.includes(insuranceFilter)) return false;
      if (providerNameParam && !p.name.toLowerCase().includes(providerNameParam.toLowerCase())) return false;
      return true;
    });

    // Sort
    if (sortBy === 'rating') {
      result.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'reviews') {
      result.sort((a, b) => b.reviewCount - a.reviewCount);
    } else if (sortBy === 'price') {
      result.sort((a, b) => a.basePrice - b.basePrice);
    } else if (sortBy === 'distance' && userLocation) {
      // Mock distance calculation (in a real app, use Haversine or similar)
      result.sort((a, b) => (a.id % 5) - (b.id % 5)); 
    }

    return result;
  }, [specialtyId, city, insuranceFilter, sortBy, userLocation]);

  return (
    <>
      <Header />

      {/* Compact search bar at top */}
      <div className="search-top-bar">
        <SearchBar
          initialSpecialty={specialtyId}
          initialService={serviceId}
          initialCity={city}
        />
      </div>

      <main className="search-page">
        <div className="search-layout">
          {/* Sidebar */}
          <aside className="search-sidebar">
            <div className="search-filters">
              <h2 className="search-filters-title">Filtros</h2>

              <div className="search-filter-group">
                <label className="search-filter-label" htmlFor="filter-insurance">Aseguradora</label>
                <select
                  id="filter-insurance"
                  className="form-select"
                  value={insuranceFilter}
                  onChange={(e) => setInsuranceFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {insuranceCompanies.map((ins) => (
                    <option key={ins} value={ins}>{ins}</option>
                  ))}
                </select>
              </div>

              <div className="search-filter-group">
                <label className="search-filter-label" htmlFor="filter-sort">Ordenar por</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                  <select
                    id="filter-sort"
                    className="form-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="rating">Mejor valorados</option>
                    <option value="reviews">Más opiniones</option>
                    <option value="price">Precio más bajo</option>
                    <option value="distance">Cercanía</option>
                  </select>
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={handleGeolocation}
                    disabled={isLocating}
                    style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                  >
                    📍 {isLocating ? 'Ubicando...' : userLocation ? 'Ubicación activa' : 'Usar mi ubicación'}
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Results */}
          <div className="search-results">
            <div className="search-results-header">
              <span className="search-results-count">
                <strong>{filteredProviders.length}</strong> centros encontrados
              </span>
            </div>

            {filteredProviders.length > 0 && (
              <div style={{ marginBottom: '12px', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: '600' }}>
                {concurrentUsers && `🔥 ${concurrentUsers} personas están buscando esto ahora`}
                {' · '}
                {(() => {
                  const slotCount = countSlotsNext7Days(filteredProviders);
                  return slotCount > 0
                    ? `¡Quedan sólo ${slotCount} citas de esta especialidad en tu región!`
                    : null;
                })()}
              </div>
            )}

            <div className="search-results-list">
              {filteredProviders.length > 0 ? (
                filteredProviders.map((provider, i) => (
                  <div key={provider.id} style={{ animationDelay: `${i * 0.08}s` }}>
                    {i === 1 && (
                      <div style={{ marginBottom: '4px', fontSize: '0.75rem', color: 'var(--gold)', fontWeight: '600' }}>
                        🕒 Última reserva realizada hace 12 minutos
                      </div>
                    )}
                    <ProviderCard
                      provider={provider}
                      serviceId={serviceId}
                      basePrice={basePrice}
                      isSinSeguro={isSinSeguro}
                      lowInventory={i % 3 === 0}
                    />
                  </div>
                ))
              ) : (
                <div className="search-no-results">
                  <h3>No encontramos resultados</h3>
                  <p>Prueba a ampliar los filtros o buscar en otra ciudad.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--muted)' }}>
        Cargando resultados...
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
