import { getPool, DB_AVAILABLE } from '@/lib/db';
import sql from 'mssql';

const DIALOG360_API_KEY = process.env.WHATSAPP_360DIALOG_API_KEY || '';
const DIALOG360_URL = 'https://waba.360dialog.io/v1/messages';

// Max conversation turns sent to Claude (older messages dropped to control cost)
const MAX_HISTORY_TURNS = 10;

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

// Returns the last MAX_HISTORY_TURNS messages for a phone number today,
// in Claude messages array format: [{role, content}]
export async function getConversationHistory(phoneNumber) {
  if (!DB_AVAILABLE) return [];
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('phone', sql.NVarChar(20), phoneNumber)
      .input('limit', sql.Int, MAX_HISTORY_TURNS)
      .query(`
        SELECT TOP (@limit) role, content
        FROM whatsapp_conversations
        WHERE phone_number = @phone
          AND session_date = CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Romance Standard Time' AS DATE)
        ORDER BY created_at ASC
      `);
    return result.recordset.map((r) => ({ role: r.role, content: r.content }));
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
  const pool = await getPool();
  const result = await pool.request()
    .input('phone', sql.NVarChar(20), data.phone_number)
    .input('name', sql.NVarChar(100), data.patient_name || null)
    .input('insurance', sql.NVarChar(100), data.insurance_company || null)
    .input('specialty', sql.NVarChar(100), data.specialty_requested || null)
    .input('doctor', sql.NVarChar(100), data.preferred_doctor || null)
    .input('date', sql.NVarChar(50), data.preferred_date || null)
    .input('time_range', sql.NVarChar(50), data.preferred_time_range || null)
    .input('reason', sql.NVarChar(500), data.visit_reason || null)
    .input('link', sql.NVarChar(1000), data.checkout_link || null)
    .input('urgency', sql.NVarChar(20), data.urgency_level || 'normal')
    .query(`
      INSERT INTO whatsapp_leads
        (phone_number, patient_name, insurance_company, specialty_requested,
         preferred_doctor, preferred_date, preferred_time_range, visit_reason,
         checkout_link, urgency_level, status)
      VALUES
        (@phone, @name, @insurance, @specialty,
         @doctor, @date, @time_range, @reason,
         @link, @urgency, 'link_sent');
      SELECT SCOPE_IDENTITY() AS id;
    `);
  return result.recordset[0]?.id;
}

export async function saveEscalation(data) {
  if (!DB_AVAILABLE) return;
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
}

// Builds the pre-filled search link for MedConnect
export function buildSearchLink(specialty, insurance) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://medconnect.es';
  const params = new URLSearchParams({ source: 'whatsapp' });
  if (specialty) params.set('q', specialty);
  if (insurance && insurance !== 'particular') params.set('insurance', insurance);
  return `${base}/search-v2?${params.toString()}`;
}
