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
//   1. INTERNAL_WATCHER_EMAIL env var — comma-separated list of addresses
//      (e.g. "francisco.pizarro@saludonnet.com,info@medconnect.es").
//   2. Hardcoded default 'francisco.pizarro@saludonnet.com' so the
//      feature works out of the box without touching Vercel envs.
//   Empty/null env value → notifications disabled.
//
// 2026-06-09 — INCIDENT FIX (Jacques Blehaut booking).
// Previously single-address. The ops team learned about the sale only
// through Aracelí's forwarded email because info@medconnect.es was
// missing from the recipient list (Zendesk ingests from that mailbox).
// Switched to comma-separated parsing so we can fan out to both
// Francisco and info@ without redeploying.

import { sendEmail } from '@/lib/email';
import { internalEventDigest } from '@/lib/emailTemplates';

const DEFAULT_WATCHERS = ['francisco.pizarro@saludonnet.com', 'info@medconnect.es'];

function resolveWatcherEmails() {
  // Empty string explicitly disables (so we can turn this off without a redeploy).
  if (typeof process.env.INTERNAL_WATCHER_EMAIL === 'string') {
    const raw = process.env.INTERNAL_WATCHER_EMAIL.trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  }
  return DEFAULT_WATCHERS;
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
    const recipients = resolveWatcherEmails();
    if (!recipients.length) return; // explicitly disabled
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
    // Fan out to every recipient. sendEmail accepts a string OR an array;
    // we send N separate sends so a per-address bounce doesn't take the
    // others down with it (Zendesk in particular sometimes rejects on
    // duplicate Message-ID when it receives the same digest twice).
    await Promise.all(
      recipients.map((to) =>
        sendEmail({ to, subject: tpl.subject, html: tpl.html }).catch((err) =>
          console.error('[internalWatcher] send to', to, 'failed', err?.message),
        ),
      ),
    );
  } catch (err) {
    // Never let a watcher failure escape — patient flow > internal mirror.
    console.error('[internalWatcher] failed', err?.message);
  }
}
