'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { formatEUR } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import './ClinicBookingModal.css';

function feeFromSlot(slot) {
  if (!slot) return { amount: 0, label: '', tier: 0 };
  return { amount: Number(slot.price ?? 0), label: slot.tierLabel ?? '', tier: slot.tier ?? 0 };
}

function getDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    weekday: d.toLocaleDateString('es-ES', { weekday: 'short' }),
    day: d.getDate(),
    month: d.toLocaleDateString('es-ES', { month: 'short' }),
  };
}

export default function ClinicBookingModal({
  provider,
  serviceId,
  isSinSeguro = false,
  initialSlot = null,
  initialProcedureSlug = '',
  initialSpecialtySlug = '',
  // Prop carrying the insurance the user selected in search-v2 (if any).
  // Forwarded to /book so the form can pre-select the insurance toggle +
  // dropdown without forcing the user to click again.
  initialInsurance = '',
  onClose,
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(initialSlot?.date ?? null);
  const [selectedSlot, setSelectedSlot] = useState(initialSlot ?? null);
  const [allSlots, setAllSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);

  // Procedure selection (mandatory for everyone — SON catalogue price comes from DB).
  const [procedures, setProcedures] = useState([]);
  const [proceduresLoading, setProceduresLoading] = useState(true);
  const [procedureSlug, setProcedureSlug] = useState(initialProcedureSlug || '');

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

  // Fetch procedures for this clinic (filtered by specialty if available).
  useEffect(() => {
    setProceduresLoading(true);
    const qs = initialSpecialtySlug ? `?specialtySlug=${encodeURIComponent(initialSpecialtySlug)}` : '';
    fetch(`/api/clinics/${provider.id}/procedures${qs}`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.procedures || [];
        setProcedures(list);
        // If we have a preselected procedure slug, keep it; otherwise default to
        // the first one so the user always lands on a valid pick.
        if (!procedureSlug && list.length > 0) {
          const preselect = initialProcedureSlug && list.find((p) => p.slug === initialProcedureSlug);
          setProcedureSlug(preselect ? preselect.slug : list[0].slug);
        }
      })
      .catch(() => setProcedures([]))
      .finally(() => setProceduresLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id, initialSpecialtySlug]);

  const selectedProcedure = useMemo(
    () => procedures.find((p) => p.slug === procedureSlug) || null,
    [procedures, procedureSlug],
  );
  const procedurePrice = Number(selectedProcedure?.price ?? 0);

  // Unique dates (next 7)
  const dates = [...new Set(allSlots.map((s) => s.date))].slice(0, 7);

  // Cheapest total fee per date — surfaced on the date buttons so users see
  // price variation across days before picking one.
  const priceByDate = useMemo(() => {
    const map = {};
    for (const s of allSlots) {
      const slotPrice = Number(s.price ?? 0);
      if (slotPrice === 0) continue; // skip free / zero-priced slots
      const total = isSinSeguro ? procedurePrice + slotPrice : slotPrice;
      if (map[s.date] == null || total < map[s.date]) map[s.date] = total;
    }
    return map;
  }, [allSlots, isSinSeguro, procedurePrice]);

  const slotsForDate = selectedDate
    ? allSlots.filter((s) => s.date === selectedDate)
    : [];

  const canBook = !!selectedSlot && !!procedureSlug;

  const handleBook = () => {
    if (!canBook) return;
    const fee = feeFromSlot(selectedSlot);
    const totalFee = isSinSeguro ? procedurePrice + fee.amount : fee.amount;

    const params = new URLSearchParams({
      provider: provider.id,
      providerName: provider.name,
      date: selectedSlot.date,
      time: selectedSlot.time,
      fee: totalFee,
      feeLabel: fee.label,
      tier: String(fee.tier),
      isSinSeguro: String(isSinSeguro),
      procedureSlug,
      procedureName: selectedProcedure?.name || '',
      procedurePrice: String(procedurePrice),
      ...(serviceId ? { service: serviceId } : {}),
      // Pass the insurer the user selected in search filters so /book can
      // pre-select the toggle + dropdown.
      ...(initialInsurance && !isSinSeguro ? { insurance: initialInsurance } : {}),
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
    ? (() => { const f = feeFromSlot(selectedSlot); return isSinSeguro ? procedurePrice + f.amount : f.amount; })()
    : null;

  return (
    <div className="cbm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cbm-modal" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="cbm-header">
          <div>
            <h2 className="cbm-title">{provider.name}</h2>
            <p className="cbm-subtitle"><Icon name="map-pin" size={14} /> {provider.address}, {provider.city}</p>
            <div className="cbm-rating">
              <span style={{ color: '#f59e0b' }}>★</span>
              <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{provider.rating}</span>
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>({provider.reviewCount} opiniones)</span>
            </div>
          </div>
          <button className="cbm-close" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={18} /></button>
        </div>

        {/* Procedure picker (required for everyone) */}
        <div className="cbm-section">
          <h3 className="cbm-section-title">Acto médico</h3>
          {proceduresLoading ? (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Cargando catálogo...</p>
          ) : procedures.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
              Esta clínica aún no tiene actos médicos en el catálogo. Contacta soporte si querés reservar igualmente.
            </p>
          ) : (
            <select
              className="cbm-procedure-select"
              value={procedureSlug}
              onChange={(e) => setProcedureSlug(e.target.value)}
            >
              {procedures.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}{isSinSeguro && p.price != null ? ` — ${formatEUR(p.price)}` : ''}
                </option>
              ))}
            </select>
          )}
          {isSinSeguro && selectedProcedure && (
            <p className="cbm-procedure-hint">
              Pagas <strong>{formatEUR(procedurePrice)}</strong> por el acto + tarifa de prioridad.
              Recibirás el voucher de SaludOnNet por email.
            </p>
          )}
          {!isSinSeguro && (
            <p className="cbm-procedure-hint">
              La consulta la cubre tu seguro. Solo pagas la tarifa de prioridad.
            </p>
          )}
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
                  {priceByDate[date] != null && (
                    <span className="cbm-date-price">desde {formatEUR(priceByDate[date])}</span>
                  )}
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
                  const f = feeFromSlot(slot);
                  const fee = isSinSeguro ? procedurePrice + f.amount : f.amount;
                  const isActive = selectedSlot?.time === slot.time;
                  return (
                    <button
                      key={i}
                      className={`cbm-time-btn cbm-time-btn--tier-${f.tier} ${isActive ? 'cbm-time-btn--active' : ''}`}
                      onClick={() => {
                        setSelectedSlot(slot);
                        trackEvent('slot_selected', { provider_id: provider.id, date: slot.date, time: slot.time, tier: f.tier });
                      }}
                      title={f.label || ''}
                    >
                      <span className="cbm-time">{slot.time}</span>
                      {f.amount > 0 && <span className="cbm-time-fee">{formatEUR(fee)}</span>}
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
          {canBook ? (
            <div className="cbm-footer-selected">
              <div>
                <p className="cbm-footer-label">Cita seleccionada</p>
                <p className="cbm-footer-summary">
                  {new Date(selectedSlot.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}{selectedSlot.time}
                  {selectedProcedure ? ` · ${selectedProcedure.name}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span className="cbm-footer-fee">{selectedFee > 0 ? formatEUR(selectedFee) : 'Gratis'}</span>
                <button className="cbm-book-btn" onClick={handleBook}>
                  Confirmar reserva →
                </button>
              </div>
            </div>
          ) : (
            <p className="cbm-footer-hint">
              {!procedureSlug ? 'Selecciona el acto médico' : 'Selecciona una fecha y horario para continuar'}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
