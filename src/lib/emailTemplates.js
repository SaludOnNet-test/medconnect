// Med Connect — HTML Email Templates
// All templates use inline CSS for Gmail/Outlook compatibility
// Colors: navy #1a3c5e, gold #c9a84c, cream #f9f7f4, green #10b981

import { formatEUR } from '@/lib/format';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect-bay.vercel.app';

const baseWrapper = (content) => `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Med Connect</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#1a3c5e;padding:24px 32px;text-align:center;">
          <span style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Med <span style="color:#c9a84c;">Connect</span></span>
        </td></tr>
        <!-- Body -->
        ${content}
        <!-- Footer -->
        <tr><td style="padding:24px 32px;text-align:center;background:#f9f7f4;border-top:1px solid #e8e4df;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Med Connect · Plataforma de citas médicas prioritarias</p>
          <p style="margin:4px 0 0;font-size:11px;color:#d1d5db;">Este email es automático, por favor no respondas a este mensaje.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const bodySection = (html) => `<tr><td style="padding:32px;">${html}</td></tr>`;

const ctaButton = (href, text, color = '#c9a84c', textColor = '#1a3c5e') =>
  `<a href="${href}" style="display:inline-block;padding:14px 32px;background:${color};color:${textColor};text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;margin:8px 4px;">${text}</a>`;

const infoRow = (label, value) =>
  `<tr><td style="padding:8px 0;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%;">${label}</td><td style="padding:8px 0;font-size:14px;color:#1f2937;font-weight:600;">${value}</td></tr>`;

// ─────────────────────────────────────────────
// 1. Lock-In Invitation (clinic created referral)
// ─────────────────────────────────────────────
export function lockInInvitation({ patientEmail, professionalEmail, clinicName, specialty, providerName, slotDate, slotTime, fee, lockInId }) {
  // Encode referral data in URL so the patient's browser can reconstruct the referral
  // even if they open the link on a different device (localStorage is per-browser)
  const referralPayload = Buffer.from(JSON.stringify({
    patientEmail, professionalEmail, clinicName, specialty, providerName, slotDate, slotTime, fee,
  })).toString('base64');
  const lockInUrl = `${BASE_URL}/lock-in/${lockInId}?data=${referralPayload}`;
  const formattedDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;

  const html = baseWrapper(bodySection(`
    <div style="background:#fff8e6;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;">⏱ Tienes <strong>60 minutos</strong> para confirmar tu cita</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">Tu clínica te ha reservado una cita prioritaria</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;"><strong>${clinicName}</strong> ha gestionado una cita para ti. Confirma tus datos para asegurarla.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Detalles de la cita</th></tr>
      ${infoRow('Especialidad', specialty || 'Consulta médica')}
      ${infoRow('Centro', providerName)}
      ${infoRow('Fecha', formattedDate)}
      ${infoRow('Hora', slotTime)}
      ${fee ? infoRow('Tarifa de prioridad', formatEUR(fee)) : ''}
    </table>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(lockInUrl, '✓ Confirmar mi cita ahora', '#c9a84c', '#1a3c5e')}
    </div>
    <p style="font-size:13px;color:#9ca3af;text-align:center;">Si no realizaste esta solicitud, puedes ignorar este email.</p>
  `));

  return {
    subject: `Tu clínica te ha reservado una cita prioritaria — tienes 60 minutos`,
    html,
  };
}

// ─────────────────────────────────────────────
// 2. Booking received — payment OK, clinic confirmation pending
// ─────────────────────────────────────────────
export function bookingConfirmation({ patientName, providerName, providerAddress, slotDate, slotTime, totalPrice, reference, hasInsurance, feeAmount, selfServiceUrl }) {
  const formattedDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;
  const insured = hasInsurance === true;
  const feeForLine = feeAmount ?? totalPrice;

  const html = baseWrapper(`
    <tr><td style="background:#1a3c5e;padding:24px;text-align:center;">
      <div style="width:60px;height:60px;background:rgba(255,255,255,0.18);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;">⏱</div>
      <h2 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">Pago recibido — gestionando tu cita</h2>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Referencia: <strong>${reference}</strong></p>
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">Hola <strong>${patientName}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
        Recibimos tu pago. Ahora <strong>llamamos a la clínica</strong> para confirmar el hueco
        que reservaste. Te avisamos por email en cuanto lo tengamos confirmado (en menos de 6 horas hábiles).
      </p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#78350f;line-height:1.55;">
          <strong>Importante:</strong> hasta que la clínica confirme, esta cita aún no está garantizada.
          Si la clínica no puede atenderte ese día/hora, te ofreceremos una alternativa o te
          devolveremos el dinero automáticamente.
        </p>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Hueco que reservaste</th></tr>
        ${infoRow('Centro médico', providerName)}
        ${providerAddress ? infoRow('Dirección', providerAddress) : ''}
        ${infoRow('Fecha', formattedDate)}
        ${infoRow('Hora', slotTime)}
        ${totalPrice ? infoRow('Importe pagado', formatEUR(totalPrice)) : ''}
      </table>
      ${insured ? `
      <div style="background:#fffaeb;border:1px solid #f0d97a;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:14px;color:#5b4400;font-weight:700;">Qué has pagado y qué cubre tu seguro</p>
        <p style="margin:0 0 6px;font-size:13px;color:#5b4400;line-height:1.6;"><strong>Tu pago de hoy:</strong> ${formatEUR(feeForLine)} (tarifa de prioridad por la reserva).</p>
        <p style="margin:0;font-size:13px;color:#5b4400;line-height:1.6;"><strong>Lo que cubre tu seguro:</strong> la consulta. La clínica la factura directamente a tu aseguradora.</p>
      </div>
      ` : `
      <div style="background:#fffaeb;border:1px solid #f0d97a;border-radius:8px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-size:14px;color:#5b4400;font-weight:700;">Qué incluye tu pago de ${formatEUR(totalPrice)}</p>
        <p style="margin:0 0 6px;font-size:13px;color:#5b4400;line-height:1.6;"><strong>Consulta privada:</strong> tarifa oficial de la clínica (catálogo SaludOnNet).</p>
        <p style="margin:0;font-size:13px;color:#5b4400;line-height:1.6;"><strong>Tarifa de prioridad:</strong> nuestra gestión del hueco urgente.</p>
        <p style="margin:8px 0 0;font-size:13px;color:#5b4400;line-height:1.6;">No se vuelve a cobrar nada en la clínica.</p>
      </div>
      <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:14px;color:#065f46;font-weight:700;">📧 Voucher de SaludOnNet en camino (≤24 h)</p>
        <p style="margin:0;font-size:13px;color:#065f46;line-height:1.6;">
          Te enviaremos un email <strong>aparte</strong> con el voucher (PDF + QR) que cubre el coste del acto médico.
          Llévalo en el móvil o impreso a la clínica junto a tu DNI — la clínica cobrará el acto a SaludOnNet con ese voucher.
        </p>
      </div>
      `}
      <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.55;">
        En cuanto la clínica confirme, te enviaremos un email final con los datos para que acudas
        (qué llevar, dirección, etc.).
      </p>
      ${selfServiceUrl ? `
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.55;">
          ¿Necesitas <strong>cancelar</strong> o <strong>cambiar la fecha</strong>?
        </p>
        <a href="${selfServiceUrl}" style="display:inline-block;font-size:13px;color:#1a3c5e;font-weight:600;text-decoration:underline;">
          Gestionar mi cita
        </a>
      </div>
      ` : ''}
    `)}
  `);

  return {
    subject: `Pago recibido — confirmando tu cita con ${providerName}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 3. Payment Receipt
// ─────────────────────────────────────────────
export function paymentReceipt({ patientName, reference, servicePrice, feeAmount, feeLabel, totalPrice, last4 }) {
  const isInsuredFlow = !servicePrice;
  const priorityLine = feeLabel
    ? `Tarifa de prioridad <span style="color:#9ca3af;font-weight:400;">· ${feeLabel.toLowerCase()}</span>`
    : 'Tarifa de prioridad';
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1a3c5e;">Recibo de pago</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hola <strong>${patientName}</strong>, aquí tienes el desglose de tu pago.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;">Referencia ${reference}</th></tr>
      ${isInsuredFlow
        ? infoRow('🩺 Consulta médica', '<span style="color:#00805a;font-weight:600;">Cubierto por tu seguro</span>')
        : infoRow('🩺 Consulta médica', formatEUR(servicePrice))}
      ${feeAmount ? infoRow(`🎫 ${priorityLine}`, formatEUR(feeAmount)) : ''}
      <tr style="background:#f9fafb;"><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#1a3c5e;">Total que has pagado</td><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#1a3c5e;">${formatEUR(totalPrice)}</td></tr>
    </table>
    ${isInsuredFlow ? `
    <div style="background:#fffaeb;border:1px solid #f0d97a;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#5b4400;line-height:1.6;">Tu seguro cubre la consulta directamente con la clínica. Tú solo pagas la prioridad por la reserva.</p>
    </div>
    ` : ''}
    ${last4 ? `<p style="font-size:13px;color:#9ca3af;text-align:center;">Cobrado a tarjeta terminada en <strong>${last4}</strong></p>` : ''}
    <p style="font-size:13px;color:#9ca3af;text-align:center;">Conserva este email como justificante de pago.</p>
  `));

  return {
    subject: `Recibo de pago — Med Connect ${reference}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 4. Admin Booking Edit (patient approval needed)
// ─────────────────────────────────────────────
export function adminBookingEdit({ patientName, oldDate, oldTime, oldClinic, newDate, newTime, newClinic, bookingId, confirmToken, proposeToken, refundToken }) {
  const confirmUrl = `${BASE_URL}/api/booking/respond?action=confirm&token=${confirmToken}`;
  const proposeUrl = `${BASE_URL}/api/booking/respond?action=propose&token=${proposeToken}`;
  const refundUrl = `${BASE_URL}/api/booking/respond?action=refund&token=${refundToken}`;

  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : d;

  const html = baseWrapper(bodySection(`
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#713f12;">⚠ Tu cita ha sido modificada — necesitamos tu confirmación en las próximas <strong>72 horas laborables</strong></p>
    </div>
    <h2 style="margin:0 0 24px;font-size:20px;font-weight:800;color:#1a3c5e;">Hola ${patientName}, se ha realizado un cambio en tu cita</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#fee2e2;"><th style="padding:10px 16px;text-align:left;font-size:12px;color:#7f1d1d;font-weight:700;text-transform:uppercase;">Antes</th><th style="padding:10px 16px;text-align:left;font-size:12px;color:#7f1d1d;font-weight:700;text-transform:uppercase;"></th></tr>
      <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;">Centro</td><td style="padding:10px 16px;font-size:14px;color:#374151;text-decoration:line-through;">${oldClinic}</td></tr>
      <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;">Fecha y hora</td><td style="padding:10px 16px;font-size:14px;color:#374151;text-decoration:line-through;">${fmtDate(oldDate)} · ${oldTime}</td></tr>
      <tr style="background:#dcfce7;"><th style="padding:10px 16px;text-align:left;font-size:12px;color:#14532d;font-weight:700;text-transform:uppercase;">Nuevo</th><th style="padding:10px 16px;"></th></tr>
      <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;">Centro</td><td style="padding:10px 16px;font-size:14px;color:#15803d;font-weight:600;">${newClinic}</td></tr>
      <tr><td style="padding:10px 16px;font-size:14px;color:#6b7280;">Fecha y hora</td><td style="padding:10px 16px;font-size:14px;color:#15803d;font-weight:600;">${fmtDate(newDate)} · ${newTime}</td></tr>
    </table>
    <p style="font-size:14px;color:#374151;margin-bottom:20px;">Por favor, elige una de las siguientes opciones:</p>
    <div style="text-align:center;margin-bottom:24px;">
      ${ctaButton(confirmUrl, '✓ Confirmar cambio', '#10b981', '#ffffff')}
      ${ctaButton(proposeUrl, '↔ Proponer alternativa', '#3b82f6', '#ffffff')}
      ${ctaButton(refundUrl, '€ Solicitar reembolso', '#ef4444', '#ffffff')}
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center;">Referencia de reserva: ${bookingId}. Si no actúas en 72h laborables, el cambio se aplicará automáticamente.</p>
  `));

  return {
    subject: `Tu cita ha sido modificada — necesitamos tu confirmación (72h)`,
    html,
  };
}

// ─────────────────────────────────────────────
// 5. Clinic: Patient Completed Lock-In Data
// ─────────────────────────────────────────────
export function clinicPatientCompleted({ patientName, patientPhone, providerName, slotDate, slotTime, referralId }) {
  const fmtDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : slotDate;

  const html = baseWrapper(bodySection(`
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:15px;font-weight:700;color:#15803d;">✓ El paciente ha completado sus datos — pendiente de pago</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1a3c5e;">Actualización de derivación</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">El paciente que derivaste ha confirmado sus datos y está en proceso de pago.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;">Detalles</th></tr>
      ${infoRow('Paciente', patientName)}
      ${patientPhone ? infoRow('Teléfono', patientPhone) : ''}
      ${infoRow('Centro', providerName)}
      ${infoRow('Fecha', fmtDate)}
      ${infoRow('Hora', slotTime)}
      ${infoRow('Ref. derivación', referralId)}
    </table>
    <p style="font-size:13px;color:#9ca3af;text-align:center;">Recibirás confirmación cuando el pago se complete.</p>
  `));

  return {
    subject: `El paciente ha completado sus datos — pendiente de pago`,
    html,
  };
}

// ─────────────────────────────────────────────
// 6. Derivador: Referral Created Confirmation
// ─────────────────────────────────────────────
export function derivadorReferralCreated({ professionalName, patientEmail, clinicName, specialty, providerName, slotDate, slotTime, fee }) {
  const formattedDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;

  const html = baseWrapper(bodySection(`
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:15px;font-weight:700;color:#1d4ed8;">✓ Caso creado — el paciente tiene 60 minutos para confirmar</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1a3c5e;">Has creado una cita prioritaria para tu paciente</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      Hemos enviado un email a <strong>${patientEmail}</strong> con el enlace de confirmación.<br>
      El paciente tiene <strong>60 minutos</strong> para completar sus datos y pagar.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;">Detalles de la cita</th></tr>
      ${infoRow('Paciente', patientEmail)}
      ${infoRow('Especialidad', specialty || 'Consulta médica')}
      ${infoRow('Centro', providerName)}
      ${infoRow('Fecha', formattedDate)}
      ${infoRow('Hora', slotTime)}
      ${fee ? infoRow('Tarifa de prioridad', formatEUR(fee)) : ''}
    </table>
    <p style="font-size:13px;color:#9ca3af;text-align:center;">Recibirás un email cuando el paciente confirme y pague.</p>
  `));

  return {
    subject: `Caso creado — esperando confirmación del paciente`,
    html,
  };
}

// ─────────────────────────────────────────────
// 7. Derivador: Patient Paid Confirmation
// ─────────────────────────────────────────────
export function derivadorPatientPaid({ patientName, providerName, slotDate, slotTime, totalPrice, reference }) {
  const formattedDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;

  const html = baseWrapper(`
    <tr><td style="background:#10b981;padding:20px 32px;text-align:center;">
      <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;">🎉 ¡Tu paciente ha confirmado y pagado!</h2>
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 24px;font-size:15px;color:#374151;">La derivación se ha completado con éxito. El paciente ha pagado y su cita está confirmada.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;">Resumen de la cita</th></tr>
        ${infoRow('Paciente', patientName)}
        ${infoRow('Centro', providerName)}
        ${infoRow('Fecha', formattedDate)}
        ${infoRow('Hora', slotTime)}
        ${totalPrice ? infoRow('Importe pagado', `€${Number(totalPrice).toFixed(2)}`) : ''}
        ${infoRow('Referencia', reference)}
      </table>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;">
        <p style="margin:0;font-size:14px;color:#15803d;">💰 Tu comisión será procesada en las próximas 24h tras la fecha de la cita.</p>
      </div>
    `)}
  `);

  return {
    subject: `¡Paciente confirmado! Referencia ${reference}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 8. Lock-In Reminder (auto-sent at 30 min mark)
// ─────────────────────────────────────────────
export function lockInReminder({ patientEmail, professionalEmail, clinicName, specialty, providerName, slotDate, slotTime, fee, lockInId }) {
  const referralPayload = Buffer.from(JSON.stringify({
    patientEmail, professionalEmail, clinicName, specialty, providerName, slotDate, slotTime, fee,
  })).toString('base64');
  const lockInUrl = `${BASE_URL}/lock-in/${lockInId}?data=${referralPayload}`;
  const formattedDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;

  const html = baseWrapper(bodySection(`
    <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:16px;font-weight:800;color:#b91c1c;">⚠️ ¡Solo te quedan 30 minutos!</p>
      <p style="margin:6px 0 0;font-size:14px;color:#7f1d1d;">Si no confirmas antes de que expire el tiempo, <strong>perderás el hueco</strong>.</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1a3c5e;">Confirma tu cita ahora — el tiempo se acaba</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;"><strong>${clinicName}</strong> te ha reservado un hueco prioritario. Completa tus datos y paga para asegurarlo.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;">Tu cita reservada</th></tr>
      ${infoRow('Especialidad', specialty || 'Consulta médica')}
      ${infoRow('Centro', providerName)}
      ${infoRow('Fecha', formattedDate)}
      ${infoRow('Hora', slotTime)}
      ${fee ? infoRow('Tarifa de prioridad', formatEUR(fee)) : ''}
    </table>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(lockInUrl, '⚡ Confirmar ahora antes de que expire', '#ef4444', '#ffffff')}
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center;">Si dejas expirar el tiempo, el hueco será liberado y no podrá recuperarse.</p>
  `));

  return {
    subject: `⚠️ Último aviso: 30 minutos para confirmar tu cita en ${providerName}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 9. Operations Alert (→ Zendesk via email)
