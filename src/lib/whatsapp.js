import { getPool, DB_AVAILABLE } from '@/lib/db';
import sql from 'mssql';
import { captureException } from '@/lib/sentry';
import { sendTextMessage } from '@/lib/whatsappProvider';

// Max conversation turns sent to Claude (older messages dropped to control cost)
const MAX_HISTORY_TURNS = 20;

// CEA Bermúdez is our partner clinic in Madrid — sorted to top in search results
// and eligible for the direct-link path
export const CEA_PROVIDER_ID = 1;
export const CEA_PROVIDER_NAME = 'Centro Médico Cea Bermúdez';

// Delegates to the provider adapter (src/lib/whatsappProvider.js).
// Kept as the public API so existing imports don't break.
export async function sendWhatsAppMessage(to, text) {
  return sendTextMessage(to, text);
}

// Returns the last MAX_HISTORY_TURNS messages for a phone number within a
// 12-hour sliding session window, in Claude messages array format:
// [{role, content}], normalised for the Anthropic API (starts with 'user',
// no consecutive same-role messages).
export async function getConversationHistory(phoneNumber) {
  if (!DB_AVAILABLE) return [];
  try {
    const pool = await getPool();
    // TOP + DESC picks the MOST RECENT N rows; reverse() restores
    // chronological order for the Claude messages array.
    const result = await pool.request()
      .input('phone', sql.NVarChar(20), phoneNumber)
      .input('limit', sql.Int, MAX_HISTORY_TURNS)
      .query(`
        SELECT TOP (@limit) role, content
        FROM whatsapp_conversations
        WHERE phone_number = @phone
          AND created_at > DATEADD(hour, -12, SYSDATETIMEOFFSET())
        ORDER BY created_at DESC
      `);
    const rows = result.recordset
      .map((r) => ({ role: r.role, content: r.content }))
      .reverse();

    // Normalise for the Anthropic API:
    //   1. Must start with a 'user' message — drop leading assistant turns.
    //   2. No two consecutive messages with the same role — merge with '\n'.
    const normalized = [];
    for (const m of rows) {
      if (!normalized.length && m.role !== 'user') continue;
      const last = normalized[normalized.length - 1];
      if (last && last.role === m.role) {
        last.content = `${last.content}\n${m.content}`;
      } else {
        normalized.push({ ...m });
      }
    }
    return normalized;
  } catch {
    return [];
  }
}

// Full, unbounded conversation transcript for a phone number — for archive /
// audit purposes (team notification emails, exec transcript viewer). Unlike
// getConversationHistory (used to build Claude's context), this has no
// MAX_HISTORY_TURNS cap and no 12h session window: it returns every message
// ever exchanged with that number, oldest first.
export async function getFullConversationTranscript(phoneNumber) {
  if (!DB_AVAILABLE) return [];
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('phone', sql.NVarChar(20), phoneNumber)
      .query(`
        SELECT role, content, created_at
        FROM whatsapp_conversations
        WHERE phone_number = @phone
        ORDER BY created_at ASC
      `);
    return result.recordset.map((r) => ({
      role: r.role,
      content: r.content,
      created_at: r.created_at,
    }));
  } catch (err) {
    console.error('[whatsapp] getFullConversationTranscript error:', err.message);
    return [];
  }
}

export async function saveMessage(phoneNumber, role, content) {
  if (!DB_AVAILABLE) return;
  try {
    const pool = await getPool();
    await pool.request()
      .input('phone', sql.NVarChar(20), phoneNumber)
      .input('role', sql.NVarChar(10), role)
      .input('content', sql.NVarChar(sql.MAX), content)
      .query(`
        INSERT INTO whatsapp_conversations (phone_number, session_date, role, content)
        VALUES (
          @phone,
          CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Romance Standard Time' AS DATE),
          @role,
          @content
        )
      `);
  } catch (err) {
    console.error('[whatsapp] saveMessage error:', err.message);
  }
}

// Extract the last 9 digits of a phone number (Spanish mobiles are 9 digits),
// stripping every non-digit first. Returns '' when fewer than 9 digits remain.
// Used to match a WhatsApp lead (stored with country prefix) against a booking
// phone that may have been typed in a different format.
export function last9Digits(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 9) return '';
  return digits.slice(-9);
}

/**
 * Upserts the lead for this phone number and reports whether the row was
 * created now.
 *
 * Returns `{ id, isNew }` — or `null` when the DB is unavailable / the write
 * failed. `isNew` is what keeps ops out of a duplicate-email storm: Claude
 * repeats the LEAD marker on every turn once it knows the specialty, so on
 * 2026-08-23 a single 5-turn conversation produced 5 identical "nuevo lead"
 * emails. The row was already deduped here; the notification wasn't. Callers
 * must notify only when `isNew` (see /api/whatsapp/webhook).
 */
