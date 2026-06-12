// Refund policy for Medconnect priority bookings.
//
// Rule (decided 2026-06-12 — supersedes the 2026-05-14 rule):
//   - Cancela > 24 h antes de la cita → refund completo (priority + service,
//     por cualquier motivo). "Cancelación gratuita hasta 24 h antes".
//   - Cancela <= 24 h antes / no-show:
//       · Asegurado (paciente con seguro)  → no refund. La prioridad se
//         queda Medconnect; la consulta corre por su póliza (no la cobramos
//         nosotros, así que no hay nada que devolver).
//       · Sin seguro                      → refund SOLO del valor del
//         servicio (SaludOnNet). La prioridad NO se reembolsa. Disuade
//         no-shows sin penalizar el coste del acto que no llegó a usarse.
//
// Ops puede forzar un refund fuera de cutoff cuando hay un motivo
// excepcional (clínica cancela, error nuestro, etc.). El helper lo
// indica como `allowed:false` + `reason` para que el endpoint de Ops
// pueda decidir si pasa por encima registrando el override.

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Build a Date from a slot date (YYYY-MM-DD) and time (HH:MM). Both are
 * stored as strings on bookings to avoid timezone footguns. Falls back
 * to a permissive parse — if the inputs are malformed, the policy
 * defaults to "no allowed" so the caller never silently refunds without
 * a valid timestamp.
 */
export function parseSlotDateTime(slotDate, slotTime) {
  if (!slotDate) return null;
  const time = slotTime && /^\d{2}:\d{2}$/.test(slotTime) ? slotTime : '00:00';
  const iso = `${slotDate}T${time}:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Returns the refund decision for a booking.
 *
 * @param {string} slotDate - YYYY-MM-DD
 * @param {string} slotTime - HH:MM
 * @param {Object} opts
 * @param {boolean} [opts.hasInsurance] - true asegurado, false sin-seguro,
 *                                        null/undefined unknown
 * @param {Date}    [opts.now] - injectable for testing; defaults to now
 *
 * @returns {{
 *   allowed: boolean,           // within cutoff?
 *   refundableAmount: 'full' | 'service_only' | 'none',
 *                              // 'full'     = priority + service
 *                              // 'service_only' = service only (sin-seguro after cutoff)
 *                              // 'none'    = nothing automatic (asegurado after cutoff)
 *   reason: string,            // human-readable explanation, ES
 *   cutoffAt: Date | null,     // when the cutoff fires; null if no slot
 *   hoursUntilSlot: number | null,
 * }}
 */
export function isRefundable(slotDate, slotTime, opts = {}) {
  const hasInsurance = opts.hasInsurance === true ? true
                     : opts.hasInsurance === false ? false
                     : null;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const slotAt = parseSlotDateTime(slotDate, slotTime);

  if (!slotAt) {
    return {
      allowed: true,
      refundableAmount: 'full',
      reason: 'Fecha de cita no disponible — se permite reembolso completo por defecto.',
      cutoffAt: null,
      hoursUntilSlot: null,
    };
  }

  const cutoffAt = new Date(slotAt.getTime() - TWENTY_FOUR_HOURS_MS);
  const hoursUntilSlot = (slotAt.getTime() - now.getTime()) / (60 * 60 * 1000);

  // Within the safe window (> 24 h before).
  if (now < cutoffAt) {
    return {
      allowed: true,
      refundableAmount: 'full',
      reason: `Cancelación con más de 24 h de antelación (faltan ${hoursUntilSlot.toFixed(1)} h). Reembolso íntegro por cualquier motivo.`,
      cutoffAt,
      hoursUntilSlot,
    };
  }

  // Past the cutoff. Asegurado → nothing automatic; sin-seguro → service value.
  if (hasInsurance === false) {
    return {
      allowed: false,
      refundableAmount: 'service_only',
      reason: `Cancelación dentro de las 24 h previas a la cita. Solo se reembolsa el valor del servicio (la prioridad no es reembolsable).`,
      cutoffAt,
      hoursUntilSlot,
    };
  }

  return {
    allowed: false,
    refundableAmount: 'none',
    reason: `Cancelación dentro de las 24 h previas a la cita o no-show. La prioridad no es reembolsable; la consulta la cubre tu seguro.`,
    cutoffAt,
    hoursUntilSlot,
  };
}

/**
 * Convenience: returns the actual euro amount to refund given booking
 * amount, service price, and the policy decision. Useful for Ops + the
 * patient self-cancel endpoint to converge on the same number.
 */
export function refundAmountFor(decision, { amount, servicePrice }) {
  const total = Number(amount || 0);
  const svc = Number(servicePrice || 0);
  switch (decision.refundableAmount) {
    case 'full': return total;
    case 'service_only': return svc > 0 ? Math.min(svc, total) : 0;
    case 'none':
    default: return 0;
  }
}