// ─────────────────────────────────────────────
export function operationsBookingAlert({
  bookingId, caseId, clinicId, clinicPhone, patientName, patientEmail, patientPhone,
  providerName, slotDate, slotTime, amount, tier, paymentToClinic, specialty,
  hasInsurance, insuranceCompany, dashboardUrl,
  procedureSlug, procedureName, servicePrice, platformFee,
}) {
  const fmtDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect-bay.vercel.app';
  const dash = dashboardUrl || `${baseUrl}/admin/ops/${caseId || ''}`;
  const sinSeguro = hasInsurance === false;
  const coverage = sinSeguro ? 'sin_seguro' : 'con_seguro';

  // Zendesk-importable header — keep keys stable, one per line
  const meta = [
    `[BOOKING_ID:${bookingId}]`,
    `[CASE_ID:${caseId || ''}]`,
    `[CLINIC_ID:${clinicId}]`,
    `[TIER:${tier || ''}]`,
    `[AMOUNT_EUR:${Number(amount).toFixed(2)}]`,
    `[CLINIC_PAYMENT_EUR:${Number(paymentToClinic || 0).toFixed(2)}]`,
    `[SLOT:${slotDate} ${slotTime}]`,
    `[PATIENT_EMAIL:${patientEmail || ''}]`,
    `[PATIENT_PHONE:${patientPhone || ''}]`,
    `[CLINIC_PHONE:${clinicPhone || ''}]`,
    `[INSURANCE:${insuranceCompany || (hasInsurance ? 'sí' : 'sin seguro')}]`,
    `[COVERAGE:${coverage}]`,
    `[SPECIALTY:${specialty || ''}]`,
    `[PROCEDURE_SLUG:${procedureSlug || ''}]`,
    `[PROCEDURE_NAME:${procedureName || ''}]`,
    `[SERVICE_PRICE_EUR:${Number(servicePrice || 0).toFixed(2)}]`,
    `[PLATFORM_FEE_EUR:${Number(platformFee || 0).toFixed(2)}]`,
    `[VOUCHER_REQUIRED:${sinSeguro ? 'true' : 'false'}]`,
  ].join('\n');

  const sinSeguroBlock = sinSeguro ? `
    <div style="background:#fee2e2;border:2px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#991b1b;">⚠️ ACCIÓN REQUERIDA — SIN SEGURO</p>
      <ol style="margin:0 0 0 18px;padding:0;font-size:13px;color:#7f1d1d;line-height:1.7;">
        <li>Comprar en SaludOnNet: <strong>${procedureName || procedureSlug || 'acto médico'}</strong> por <strong>€${Number(servicePrice || 0).toFixed(2)}</strong>.</li>
        <li>Subir el voucher (PDF + URL + ref. de la orden SON) al admin: <a href="${dash}" style="color:#991b1b;font-weight:700;">${dash}</a></li>
        <li>Al subirlo, el sistema enviará automáticamente el voucher al paciente por email.</li>
      </ol>
      <p style="margin:10px 0 0;font-size:12px;color:#7f1d1d;">SLA: subir el voucher en < 24 h desde el pago. Si no hay voucher en 24 h, el caso escala.</p>
    </div>
  ` : '';

  const callScript = `
1. Saludo y presentación
   "Buenos días, le llamo de Med Connect, somos un marketplace que envía pacientes
   con seguro privado (Sanitas, Adeslas, DKV, etc.) a clínicas como la suya."

2. La oferta concreta
   "Tengo un paciente de ${insuranceCompany || 'su aseguradora'} que quiere ser visto
   el ${fmtDate} a las ${slotTime}. Su seguro paga la consulta como siempre, y nosotros
   les pagamos €${Number(paymentToClinic || 0).toFixed(2)} extra por encima por aceptar
   atenderlo a esa hora."

3. La promesa de volumen
   "Si aceptan este caso testigo, podemos enviarles más pacientes de forma recurrente.
   Es trabajo que ya están haciendo (consultas de aseguradora) con un extra por cada
   paciente que les enviamos."

4. Cierre
   - Si aceptan slot original ➜ DASHBOARD: "Clínica aceptó"
   - Si proponen otro día/hora ➜ DASHBOARD: "Clínica propone alternativa" (registrar fecha/hora)
   - Si rechazan ➜ DASHBOARD: "Clínica rechazó" → buscar otra clínica cerca con misma especialidad
`.trim();

  const rules = `
• Importe que SaludOnNet puede ofrecer a la clínica: €${Number(paymentToClinic || 0).toFixed(2)} (no negociar al alza sin aprobación).
• Si la clínica pide más, decir: "Tengo que consultarlo internamente, le devuelvo la llamada."
• Si la clínica no atiende en 30 min, intentar 2 veces más espaciadas 1 hora.
• SLA: el caso debe quedar resuelto (confirmado o reembolsado) en < 6 h hábiles desde la compra.
• Nunca confirmar una hora distinta sin que el paciente la apruebe explícitamente
  (el dashboard envía un email de aceptar/rechazar con un solo clic).
• Si la clínica acepta otra hora cercana (±15 min), igual hay que mandar el email al paciente.
`.trim();

  const html = baseWrapper(bodySection(`
    <pre style="background:#1f2937;color:#f9fafb;padding:16px;border-radius:8px;font-size:13px;margin-bottom:24px;overflow-x:auto;">${meta}</pre>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1a3c5e;">Nueva venta — gestionar con la clínica</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">
      Abrir el caso en el dashboard:
      <a href="${dash}" style="color:#1a3c5e;font-weight:700;">${dash}</a>
    </p>
    ${sinSeguroBlock}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;">Resumen del caso</th></tr>
      ${infoRow('Caso #', String(caseId || '—'))}
      ${infoRow('Booking', bookingId)}
      ${infoRow('Paciente', patientName || '—')}
      ${infoRow('Email paciente', patientEmail || '—')}
      ${infoRow('Tel. paciente', patientPhone || '—')}
      ${infoRow('Aseguradora', insuranceCompany || (hasInsurance ? 'Sí' : 'Sin seguro'))}
      ${infoRow('Especialidad', specialty || '—')}
      ${infoRow('Acto médico', procedureName || procedureSlug || '—')}
      ${infoRow('Precio acto (SON)', `€${Number(servicePrice || 0).toFixed(2)}`)}
      ${infoRow('Tarifa de prioridad', `€${Number(platformFee || 0).toFixed(2)}`)}
      ${infoRow('Centro', providerName)}
      ${infoRow('Tel. clínica', clinicPhone || '—')}
      ${infoRow('Fecha cita', fmtDate)}
      ${infoRow('Hora cita', slotTime)}
      ${infoRow('Cobrado al paciente', `€${Number(amount).toFixed(2)}`)}
      ${infoRow('A pagar a la clínica', `€${Number(paymentToClinic || 0).toFixed(2)}`)}
      ${infoRow('Tier', `T${tier || '—'}`)}
    </table>

    <h3 style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1a3c5e;">Guion de llamada</h3>
    <pre style="background:#f9fafb;border:1px solid #e5e7eb;padding:14px;border-radius:8px;font-size:13px;white-space:pre-wrap;color:#1f2937;margin-bottom:20px;">${callScript}</pre>

    <h3 style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1a3c5e;">Reglas del operador</h3>
    <pre style="background:#fff7ed;border:1px solid #fed7aa;padding:14px;border-radius:8px;font-size:13px;white-space:pre-wrap;color:#7c2d12;margin-bottom:20px;">${rules}</pre>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#1e40af;">Acciones desde el dashboard</p>
      <ul style="margin:8px 0 0 16px;padding:0;font-size:13px;color:#1e3a8a;">
        <li>"Clínica aceptó" → confirma cita al paciente automáticamente.</li>
        <li>"Clínica propone otro día/hora" → manda email con un slot al paciente; acepta o reembolso.</li>
        <li>"Clínica rechazó" → marcas y buscas otra; cuando la encuentres, "proponer alternativa" al paciente.</li>
        <li>"Sin alternativa" → emite reembolso completo automático.</li>
      </ul>
    </div>
  `));

  return {
    subject: `[BOOKING_ID:${bookingId}][CASE:${caseId || ''}] Nueva venta — ${providerName} ${slotDate} ${slotTime}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 10. Patient — alternative slot proposal (accept/reject)
// ─────────────────────────────────────────────
export function patientAlternativeSlot({
  patientName, originalClinicName, originalDate, originalTime,
  alternativeClinicName, alternativeAddress, alternativeCity,
  alternativeDate, alternativeTime, alternativeReason,
  acceptUrl, rejectUrl,
}) {
  const fmtOriginal = originalDate ? new Date(originalDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : originalDate;
  const fmtAlternative = alternativeDate ? new Date(alternativeDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : alternativeDate;
  // Compose the address line from address + city when available. Both
  // optional — pre-typeahead callers may not pass them. When missing the
  // email just shows the clinic name as before.
  const addrParts = [alternativeAddress, alternativeCity].filter(Boolean);
  const fullAddress = addrParts.length ? addrParts.join(', ') : '';

  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#1a3c5e;">Hola ${patientName || ''} 👋</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.5;">
      La cita que reservaste con <strong>${originalClinicName}</strong> para el
      <strong>${fmtOriginal} a las ${originalTime}</strong> ha tenido que cambiar:
      ${alternativeReason || 'la clínica no puede atenderte exactamente a esa hora'}.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.5;">
      Te proponemos esta alternativa:
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Nueva propuesta</p>
      <p style="margin:0;font-size:18px;font-weight:800;color:#14532d;">${alternativeClinicName}</p>
      ${fullAddress ? `<p style="margin:6px 0 0;font-size:14px;color:#475569;">📍 ${fullAddress}</p>` : ''}
      <p style="margin:4px 0 0;font-size:16px;color:#166534;">${fmtAlternative} · ${alternativeTime}</p>
      <p style="margin:8px 0 0;font-size:12px;color:#475569;">Tienes 24 horas para confirmar esta nueva cita.</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center" style="padding-right:8px;">
          <a href="${acceptUrl}" style="display:inline-block;background:#0d5e42;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;">✓ Aceptar nueva cita</a>
        </td>
        <td align="center" style="padding-left:8px;">
          <a href="${rejectUrl}" style="display:inline-block;background:#fff;color:#dc2626;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;border:1.5px solid #dc2626;">✕ Reembolsar</a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.4;">
      Si rechazas, te devolvemos el importe completo de la tarifa de prioridad en 1–2 días hábiles
      a la misma tarjeta con la que pagaste.
    </p>
  `));

  return {
    subject: `Cambio de agenda — ${alternativeClinicName} (${alternativeDate} ${alternativeTime})`,
    html,
  };
}

