'use client';
import { availability, getConvenienceFee } from '@/data/mock';
import './ClinicCardV2.css';

// Get initials from clinic name for avatar
function getInitials(name) {
  return name
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// Avatar background colours cycle based on index
const AVATAR_COLORS = ['#1a3c5e','#0d5e42','#7c3aed','#b45309','#0e7490','#9d174d'];

// Format date as "Jue 10 Abr"
function formatSlotDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ClinicCardV2({ provider, index = 0, serviceId, basePrice = 0, isSinSeguro = false, onOpenModal, highlighted = false }) {
  const slots = (availability[provider.id] || []).filter((s) => s.available);

  // Get next 3 available slots
  const nextSlots = slots.slice(0, 3);

  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  return (
    <div className={`cv2-card ${highlighted ? 'cv2-card--highlighted' : ''}`} id={`clinic-card-${provider.id}`}>
      <div className="cv2-card-body">
        {/* Avatar — shows clinic image if available (from SaludOnNet DB), else initials */}
        <div className="cv2-avatar" style={provider.imageUrl ? {} : { background: avatarColor }}>
          {provider.imageUrl
            ? <img src={provider.imageUrl} alt={provider.name} className="cv2-avatar-img" />
            : getInitials(provider.name)}
        </div>

        {/* Main info */}
        <div className="cv2-info">
          <div className="cv2-info-top">
            <div>
              <h3 className="cv2-name">{provider.name}</h3>
              <p className="cv2-address">
                <span className="cv2-icon">📍</span>
                {provider.address}, {provider.city}
              </p>
            </div>

            {/* Rating */}
            <div className="cv2-rating-block">
              <div className="cv2-stars">
                {'★'.repeat(Math.round(provider.rating))}
              </div>
              <span className="cv2-rating-num">{provider.rating}</span>
              <span className="cv2-reviews">({provider.reviewCount} opiniones)</span>
            </div>
          </div>

          {/* Insurance tags */}
          <div className="cv2-tags">
            {provider.acceptedInsurance.slice(0, 3).map((ins) => (
              <span key={ins} className="cv2-tag">{ins}</span>
            ))}
            {provider.acceptedInsurance.length > 3 && (
              <span className="cv2-tag cv2-tag--more">+{provider.acceptedInsurance.length - 3}</span>
            )}
            {provider.allowsFreeCancel && (
              <span className="cv2-tag cv2-tag--green">✓ Cancelación gratuita</span>
            )}
          </div>
        </div>
      </div>

      {/* Slot chips */}
      {nextSlots.length > 0 ? (
        <div className="cv2-slots">
          <span className="cv2-slots-label">Próximas citas:</span>
          <div className="cv2-slots-row">
            {nextSlots.map((slot, i) => {
              const convFee = getConvenienceFee(slot.date);
              const fee = isSinSeguro
                ? (basePrice + convFee.amount)
                : convFee.amount;
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
        <div className="cv2-no-slots">Sin disponibilidad próxima · <button className="cv2-link" onClick={() => onOpenModal && onOpenModal(provider, null)}>Ver opciones</button></div>
      )}
    </div>
  );
}
