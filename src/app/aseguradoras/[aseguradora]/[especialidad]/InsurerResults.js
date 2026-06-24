'use client';
import { useState, useEffect } from 'react';
import ClinicCardV2 from '@/components/ClinicCardV2';
import ClinicBookingModal from '@/components/ClinicBookingModal';
import '../../../search-v2/search-v2.css';

export default function InsurerResults({ specialtySlug, insurerDbName, insurerName, specialtyName }) {
  const [clinics, setClinics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedClinic, setSelectedClinic] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams({
      specialty: specialtySlug,
      insurance: insurerDbName,
      limit: '30',
      sort: 'rating',
    });
    fetch(`/api/clinics/search?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setClinics(data.clinics || []);
        setLoading(false);
      })
      .catch(() => {
        setClinics([]);
        setLoading(false);
      });
  }, [specialtySlug, insurerDbName]);

  if (loading) {
    return (
      <div className="search-results-loading">
        <p className="search-results-loading__text">Buscando especialistas disponibles…</p>
        <div className="search-skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="clinic-card-skeleton" aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  if (!clinics || clinics.length === 0) {
    return (
      <div className="search-empty">
        <p>No encontramos centros disponibles para {specialtyName} con {insurerName} en este momento.</p>
        <p>Prueba el <a href="/search-v2">buscador general</a> para ver todas las opciones.</p>
      </div>
    );
  }

  return (
    <>
      <p className="insurer-results-count">
        {clinics.length} {clinics.length === 1 ? 'centro encontrado' : 'centros encontrados'} con {insurerName}
      </p>
      <div className="search-cards-grid">
        {clinics.map((clinic) => (
          <ClinicCardV2
            key={clinic.id}
            clinic={clinic}
            onBook={() => setSelectedClinic(clinic)}
          />
        ))}
      </div>
      {selectedClinic && (
        <ClinicBookingModal
          clinic={selectedClinic}
          onClose={() => setSelectedClinic(null)}
        />
      )}
    </>
  );
}
