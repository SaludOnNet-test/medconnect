'use client';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getConvenienceFee } from '@/data/mock';
import './SlotCalendar.css';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const VISIBLE_DAYS = 10;

export default function SlotCalendar({ slots, onSelectSlot, isSinSeguro = false, basePrice = 0, provider, serviceId }) {
  const router = useRouter();
  const [startIndex, setStartIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const grouped = {};
    slots.forEach((s) => {
      if (!grouped[s.date]) grouped[s.date] = [];
      grouped[s.date].push(s);
    });
    return grouped;
  }, [slots]);

  const dates = Object.keys(slotsByDate).sort();
  // Let's show 10 days at a time (2 rows of 5)
  const visibleDates = dates.slice(startIndex, startIndex + VISIBLE_DAYS);

  const handleDayClick = (date) => {
    setSelectedDate(date === selectedDate ? null : date);
    setSelectedTime(null);
  };

  const handleTimeClick = (date, time) => {
    setSelectedTime(time);
    const fee = getConvenienceFee(date);
    onSelectSlot?.({ date, time, fee });
  };

  const handleStickyBook = () => {
    if (!selectedDate || !selectedTime || !provider) return;
    const fee = getConvenienceFee(selectedDate);
    const totalFee = isSinSeguro ? (basePrice + fee.amount) : fee.amount;
    const params = new URLSearchParams({
      provider: provider.id,
      providerName: provider.name,
      date: selectedDate,
      time: selectedTime,
      fee: totalFee,
      feeLabel: fee.label,
      isSinSeguro: isSinSeguro,
      ...(serviceId ? { service: serviceId } : {}),
    });
    router.push(`/book?${params.toString()}`);
  };

  const selectedFee = selectedDate ? getConvenienceFee(selectedDate) : null;
  const selectedDayLabel = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    : null;

  return (
    <>
    <div className="slot-calendar">
      <div className="slot-calendar-header">
        <span className="slot-calendar-title">Disponibilidad</span>
        <div className="slot-calendar-nav">
          <button
            onClick={() => setStartIndex(Math.max(0, startIndex - 5))}
            disabled={startIndex === 0}
            aria-label="Anterior"
          >
            ←
          </button>
          <button
            onClick={() => setStartIndex(Math.min(dates.length - VISIBLE_DAYS, startIndex + 5))}
            disabled={startIndex + VISIBLE_DAYS >= dates.length}
            aria-label="Siguiente"
          >
            →
          </button>
        </div>
      </div>

      <div className="slot-days-grid">
        {visibleDates.map((date, index) => {
          const d = new Date(date + 'T00:00:00');
          const feeObj = getConvenienceFee(date);
          const isSelected = selectedDate === date;
          
          // If Sin Seguro, total price is base price + urgency fee
          const totalAmount = isSinSeguro ? (basePrice + feeObj.amount) : feeObj.amount;
          
          const dayCell = (
            <div
              key={date}
              className={`slot-day ${isSelected ? 'selected' : ''} tier-${feeObj.tier}`}
              onClick={() => handleDayClick(date)}
            >
              <span className="slot-day-name">{DAY_NAMES[d.getDay()]}</span>
              <span className="slot-day-number">{d.getDate()}</span>
              
              <div className="slot-day-pricing">
                {isSinSeguro ? (
                  <div className="slot-price-split">
                    <span className="price-service">{Number(basePrice).toFixed(2)}€</span>
                    <span className="price-plus">+</span>
                    <span className="price-fee">{Number(feeObj.amount).toFixed(2)}€</span>
                  </div>
                ) : (
                  <span className="slot-day-price">
                    {feeObj.amount > 0 ? `${Number(feeObj.amount).toFixed(2)}€` : '0€'}
                  </span>
                )}
                <span className="slot-urgency-label">{feeObj.label}</span>
              </div>
            </div>
          );

          // The accordion panel that appears below the clicked day
          const expandedPanel = isSelected ? (
            <div key={`${date}-expanded`} className="slot-times-accordion">
              {slotsByDate[selectedDate]?.length > 0 ? (
                slotsByDate[selectedDate].map((slot) => (
                  <button
                    key={slot.time}
                    className={`slot-time ${selectedTime === slot.time ? 'selected' : ''}`}
                    onClick={() => handleTimeClick(selectedDate, slot.time)}
                  >
                    {slot.time}
                  </button>
                ))
              ) : (
                <p className="slot-no-times">No hay horarios disponibles este día.</p>
              )}
            </div>
          ) : null;

          return (
            <React.Fragment key={date}>
              {dayCell}
              {expandedPanel}
            </React.Fragment>
          );
        })}
      </div>
    </div>

    {/* Mobile sticky booking bar — shows when a date is selected */}
    {selectedDate && provider && (
      <div className="slot-sticky-bar">
        <div className="slot-sticky-info">
          <span className="slot-sticky-date">{selectedDayLabel}</span>
          <div className="slot-sticky-times">
            {(slotsByDate[selectedDate] || []).map((slot) => (
              <button
                key={slot.time}
                className={`slot-sticky-time-pill ${selectedTime === slot.time ? 'selected' : ''}`}
                onClick={() => handleTimeClick(selectedDate, slot.time)}
              >
                {slot.time}
              </button>
            ))}
          </div>
        </div>
        <div className="slot-sticky-actions">
          {selectedFee && (
            <span className="slot-sticky-fee">
              {isSinSeguro
                ? `${Number(basePrice + selectedFee.amount).toFixed(2)}€`
                : `${Number(selectedFee.amount).toFixed(2)}€`}
            </span>
          )}
          <button
            className="slot-sticky-book-btn"
            onClick={handleStickyBook}
            disabled={!selectedTime}
          >
            Reservar →
          </button>
        </div>
      </div>
    )}
    </>
  );
}
