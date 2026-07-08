// Pure helpers moved out of page.js in the 2026-07 structural refactor.

export const sendEmail = (templateName, data) => {
  fetch('/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateName, data }),
  }).catch(() => {});
};

// Google Calendar "add event" URL — used by the payment-success handler
// (same-session fast path via window._mcCalendarUrl) and recomputed on the
// success screen after a reload (URL-restored success).
export function buildCalendarUrl(clinicName, slotDate, slotTime, reference) {
  const start = new Date(`${slotDate}T${slotTime}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Cita+en+${encodeURIComponent(clinicName)}&dates=${fmt(start)}/${fmt(end)}&details=Referencia+${reference}`;
}