// ─────────────────────────────────────────────
// 11. Patient — final confirmation (clinic accepted original slot)
// ─────────────────────────────────────────────
export function patientFinalConfirmation({ patientName, providerName, slotDate, slotTime, address, hasInsurance }) {
  const fmtDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;
  const insured = hasInsurance === true;
  const html = baseWrapper(`
    <tr><td style="background:#10b981;padding:24px;text-align:center;">
      <div style="width:60px;height:60px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;">✓</div>
      <h2 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">¡Cita confirmada con la clínica!</h2>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Ya está todo cerrado — te esperan.</p>
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
        Hola ${patientName || ''}, hemos hablado con <strong>${providerName}</strong> y nos confirman tu cita.
        Esto ya es definitivo: el doctor te atenderá en la fecha y hora que reservaste.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">Tu cita</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:#14532d;">${providerName}</p>
        <p style="margin:4px 0 0;font-size:16px;color:#166534;">${fmtDate} · ${slotTime}</p>
        ${address ? `<p style="margin:6px 0 0;font-size:14px;color:#475569;">📍 ${address}</p>` : ''}
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#78350f;">Recuerda llevar:</p>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#78350f;line-height:1.55;">
          <li>DNI o pasaporte</li>
          ${insured ? '<li><strong>Tarjeta de tu aseguradora</strong> — la consulta corre por tu póliza</li>' : '<li>Tarjeta sanitaria si la tienes</li>'}
          <li>Este email (o tu referencia de reserva)</li>
        </ul>
      </div>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.55;">
        Si necesitas cancelar o algo cambia, escríbenos a
        <a href="mailto:operaciones@medconnect.es" style="color:#1a3c5e;">operaciones@medconnect.es</a>.
      </p>
    `)}
  `);
  return { subject: `✓ Cita confirmada — ${providerName} (${slotDate} ${slotTime})`, html };
}

// ─────────────────────────────────────────────
// 11b. Clinic — confirmation when ops accepted the booking on their behalf.
//      Includes booking details for them to record in their internal agenda
//      AND a CTA to onboard on Medconnect's pro portal so they can collect
//      the commission. Sent in parallel with patientFinalConfirmation when
//      the operator hits the "✓ Aceptar" button.
//
//      Designed to also work as a cold acquisition email: a clinic that has
//      never used Medconnect should be able to read this end-to-end and
//      understand (a) that we just sent them a paying patient, (b) why
//      onboarding is worth their time. Keep the copy concrete.
// ─────────────────────────────────────────────
export function clinicConfirmationWithOnboarding({
  clinicName,
  patientName,
  patientPhone,
  patientEmail,
  specialty,
  slotDate,
  slotTime,
  hasInsurance,
  insuranceCompany,
  onboardingUrl,
  alreadyOnboarded,
}) {
  const fmtDate = slotDate
    ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : slotDate;
  const onboardCta = alreadyOnboarded
    ? `Tu clínica ya está dada de alta en Medconnect — la cita aparecerá en tu panel pro.`
    : `Para cobrar tu comisión por esta cita y las que vengan, da de alta tu clínica en el portal:`;
  const ctaLabel = alreadyOnboarded ? 'Abrir mi panel pro' : 'Dar de alta mi clínica';
  const ctaHref = alreadyOnboarded
    ? `${BASE_URL}/pro/dashboard`
    : (onboardingUrl || `${BASE_URL}/pro/onboarding?from=case`);
  const html = baseWrapper(`
    <tr><td style="background:#1a3c5e;padding:24px;text-align:center;">
      <div style="width:60px;height:60px;background:rgba(201,168,76,0.25);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#c9a84c;">📋</div>
      <h2 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">Tienes una cita confirmada en Medconnect</h2>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Datos del paciente y próximos pasos abajo</p>
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
        Hola <strong>${clinicName || 'equipo de la clínica'}</strong>, acabamos de hablar por teléfono y nos has confirmado
        que aceptáis esta cita de un paciente que ha pagado prioridad en <a href="${BASE_URL}" style="color:#1a3c5e;font-weight:700;">Medconnect</a>.
        Aquí van los datos para que los anotéis en vuestra agenda.
      </p>
      <div style="background:#f9f7f4;border:1px solid #e8e4df;border-radius:10px;padding:18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:0.05em;">La cita</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:#1f2937;">${fmtDate} · ${slotTime || ''}</p>
        ${specialty ? `<p style="margin:4px 0 0;font-size:14px;color:#475569;">Especialidad: <strong>${specialty}</strong></p>` : ''}
        <hr style="margin:14px 0;border:none;border-top:1px solid #e8e4df;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1a3c5e;text-transform:uppercase;letter-spacing:0.05em;">El paciente</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:#1f2937;">${patientName || '(nombre no facilitado)'}</p>
        ${patientPhone ? `<p style="margin:2px 0 0;font-size:14px;color:#475569;">Teléfono: <a href="tel:${patientPhone}" style="color:#1a3c5e;">${patientPhone}</a></p>` : ''}
        ${patientEmail ? `<p style="margin:2px 0 0;font-size:14px;color:#475569;">Email: <a href="mailto:${patientEmail}" style="color:#1a3c5e;">${patientEmail}</a></p>` : ''}
        ${hasInsurance && insuranceCompany ? `<p style="margin:6px 0 0;font-size:13px;color:#475569;">Aseguradora: <strong>${insuranceCompany}</strong> — la consulta corre por su póliza.</p>` : ''}
        ${hasInsurance === false ? `<p style="margin:6px 0 0;font-size:13px;color:#475569;">Sin seguro — el paciente recibe un voucher SaludOnNet por separado.</p>` : ''}
      </div>

      <h3 style="margin:0 0 8px;font-size:16px;color:#1a3c5e;">Próximos pasos</h3>
      <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#374151;line-height:1.7;">
        <li>Anotad la cita en vuestra agenda interna en la fecha y hora indicadas.</li>
        <li>Atended al paciente como cualquier cita de su aseguradora${hasInsurance && insuranceCompany ? ` (${insuranceCompany})` : ''}.</li>
        <li>${alreadyOnboarded ? 'La cita aparecerá automáticamente en vuestro panel pro de Medconnect.' : 'Dad de alta la clínica en el portal para cobrar la comisión (botón abajo).'}</li>
        <li>Si surge cualquier imprevisto, escribid a <a href="mailto:operaciones@medconnect.es" style="color:#1a3c5e;">operaciones@medconnect.es</a> o llamad al ${SUPPORT_PHONE_INLINE}.</li>
      </ol>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin-bottom:20px;">
        <p style="margin:0 0 10px;font-size:14px;color:#15803d;font-weight:700;">💰 ${onboardCta}</p>
        <div style="text-align:center;">
          ${ctaButton(ctaHref, ctaLabel, '#1a3c5e', '#ffffff')}
        </div>
        <p style="margin:12px 0 0;font-size:12px;color:#475569;text-align:center;">
          ${alreadyOnboarded ? '' : 'Tarda 3 minutos: datos básicos de la clínica + IBAN para recibir las comisiones. Sin compromiso.'}
        </p>
      </div>

      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.55;">
        Para cualquier duda, contestadnos a este email o llamadnos.
        Gracias por colaborar con Medconnect.
      </p>
    `)}
  `);
  return {
    subject: `Cita confirmada en Medconnect — ${patientName || 'paciente'} · ${fmtDate} ${slotTime || ''}`,
    html,
  };
}

