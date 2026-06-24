'use client';
import Icon from '@/components/icons/Icon';
import { formatEUR } from '@/lib/format';
import { getPricingDisplay, applyPartnerDiscount, STANDARD_TIERS, PARTNER_DISCOUNT_PCT } from '@/lib/pricing';
import { isPartnerClinic } from '@/lib/partnerClinics';
// SaludOnNet video-consultation pilot — trackEvent fires the click
// telemetry (GA4 + Clarity + analytics_events DB row) so we can
// measure the pilot's funnel and compare CTR vs. in-person.
// Cleanup of the pilot: drop this import and the
// video_pilot_card_click trackEvent below.
import { trackEvent } from '@/lib/analytics';
import './ClinicCardV2.css';

function getInitials(name) {
  return name
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

const AVATAR_COLORS = ['#1a3c5e','#0d5e42','#7c3aed','#b45309','#0e7490','#9d174d'];

function formatSlotDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

// slots prop:
//   undefined  → loading (show skeleton shimmer)
//   []         → no availability
//   [{...}]    → show chips
//
// visibleTiers prop:
//   null / undefined → show every tier the clinic has (default).
//   Set([1,2])       → hide slot chips outside the selected tier set,
//                      so the patient's tier-filter chip is reflected
//                      directly on the card.
export default function ClinicCardV2({
  provider, index = 0, serviceId, basePrice = 0,
  isSinSeguro = false, onOpenModal, highlighted = false,
  slots, visibleTiers = null,
}) {
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  // Pipeline: available → filter by tier (if visibleTiers passed) → cap at 3.
  // Doing the tier filter BEFORE the cap means picking 3 tier-1 chips when
  // the user only wants this-week slots, not 3 mixed-tier chips that
  // happened to come first.
  const availableSlots = slots === undefined
    ? undefined
    : (slots || []).filter((s) => s.available);
  const tierFilteredSlots = availableSlots === undefined
    ? undefined
    : (visibleTiers && visibleTiers.size > 0
        ? availableSlots.filter((s) => visibleTiers.has(s.tier))
        : availableSlots);
  const nextSlots = tierFilteredSlots === undefined
    ? undefined
    : tierFilteredSlots.slice(0, 3);
  // "Última cita" scarcity banner: fires when the clinic has exactly one
  // tier-1 (≤ 7 días) slot left across its FULL inventory — not just the
  // 3-slot preview the card displays. The previous version checked
  // `tierFilteredSlots.length === 1`, which is the post-slice preview,
  // so the banner never appeared unless almost the whole clinic was
  // already booked. We now count tier-1 hits over `availableSlots` (all
  // future, available slots from /api/clinics/batch-slots).
  //
  // Tier-3 / 4 "last-of-month" cases stay silent — no urgency when the
  // next opening is a month away.
  const tierOneCount = availableSlots === undefined
    ? null
    : availableSlots.filter((s) => s.tier === 1).length;
  const isLastSlotThisWeek = tierOneCount === 1;

  // SaludOnNet video-consultation pilot — providers carrying
  // `deliveryMode === 'video'` short-circuit every CTA on this card.
  // Instead of opening ClinicBookingModal, we fire a Clarity event
  // + Sentry breadcrumb and open SaludOnNet's booking page in a new
  // tab with UTM params attached. Removing the pilot reverts every
  // dispatchOpen() call below to the direct onOpenModal() form.
  const isVideoProvider = provider?.deliveryMode === 'video';
  const dispatchOpen = (slot) => {
    if (isVideoProvider) {
      // Telemetry — trackEvent fans out to GA4, Clarity, and the
      // analytics_events Azure SQL table. Lets us measure the
      // pilot's CTR (card click → modal open) and compare against
      // in-person card CTR by isolating the event name.
      try {
        trackEvent('video_pilot_card_click', {
          providerId: String(provider.id),
          specialty: provider.specialtyDisplay || '',
          slotDate: slot?.date || null,
          slotTime: slot?.time || null,
        });
      } catch {}
    }
    if (onOpenModal) onOpenModal(provider, slot);
  };

  // 2026-06-04 — Dead-click fix.
  // Clarity recorded heavy dead-click activity on the clinic name, logo
  // avatar, address and insurance tags. Patients expected the card to be
  // clickable as a unit; the slot chips were the only interactive area.
  // The upper "card body" (avatar + name + rating + insurance tags) now
  // opens the booking modal in browse mode (no preselected slot), same
  // as the "Ver todos los horarios →" CTA. Slot chips are SIBLINGS of
  // this container, not children, so their click handlers are unaffected.
  const openBrowseMode = () => {
    dispatchOpen(null);
  };
  const handleBodyKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openBrowseMode();
    }
  };

  return (
    <div className={`cv2-card ${highlighted ? 'cv2-card--highlighted' : ''}`} id={`clinic-card-${provider.id}`}>
      <div
        className="cv2-card-body cv2-card-body--clickable"
        role="button"
        tabIndex={0}
        onClick={openBrowseMode}
        onKeyDown={handleBodyKey}
        aria-label={`Ver disponibilidad de ${provider.name}`}
        title="Click para reservar"
      >
        <div className="cv2-avatar" style={provider.imageUrl ? {} : { background: avatarColor }}>
          {provider.imageUrl
            ? <img src={provider.imageUrl} alt={provider.name} className="cv2-avatar-img" />
            : getInitials(provider.name)}
        </div>

        <div className="cv2-info">
          <div className="cv2-info-top">
            <div>
              <h3 className="cv2-name">{provider.name}</h3>
              {/* 2026-06-22 — Address ahora link a Google Maps.
                  Clarity grabó múltiples sesiones (incluida una SEM de
                  bing/derma-barcelona) con dead clicks en la dirección
                  de la clínica — los usuarios la leen como interactiva
                  porque "es una dirección, debería abrir en mapa".
                  Ahora click en la dirección abre Maps en pestaña nueva
                  con la dirección pre-rellenada. stopPropagation para
                  que NO se dispare ALSO el openBrowseMode del card-body
                  (sin eso, el click haría las dos cosas — abrir modal Y
                  Maps — porque el link queda DENTRO del card clickeable). */}
              {isVideoProvider ? (
                // Video pilot — no physical address, so the line is
                // plain text. Icon swapped from map-pin to video to
                // reinforce the modality at-a-glance.
                <span className="cv2-address">
                  <Icon name="video" size={14} className="cv2-icon" />
                  {provider.address || 'Videoconsulta online'}
                </span>
              ) : (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${provider.name}, ${provider.address || ''}, ${provider.city || ''}`.trim()
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cv2-address cv2-address--link"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  title="Ver en Google Maps"
                  aria-label={`Ver ${provider.name} en Google Maps`}
                >
                  <Icon name="map-pin" size={14} className="cv2-icon" />
                  {provider.address}, {provider.city}
                </a>
              )}
            </div>

            {/* 2026-06-12 — Dead-click fix follow-up.
                Clarity recorded a SEM session (Jun 10, 17:32) with two
                consecutive dead clicks on `★` and `(N opiniones)`. The
                rating block ALREADY bubbled into the card-body's
                openBrowseMode handler, but Clarity's heuristic flags a
                click as dead when the exact element doesn't visually
                respond within ~250 ms — the modal opens after a brief
                React state cycle, so the click target itself looks
                inert. We now (a) attach the handler EXPLICITLY to the
                rating block so its onClick fires before the bubble does,
                (b) give it a :hover + :active style so the element
                literally responds under the cursor, and (c) mark it as
                role="button" so Clarity classifies it as interactive
                and stops scoring its clicks as dead. */}
            <div
              className="cv2-rating-block cv2-rating-block--clickable"
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); openBrowseMode(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openBrowseMode();
                }
              }}
              aria-label={`Ver opiniones y reservar en ${provider.name}`}
            >
              <div className="cv2-stars">{'★'.repeat(Math.round(provider.rating || 0))}</div>
              <span className="cv2-rating-num">{provider.rating}</span>
              <span className="cv2-reviews">({provider.reviewCount} opiniones)</span>
            </div>
          </div>

          <div className="cv2-tags">
            {/* SaludOnNet video-consultation pilot — sits FIRST so it
                reads as the headline differentiator on the card, the
                same slot the partner pill would occupy for in-person
                providers (the two are mutually exclusive — video
                providers never receive the partner pill). */}
            {isVideoProvider && (
              <span className="cv2-tag cv2-tag--video" title="Consulta por videollamada con un médico de la red SaludOnNet">
                🎥 Videoconsulta
              </span>
            )}
            {/* 2026-06-08 — Partner badge. Cea Bermúdez (and any future
                PARTNER_CLINIC_IDS member) earns a visible green chip
                advertising the extra -30% discount applied to all its
                slots. Sits FIRST in the row so it reads as the headline
                differentiator. */}
            {!isVideoProvider && isPartnerClinic(provider.id) && (
              <span className="cv2-tag cv2-tag--partner" title="Tarifa de prioridad con descuento adicional del 30%">
                ✨ Centro destacado · −{Math.round(PARTNER_DISCOUNT_PCT * 100)}%
              </span>
            )}
            {(provider.acceptedInsurance || []).slice(0, 3).map((ins) => (
              <span key={ins} className="cv2-tag">{ins}</span>
            ))}
            {(provider.acceptedInsurance || []).length > 3 && (
              <span className="cv2-tag cv2-tag--more">+{(provider.acceptedInsurance || []).length - 3}</span>
            )}
            {provider.allowsFreeCancel && (
              <span className="cv2-tag cv2-tag--green">✓ Cancelación gratuita</span>
            )}
          </div>
        </div>
      </div>

      {/* Slot area */}
      {nextSlots === undefined ? (
        <div className="cv2-slots-loading">
          <span className="cv2-slot-skeleton" />
          <span className="cv2-slot-skeleton" />
          <span className="cv2-slot-skeleton" />
        </div>
      ) : nextSlots.length > 0 ? (
        <div className="cv2-slots">
          {isLastSlotThisWeek && (() => {
            // 2026-06-08 — Clarity recorded rage clicks on this banner: users
            // expected the urgency message to be actionable. Now clicking
            // teleports them to the booking modal with the single
            // remaining tier-1 slot pre-selected → 1 click away from book.
            const firstTier1 = availableSlots?.find((s) => s.tier === 1);
            const handleBannerClick = () => {
              if (firstTier1) dispatchOpen(firstTier1);
            };
            return (
              <div
                className="cv2-last-slot-banner cv2-last-slot-banner--clickable"
                role="button"
                tabIndex={0}
                onClick={handleBannerClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBannerClick();
                  }
                }}
                aria-label={firstTier1 ? `Reservar la última cita disponible (${firstTier1.date} ${firstTier1.time})` : 'Última cita disponible'}
              >
                ⏱ <strong>Última cita en este centro en menos de una semana</strong>
                {firstTier1 && <span className="cv2-last-slot-banner-cta"> · Reservar →</span>}
              </div>
            );
          })()}
          <span className="cv2-slots-label">
            Próximas citas
            {(() => {
              // 2026-06-08 — header label now shows the strikethrough
              // "tarifa habitual" anchor alongside the active min price.
              // Uses the cheapest tier in nextSlots; if all slots are
              // partner-discounted the active number already reflects it.
              const priced = nextSlots.filter((s) => s.tier && Number(s.price) > 0);
              if (priced.length === 0) return null;
              const cheapest = priced.reduce(
                (best, s) => (Number(s.price) < Number(best.price) ? s : best),
                priced[0],
              );
              // SaludOnNet video pilot — service price flows straight
              // through with no priority-fee framing. Plain "desde X €"
              // copy, no strikethrough (no partner discount applies to
              // video providers in this round).
              if (isVideoProvider) {
                return (
                  <> · videoconsulta · <strong>desde {formatEUR(Number(cheapest.price) || 0)}</strong></>
                );
              }
              const display = getPricingDisplay(cheapest, provider.id);
              return (
                <> · tarifa de prioridad{' '}
                  {display.showStrikethrough && (
                    <>
                      <s className="cv2-price-old">desde {display.standardLabel}</s>{' '}
                    </>
                  )}
                  <strong>desde {display.activeLabel}</strong>
                </>
              );
            })()}
            {!isSinSeguro && !isVideoProvider && (
              <span className="cv2-slots-coverage"> · tu seguro cubre la consulta</span>
            )}
            :
          </span>
          <div className="cv2-slots-row">
            {nextSlots.map((slot, i) => {
              const hasTier = slot.tier && Number(slot.price) > 0;
              if (!hasTier) {
                return (
                  <button
                    key={i}
                    className={`cv2-slot-chip tier-${slot.tier ?? 0}`}
                    onClick={() => dispatchOpen(slot)}
                    title={slot.tierLabel || ''}
                  >
                    <span className="cv2-slot-date">{formatSlotDate(slot.date)} · {slot.time}</span>
                  </button>
                );
              }
              // 2026-06-08 — Strikethrough display for each slot chip.
              // Sin-seguro path still includes the consultation cost
              // (basePrice) on top of the discounted priority fee.
              // SaludOnNet video pilot — skip priority-fee math and
              // render the SaludOnNet service price as a single number.
              if (isVideoProvider) {
                return (
                  <button
                    key={i}
                    className={`cv2-slot-chip tier-${slot.tier ?? 0}`}
                    onClick={() => dispatchOpen(slot)}
                    title={slot.tierLabel || ''}
                  >
                    <span className="cv2-slot-date">{formatSlotDate(slot.date)} · {slot.time}</span>
                    <span className="cv2-slot-fee-group">
                      <span className="cv2-slot-fee">{formatEUR(Number(slot.price) || 0)}</span>
                    </span>
                  </button>
                );
              }
              const display = getPricingDisplay(slot, provider.id);
              const activeWithService = isSinSeguro
                ? display.active + Number(basePrice || 0)
                : display.active;
              const standardWithService = isSinSeguro
                ? display.standard + Number(basePrice || 0)
                : display.standard;
              return (
                <button
                  key={i}
                  className={`cv2-slot-chip tier-${slot.tier ?? 0}`}
                  onClick={() => dispatchOpen(slot)}
                  title={slot.tierLabel || ''}
                >
                  <span className="cv2-slot-date">{formatSlotDate(slot.date)} · {slot.time}</span>
                  <span className="cv2-slot-fee-group">
                    {display.showStrikethrough && (
                      <span className="cv2-slot-fee-old">{formatEUR(standardWithService)}</span>
                    )}
                    <span className="cv2-slot-fee">{formatEUR(activeWithService)}</span>
                  </span>
                </button>
              );
            })}
            <button
              className="cv2-slot-chip cv2-slot-chip--more"
              onClick={() => dispatchOpen(null)}
            >
              Ver todos los horarios →
            </button>
          </div>
        </div>
      ) : (
        <div className="cv2-no-slots">
          Sin disponibilidad próxima ·{' '}
          <button className="cv2-link" onClick={() => dispatchOpen(null)}>
            Ver opciones
          </button>
        </div>
      )}
    </div>
  );
}
