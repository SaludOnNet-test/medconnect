'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { specialties, services as allServices, cities } from '@/data/mock';
import './SearchBar.css';

export default function SearchBar({ initialSpecialty, initialService, initialCity, initialProviderName }) {
  const router = useRouter();
  const [specialtyId, setSpecialtyId] = useState(initialSpecialty || '');
  const [serviceId, setServiceId] = useState(initialService || '');
  const [city, setCity] = useState(initialCity || '');
  const [providerName, setProviderName] = useState(initialProviderName || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const filteredServices = specialtyId
    ? allServices.filter((s) => s.specialtyId === Number(specialtyId))
    : allServices;

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (specialtyId) params.set('specialty', specialtyId);
    if (serviceId) params.set('service', serviceId);
    if (city) params.set('city', city);
    if (providerName) params.set('providerName', providerName);
    router.push(`/search?${params.toString()}`);
  };

  const handleCityChange = (val) => {
    setCity(val);
    if (val.length > 0) {
      const filtered = cities.filter(c => c.toLowerCase().includes(val.toLowerCase()));
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (val) => {
    setCity(val);
    setShowSuggestions(false);
  };

  return (
    <form className="search-bar" onSubmit={handleSearch} id="search-bar">
      <div className="search-bar-inner">
        <div className="form-group">
          <label className="form-label" htmlFor="specialty">Especialidad</label>
          <select
            id="specialty"
            className="form-select"
            value={specialtyId}
            onChange={(e) => {
              setSpecialtyId(e.target.value);
              setServiceId('');
            }}
          >
            <option value="">Todas las especialidades</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="service">Servicio</label>
          <select
            id="service"
            className="form-select"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            <option value="">Todos los servicios</option>
            {filteredServices.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label" htmlFor="city">Ciudad / Provincia</label>
          <input
            id="city"
            className="form-input"
            type="text"
            placeholder="Toda España"
            value={city}
            onChange={(e) => handleCityChange(e.target.value)}
            onFocus={() => city && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="search-suggestions">
              {suggestions.map((s) => (
                <div 
                  key={s} 
                  className="search-suggestion-item"
                  onClick={() => selectSuggestion(s)}
                >
                  📍 {s}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="providerName">Clínica u Hospital</label>
          <input
            id="providerName"
            className="form-input"
            type="text"
            placeholder="Nombre de la clínica..."
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-gold btn-lg" id="search-btn">
          Buscar cita prioritaria
        </button>
      </div>
    </form>
  );
}