export async function saveLead(data) {
  if (!DB_AVAILABLE) return null;
  try {
    const pool = await getPool();

    // UPSERT: a single lead may be enriched across several bot turns, and each
    // turn that carries a LEAD marker would otherwise INSERT a duplicate row.
    // Reuse the most recent still-open ('link_sent') row for this phone from
    // the last 12h and enrich it in place; only INSERT when none exists.
    const existing = await pool.request()
      .input('phone', sql.NVarChar(20), data.phone_number)
      .query(`
        SELECT TOP 1 id FROM whatsapp_leads
        WHERE phone_number = @phone
          AND status = 'link_sent'
          AND created_at > DATEADD(hour, -12, SYSDATETIMEOFFSET())
        ORDER BY created_at DESC
      `);
    const existingId = existing.recordset[0]?.id;

    if (existingId) {
      // COALESCE(@new, column): only overwrite a column when the new marker
      // actually carries that field — never blank out data captured earlier.
      await pool.request()
        .input('id', sql.Int, existingId)
        .input('name', sql.NVarChar(100), data.patient_name || null)
        .input('email', sql.NVarChar(255), data.email || null)
        .input('insurance', sql.NVarChar(100), data.insurance_company || null)
        .input('specialty', sql.NVarChar(100), data.specialty_requested || null)
        .input('doctor', sql.NVarChar(100), data.preferred_doctor || null)
        .input('city', sql.NVarChar(100), data.city || null)
        .input('modality', sql.NVarChar(20), data.preferred_modality || null)
        .input('date', sql.NVarChar(50), data.preferred_date || null)
        .input('time_range', sql.NVarChar(50), data.preferred_time_range || null)
        .input('reason', sql.NVarChar(500), data.visit_reason || null)
        .input('link', sql.NVarChar(1000), data.checkout_link || null)
        .input('urgency', sql.NVarChar(20), data.urgency_level || null)
        .query(`
          UPDATE whatsapp_leads
          SET patient_name         = COALESCE(@name, patient_name),
              email                = COALESCE(@email, email),
              insurance_company    = COALESCE(@insurance, insurance_company),
              specialty_requested  = COALESCE(@specialty, specialty_requested),
              preferred_doctor     = COALESCE(@doctor, preferred_doctor),
              city                 = COALESCE(@city, city),
              preferred_modality   = COALESCE(@modality, preferred_modality),
              preferred_date       = COALESCE(@date, preferred_date),
              preferred_time_range = COALESCE(@time_range, preferred_time_range),
              visit_reason         = COALESCE(@reason, visit_reason),
              checkout_link        = COALESCE(@link, checkout_link),
              urgency_level        = COALESCE(@urgency, urgency_level),
              updated_at           = SYSDATETIMEOFFSET()
          WHERE id = @id
        `);
      return { id: existingId, isNew: false };
    }

    const result = await pool.request()
    .input('phone', sql.NVarChar(20), data.phone_number)
    .input('name', sql.NVarChar(100), data.patient_name || null)
    .input('email', sql.NVarChar(255), data.email || null)
    .input('insurance', sql.NVarChar(100), data.insurance_company || null)
    .input('specialty', sql.NVarChar(100), data.specialty_requested || null)
    .input('doctor', sql.NVarChar(100), data.preferred_doctor || null)
    .input('city', sql.NVarChar(100), data.city || null)
    .input('modality', sql.NVarChar(20), data.preferred_modality || null)
    .input('date', sql.NVarChar(50), data.preferred_date || null)
    .input('time_range', sql.NVarChar(50), data.preferred_time_range || null)
    .input('reason', sql.NVarChar(500), data.visit_reason || null)
    .input('link', sql.NVarChar(1000), data.checkout_link || null)
    .input('urgency', sql.NVarChar(20), data.urgency_level || 'normal')
    .query(`
      INSERT INTO whatsapp_leads
        (phone_number, patient_name, email, insurance_company, specialty_requested,
         preferred_doctor, city, preferred_modality, preferred_date,
         preferred_time_range, visit_reason, checkout_link, urgency_level, status)
      VALUES
        (@phone, @name, @email, @insurance, @specialty,
         @doctor, @city, @modality, @date,
         @time_range, @reason, @link, @urgency, 'link_sent');
      SELECT SCOPE_IDENTITY() AS id;
    `);
    return { id: result.recordset[0]?.id ?? null, isNew: true };
  } catch (err) {
    // A failed lead insert must not block sending the booking link to the
    // patient — log + Sentry and let the caller continue.
    console.error('[whatsapp] saveLead error:', err.message);
    captureException(err instanceof Error ? err : new Error(String(err)), {
      scope: '[whatsapp.saveLead]',
    }).catch(() => {});
    return null;
  }
}

// Conversion tracking: when a Stripe payment settles, mark the matching
// WhatsApp lead as 'paid'. Best-effort — never throws (a failure here must not
// affect the Stripe webhook result). The booking phone may be in a different
// format than the stored lead phone, so we match on the last 9 digits.
export async function markWhatsappLeadPaid(rawPhone) {
  if (!DB_AVAILABLE) return;
  const last9 = last9Digits(rawPhone);
  if (!last9) return;
  try {
    const pool = await getPool();
    await pool.request()
      .input('last9', sql.NVarChar(9), last9)
      .query(`
        UPDATE whatsapp_leads
        SET status = 'paid', updated_at = SYSDATETIMEOFFSET()
        WHERE id = (
          SELECT TOP 1 id FROM whatsapp_leads
          WHERE status = 'link_sent'
            AND RIGHT(REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), 9) = @last9
            AND created_at >= DATEADD(day, -30, SYSDATETIMEOFFSET())
          ORDER BY created_at DESC
        )
      `);
  } catch (err) {
    console.error('[whatsapp] markWhatsappLeadPaid error:', err.message);
  }
}