const SUPPORT_PHONE_INLINE = '+34 91 197 70 52';

// ─────────────────────────────────────────────
// 12. Patient — refund issued
// ─────────────────────────────────────────────
export function patientRefunded({ patientName, providerName, slotDate, slotTime, amount, reason }) {
  const fmtDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : slotDate;
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#1a3c5e;">Reembolso emitido</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.5;">
      Hola ${patientName || ''}, te hemos devuelto <strong>${formatEUR(amount || 0)}</strong>
      a la tarjeta con la que pagaste. Verás el ingreso en 1–2 días hábiles.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      Cita afectada: ${providerName} · ${fmtDate} · ${slotTime}.<br>
      Motivo: ${reason || 'la clínica no pudo atenderte y no encontramos una alternativa que te encajara'}.
    </p>
    <p style="margin:0;font-size:14px;color:#374151;">Lamentamos las molestias. Búscanos otra vez en
      <a href="https://medconnect.es" style="color:#1a3c5e;font-weight:700;">medconnect.es</a>.</p>
  `));
  return { subject: `Reembolso de ${formatEUR(amount || 0)} emitido — ${providerName}`, html };
}

// ─────────────────────────────────────────────
// 13. Patient — voucher delivery (sin seguro). Sent when ops uploads the
//     SaludOnNet voucher PDF/URL from the admin dashboard.
// ─────────────────────────────────────────────
export function voucherDelivery({
  patientName, providerName, slotDate, slotTime, procedureName,
  voucherUrl, sonOrderRef, servicePrice, voucherPdfPath,
}) {
  const fmtDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : slotDate;
  // Prefer the externally hosted SON URL when both are present; fall back
  // to the operator-uploaded PDF. We deliberately render only one CTA so
  // the patient isn't confused by two competing buttons.
  const ctaHref = voucherUrl || voucherPdfPath || '';
  const ctaLabel = voucherUrl ? 'Ver / descargar voucher' : 'Descargar voucher (PDF)';
  const html = baseWrapper(`
    <tr><td style="background:#065f46;padding:24px;text-align:center;">
      <div style="width:60px;height:60px;background:rgba(255,255,255,0.18);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;">🎟️</div>
      <h2 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">Tu voucher de SaludOnNet está listo</h2>
      ${sonOrderRef ? `<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Referencia SON: <strong>${sonOrderRef}</strong></p>` : ''}
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">Hola <strong>${patientName || ''}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
        Te enviamos el voucher de <strong>SaludOnNet</strong> que cubre el coste de
        ${procedureName ? `<strong>${procedureName}</strong>` : 'tu acto médico'}${servicePrice ? ` (${formatEUR(servicePrice)})` : ''}
        en ${providerName}${fmtDate ? ` el ${fmtDate}` : ''}${slotTime ? ` a las ${slotTime}` : ''}.
      </p>
      ${ctaHref ? `
      <div style="text-align:center;margin:20px 0 24px;">
        <a href="${ctaHref}" style="display:inline-block;background:#065f46;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:8px;font-size:15px;">
          ${ctaLabel}
        </a>
      </div>` : sonOrderRef ? `
      <div style="text-align:center;margin:20px 0 24px;padding:16px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:13px;color:#065f46;font-weight:700;">Tu código de voucher</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#065f46;letter-spacing:0.05em;font-family:monospace;">${sonOrderRef}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#065f46;">Mostrá este código en la clínica.</p>
      </div>` : ''}
      <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:14px;color:#065f46;font-weight:700;">📍 Cuando llegues a la clínica</p>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#065f46;line-height:1.7;">
          <li>Presenta tu <strong>DNI</strong>.</li>
          <li>Muestra el voucher (en el móvil o impreso).</li>
          <li>La clínica cobrará el acto a SaludOnNet con ese voucher — tú no pagas nada extra.</li>
        </ul>
      </div>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.55;">
        Si tenés cualquier duda, escribinos a
        <a href="mailto:operaciones@medconnect.es" style="color:#1a3c5e;">operaciones@medconnect.es</a>.
      </p>
    `)}
  `);
  return {
    subject: `🎟️ Tu voucher de SaludOnNet — ${providerName} ${slotDate || ''} ${slotTime || ''}`.trim(),
    html,
  };
}

