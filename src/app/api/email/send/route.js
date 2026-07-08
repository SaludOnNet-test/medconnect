import { sendEmail } from '@/lib/email';
import { limits } from '@/lib/rateLimit';
import { internalError } from '@/lib/errors';
import { timingSafeEqualStr } from '@/lib/exec/auth';
import { requireRole } from '@/lib/adminAuth';
import { signActionToken } from '@/lib/actionTokens';
import {
  lockInInvitation,
  lockInReminder,
  bookingConfirmation,
  paymentReceipt,
  adminBookingEdit,
  clinicPatientCompleted,
  derivadorReferralCreated,
  derivadorPatientPaid,
  operationsBookingAlert,
  patientAlternativeSlot,
  patientFinalConfirmation,
  patientRefunded,
  voucherDelivery,
  // SaludOnNet video-consultation pilot — patient/ops emails routed
  // through the same /api/email/send dispatcher.
  videoBookingPending,
  videoBookingOpsAlert,
} from '@/lib/emailTemplates';

const TEMPLATES = {
  lockInInvitation,
  lockInReminder,
  bookingConfirmation,
  paymentReceipt,
  adminBookingEdit,
  clinicPatientCompleted,
  derivadorReferralCreated,
  derivadorPatientPaid,
  operationsBookingAlert,
  patientAlternativeSlot,
  patientFinalConfirmation,
  patientRefunded,
  voucherDelivery,
  videoBookingPending,
  videoBookingOpsAlert,
};

// Templates the browser may trigger WITHOUT the internal secret. These are
// the ones the public patient/pro flows (/book, /lock-in, /pro/dashboard,
// LockInTimer) fire client-side. For these, the recipient is derived from
// the booking payload (patientEmail / professionalEmail / fixed ops inbox)
// — never a free-form `data.to` — and the strict per-IP rate limit applies.
// Everything else (adminBookingEdit, refunds, vouchers, alternative slots)
// requires either the internal secret or an admin/ops session token.
const PUBLIC_TEMPLATES = new Set([
  'lockInInvitation',
  'lockInReminder',
  'bookingConfirmation',
  'paymentReceipt',
  'clinicPatientCompleted',
  'derivadorReferralCreated',
  'derivadorPatientPaid',
  'operationsBookingAlert',
  'videoBookingPending',
  'videoBookingOpsAlert',
]);

// Templates whose recipient is the derivador, not the patient.
const DERIVADOR_TEMPLATES = new Set(['derivadorReferralCreated', 'derivadorPatientPaid']);

// Returns 'internal' | 'admin' | 'public', or a Response to short-circuit.
function classifyCaller(request) {
  const provided = request.headers.get('x-internal-secret');
  if (provided != null) {
    const expected = process.env.INTERNAL_API_SECRET;
    if (!expected) {
      return Response.json(
        { success: false, error: 'internal_api_secret_not_configured' },
        { status: 503 },
      );
    }
    if (!timingSafeEqualStr(expected, provided)) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return 'internal';
  }
  // Admin panel calls carry the admin session token (Bearer).
  const rr = requireRole(request, ['admin', 'ops']);
  if (!(rr instanceof Response)) return 'admin';
  return 'public';
}

export async function POST(request) {
  try {
    // 5 sends/min/IP. Stops accidental loops + abuse without blocking legit
    // server-side callers (which all live on the same IP and share the bucket).
    const r = await limits.emailSend.check(request);
    if (!r.ok) {
      return Response.json(
        { success: false, error: 'rate_limited', retryAfterSec: r.retryAfterSec },
        { status: 429, headers: r.headers },
      );
    }

    const caller = classifyCaller(request);
    if (caller instanceof Response) return caller;
    const trusted = caller === 'internal' || caller === 'admin';

    const { templateName, data } = await request.json();

    if (!templateName || !TEMPLATES[templateName]) {
      return Response.json(
        { success: false, error: `Unknown template: "${templateName}". Valid: ${Object.keys(TEMPLATES).join(', ')}` },
        { status: 400 }
      );
    }

    if (!trusted && !PUBLIC_TEMPLATES.has(templateName)) {
      return Response.json(
        { success: false, error: 'template_requires_auth' },
        { status: 401 },
      );
    }

    const templateData = { ...(data || {}) };

    // adminBookingEdit CTA links: the confirm/propose/refund tokens are
    // signed SERVER-SIDE here (HMAC + 7-day expiry, see lib/actionTokens).
    // Whatever the client sent in confirmToken/proposeToken/refundToken is
    // ignored — the browser cannot hold SESSION_SECRET.
    if (templateName === 'adminBookingEdit' && templateData.bookingId) {
      templateData.confirmToken = signActionToken('confirm', String(templateData.bookingId));
      templateData.proposeToken = signActionToken('propose', String(templateData.bookingId));
      templateData.refundToken = signActionToken('refund', String(templateData.bookingId));
    }

    const templateFn = TEMPLATES[templateName];
    const { subject, html } = templateFn(templateData);

    // Determine recipient. Untrusted (browser) callers can NOT pick a
    // free-form `data.to` — the recipient is derived from the booking
    // payload instead, which kills the open-relay primitive.
    let to;
    if (trusted) {
      to = templateData.to || templateData.patientEmail;
    } else if (DERIVADOR_TEMPLATES.has(templateName)) {
      to = templateData.professionalEmail;
    } else {
      to = templateData.patientEmail;
    }
    if (templateName === 'operationsBookingAlert') {
      to = process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es';
    }
    if (templateName === 'clinicPatientCompleted') {
      to = templateData.clinicEmail || process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es';
    }
    // SaludOnNet video pilot — alert goes to the shared ops inbox
    // with Francisco in cc. Hardcoded recipient list because the
    // user's rule is "todos los correos de compras que tengan
    // impacto en ops llegan a info@medconnect.es + copia a francisco".
    // For arrays the sendEmail wrapper splits into per-address sends so
    // a per-address bounce doesn't take the others down with it.
    if (templateName === 'videoBookingOpsAlert') {
      to = ['info@medconnect.es', 'francisco.pizarro@saludonnet.com'];
    }

    if (!to) {
      return Response.json({ success: false, error: 'No recipient email found in data.to or data.patientEmail' }, { status: 400 });
    }

    // sendEmail accepts string or array — fan out per-address when
    // multiple targets are configured (currently only the video Ops
    // alert) so a single bounce doesn't drop the rest.
    const recipients = Array.isArray(to) ? to : [to];
    const results = await Promise.all(
      recipients.map((r) => sendEmail({ to: r, subject, html }).catch((err) => ({ ok: false, error: err?.message }))),
    );
    const okCount = results.filter((r) => r.ok).length;
    return Response.json({
      success: okCount > 0,
      mock: results.some((r) => r.mock),
      sent: okCount,
      attempted: recipients.length,
      error: okCount === 0 ? results[0]?.error : undefined,
    });
  } catch (err) {
    return internalError(err, '[POST /api/email/send]');
  }
}
