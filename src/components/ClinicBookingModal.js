'use client';
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { formatEUR } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import TrustStrip from '@/components/TrustStrip';
import { getPricingDisplay, applyPartnerDiscount } from '@/lib/pricing';
import { isPartnerClinic } from '@/lib/partnerClinics';
import { fetchWithSession } from '@/lib/sessionId';
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
  // When true, /book pre-checks the "Soy un profesional médico y estoy
  // derivando a este paciente" toggle. Set by the parent (search-v2) when
  // a Clerk pro user is signed in OR when ?asProfessional=true was
  // deep-linked from a "derivar un paciente" entry-point.
  asProfessional = false,
  // Scarcity-cap forward from the listing rank. When true the slot
  // fetch appends `?asTopRanked=true` so /api/clinics/[id]/available-slots
  // caps tier-1 to 1 — keeps the "última cita…" pill consistent between
  // the card and the modal for top-3 non-partner clinics. Partners are
  // always capped server-side via PARTNER_CLINIC_IDS regardless.
  isTopRanked = false,
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
    const qs = isTopRanked ? '?asTopRanked=true' : '';
    fetch(`/api/clinics/${provider.id}/available-slots${qs}`)
      .then((r) => r.json())
      .then((data) => {
        setAllSlots((data.slots || []).filter((s) => s.available));
      })
      .catch(() => setAllSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [provider.id, isTopRanked]);

  // Fetch procedures for this clinic (filtered by specialty if available).
  useEffect(() => {
    setProceduresLoading(true);
    const qs = initialSpecialtySlug ? `?specialtySlug=${encodeURIComponent(initialSpecialtySlug)}` : '';
    fetch(`/api/clinics/${provider.id}/procedures${qs}`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.procedures || [];
        setProcedures(list);

        if (procedureSlug || list.length === 0) return;

        // (1) Explicit slug wins — came through the search context.
        if (initialProcedureSlug) {
          const preselect = list.find((p) => p.slug === initialProcedureSlug);
          if (preselect) { setProcedureSlug(preselect.slug); return; }
        }

        // (2) 2026-06-08 — When the modal opens from a SEM landing
        // (/especialistas/[especialidad]/[ciudad]), pre-select the
        // STANDARD CONSULTATION for that specialty so the patient
        // doesn't have to scroll through niche aesthetic procedures
        // first. Match heuristic, in order:
        //   a. name contains "consulta" + the specialty keyword
        //      (e.g. "Consulta de Cardiología", "Consulta Cardio")
        //   b. name STARTS with the specialty keyword and is the
        //      shortest such match (proxy for "the basic one")
        //   c. cheapest procedure as last resort
        // Without an initialSpecialtySlug (= patient came in via
        // clinic-card click without context), we leave the dropdown
        // on the placeholder.
        if (initialSpecialtySlug) {
          const slugTokens = initialSpecialtySlug
            .toLowerCase()
            .replace(/-/g, ' ')
            .split(/\s+/)
            .filter((t) => t.length >= 4); // drop "y", "de", etc.
          const matches = (name) => {
            const n = (name || '').toLowerCase();
            return slugTokens.some((t) => n.includes(t.slice(0, 5))); // stem match
          };
          const withConsulta = list
            .filter((p) => /consulta/i.test(p.name || '') && matches(p.name))
            .sort((a, b) => (a.price || 0) - (b.price || 0));
          if (withConsulta.length > 0) {
            setProcedureSlug(withConsulta[0].slug);
            return;
          }
          const startsWithSpecialty = list
            .filter((p) => matches(p.name))
            .sort((a, b) => (a.name || '').length - (b.name || '').length);
          if (startsWithSpecialty.length > 0) {
            setProcedureSlug(startsWithSpecialty[0].slug);
            return;
          }
        }

        // (3) No specialty context — leave empty so dropdown shows
        // "Selecciona el acto médico" placeholder and the new
        // clickable hint guides the patient to pick.
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
  //
  // 2026-06-09 — Apply the partner discount HERE so the date button
  // matches the time-slot button. Previous deploy (rolled back) shipped
  // the time-slot fix without this and produced an inconsistent
  // "desde €29" date / "€20,50" slot — the bug surfaced on Cea
  // Bermúdez. Both surfaces now route through applyPartnerDiscount
  // and getPricingDisplay so the partner-discounted active price is
  // the SINGLE number we show across the modal.
  const priceByDate = useMemo(() => {
    const map = {};
    const standardMap = {};
    for (const s of allSlots) {
      const rawSlotPrice = Number(s.price ?? 0);
      if (rawSlotPrice === 0) continue;
      const slotPrice = applyPartnerDiscount(rawSlotPrice, provider.id);
      const total = isSinSeguro ? procedurePrice + slotPrice : slotPrice;
      if (map[s.date] == null || total < map[s.date]) {
        map[s.date] = total;
        // Track the matching standard (strikethrough) price for the
        // chosen cheapest slot of the day so the date button can
        // render both consistently.
        const display = getPricingDisplay(s, provider.id);
        standardMap[s.date] = isSinSeguro ? procedurePrice + display.standard : display.standard;
      }
    }
    return { active: map, standard: standardMap };
  }, [allSlots, isSinSeguro, procedurePrice, provider.id]);

  const slotsForDate = selectedDate
    ? allSlots.filter((s) => s.date === selectedDate)
    : [];

  const canBook = !!selectedSlot && !!procedureSlug;
  const [holdError, setHoldError] = useState('');
  const [holdLoading, setHoldLoading] = useState(false);

  // Client-side scarcity flag — true when the clinic has exactly one
  // tier-1 (≤7 días) slot left in its FULL inventory. Used to render
  // the amber banner inside the modal AND to forward `lastSlot=1` to
  // /book without depending on the server-side probe (which fails
  // silently if Upstash/DB are slow on a cold Lambda).
  const tierOneAvailableCount = useMemo(
    () => (allSlots || []).filter((s) => s.tier === 1 && s.available).length,
    [allSlots],
  );
  const isLastSlotThisWeekClient = tierOneAvailableCount === 1;

  const handleBook = async () => {
    if (!canBook || holdLoading) return;
    const fee = feeFromSlot(selectedSlot);
    // BUG FIX (ítem 1 del reporte): antes pasábamos `totalFee = procedurePrice
    // + fee.amount` y luego /book volvía a sumar `servicePrice + activeFee`,
    // duplicando el precio del servicio en el checkout. Ahora `fee` es solo
    // la prioridad; /book compone el total para sin-seguro como
    // `servicePrice + priority`. Para asegurado, `total = priority` (la
    // consulta corre por el seguro).
    const priorityFee = fee.amount;

    // 2026-06 — claim a 15-minute slot hold before navigating to /book.
    // The hold blocks any other browser session from booking the same
    // (clinic, date, time) for 15 min (auto-extends to 30 on the payment
    // step). On 409 we surface a toast + refresh the slot list. On any
    // other failure (Redis down etc.) the route gracefully no-ops and
    // we proceed without the hold — the patient still books, the
    // exclusion just doesn't fire for other users until Redis is back.
    setHoldError('');
    setHoldLoading(true);
    let holdResponse = { ok: true, expiresAt: null, isLastSlotThisWeek: false };
    try {
      const res = await fetchWithSession('/api/slot-holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: provider.id,
          providerName: provider.name,
          date: selectedSlot.date,
          time: selectedSlot.time,
          procedureSlug,
          procedureName: selectedProcedure?.name || null,
          procedurePrice,
          tier: fee.tier,
          fee: priorityFee,
          feeLabel: fee.label,
          hasInsurance: !isSinSeguro,
          insuranceCompany: initialInsurance || null,
        }),
      });
      if (res.status === 409) {
        setHoldLoading(false);
        setHoldError('Este hueco se acaba de reservar. Hemos refrescado las opciones disponibles — elige otra hora.');
        // Re-fetch slots so the listing reflects the new state.
        try {
          const refresh = await fetchWithSession(`/api/clinics/${provider.id}/available-slots${isTopRanked ? '?asTopRanked=true' : ''}`);
          const data = await refresh.json();
          if (data?.slots) setAllSlots((data.slots || []).filter((s) => s.available));
        } catch {}
        setSelectedSlot(null);
        return;
      }
      if (res.ok) {
        holdResponse = await res.json();
      }
    } catch (err) {
      // Network hiccup — log and continue. Better to lose the lock than
      // block the booking.
      console.error('[ClinicBookingModal] hold acquisition failed (continuing)', err?.message);
    } finally {
      setHoldLoading(false);
    }

    // 2026-06-09 — INCIDENT FIX (Jacques Blehaut booking).
    // The param name was `provider` here; /book reads `providerId`. The
    // mismatch caused every booking to default to provider_id=1 (Cea
    // Bermúdez) in /book → wrong notification email + wrong partner
    // discount + wrong clinic in admin. Renamed to match /book's
    // search-params reader. Also surfacing specialty here so the
    // bookings row no longer ends up with specialty=NULL.
    const params = new URLSearchParams({
      providerId: String(provider.id),
      providerName: provider.name,
      ...(selectedProcedure?.specialty_slug
        ? { specialty: selectedProcedure.specialty_slug }
        : selectedProcedure?.specialty_name
        ? { specialty: selectedProcedure.specialty_name }
        : initialSpecialtySlug
        ? { specialty: initialSpecialtySlug }
        : {}),
      date: selectedSlot.date,
      time: selectedSlot.time,
      fee: priorityFee,
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
      // Pro user / explicit derivation entry-point — /book pre-checks the
      // referral toggle and pre-fills the pro fields from Clerk on its end.
      ...(asProfessional ? { asProfessional: 'true' } : {}),
      // 15-min hold context for /book. We ALWAYS forward an expiresAt
      // so the timer is visible even when the server-side hold layer
      // is having a bad day — the server-issued value when we got one,
      // otherwise a local synthetic now+15min that drives the UI alone
      // (no enforcement, but the visible countdown still works and the
      // patient understands the window).
      holdExpiresAt: holdResponse.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      // "Última cita" pill. Client-side scarcity is the source of
      // truth — server probe is a confirmation, not a gate. Either
      // signal flipping it on lights the banner on /book.
      ...((holdResponse.isLastSlotThisWeek || isLastSlotThisWeekClient) ? { lastSlot: '1' } : {}),
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

  // 2026-06-01 — price-shock fix. Previously the footer only showed ONE
  // price (the priority fee when isSinSeguro=false, or the full total when
  // isSinSeguro=true). Users coming from the ad landing pages have
  // isSinSeguro=false, so they saw "€29" in the modal and mentally
  // committed to that. Then on /book they toggled "No tengo seguro" and
  // the price jumped to €70+ — instant bailout (confirmed via Clarity:
  // session of the only user who filled the form abandoned exactly at
  // that toggle on 05/29). Now the modal exposes BOTH the "with insurance"
  // and "without insurance" totals upfront so the user is informed before
  // committing.
  // 2026-06-08 — Apply partner discount (30% off) directly to the
  // priority fee for display + charge. The discount is the SINGLE
  // source via applyPartnerDiscount(); the same call is mirrored on
  // the server in /api/payments via computeChargeAmount() so a tampered
  // client can't bypass it.
  const rawPriorityFee = selectedSlot ? feeFromSlot(selectedSlot).amount : 0;
  const selectedPriorityFee = applyPartnerDiscount(rawPriorityFee, provider.id);
  const selectedTotalNoInsurance = selectedPriorityFee + procedurePrice;
  // Pricing display bag for the selected slot — strikethrough labels
  // come from here. We compute once and reuse across the footer row.
  const selectedPricingDisplay = selectedSlot
    ? getPricingDisplay(selectedSlot, provider.id)
    : null;
  // Backwards-compatible single number for callers that still expect it.
  const selectedFee = isSinSeguro ? selectedTotalNoInsurance : selectedPriorityFee;

  // Date strip horizontal scroll affordances. The row is `overflow-x: auto`
  // and the inline scrollbar is hidden by design, so on small viewports
  // (Villasalud's 5-7 dates don't fit a 360 px modal) the last button was
  // clipping mid-button and the user had no visible way to scroll. We add
  // chevron buttons + scroll-snap so the row always stops on a clean
  // button boundary.
  const datesRef = useRef(null);
  const [canScrollDatesLeft, setCanScrollDatesLeft] = useState(false);
  const [canScrollDatesRight, setCanScrollDatesRight] = useState(false);

  const updateDatesOverflow = () => {
    const el = datesRef.current;
    if (!el) return;
    // 1 px tolerance for sub-pixel scrollWidth on fractional zoom levels.
    setCanScrollDatesLeft(el.scrollLeft > 1);
    setCanScrollDatesRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useLayoutEffect(() => {
    updateDatesOverflow();
  }, [dates.length, slotsLoading]);

  useEffect(() => {
    const el = datesRef.current;
    if (!el) return;
    const onScroll = () => updateDatesOverflow();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateDatesOverflow);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateDatesOverflow);
    };
  }, [dates.length]);

  const scrollDates = (direction) => {
    const el = datesRef.current;
    if (!el) return;
    // Step ≈ one date button + gap (60 + 8 + small breathing room).
    const step = Math.max(120, Math.floor(el.clientWidth * 0.6));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

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

        {/* Scrollable body — wraps every section so the modal doesn't push
            the footer off-screen when content is taller than 90 vh. */}
        <div className="cbm-body">
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
              id="cbm-procedure-select"
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

        {/* Scarcity banner — mirrors the one on the clinic card so the
            urgency message follows the patient into the modal. Fires
            from `tierOneAvailableCount === 1` over the FULL slot
            inventory (not the 3-slot preview the card displays), same
            criterion as ClinicCardV2's last-slot banner. */}
        {!slotsLoading && isLastSlotThisWeekClient && (
          <div
            style={{
              margin: '0 var(--space-5)',
              padding: '8px 12px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: 8,
              color: '#7c2d12',
              fontSize: '0.9rem',
              lineHeight: 1.4,
            }}
          >
            ⏱ <strong>Última cita en este centro en menos de una semana</strong>
          </div>
        )}

        {/* Date picker */}
        <div className="cbm-section">
          <h3 className="cbm-section-title">Selecciona una fecha</h3>
          {slotsLoading ? (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Cargando disponibilidad...</p>
          ) : dates.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No hay fechas disponibles próximamente.</p>
          ) : (
          <div className="cbm-dates-wrap">
            <button
              type="button"
              className={`cbm-dates-nav cbm-dates-nav--prev ${canScrollDatesLeft ? '' : 'cbm-dates-nav--hidden'}`}
              onClick={() => scrollDates(-1)}
              aria-label="Ver fechas anteriores"
              tabIndex={canScrollDatesLeft ? 0 : -1}
            >
              <Icon name="chevron-left" size={18} />
            </button>
            <div className="cbm-dates" ref={datesRef}>
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
                    {priceByDate.active[date] != null && (
                      <span className="cbm-date-price">
                        desde{' '}
                        {priceByDate.standard[date] > priceByDate.active[date] && (
                          <span className="cbm-date-price-old">{formatEUR(priceByDate.standard[date])}</span>
                        )}{' '}
                        <strong>{formatEUR(priceByDate.active[date])}</strong>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={`cbm-dates-nav cbm-dates-nav--next ${canScrollDatesRight ? '' : 'cbm-dates-nav--hidden'}`}
              onClick={() => scrollDates(1)}
              aria-label="Ver más fechas"
              tabIndex={canScrollDatesRight ? 0 : -1}
            >
              <Icon name="chevron-right" size={18} />
            </button>
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
                  // 2026-06-08 — apply partner discount + strikethrough.
                  // The slot button now shows both the standard price
                  // (struck out) and the active price the patient will
                  // actually be charged.
                  const display = getPricingDisplay(
                    { tier: f.tier, price: f.amount },
                    provider.id,
                  );
                  const activeFee = isSinSeguro ? procedurePrice + display.active : display.active;
                  const standardFee = isSinSeguro ? procedurePrice + display.standard : display.standard;
                  const isActive = selectedSlot?.time === slot.time;
                  return (
                    <button
                      key={i}
                      className={`cbm-time-btn cbm-time-btn--tier-${f.tier} ${isActive ? 'cbm-time-btn--active' : ''}`}
                      onClick={() => {
                        setSelectedSlot(slot);
                        // `source` matches the value used in book_started so
                        // the marketing agent can pair the events when
                        // computing flow-specific conversion rates.
                        trackEvent('slot_selected', { provider_id: provider.id, date: slot.date, time: slot.time, tier: f.tier, source: 'modal' });
                      }}
                      title={f.label || ''}
                    >
                      <span className="cbm-time">{slot.time}</span>
                      {f.amount > 0 && (
                        <span className="cbm-time-fee-group">
                          {display.showStrikethrough && (
                            <span className="cbm-time-fee-old">{formatEUR(standardFee)}</span>
                          )}
                          <span className="cbm-time-fee">{formatEUR(activeFee)}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No hay horas disponibles para este día.</p>
            )}
          </div>
        )}
        </div>{/* /.cbm-body */}

        {/* Footer CTA */}
        <div className="cbm-footer">
          {/* 2026-06-04 — A2: trust strip just above the Confirmar button.
              The patient is about to commit; we restate the 3 reassurances
              at the moment of highest friction in the modal flow. Hidden if
              there is no actionable booking yet. Inline variant so the
              slot picker stays above the fold on mobile — the v1 chip row
              pushed slots out of view. */}
          {canBook && (
            <div style={{ marginBottom: 8 }}>
              <TrustStrip variant="inline" />
            </div>
          )}
          {canBook ? (
            <div className="cbm-footer-selected">
              <div className="cbm-footer-info">
                <p className="cbm-footer-label">Cita seleccionada</p>
                <p className="cbm-footer-summary">
                  {new Date(selectedSlot.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}{selectedSlot.time}
                  {selectedProcedure && (
                    <span className="cbm-footer-procedure" title={selectedProcedure.name}>
                      {' · '}{selectedProcedure.name}
                    </span>
                  )}
                </p>
                {/* Show BOTH prices upfront to avoid price-shock when the
                    user toggles "No tengo seguro". When sin-seguro flow,
                    we know the total already and show only that. Otherwise
                    "Con seguro: €X · Sin seguro: €Y" + a single-line note.
                    2026-06-04 v2 — dropped the "consulta privada €60-120"
                    line from the modal: the landing-hero anchor already
                    sets that frame, and the modal needs vertical room for
                    the slot picker to stay above the fold on mobile. */}
                {!isSinSeguro && procedurePrice > 0 && selectedPriorityFee > 0 && (
                  <p className="cbm-footer-pricehint">
                    {selectedPricingDisplay?.showStrikethrough && (
                      <span className="cbm-price-old">{selectedPricingDisplay.standardLabel}</span>
                    )}{' '}
                    <strong>{formatEUR(selectedPriorityFee)}</strong> con seguro
                    {' · '}
                    <strong>{formatEUR(selectedTotalNoInsurance)}</strong> sin seguro
                    {' '}<span className="cbm-footer-pricehint-note">(consulta {formatEUR(procedurePrice)} + prioridad)</span>
                    {selectedPricingDisplay?.isPartner && (
                      <span className="cbm-partner-savings">
                        {' '}· ✨ −30% centro destacado
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="cbm-footer-cta">
                <span className="cbm-footer-fee">{selectedFee > 0 ? formatEUR(selectedFee) : 'Gratis'}</span>
                <button className="cbm-book-btn" onClick={handleBook} disabled={holdLoading}>
                  {holdLoading ? 'Reservando hueco…' : 'Confirmar reserva →'}
                </button>
              </div>
            </div>
          ) : !procedureSlug ? (
            // 2026-06-08 — Clarity rage clicks recorded on this text:
            // patients tapped the "Selecciona el acto médico" hint
            // expecting it to open the dropdown. Now it does. We also
            // scroll the select into view + focus it so the native
            // picker can open on mobile with one extra tap.
            <button
              type="button"
              className="cbm-footer-hint cbm-footer-hint--clickable"
              onClick={() => {
                const sel = document.getElementById('cbm-procedure-select');
                if (sel) {
                  sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  sel.focus();
                }
              }}
            >
              Selecciona el acto médico →
            </button>
          ) : (
            <p className="cbm-footer-hint">
              Selecciona una fecha y horario para continuar
            </p>
          )}
          {holdError && (
            <p
              role="alert"
              style={{
                margin: '8px 0 0',
                padding: '8px 12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                color: '#991b1b',
                fontSize: '0.85rem',
                lineHeight: 1.4,
              }}
            >
              {holdError}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