// ─────────────────────────────────────────────
// 14. Ops alert — new clinic alta request submitted by a pro user.
//     Sent to operaciones@medconnect.es (or OPERATIONS_EMAIL env override).
// ─────────────────────────────────────────────
export function clinicAltaRequestOps({
  requestId, requestedByEmail, requestedByName, clinicName, city, province,
  address, telephone, contactEmail, specialties, aseguradoras, notes,
}) {
  const reviewUrl = `${BASE_URL}/admin/clinic-alta`;
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">Nueva solicitud de alta de clínica</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      <strong>${requestedByName || requestedByEmail}</strong> quiere dar de alta su clínica en Med Connect.
      Revisa los datos y aprueba o rechaza desde el panel de operaciones.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Solicitud #${requestId}</th></tr>
      ${infoRow('Solicitante', `${requestedByName || ''} &lt;${requestedByEmail}&gt;`)}
      ${infoRow('Clínica', clinicName)}
      ${city ? infoRow('Ciudad', city) : ''}
      ${province ? infoRow('Provincia', province) : ''}
      ${address ? infoRow('Dirección', address) : ''}
      ${telephone ? infoRow('Teléfono', telephone) : ''}
      ${contactEmail ? infoRow('Email de contacto', contactEmail) : ''}
      ${specialties ? infoRow('Especialidades', specialties) : ''}
      ${aseguradoras ? infoRow('Aseguradoras', aseguradoras) : ''}
      ${notes ? infoRow('Notas', notes) : ''}
    </table>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(reviewUrl, 'Revisar en el panel', '#c9a84c', '#1a3c5e')}
    </div>
  `));
  return {
    subject: `🏥 Alta clínica pendiente — ${clinicName}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 15. Pro user — confirmation of clinic alta request received.
