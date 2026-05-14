// Centralised zod schemas for the most data-sensitive POST endpoints.
//
// Why centralise: the schemas double as source-of-truth documentation for
// what each route expects. Any new field stops at the boundary if it isn't
// declared, so mass-assignment issues (a client tampering an `is_admin`
// flag through the booking POST, say) can't reach SQL or Stripe.

import { z } from 'zod';

const trimmedString = (max) =>
  z.string().trim().min(1).max(max);

const optionalText = (max) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v && v.length ? v : null));

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/i, 'invalid email');

const captchaToken = z.string().min(1).max(2048).optional();

// ---------- /api/payments ----------

export const paymentsBodySchema = z.object({
  amount: z.coerce.number().positive().max(1000),
  paymentMethodId: trimmedString(60),
  email: emailSchema.optional(),
  description: optionalText(255),
  name: optionalText(120),
  bookingId: optionalText(80),
});

// ---------- /api/bookings POST ----------

export const bookingsCreateSchema = z.object({
  id: trimmedString(50),
  referralId: optionalText(50),
  patientName: optionalText(255),
  patientEmail: emailSchema,
  patientPhone: optionalText(50),
  patientAddress: optionalText(500),
  providerId: z.coerce.number().int().nullable().optional(),
  providerName: optionalText(255),
  specialty: optionalText(100),
  slotDate: optionalText(20),
  slotTime: optionalText(10),
  amount: z.coerce.number().nonnegative().max(1000).nullable().optional(),
  status: optionalText(30),
  cardLast4: optionalText(4),
  hasInsurance: z.boolean().optional(),
  insuranceCompany: optionalText(100),
  paymentIntentId: optionalText(80),
  procedureSlug: optionalText(100),
  procedureName: optionalText(255),
  servicePrice: z.coerce.number().nonnegative().nullable().optional(),
  platformFee: z.coerce.number().nonnegative().nullable().optional(),
});

// ---------- /api/pro/clinic-alta-request ----------

export const clinicAltaRequestSchema = z.object({
  requestedByEmail: emailSchema,
  requestedByName: optionalText(255),
  clinicName: trimmedString(255),
  city: optionalText(120),
  province: optionalText(120),
  address: optionalText(500),
  telephone: optionalText(40),
  contactEmail: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  specialties: optionalText(2000),
  aseguradoras: optionalText(2000),
  iban: optionalText(34),
  notes: optionalText(2000),
  captchaToken,
});

// ---------- /api/referrals POST ----------

export const referralsCreateSchema = z.object({
  id: trimmedString(50),
  patientEmail: emailSchema,
  patientName: optionalText(255),
  professionalEmail: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  professionName: optionalText(255),
  providerName: optionalText(255),
  providerId: z.coerce.number().int().nullable().optional(),
  slotDate: optionalText(20),
  slotTime: optionalText(10),
  fee: z.coerce.number().nonnegative().max(100).nullable().optional(),
  specialty: optionalText(100),
  specialtySlug: optionalText(100),
  procedureSlug: optionalText(100),
  procedureName: optionalText(255),
  lockInWarningAt: optionalText(64),
  // 'list' (default) when the pro picked from the generated available-slots
  // grid; 'manual' when the pro typed an hueco via the internal-derivation
  // escape hatch. Persisted server-side so we can later audit how often
  // manual slots get used and whether they convert.
  slotSource: z.enum(['list', 'manual']).optional(),
  notes: optionalText(2000),
  captchaToken,
});

// ---------- /api/booking respond (token) ----------

export const bookingByTokenCancelSchema = z.object({
  reason: optionalText(200),
}).partial();

export const bookingByTokenRescheduleSchema = z.object({
  preferredDates: optionalText(500),
  notes: optionalText(1000),
}).partial();

// ---------- /api/reviews/by-token POST ----------
//
// Two ratings, decoupled by design. Med Connect rating ("how fast did we
// get you the appointment?") is required — that's the metric we track and
// the gate for the inline Trustpilot CTA. Clinic rating ("how was the
// service at the clinic?") is optional — keeping it optional lifts
// completion rate and the user asked for that explicitly.

export const reviewSubmitSchema = z.object({
  ratingMedconnect: z.coerce.number().int().min(1).max(5),
  ratingClinic: z.coerce.number().int().min(1).max(5).nullable().optional(),
  commentMedconnect: optionalText(2000),
  commentClinic: optionalText(2000),
});

// ---------- helpers ----------

/**
 * Reduce a ZodError into a single short string suitable for a 400
 * response. Keeps the JSON small and avoids leaking the full schema
 * shape to the client.
 */
export function formatZodError(err) {
  const issue = err.issues?.[0];
  if (!issue) return 'invalid body';
  const path = issue.path?.length ? issue.path.join('.') : 'body';
  return `${path}: ${issue.message}`;
}