export async function saveEscalation(data) {
  if (!DB_AVAILABLE) return null;
  try {
    const pool = await getPool();
    await pool.request()
    .input('phone', sql.NVarChar(20), data.phone_number)
    .input('name', sql.NVarChar(100), data.patient_name || null)
    .input('time', sql.NVarChar(100), data.preferred_contact_time || null)
    .input('contact_phone', sql.NVarChar(20), data.contact_phone || null)
    .input('summary', sql.NVarChar(sql.MAX), data.conversation_summary || null)
    .query(`
      INSERT INTO human_escalations
        (phone_number, patient_name, preferred_contact_time, contact_phone, conversation_summary, status)
      VALUES
        (@phone, @name, @time, @contact_phone, @summary, 'pending')
    `);
  } catch (err) {
    console.error('[whatsapp] saveEscalation error:', err.message);
    captureException(err instanceof Error ? err : new Error(String(err)), {
      scope: '[whatsapp.saveEscalation]',
    }).catch(() => {});
    return null;
  }
}

// Normalise a Spanish specialty name to the URL slug used by search-v2.
// Not exhaustive — unknown specialties pass through lowercased.
const SPECIALTY_SLUGS = {
  cardiología: 'cardiologia', cardiologia: 'cardiologia',
  dermatología: 'dermatologia', dermatologia: 'dermatologia',
  traumatología: 'traumatologia', traumatologia: 'traumatologia',
  oftalmología: 'oftalmologia', oftalmologia: 'oftalmologia',
  pediatría: 'pediatria', pediatria: 'pediatria',
  ginecología: 'ginecologia', ginecologia: 'ginecologia',
  urología: 'urologia', urologia: 'urologia',
  neurología: 'neurologia', neurologia: 'neurologia',
  psiquiatría: 'psiquiatria', psiquiatria: 'psiquiatria',
  psicología: 'psicologia', psicologia: 'psicologia',
  endocrinología: 'endocrinologia', endocrinologia: 'endocrinologia',
  reumatología: 'reumatologia', reumatologia: 'reumatologia',
  neumología: 'neumologia', neumologia: 'neumologia',
  digestivo: 'digestivo', 'aparato digestivo': 'digestivo',
  nutrición: 'nutricion', nutricion: 'nutricion',
  'medicina interna': 'medicina-interna',
  fisioterapia: 'fisioterapia',
  'medicina estética': 'medicina-estetica',
  andrología: 'andrologia', andrologia: 'andrologia',
};

export function toSpecialtySlug(name) {
  if (!name) return '';
  const normalized = name.toLowerCase().trim();
  return SPECIALTY_SLUGS[normalized] || normalized.replace(/\s+/g, '-').replace(/[áéíóú]/g, (c) =>
    ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[c] || c)
  );
}

/**
 * Builds the set of booking links to include in the WhatsApp message.
 *
 * Returns { mainLink, videoLink, ceaLink } where:
 * - mainLink   always present — search filtered by specialty + city
 * - videoLink  present when modality is 'video' or user didn't specify
 *              (we always offer video as an option)
 * - ceaLink    present only for Madrid searches — direct link to CEA
 */
export function buildLinks({ specialty, insurance, city, modality }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://medconnect.es';
  const slug = toSpecialtySlug(specialty);

  // Main in-person search
  const mainParams = new URLSearchParams({ source: 'whatsapp' });
  if (slug) mainParams.set('specialtySlug', slug);
  if (city) mainParams.set('city', city);
  const mainLink = `${base}/search-v2?${mainParams.toString()}`;

  // Video consultation search (same specialty, no city restriction)
  const videoParams = new URLSearchParams({ source: 'whatsapp', modality: 'video' });
  if (slug) videoParams.set('specialtySlug', slug);
  const videoLink = `${base}/search-v2?${videoParams.toString()}`;

  // CEA Bermúdez direct search (Madrid only — CEA appears at top of results)
  let ceaLink = null;
  const isMadrid = !city || city.toLowerCase().includes('madrid');
  if (isMadrid && modality !== 'video') {
    const ceaParams = new URLSearchParams({
      source: 'whatsapp',
      providerName: CEA_PROVIDER_NAME,
    });
    if (slug) ceaParams.set('specialtySlug', slug);
    ceaParams.set('city', 'Madrid');
    ceaLink = `${base}/search-v2?${ceaParams.toString()}`;
  }

  return { mainLink, videoLink, ceaLink };
}

// Keep backward-compatible export for any code still calling buildSearchLink
export function buildSearchLink(specialty, insurance) {
  const { mainLink } = buildLinks({ specialty, insurance });
  return mainLink;
}
