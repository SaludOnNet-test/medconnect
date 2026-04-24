'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getConvenienceFee } from '@/data/mock';
import { trackEvent } from '@/lib/analytics';
import './ClinicBookingModal.css';

function getDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    weekday: d.toLocaleDateString('es-ES', { weekday: 'short' }),
    day: d.getDate(),
    month: d.toLocaleDateString('es-ES', { month: 'short' }),
  };
}

export default function ClinicBookingModal({ provider, serviceId, basePrice = 0, isSinSeguro = false, initialSlot = null, onClose }) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(initialSlot?.date ?? null);
  const [selectedSlot, setSelectedSlot] = useState(initialSlot ?? null);
  const [allSlots, setAllSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);

  // Lock body scroll + track clinic_viewed on mount
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    trackEvent('clinic_viewed', { provider_id: provider.id, provider_name: provider.name, city: provider.city });
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Fetch real slots from API
  useEffect(() => {
    setSlotsLoading(true);
    fetch(`/api/clinics/${provider.id}/available-slots`)
      .then((r) => r.json())
      .then((data) => {
        setAllSlots((data.slots || []).filter((s) => s.available));
      })
      .catch(() => setAllSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [provider.id]);

  // Unique dates (next 7)
  const dates = [...new Set(allSlots.map((s) => s.date))].slice(0, 7);

  const slotsForDate = selectedDate
    ? allSlots.filter((s) => s.date === selectedDate)
    : [];

  const handleBook = () => {
    if (!selectedSlot) return;
    const convFee = getConvenienceFee(selectedSlot.date);
    const totalFee = isSinSeguro
      ? basePrice + convFee.amount
      : convFee.amount;

    const params = new URLSearchParams({
      provider: provider.id,
      providerName: provider.name,
      date: selectedSlot.date,
      time: selectedSlot.time,
      fee: totalFee,
      feeLabel: convFee.label,
      isSinSeguro: String(isSinSeguro),
      ...(serviceId ? { service: serviceId } : {}),
    });
    router.push(`/book?${params.toString()}`);
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const selectedFee = selectedSlot
    ? (() => { const f = getConvenienceFee(selectedSlot.date); return isSinSeguro ? basePrice + f.amount : f.amount; })()
    : null;

  return (
    <div className="cbm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cbm-modal" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="cbm-header">
          <div>
            <h2 className="cbm-title">{provider.name}</h2>
            <p className="cbm-subtitle">📍 {provider.address}, {provider.city}</p>
            <div className="cbm-rating">
              <span style={{ color: '#f59e0b' }}>★</span>
              <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{provider.rating}</span>
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>({provider.reviewCount} opiniones)</span>
            </div>
          </div>
          <button className="cbm-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Date picker */}
        <div className="cbm-section">
          <h3 className="cbm-section-title">Selecciona una fecha</h3>
          {slotsLoading ? (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Cargando disponibilidad...</p>
          ) : dates.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No hay fechas disponibles próximamente.</p>
          ) : (
          <div className="cbm-dates">
            {dates.map((date) => {
              const { weekday, day, month } = getDayLabel(date);
              const isSelected = selectedDate === date;
              return (
                <button
                  key={date}
                  className={`cbm-date-btn ${isSelected ? 'cbm-date-btn--active' : ''}`}
                  onClick={() => { setSelectedDate(date); setSelectedSlot(null); }}
                >
                  <span className="cbm-date-weekday">{weekday}</span>
                  <span className="cbm-date-num">{day}</span>
                  <span className="cbm-date-month">{month}</span>
                </button>
              );
            })}
          </div>
          )}
        </div>

        {/* Time slots */}
        {selectedDate && (
          <div className="cbm-section">
            <h3 className="cbm-section-title">Horarios disponibles</h3>
            {slotsForDate.length > 0 ? (
              <div className="cbm-times">
                {slotsForDate.map((slot, i) => {
                  const slotConvFee = getConvenienceFee(slot.date);
                  const fee = isSinSeguro
                    ? basePrice + slotConvFee.amount
                    : slotConvFee.amount;
                  const isActive = selectedSlot?.time === slot.time;
                  return (
                    <button
                      key={i}
                      className={`cbm-time-btn ${isActive ? 'cbm-time-btn--active' : ''}`}
                      onClick={() => {
                        setSelectedSlot(slot);
                        trackEvent('slot_selected', { provider_id: provider.id, date: slot.date, time: slot.time });
                      }}
                    >
                      <span className="cbm-time">{slot.time}</span>
                      <span className="cbm-time-fee">{fee > 0 ? `${fee.toFixed(2)}€` : 'Gratis'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No hay horas disponibles para este día.</p>
            )}
          </div>
        )}

        {/* Footer CTA */}
        <div className="cbm-footer">
          {selectedSlot ? (
            <div className="cbm-footer-selected">
              <div>
                <p className="cbm-footer-label">Cita seleccionada</p>
                <p className="cbm-footer-summary">
                  {new Date(selectedSlot.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}{selectedSlot.time}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span className="cbm-footer-fee">{selectedFee > 0 ? `${selectedFee.toFixed(2)}€` : 'Gratis'}</span>
                <button className="cbm-book-btn" onClick={handleBook}>
                  Confirmar reserva →
                </button>
              </div>
            </div>
          ) : (
            <p className="cbm-footer-hint">Selecciona una fecha y horario para continuar</p>
          )}
        </div>

      </div>
    </div>
  );
}
