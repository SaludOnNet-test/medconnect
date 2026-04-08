'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { availability } from '@/data/mock';
import SlotCalendar from './SlotCalendar';
import './ProviderCard.css';

export default function ProviderCard({ provider, serviceId, basePrice = 0, isSinSeguro = false, lowInventory = false }) {
  const router = useRouter();
  const [selectedSlot, setSelectedSlot] = useState(null);
  const slots = availability[provider.id] || [];

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
  };

  const handleBook = () => {
    if (!selectedSlot) return;
    
    const totalFee = isSinSeguro ? (basePrice + selectedSlot.fee.amount) : selectedSlot.fee.amount;

    const params = new URLSearchParams({
      provider: provider.id,
      providerName: provider.name,
      date: selectedSlot.date,
      time: selectedSlot.time,
      fee: totalFee,
      feeLabel: selectedSlot.fee.label,
      isSinSeguro: isSinSeguro,
      ...(serviceId ? { service: serviceId } : {}),
    });
    router.push(`/book?${params.toString()}`);
  };

  const currentTotalFee = selectedSlot 
    ? (isSinSeguro ? (basePrice + selectedSlot.fee.amount) : selectedSlot.fee.amount)
    : 0;

  return (
    <div className="provider-card">
      <div className="provider-card-top">
        <div className="provider-card-info">
          <h3 className="provider-card-name">{provider.name}</h3>
          <p className="provider-card-address">📍 {provider.address}, {provider.city}</p>
          <div className="provider-card-meta">
            <span className="provider-card-rating">
              <span className="provider-card-star">★</span>
              {provider.rating}
              <span className="provider-card-reviews">({provider.reviewCount} opiniones)</span>
            </span>
            {provider.allowsFreeCancel && (
              <span className="provider-card-badge-success" style={{ marginLeft: '12px', fontSize: '0.7rem', background: '#e6f4ea', color: '#1e4620', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                ✓ Cancelación Gratuita
              </span>
            )}
          </div>
          {lowInventory && (
            <div className="provider-card-urgency" style={{ marginTop: '8px', color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 'bold' }}>
              ⚠️ ¡Apúrate que quedan solo 2 citas para esta especialidad!
            </div>
          )}
          <div className="provider-card-insurances" style={{ marginTop: '8px' }}>
            {provider.acceptedInsurance.map((ins) => (
              <span 
                key={ins} 
                className="provider-card-insurance-tag"
                style={ins === 'Sin seguro - SaludOnNet' ? { background: 'var(--navy)', color: 'white' } : {}}
              >
                {ins}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="provider-card-divider" />

      <SlotCalendar
        slots={slots}
        onSelectSlot={handleSelectSlot}
        isSinSeguro={isSinSeguro}
        basePrice={basePrice}
        provider={provider}
        serviceId={serviceId}
      />

      {selectedSlot && (
        <div className="provider-card-selected">
          <div className="provider-card-selected-info">
            <strong>
              {new Date(selectedSlot.date + 'T00:00:00').toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </strong>
            {' '}a las <strong>{selectedSlot.time}</strong>
            <br />
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {selectedSlot.fee.label} {isSinSeguro && ` + Servicio Base (${Number(basePrice).toFixed(2)}€)`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span className="provider-card-selected-fee">
              {currentTotalFee > 0 ? `${Number(currentTotalFee).toFixed(2)}€` : 'Gratis'}
            </span>
            <button className="btn btn-gold" onClick={handleBook} id="book-btn">
              Reservar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