// ─────────────────────────────────────────────
export function clinicAltaRequestReceived({ requestedByName, clinicName }) {
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">Hemos recibido tu solicitud</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hola <strong>${requestedByName || ''}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Tu solicitud de alta para <strong>${clinicName}</strong> está en revisión.
      Nuestro equipo de operaciones la revisará y te avisará por email en cuanto
      esté aprobada — normalmente en menos de <strong>48 horas hábiles</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Mientras tanto puedes seguir derivando pacientes a otras clínicas de la red
      desde tu panel profesional.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.55;">
      Si tenés cualquier duda escribinos a
      <a href="mailto:operaciones@medconnect.es" style="color:#1a3c5e;">operaciones@medconnect.es</a>.
    </p>
  `));
  return {
    subject: `Solicitud de alta recibida — ${clinicName}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 16. Pro user — alta approved (clinic now active).
// ─────────────────────────────────────────────
export function clinicAltaApproved({ requestedByName, clinicName, clinicCity }) {
  const dashboardUrl = `${BASE_URL}/pro/dashboard`;
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">¡Tu clínica está activa!</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hola <strong>${requestedByName || ''}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      <strong>${clinicName}</strong>${clinicCity ? ` (${clinicCity})` : ''} ya está dada de alta en
      Med Connect. Ya puedes crear derivaciones internas hacia tu propia clínica
      desde el panel profesional.
    </p>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(dashboardUrl, 'Ir al panel profesional', '#c9a84c', '#1a3c5e')}
    </div>
  `));
  return {
    subject: `Tu clínica ya está activa en Med Connect — ${clinicName}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 17. Pro user — alta rejected with ops notes.
// ─────────────────────────────────────────────
export function clinicAltaRejected({ requestedByName, clinicName, opsNotes }) {
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">No hemos podido completar tu alta</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hola <strong>${requestedByName || ''}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hemos revisado tu solicitud para <strong>${clinicName}</strong> y, por ahora,
      no podemos darla de alta automáticamente.
    </p>
    ${opsNotes ? `
    <div style="background:#fff8e6;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:13px;color:#92400e;font-weight:700;">Motivo</p>
      <p style="margin:0;font-size:14px;color:#92400e;line-height:1.5;">${opsNotes}</p>
    </div>` : ''}
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.55;">
      Si crees que es un error o quieres aportar más información, contesta a
      <a href="mailto:operaciones@medconnect.es" style="color:#1a3c5e;">operaciones@medconnect.es</a>
      y te ayudaremos a completar el alta.
    </p>
  `));
  return {
    subject: `Tu solicitud de alta — ${clinicName}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 18. Ops alert — new pro verification request submitted.
// ─────────────────────────────────────────────
export function proVerificationOps({
  requestId, requestedByEmail, profileType, fullName, licenseNumber,
  clinicName, documentCount,
}) {
  const reviewUrl = `${BASE_URL}/admin/pro-verifications`;
  const profileLabel = profileType === 'doctor'
    ? 'Médico individual'
    : 'Representante de clínica';
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">Nueva verificación de pro</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      <strong>${requestedByEmail}</strong> ha enviado documentación para verificar su cuenta.
      Revisa los archivos adjuntos antes de aprobar o rechazar.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Solicitud #${requestId}</th></tr>
      ${infoRow('Tipo de perfil', profileLabel)}
      ${fullName ? infoRow('Nombre completo', fullName) : ''}
      ${licenseNumber ? infoRow('Nº colegiado', licenseNumber) : ''}
      ${clinicName ? infoRow('Razón social', clinicName) : ''}
      ${infoRow('Documentos', `${documentCount} archivo${documentCount === 1 ? '' : 's'}`)}
    </table>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(reviewUrl, 'Revisar en el panel', '#c9a84c', '#1a3c5e')}
    </div>
  `));
  return {
    subject: `🔍 Verificación de pro pendiente — ${profileLabel}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 19. Pro user — verification submitted (ack).
// ─────────────────────────────────────────────
export function proVerificationReceived({ requestedByName }) {
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">Hemos recibido tu documentación</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hola <strong>${requestedByName || ''}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Estamos revisando los archivos que nos enviaste. Nuestro equipo de operaciones
      validará la documentación y te avisará por email — normalmente en menos de
      <strong>48 horas hábiles</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Mientras tanto puedes seguir creando derivaciones desde tu panel profesional.
      Solo se desbloquea la <strong>solicitud de liquidación</strong> una vez verificada
      la cuenta.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.55;">
      Si tenés dudas escribinos a
      <a href="mailto:operaciones@medconnect.es" style="color:#1a3c5e;">operaciones@medconnect.es</a>.
    </p>
  `));
  return {
    subject: `Verificación recibida — Med Connect`,
    html,
  };
}

// ─────────────────────────────────────────────
// 20. Pro user — verification approved.
// ─────────────────────────────────────────────
export function proVerificationApproved({ requestedByName }) {
  const dashboardUrl = `${BASE_URL}/pro/dashboard`;
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">¡Tu cuenta está verificada!</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hola <strong>${requestedByName || ''}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hemos aprobado la documentación que nos enviaste. Tu cuenta queda
      <strong>verificada</strong> en Med Connect, y ya puedes solicitar la liquidación
      de tus comisiones desde el panel profesional.
    </p>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(dashboardUrl, 'Ir al panel profesional', '#c9a84c', '#1a3c5e')}
    </div>
  `));
  return {
    subject: `Tu cuenta ya está verificada en Med Connect`,
    html,
  };
}

// ─────────────────────────────────────────────
// 21. Pro user — verification rejected.
// ─────────────────────────────────────────────
export function proVerificationRejected({ requestedByName, opsNotes }) {
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">No hemos podido verificar tu cuenta</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hola <strong>${requestedByName || ''}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hemos revisado los documentos que nos enviaste y, por ahora, no podemos
      verificar tu cuenta automáticamente.
    </p>
    ${opsNotes ? `
    <div style="background:#fff8e6;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:13px;color:#92400e;font-weight:700;">Motivo</p>
      <p style="margin:0;font-size:14px;color:#92400e;line-height:1.5;">${opsNotes}</p>
    </div>` : ''}
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.55;">
      Puedes volver a enviar la documentación desde el panel profesional con los
      cambios que necesites, o contactarnos para resolver el problema:
      <a href="mailto:operaciones@medconnect.es" style="color:#1a3c5e;">operaciones@medconnect.es</a>.
    </p>
  `));
  return {
    subject: `Verificación pendiente — Med Connect`,
    html,
  };
}

// ─────────────────────────────────────────────
// 22. Pro user — ops requested more info on verification.
// ─────────────────────────────────────────────
export function proVerificationMoreInfo({ requestedByName, message }) {
  const dashboardUrl = `${BASE_URL}/pro/dashboard`;
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">Necesitamos un poco más de información</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hola <strong>${requestedByName || ''}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hemos empezado a revisar tu solicitud de verificación, pero antes de
      aprobarla nuestro equipo de operaciones necesita que nos amplíes algún dato
      o documento.
    </p>
    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:13px;color:#1e40af;font-weight:700;">Lo que pedimos</p>
      <p style="margin:0;font-size:14px;color:#1e3a8a;line-height:1.5;white-space:pre-line;">${message || ''}</p>
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.55;">
      Puedes responder y reenviar la documentación desde tu panel profesional.
      Tu solicitud sigue activa — sólo cambia el estado a "esperando tu respuesta".
    </p>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(dashboardUrl, 'Responder en mi panel', '#c9a84c', '#1a3c5e')}
    </div>
  `));
  return {
    subject: `Tu verificación necesita más información — Med Connect`,
    html,
  };
}

