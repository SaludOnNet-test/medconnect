'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { specialties, services as allServices, cities, providers } from '@/data/mock';
import { trackEvent } from '@/lib/analytics';
import './SearchBarV2.css';

// Build unified suggestion list: specialties, services, clinic names
function buildSuggestions() {
  const items = [];
  specialties.forEach((s) =>
    items.push({ type: 'specialty', id: s.id, label: s.name, icon: '🔬' })
  );
  allServices.forEach((s) =>
    items.push({ type: 'service', id: s.id, specialtyId: s.specialtyId, label: s.name, icon: '🩺' })
  );
  providers.forEach((p) =>
    items.push({ type: 'provider', label: p.name, icon: '🏥' })
  );
  return items;
}

const ALL_SUGGESTIONS = buildSuggestions();

export default function SearchBarV2({ initialSpecialty, initialService, initialCity, compact = false }) {
  const router = useRouter();
  const [visitType, setVisitType] = useState('presencial'); // 'presencial' | 'online'
  const [query, setQuery] = useState('');
  const [city, setCity] = useState(initialCity || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState(null); // { type, id, specialtyId, label }
  const [showCityList, setShowCityList] = useState(false);
  const inputRef = useRef(null);

  // Initialise query from props
  useEffect(() => {
    if (initialSpecialty) {
      const sp = specialties.find((s) => String(s.id) === String(initialSpecialty));
      if (sp) { setQuery(sp.name); setSelected({ type: 'specialty', id: sp.id, label: sp.name }); }
    } else if (initialService) {
      const sv = allServices.find((s) => String(s.id) === String(initialService));
      if (sv) { setQuery(sv.name); setSelected({ type: 'service', id: sv.id, specialtyId: sv.specialtyId, label: sv.name }); }
    }
  }, [initialSpecialty, initialService]);

  const handleQueryChange = (val) => {
    setQuery(val);
    setSelected(null);
    if (val.length > 0) {
      const lower = val.toLowerCase();
      const filtered = ALL_SUGGESTIONS.filter((s) =>
        s.label.toLowerCase().includes(lower)
      ).slice(0, 7);
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (item) => {
    setQuery(item.label);
    setSelected(item);
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleSearch = (e) => {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (selected?.type === 'specialty') params.set('specialty', selected.id);
    else if (selected?.type === 'service') { params.set('service', selected.id); if (selected.specialtyId) params.set('specialty', selected.specialtyId); }
    else if (selected?.type === 'provider') params.set('providerName', selected.label);
    else if (query.trim()) params.set('providerName', query.trim());
    if (city) params.set('city', city);
    trackEvent('search_performed', {
      specialty: selected?.type === 'specialty' ? selected.label : undefined,
      service:   selected?.type === 'service'   ? selected.label : undefined,
      provider:  selected?.type === 'provider'  ? selected.label : undefined,
      query:     query.trim() || undefined,
      city:      city || undefined,
    });
    router.push(`/search-v2?${params.toString()}`);
  };

  const filteredCities = city
    ? cities.filter((c) => c.toLowerCase().includes(city.toLowerCase()))
    : cities;

  return (
    <div className={`sbv2 ${compact ? 'sbv2--compact' : ''}`}>
      {/* Visit type tabs — only on full (home) version */}
      {!compact && (
        <div className="sbv2-tabs">
          <button
            type="button"
            className={`sbv2-tab ${visitType === 'presencial' ? 'sbv2-tab--active' : ''}`}
            onClick={() => setVisitType('presencial')}
          >
            <span className="sbv2-tab-icon">🏥</span> Visita presencial
          </button>
          <button
            type="button"
            className={`sbv2-tab ${visitType === 'online' ? 'sbv2-tab--active' : ''}`}
            onClick={() => setVisitType('online')}
          >
            <span className="sbv2-tab-icon">📹</span> Online
          </button>
        </div>
      )}

      {/* Search row */}
      <form className="sbv2-row" onSubmit={handleSearch}>
        {/* Specialty / service / name field */}
        <div className="sbv2-field sbv2-field--main" style={{ position: 'relative' }}>
          <span className="sbv2-field-icon">🔍</span>
          <input
            ref={inputRef}
            className="sbv2-input"
            type="text"
            placeholder="especialidad, enfermedad o nombre"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => query && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="sbv2-dropdown">
              {suggestions.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  className="sbv2-dropdown-item"
                  onMouseDown={() => handleSelectSuggestion(item)}
                >
                  <span className="sbv2-dropdown-icon">{item.icon}</span>
                  <span className="sbv2-dropdown-label">{item.label}</span>
                  <span className="sbv2-dropdown-type">
                    {item.type === 'specialty' ? 'Especialidad' : item.type === 'service' ? 'Servicio' : 'Centro'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="sbv2-divider" />

        {/* City field */}
        <div className="sbv2-field sbv2-field--city" style={{ position: 'relative' }}>
          <span className="sbv2-field-icon">📍</span>
          <input
            className="sbv2-input"
            type="text"
            placeholder="Ciudad"
            value={city}
            onChange={(e) => { setCity(e.target.value); setShowCityList(true); }}
            onFocus={() => setShowCityList(true)}
            onBlur={() => setTimeout(() => setShowCityList(false), 180)}
            autoComplete="off"
          />
          {showCityList && filteredCities.length > 0 && (
            <div className="sbv2-dropdown">
              {filteredCities.slice(0, 8).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="sbv2-dropdown-item"
                  onMouseDown={() => { setCity(c); setShowCityList(false); }}
                >
                  <span className="sbv2-dropdown-icon">📍</span>
                  <span className="sbv2-dropdown-label">{c}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search button */}
        <button type="submit" className="sbv2-btn">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          {!compact && <span>Buscar</span>}
        </button>
      </form>
    </div>
  );
}
