'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import './SearchBarV2.css';

export default function SearchBarV2({ initialSpecialty, initialService, initialCity, compact = false }) {
  const router = useRouter();
  const [visitType, setVisitType] = useState('presencial');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState(initialCity || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showCityList, setShowCityList] = useState(false);
  const [dbSpecialties, setDbSpecialties] = useState([]);
  const [dbCities, setDbCities] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch('/api/clinics/filters')
      .then((r) => r.json())
      .then((data) => {
        if (data.specialties) setDbSpecialties(data.specialties);
        if (data.cities) setDbCities(data.cities); // keep full {city, province} objects
      })
      .catch(() => {});
  }, []);

  const allSuggestions = useMemo(
    () => dbSpecialties.map((s) => ({ type: 'specialty', slug: s.slug, label: s.name, icon: '🔬' })),
    [dbSpecialties]
  );

  useEffect(() => {
    if (!initialSpecialty || dbSpecialties.length === 0) return;
    const sp = dbSpecialties.find(
      (s) => s.slug === initialSpecialty || String(s.id) === String(initialSpecialty)
    );
    if (sp) {
      setQuery(sp.name);
      setSelected({ type: 'specialty', slug: sp.slug, label: sp.name });
    }
  }, [initialSpecialty, dbSpecialties]);

  const handleQueryChange = (val) => {
    setQuery(val);
    setSelected(null);
    if (val.length > 0) {
      const lower = val.toLowerCase();
      setSuggestions(allSuggestions.filter((s) => s.label.toLowerCase().includes(lower)).slice(0, 8));
    } else {
      setSuggestions(allSuggestions.slice(0, 8));
    }
    setShowSuggestions(true);
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
    if (selected?.type === 'specialty' && selected.slug) {
      params.set('specialtySlug', selected.slug);
    } else if (query.trim()) {
      params.set('providerName', query.trim());
    }
    if (city) params.set('city', city);
    trackEvent('search_performed', {
      specialty: selected?.type === 'specialty' ? selected.label : undefined,
      query: query.trim() || undefined,
      city: city || undefined,
    });
    router.push(`/search-v2?${params.toString()}`);
  };

  const filteredCities = dbCities.length === 0 ? [] : (
    city
      ? dbCities.filter((c) => `${c.city} ${c.province || ''}`.toLowerCase().includes(city.toLowerCase()))
      : dbCities
  );

  return (
    <div className={`sbv2 ${compact ? 'sbv2--compact' : ''}`}>
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

      <form className="sbv2-row" onSubmit={handleSearch}>
        <div className="sbv2-field sbv2-field--main" style={{ position: 'relative' }}>
          <span className="sbv2-field-icon">🔍</span>
          <input
            ref={inputRef}
            className="sbv2-input"
            type="text"
            placeholder="especialidad, enfermedad o nombre"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => { setSuggestions(query ? allSuggestions.filter((s) => s.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : allSuggestions.slice(0, 8)); setShowSuggestions(true); }}
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
                  <span className="sbv2-dropdown-type">Especialidad</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sbv2-divider" />

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
                  key={c.city}
                  type="button"
                  className="sbv2-dropdown-item"
                  onMouseDown={() => { setCity(c.city); setShowCityList(false); }}
                >
                  <span className="sbv2-dropdown-icon">📍</span>
                  <span className="sbv2-dropdown-label">
                    {c.city}{c.province && c.province !== c.city ? ` (${c.province})` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

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
