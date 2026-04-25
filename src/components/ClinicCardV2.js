'use client';
import { useState, useEffect, useRef } from 'react';
import { getConvenienceFee } from '@/data/mock';
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

function deterministicSlots(providerId) {
  const slots = [];
  const baseHour = 9 + (providerId % 4);
  let d = new Date();
  d.setDate(d.getDate() + 1);
  while (slots.length < 3) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      slots.push({ date: dateStr, time: `${String(baseHour + slots.length).padStart(2, '0')}:00`, available: true });
    }
    d = new Date(d.getTime() + 86400000);
  }
  return slots;
}

// props:
//   slots     — undefined: loading (show skeleton), Array: loaded (may be empty)
//               when omitted together with onVisible, falls back to deterministic generation
//   onVisible — callback(clinicId) when card enters viewport; parent handles batched fetching
export default function ClinicCardV2({
  provider, index = 0, serviceId, basePrice = 0,
  isSinSeguro = false, onOpenModal, highlighted = false,
  slots, onVisible,
}) {
  const cardRef = useRef(null);
  // fallback slots used when no parent manages slot state
  const [fallbackSlots, setFallbackSlots] = useState(onVisible ? undefined : undefined);

  useEffect(() => {
    if (onVisible) {
      // Parent manages slots — set up IntersectionObserver to notify parent
      const el = cardRef.current;
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            onVisible(provider.id);
            observer.disconnect();
          }
        },
        { rootMargin: '150px' }
      );
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      // Standalone use: generate deterministic preview slots
      setFallbackSlots(deterministicSlots(provider.id));
    }
  }, [provider.id, onVisible]);

  // When used standalone (no parent), use fallback; otherwise use prop
  const nextSlots = onVisible
    ? (slots === undefined ? undefined : (slots || []).filter((s) => s.available).slice(0, 3))
    : (fallbackSlots || []).slice(0, 3);

  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  return (
    <div
      ref={cardRef}
      className={`cv2-card ${highlighted ? 'cv2-card--highlighted' : ''}`}
      id={`clinic-card-${provider.id}`}
    >
      <div className="cv2-card-body">
        <div className="cv2-avatar" style={provider.imageUrl ? {} : { background: avatarColor }}>
          {provider.imageUrl
            ? <img src={provider.imageUrl} alt={provider.name} className="cv2-avatar-img" />
            : getInitials(provider.name)}
        </div>

        <div className="cv2-info">
          <div className="cv2-info-top">
            <div>
              <h3 className="cv2-name">{provider.name}</h3>
              <p className="cv2-address">
                <span className="cv2-icon">📍</span>
                {provider.address}, {provider.city}
              </p>
            </div>

            <div className="cv2-rating-block">
              <div className="cv2-stars">{'★'.repeat(Math.round(provider.rating || 0))}</div>
              <span className="cv2-rating-num">{provider.rating}</span>
              <span className="cv2-reviews">({provider.reviewCount} opiniones)</span>
            </div>
          </div>

          <div className="cv2-tags">
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
          <span className="cv2-slots-label">Próximas citas:</span>
          <div className="cv2-slots-row">
            {nextSlots.map((slot, i) => {
              const convFee = getConvenienceFee(slot.date);
              const fee = isSinSeguro ? basePrice + convFee.amount : convFee.amount;
              return (
                <button
                  key={i}
                  className="cv2-slot-chip"
                  onClick={() => onOpenModal && onOpenModal(provider, slot)}
                >
                  <span className="cv2-slot-date">{formatSlotDate(slot.date)} · {slot.time}</span>
                  <span className="cv2-slot-fee">{fee > 0 ? `${fee.toFixed(2)}€` : 'Gratis'}</span>
                </button>
              );
            })}
            <button
              className="cv2-slot-chip cv2-slot-chip--more"
              onClick={() => onOpenModal && onOpenModal(provider, null)}
            >
              Ver todos los horarios →
            </button>
          </div>
        </div>
      ) : (
        <div className="cv2-no-slots">
          Sin disponibilidad próxima ·{' '}
          <button className="cv2-link" onClick={() => onOpenModal && onOpenModal(provider, null)}>
            Ver opciones
          </button>
        </div>
      )}
    </div>
  );
}
