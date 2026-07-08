import { getPool, DB_AVAILABLE } from '@/lib/db';
import sql from 'mssql';
import { captureException } from '@/lib/sentry';

const DIALOG360_API_KEY = process.env.WHATSAPP_360DIALOG_API_KEY || '';
const DIALOG360_URL = 'https://waba.360dialog.io/v1/messages';

// Max conversation turns sent to Claude (older messages dropped to control cost)
const MAX_HISTORY_TURNS = 20;

// CEA Bermúdez is our partner clinic in Madrid — sorted to top in search results
// and eligible for the direct-link path
export const CEA_PROVIDER_ID = 1;
export const CEA_PROVIDER_NAME = 'Centro Médico Cea Bermúdez';

export async function sendWhatsAppMessage(to, text) {
  const res = await fetch(DIALOG360_URL, {
    method: 'POST',
    headers: {
      'D360-API-KEY': DIALOG360_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`360dialog send failed ${res.status}: ${body}`);
  }
  return res.json();
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

export async function saveLead(data) {
  if (!DB_AVAILABLE) return null;
  try {
    const pool = await getPool();
    const result = await pool.request()
    .input('phone', sql.NVarChar(20), data.phone_number)
    .input('name', sql.NVarChar(100), data.patient_name || null)
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
        (phone_number, patient_name, insurance_company, specialty_requested,
         preferred_doctor, city, preferred_modality, preferred_date,
         preferred_time_range, visit_reason, checkout_link, urgency_level, status)
      VALUES
        (@phone, @name, @insurance, @specialty,
         @doctor, @city, @modality, @date,
         @time_range, @reason, @link, @urgency, 'link_sent');
      SELECT SCOPE_IDENTITY() AS id;
    `);
    return result.recordset[0]?.id;
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

function toSpecialtySlug(name) {
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
