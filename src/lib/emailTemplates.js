// Med Connect — HTML Email Templates
// All templates use inline CSS for Gmail/Outlook compatibility
// Colors: navy #1a3c5e, gold #c9a84c, cream #f9f7f4, green #10b981

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
      ${fee ? infoRow('Tarifa de prioridad', `€${fee}`) : ''}
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
// 2. Booking Confirmation (after payment)
// ─────────────────────────────────────────────
export function bookingConfirmation({ patientName, providerName, providerAddress, slotDate, slotTime, totalPrice, reference, calendarUrl }) {
  const formattedDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;

  const html = baseWrapper(`
    <tr><td style="background:#10b981;padding:24px;text-align:center;">
      <div style="width:60px;height:60px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:28px;">✓</div>
      <h2 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;">¡Cita confirmada!</h2>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Referencia: <strong>${reference}</strong></p>
    </td></tr>
    ${bodySection(`
      <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hola <strong>${patientName}</strong>,<br>Tu cita ha sido confirmada y el pago procesado correctamente.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Tu cita</th></tr>
        ${infoRow('Centro médico', providerName)}
        ${providerAddress ? infoRow('Dirección', providerAddress) : ''}
        ${infoRow('Fecha', formattedDate)}
        ${infoRow('Hora', slotTime)}
        ${totalPrice ? infoRow('Total pagado', `€${Number(totalPrice).toFixed(2)}`) : ''}
      </table>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#15803d;font-weight:600;">📋 Recuerda llevar el día de la cita:</p>
        <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:#166534;">
          <li>DNI o pasaporte</li>
          <li>Tarjeta sanitaria (si aplica)</li>
          <li>Este email de confirmación</li>
        </ul>
      </div>
      ${calendarUrl ? `<div style="text-align:center;margin:24px 0;">${ctaButton(calendarUrl, '📅 Añadir al calendario', '#1a3c5e', '#ffffff')}</div>` : ''}
    `)}
  `);

  return {
    subject: `¡Cita confirmada! Referencia ${reference}`,
    html,
  };
}

// ─────────────────────────────────────────────
// 3. Payment Receipt
// ─────────────────────────────────────────────
export function paymentReceipt({ patientName, reference, servicePrice, feeAmount, feeLabel, totalPrice, last4 }) {
  const html = baseWrapper(bodySection(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1a3c5e;">Recibo de pago</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hola <strong>${patientName}</strong>, aquí tienes el desglose de tu pago.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;">Referencia ${reference}</th></tr>
      ${servicePrice ? infoRow('Precio del servicio', `€${Number(servicePrice).toFixed(2)}`) : ''}
      ${feeAmount ? infoRow(feeLabel || 'Tarifa de prioridad', `€${Number(feeAmount).toFixed(2)}`) : ''}
      <tr style="background:#f9fafb;"><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#1a3c5e;">Total</td><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#1a3c5e;">€${Number(totalPrice).toFixed(2)}</td></tr>
    </table>
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
      ${fee ? infoRow('Tarifa de prioridad', `€${fee}`) : ''}
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
      ${fee ? infoRow('Tarifa', `€${fee}`) : ''}
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
export function operationsBookingAlert({ bookingId, clinicId, slotType, patientName, providerName, slotDate, slotTime, amount }) {
  const fmtDate = slotDate ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : slotDate;

  const html = baseWrapper(bodySection(`
    <pre style="background:#1f2937;color:#f9fafb;padding:16px;border-radius:8px;font-size:13px;margin-bottom:24px;overflow-x:auto;">[BOOKING_ID:${bookingId}]
[CLINIC_ID:${clinicId}]
[SLOT_TYPE:${slotType}]
[AMOUNT:${amount}]
[DATE:${slotDate}]
[TIME:${slotTime}]</pre>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1a3c5e;">Nueva reserva — acción requerida</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;"><th colspan="2" style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;">Resumen</th></tr>
      ${infoRow('Referencia', bookingId)}
      ${infoRow('Paciente', patientName)}
      ${infoRow('Centro', providerName)}
      ${infoRow('Fecha', fmtDate)}
      ${infoRow('Hora', slotTime)}
      ${infoRow('Importe', `€${Number(amount).toFixed(2)}`)}
      ${infoRow('Tipo de hueco', slotType === 'placeholder' ? '⚠ PLACEHOLDER — confirmar con clínica' : '✓ Real (SaludOnNet)')}
    </table>
    ${slotType === 'placeholder' ? `
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:16px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#713f12;">⚠ Hueco placeholder — Llamar a la clínica para confirmar disponibilidad</p>
      <p style="margin:8px 0 0;font-size:13px;color:#92400e;">Si aceptan: marcar como confirmado. Si no: buscar hasta 3 alternativas en misma especialidad/ciudad.</p>
    </div>` : ''}
  `));

  return {
    subject: `[BOOKING_ID:${bookingId}] Nueva reserva — ${providerName}`,
    html,
  };
}
