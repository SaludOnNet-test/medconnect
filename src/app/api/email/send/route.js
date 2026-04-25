import { sendEmail } from '@/lib/email';
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
};

export async function POST(request) {
  try {
    const { templateName, data } = await request.json();

    if (!templateName || !TEMPLATES[templateName]) {
      return Response.json(
        { success: false, error: `Unknown template: "${templateName}". Valid: ${Object.keys(TEMPLATES).join(', ')}` },
        { status: 400 }
      );
    }

    const templateFn = TEMPLATES[templateName];
    const { subject, html } = templateFn(data || {});

    // Determine recipient
    let to = data.to || data.patientEmail;
    if (templateName === 'operationsBookingAlert') {
      to = process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es';
    }
    if (templateName === 'clinicPatientCompleted') {
      to = data.clinicEmail || process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es';
    }

    if (!to) {
      return Response.json({ success: false, error: 'No recipient email found in data.to or data.patientEmail' }, { status: 400 });
    }

    const result = await sendEmail({ to, subject, html });
    return Response.json({ success: result.ok, mock: result.mock, error: result.error });
  } catch (err) {
    console.error('[/api/email/send Error]', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