// ─────────────────────────────────────────────
// 23. Ops — pro responded with the requested info on verification.
// ─────────────────────────────────────────────
export function proVerificationInfoResponded({ requestId, requestedByEmail, documentCount }) {
  const reviewUrl = `${BASE_URL}/admin/pro-verifications`;
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">El pro respondió a la solicitud</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      <strong>${requestedByEmail}</strong> envió la información extra que pediste.
      La solicitud #${requestId} vuelve a estado <strong>pendiente</strong> para tu revisión.
    </p>
    ${typeof documentCount === 'number' ? `
    <p style="margin:0 0 24px;font-size:14px;color:#374151;">
      Documentos totales en la solicitud: <strong>${documentCount}</strong>.
    </p>` : ''}
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(reviewUrl, 'Revisar en el panel', '#c9a84c', '#1a3c5e')}
    </div>
  `));
  return {
    subject: `🔁 Verificación actualizada — el pro respondió #${requestId}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 24. Pro user — ops requested more info on clinic alta.
// ─────────────────────────────────────────────
export function clinicAltaMoreInfo({ requestedByName, clinicName, message }) {
  const dashboardUrl = `${BASE_URL}/pro/dashboard`;
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">Necesitamos un poco más de información</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Hola <strong>${requestedByName || ''}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
      Estamos revisando la solicitud de alta de <strong>${clinicName || 'tu clínica'}</strong>,
      pero antes de aprobarla necesitamos que nos amplíes algún dato.
    </p>
    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:13px;color:#1e40af;font-weight:700;">Lo que pedimos</p>
      <p style="margin:0;font-size:14px;color:#1e3a8a;line-height:1.5;white-space:pre-line;">${message || ''}</p>
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.55;">
      Responde desde tu panel profesional para que tu alta avance.
    </p>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(dashboardUrl, 'Responder en mi panel', '#c9a84c', '#1a3c5e')}
    </div>
  `));
  return {
    subject: `Tu alta de clínica necesita más información — Med Connect`,
    html,
  };
}

// ─────────────────────────────────────────────
// 25. Ops — pro responded with the requested info on clinic alta.
// ─────────────────────────────────────────────
export function clinicAltaInfoResponded({ requestId, requestedByEmail, clinicName }) {
  const reviewUrl = `${BASE_URL}/admin/clinic-alta`;
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a3c5e;">El pro respondió a la solicitud</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      <strong>${requestedByEmail}</strong> actualizó la información de
      <strong>${clinicName || 'su clínica'}</strong>. La solicitud #${requestId}
      vuelve a estado <strong>pendiente</strong>.
    </p>
    <div style="text-align:center;margin:28px 0;">
      ${ctaButton(reviewUrl, 'Revisar en el panel', '#c9a84c', '#1a3c5e')}
    </div>
  `));
  return {
    subject: `🔁 Alta de clínica actualizada — el pro respondió #${requestId}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 25. Review request — sent ~24h after the appointment date.
//     Two ratings, decoupled by design: MC rating ("we got you the cita
//     fast") is required; clinic rating ("the service") is optional. The
//     5-star MC rating triggers an inline Trustpilot CTA on the form
//     confirmation state, no follow-up email.
// ─────────────────────────────────────────────
export function reviewRequest({ patientName, providerName, slotDate, token }) {
  const reviewUrl = `${BASE_URL}/review/${token}`;
  const fmtDate = slotDate
    ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  const html = baseWrapper(`
    <tr><td style="background:#1a3c5e;padding:24px;text-align:center;">
      <div style="width:60px;height:60px;background:rgba(255,255,255,0.18);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;">⭐</div>
      <h2 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">¿Cómo te fue en tu cita?</h2>
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">Hola <strong>${patientName || ''}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
        ${fmtDate ? `Hace 24&nbsp;h estuviste en <strong>${providerName}</strong> el ${fmtDate}.` : `Hace 24&nbsp;h estuviste en <strong>${providerName}</strong>.`}
        Nos importa saber cómo te fue.
      </p>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.55;">
        Tomate 30&nbsp;segundos para contarnos. Te preguntamos <strong>dos cosas
        separadas</strong>: cómo fuimos nosotros consiguiéndote la cita rápido,
        y cómo fue la atención en la clínica. Tu respuesta nos ayuda a mejorar
        y a otros pacientes a elegir mejor.
      </p>
      <div style="text-align:center;margin:28px 0;">
        ${ctaButton(reviewUrl, 'Dejar mi opinión →', '#c9a84c', '#1a3c5e')}
      </div>
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.55;text-align:center;">
        Si el botón no funciona: <a href="${reviewUrl}" style="color:#1a3c5e;word-break:break-all;">${reviewUrl}</a>
      </p>
    `)}
  `);
  return {
    subject: `¿Cómo te fue en ${providerName}? · 30 segundos de tu opinión`,
    html,
  };
}

