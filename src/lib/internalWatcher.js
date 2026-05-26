// Med Connect — Internal watcher email dispatcher
//
// Sends a structured digest email to an internal watcher (Francisco by
// default) for every meaningful platform event: sales, cancellations,
// refunds, alternative proposals, clinic acceptances, reschedules.
//
// One helper, one template, fire-and-forget — so any new trigger point
// can opt in with a single line without bloating the route handlers.
//
// Recipient resolution order:
//   1. INTERNAL_WATCHER_EMAIL env var (single address)
//   2. Hardcoded default 'francisco.pizarro@saludonnet.com' so the
//      feature works out of the box without touching Vercel envs.
//   Empty/null env value → notifications disabled.

import { sendEmail } from '@/lib/email';
import { internalEventDigest } from '@/lib/emailTemplates';

const DEFAULT_WATCHER = 'francisco.pizarro@saludonnet.com';

function resolveWatcherEmail() {
  // Empty string explicitly disables (so we can turn this off without a redeploy).
  if (typeof process.env.INTERNAL_WATCHER_EMAIL === 'string') {
    const v = process.env.INTERNAL_WATCHER_EMAIL.trim();
    return v || null;
  }
  return DEFAULT_WATCHER;
}

// Human-readable labels per event kind. Used in the subject prefix +
// the digest header so the inbox preview communicates the event type at
// a glance ("[Med Connect Interno · Venta]", "[… · Cancelación]", etc.).
const KIND_LABELS = {
  sale: 'Venta',
  cancelled: 'Cancelación',
  refunded: 'Reembolso',
  alternative_proposed: 'Cambio propuesto',
  alternative_accepted: 'Cambio aceptado',
  alternative_rejected: 'Cambio rechazado',
  clinic_accepted: 'Clínica acepta',
  clinic_rejected: 'Clínica rechaza',
  reschedule_requested: 'Reagendado solicitado',
};

/**
 * Fire-and-forget watcher notification.
 *
 * @param {object} args
 * @param {keyof typeof KIND_LABELS} args.kind  - event type, drives subject prefix
 * @param {string} [args.summary]                - one-line description (e.g. "Nueva venta · CEA Bermúdez")
 * @param {object} [args.booking]                - booking row data (renders as a section)
 * @param {object} [args.case]                   - operations_cases row data (renders as a section)
 * @param {object} [args.extra]                  - free-form key/value pairs (refund amount, ops user, reason…)
 *
 * Errors are swallowed and logged so the caller never has to wrap this
 * in another try/catch. Safe to call without `await`.
 */
export async function notifyInternalWatcher(args) {
  try {
    const to = resolveWatcherEmail();
    if (!to) return; // explicitly disabled
    const kind = args?.kind || 'event';
    const label = KIND_LABELS[kind] || kind;
    const tpl = internalEventDigest({
      kind,
      label,
      summary: args.summary || label,
      booking: args.booking || null,
      caseRow: args.case || null,
      extra: args.extra || null,
    });
    await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    // Never let a watcher failure escape — patient flow > internal mirror.
    console.error('[internalWatcher] failed', err?.message);
  }
}