// ─────────────────────────────────────────────
// 27. Clinic notification — new sale derived to this clinic
//
// Recipient is the clinic's notification_email (gerente / recepción).
// Modeled on `clinicConfirmationWithOnboarding` but: (a) covers ALL four
// channels (direct / internal / external / ops-proposed alternative),
// (b) breaks the money figures down so the clinic knows exactly what the
// patient paid and what they will receive, (c) fires at booking creation
// for sin-seguro (status awaiting_voucher) so the clinic can plan agenda
// without waiting for the voucher upload.
//
// Money explained:
//   - With seguro: patient paid only Med Connect's priority fee. The
//     consultation itself goes to the patient's insurance (the clinic
//     bills the insurer directly, as usual).
//   - Without seguro: patient paid Med Connect's priority fee + the SON
//     catalogue price of the medical service. The clinic receives the
//     service price via the SON voucher (separate workflow).
// ─────────────────────────────────────────────
export function clinicSaleNotification({
  clinicName,
  bookingId,
  referralId,
  channel,                  // 'directo' | 'derivacion_interna' | 'derivacion_externa' | 'alternativa_propuesta_por_ops'
  channelLabel,
  patientName,
  patientEmail,
  patientPhone,
  specialty,
  procedureName,
  slotDate,
  slotTime,
  status,
  amountPaid,               // total cobrado al paciente (priority fee + servicio si sin-seguro)
  servicePrice,             // precio del acto médico (sin-seguro) — lo que recibe la clínica
  platformFee,              // tarifa Med Connect — lo que se queda Med Connect
  hasInsurance,
  insuranceCompany,
  derivadorEmail,
  derivadorClinicName,
}) {
  const fmtDate = slotDate
    ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : slotDate;
  const insured = hasInsurance === true;
  const totalPaid = Number(amountPaid || 0);
  const service = Number(servicePrice || 0);
  const fee = Number(platformFee || 0);

  // Money rows differ by insurance type. With seguro: the consultation
  // goes via the patient's insurance, the clinic only sees Med Connect's
  // priority fee on this email (informational). Without seguro: the
  // service price is what the clinic actually receives via SON voucher.
  const moneyRows = insured
    ? `
      ${infoRow('Importe pagado por el paciente', formatEUR(totalPaid))}
      ${infoRow('Cubierto por su seguro', `Consulta · ${insuranceCompany || 'aseguradora del paciente'}`)}
      ${fee ? infoRow('Tarifa Med Connect (prioridad)', formatEUR(fee)) : ''}
      ${infoRow('Lo que recibe la clínica', 'La consulta se factura a la aseguradora del paciente como cualquier otra cita')}
    `
    : `
      ${infoRow('Importe pagado por el paciente', formatEUR(totalPaid))}
      ${service ? infoRow('Precio del acto médico (transferido a la clínica)', formatEUR(service)) : ''}
      ${fee ? infoRow('Tarifa Med Connect (prioridad)', formatEUR(fee)) : ''}
      ${infoRow('Lo que recibe la clínica', service ? `${formatEUR(service)} vía voucher SaludOnNet` : 'Vía voucher SaludOnNet')}
    `;

  const statusLabel = status === 'awaiting_voucher'
    ? 'Pendiente de voucher (sin seguro) · cita ya está reservada en la agenda'
    : status === 'confirmed'
    ? 'Confirmada'
    : status || '—';

  const channelChip = channel === 'directo'
    ? '<span style="display:inline-block;background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">Directo</span>'
    : channel === 'derivacion_interna'
    ? '<span style="display:inline-block;background:#dcfce7;color:#166534;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">Derivación interna</span>'
    : channel === 'derivacion_externa'
    ? '<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">Derivación externa</span>'
    : channel === 'alternativa_propuesta_por_ops'
    ? '<span style="display:inline-block;background:#ede9fe;color:#5b21b6;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">Alternativa propuesta por Operaciones</span>'
    : '';

  const html = baseWrapper(`
    <tr><td style="background:#1a3c5e;padding:24px;text-align:center;">
      <div style="width:60px;height:60px;background:rgba(201,168,76,0.25);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#c9a84c;">📅</div>
      <h2 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">Nueva cita en ${clinicName || 'tu clínica'}</h2>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Med Connect · ${fmtDate || ''} ${slotTime || ''}</p>
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
        Hola <strong>${clinicName || 'equipo de la clínica'}</strong>, acabamos de cerrar una venta
        de Med Connect que termina en tu clínica. ${channelChip}
      </p>

      ${channelLabel ? `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.55;">Canal de origen: <strong>${channelLabel}</strong>${derivadorClinicName ? ` — derivado por "${derivadorClinicName}"` : ''}${derivadorEmail ? ` (${derivadorEmail})` : ''}.</p>` : ''}

      <h3 style="margin:18px 0 8px;font-size:14px;color:#1a3c5e;text-transform:uppercase;letter-spacing:0.05em;">La cita</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tbody>
          ${infoRow('Fecha', fmtDate || '—')}
          ${infoRow('Hora', slotTime || '—')}
          ${specialty ? infoRow('Especialidad', specialty) : ''}
          ${procedureName ? infoRow('Acto médico', procedureName) : ''}
          ${infoRow('Estado', statusLabel)}
        </tbody>
      </table>

      <h3 style="margin:18px 0 8px;font-size:14px;color:#1a3c5e;text-transform:uppercase;letter-spacing:0.05em;">El paciente</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tbody>
          ${infoRow('Nombre', patientName || '(no facilitado)')}
          ${patientPhone ? infoRow('Teléfono', `<a href="tel:${patientPhone}" style="color:#1a3c5e;">${patientPhone}</a>`) : ''}
          ${patientEmail ? infoRow('Email', `<a href="mailto:${patientEmail}" style="color:#1a3c5e;">${patientEmail}</a>`) : ''}
          ${insured && insuranceCompany ? infoRow('Aseguradora', insuranceCompany) : ''}
          ${insured === false ? infoRow('Modalidad', 'Sin seguro · paciente recibirá voucher SaludOnNet') : ''}
        </tbody>
      </table>

      <h3 style="margin:18px 0 8px;font-size:14px;color:#1a3c5e;text-transform:uppercase;letter-spacing:0.05em;">Importes</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tbody>${moneyRows}</tbody>
      </table>

      <h3 style="margin:18px 0 8px;font-size:14px;color:#1a3c5e;text-transform:uppercase;letter-spacing:0.05em;">Referencias</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tbody>
          ${bookingId ? infoRow('Booking ID', `<code style="font-family:monospace;font-size:13px;">${bookingId}</code>`) : ''}
          ${referralId ? infoRow('Referral ID', `<code style="font-family:monospace;font-size:13px;">${referralId}</code>`) : ''}
        </tbody>
      </table>

      <div style="background:#f9f7f4;border:1px solid #e8e4df;border-radius:10px;padding:16px;margin-bottom:8px;">
        <p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.55;">
          <strong>Próximos pasos para la clínica:</strong>
        </p>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:#475569;line-height:1.7;">
          <li>Anotad la cita en vuestra agenda en la fecha y hora indicadas.</li>
          <li>Atended al paciente como cualquier otra cita${insured && insuranceCompany ? ` (${insuranceCompany})` : ''}.</li>
          ${insured === false ? '<li>El paciente os entregará el voucher de SaludOnNet — escaneadlo o anotad el código.</li>' : ''}
          <li>Si surge cualquier imprevisto contactad con Operaciones (${SUPPORT_PHONE_INLINE} · operaciones@medconnect.es).</li>
        </ol>
      </div>

      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.55;">
        Recibís este email porque sois la clínica destinataria configurada en Med Connect.
        Si queréis cambiar el correo de notificaciones o pausar los avisos, contactad con Operaciones.
      </p>
    `)}
  `);

  return {
    subject: `Nueva cita en ${clinicName || 'tu clínica'} (Med Connect) · ${patientName || 'paciente'} · ${fmtDate || ''} ${slotTime || ''}`.trim(),
    html,
  };
}

// ─────────────────────────────────────────────
// 28. Clinic notification — sale cancelled / refunded
//
// Sent when a previously notified sale is cancelled or refunded. Two
// origin types: patient self-service (via /api/bookings/by-token/.../cancel)
// or ops action (cancel / refund from /admin/ops). The clinic needs this
// to free the agenda slot.
// ─────────────────────────────────────────────
export function clinicSaleCancellation({
  clinicName,
  bookingId,
  patientName,
  patientEmail,
  slotDate,
  slotTime,
  reason,        // free-text reason if available
  reasonLabel,   // 'self_service' | 'ops_cancel' | 'ops_refund' label for the chip
  refundAmount,
}) {
  const fmtDate = slotDate
    ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : slotDate;
  const refundLine = refundAmount != null && Number(refundAmount) > 0
    ? `<p style="margin:0 0 10px;font-size:13px;color:#475569;">Reembolso emitido al paciente: <strong>${formatEUR(Number(refundAmount))}</strong>.</p>`
    : '';

  const html = baseWrapper(`
    <tr><td style="background:#7f1d1d;padding:24px;text-align:center;">
      <div style="width:60px;height:60px;background:rgba(255,255,255,0.18);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;">✕</div>
      <h2 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">Cita cancelada en ${clinicName || 'tu clínica'}</h2>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Med Connect · ${fmtDate || ''} ${slotTime || ''}</p>
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">
        Hola <strong>${clinicName || 'equipo de la clínica'}</strong>, te avisamos de que una cita
        de Med Connect en tu clínica acaba de cancelarse. Podéis liberar el hueco en vuestra agenda.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tbody>
          ${infoRow('Paciente', patientName || '(no facilitado)')}
          ${patientEmail ? infoRow('Email', `<a href="mailto:${patientEmail}" style="color:#1a3c5e;">${patientEmail}</a>`) : ''}
          ${infoRow('Fecha', fmtDate || '—')}
          ${infoRow('Hora', slotTime || '—')}
          ${bookingId ? infoRow('Booking ID', `<code style="font-family:monospace;font-size:13px;">${bookingId}</code>`) : ''}
          ${reasonLabel ? infoRow('Motivo', reasonLabel) : ''}
        </tbody>
      </table>

      ${reason ? `<p style="margin:0 0 10px;font-size:13px;color:#475569;line-height:1.55;"><strong>Nota:</strong> ${reason}</p>` : ''}
      ${refundLine}

      <p style="margin:18px 0 0;font-size:13px;color:#6b7280;line-height:1.55;">
        Si tenéis cualquier duda, contactad con Operaciones (${SUPPORT_PHONE_INLINE} · operaciones@medconnect.es).
      </p>
    `)}
  `);

  return {
    subject: `Cita cancelada en ${clinicName || 'tu clínica'} (Med Connect) · ${patientName || 'paciente'} · ${fmtDate || ''} ${slotTime || ''}`.trim(),
    html,
  };
}
