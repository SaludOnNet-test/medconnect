import { NextResponse, after } from 'next/server';
import crypto from 'crypto';
import {
  sendWhatsAppMessage,
  getConversationHistory,
  getFullConversationTranscript,
  saveMessage,
  saveLead,
  saveEscalation,
  buildLinks,
} from '@/lib/whatsapp';
import { sendEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rateLimit';
import { captureException, captureMessage } from '@/lib/sentry';
import { parseSignals } from '@/lib/whatsappSignals';
import { fetchWithTimeout } from '@/lib/http';
import { parseInboundPayload } from '@/lib/whatsappProvider';
import { whatsappSecurityAlert } from '@/lib/emailTemplates';
import { dispatchStaleConversationDigests } from '@/lib/whatsappDigest';
import { scheduleFollowup } from '@/lib/whatsappFollowup';
import { runAssistantTurn } from '@/lib/whatsappAgent';

// Last N transcript lines included in the immediate security-alert email —
// enough context to judge the attempt without dumping the whole history.
const SECURITY_ALERT_TRANSCRIPT_LINES = 6;

export const dynamic = 'force-dynamic';

// Rate limit inbound messages per phone number (not per IP — 360dialog is the
// only caller, so IP-based limiting would throttle everyone together).
const whatsappMessageLimiter = rateLimit({
  key: 'whatsapp:msg',
  windowMs: 60 * 60_000,
  max: 20,
  identify: (req) => req.phoneNumber,
});

// Timing-safe comparison of two secrets. Returns false on length mismatch
// instead of throwing (timingSafeEqual requires equal-length buffers).
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Idempotency — dedupe by 360dialog message id via Upstash Redis (SET NX + TTL).
// Same REST pattern as src/lib/rateLimit.js. Returns true when the message was
// already processed. If Redis isn't configured/reachable, we proceed without
// dedupe (log warning) rather than dropping messages.
// ---------------------------------------------------------------------------
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

async function isDuplicateMessage(messageId) {
  if (!messageId) return false;
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn('[whatsapp/webhook] Upstash not configured — skipping message dedupe');
    return false;
  }
  try {
    const res = await fetchWithTimeout(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['SET', `wa:msg:${messageId}`, '1', 'NX', 'EX', String(24 * 60 * 60)],
      ]),
      timeoutMs: 1500,
    });
    if (!res.ok) {
      console.warn('[whatsapp/webhook] dedupe check failed — proceeding without dedupe');
      return false;
    }
    const data = await res.json();
    // SET ... NX returns "OK" when the key was created, null when it existed.
    return data?.[0]?.result !== 'OK';
  } catch {
    console.warn('[whatsapp/webhook] dedupe check errored — proceeding without dedupe');
    return false;
  }
}

// 360dialog sends a verification GET on webhook registration
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken || !safeCompare(searchParams.get('hub.verify_token') || '', verifyToken)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const challenge = searchParams.get('hub.challenge');
  if (challenge) return new Response(challenge, { status: 200 });
  return NextResponse.json({ ok: true });
}

export async function POST(request) {
  // Auth FIRST — before any DB/Claude work. Never open by default.
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  // 360dialog's webhook-registration UI only exposes a plain URL field (no
  // custom headers), so also accept the secret as a query param embedded in
  // the registered URL. Header takes precedence when both are present.
  const url = new URL(request.url);
  const providedSecret = request.headers.get('x-webhook-secret') || url.searchParams.get('secret') || '';
  if (!safeCompare(providedSecret, webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Provider-agnostic inbound parsing (360dialog today — see whatsappProvider.js)
  const { messages } = parseInboundPayload(body);
  if (!messages?.length) return NextResponse.json({ ok: true });

  // Only process text messages — respond to media/image senders with a helper message
  const msg = messages[0];
  if (!msg?.from) return NextResponse.json({ ok: true });

  const phoneNumber = msg.from;

  // Idempotency: skip already-processed message ids (360dialog retries).
  if (await isDuplicateMessage(msg.id)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Rate limit per phone number
  const rl = await whatsappMessageLimiter.check({ headers: request.headers, phoneNumber });
  if (!rl.ok) {
    return NextResponse.json({ ok: true, rate_limited: true }, { status: 200, headers: rl.headers });
  }

  // Emoji reactions come through with the emoji as `text` (see
  // whatsappProvider.js) and flow into the conversation like a short text
  // message — the system prompt tells Claude how to read them in context.
  // Removing a reaction arrives as type 'reaction' with no emoji: ignore it
  // silently (replying anything to an un-react would be noise).
  if (msg.type === 'reaction' && !msg.text) {
    return NextResponse.json({ ok: true });
  }
  const isReadable = msg.type === 'text' || (msg.type === 'reaction' && msg.text);
  if (!isReadable) {
    await sendWhatsAppMessage(
      phoneNumber,
      'Solo proceso mensajes de texto. Si quieres reservar una cita o tienes alguna duda, escríbeme y te ayudo encantado. 😊'
    );
    return NextResponse.json({ ok: true });
  }

  const userText = msg.text?.trim();
  if (!userText) return NextResponse.json({ ok: true });

  try {
    const history = await getConversationHistory(phoneNumber);
    await saveMessage(phoneNumber, 'user', userText);
    history.push({ role: 'user', content: userText });

    const assistantText = await runAssistantTurn(history);
    await saveMessage(phoneNumber, 'assistant', assistantText);

    const { cleanText, leadData, escalationData, securityFlag } = parseSignals(assistantText, phoneNumber);

    if (securityFlag) {
      // Fire-and-forget — a security-flag notification must never block the
      // patient-facing reply, but we still want it best-effort awaited so it
      // has a chance to complete before the serverless function suspends.
      await notifySecurityFlag({ ...securityFlag, phoneNumber });
    }

    if (leadData) {
      const { mainLink, videoLink, ceaLink } = buildLinks({
        specialty: leadData.specialty_requested,
        insurance: leadData.insurance_company,
        city: leadData.city,
        modality: leadData.preferred_modality,
      });
      // Store the most relevant link as the primary
      const primaryLink = leadData.preferred_modality === 'video' ? videoLink : (ceaLink || mainLink);
      const lead = await saveLead({ ...leadData, phone_number: phoneNumber, checkout_link: primaryLink });
      // ONE email per lead. Claude re-emits the LEAD marker on every turn once
      // it knows the specialty, so notifying unconditionally sent ops one
      // email per bot reply (5 for the 2026-08-23 conversation). saveLead
      // upserts and tells us whether the row is new; later turns only enrich
      // it, and the enriched state is visible in /admin/exec → WhatsApp Leads.
      // `lead === null` means the DB write itself failed — notify anyway
      // rather than lose the lead silently.
      if (!lead || lead.isNew) {
        await notifyTeamLead({ ...leadData, phone_number: phoneNumber, mainLink, videoLink, ceaLink });
      }
    }

    if (escalationData) {
      await saveEscalation({ ...escalationData, phone_number: phoneNumber });
      await notifyTeamEscalation({ ...escalationData, phone_number: phoneNumber });
    }

    await sendWhatsAppMessage(phoneNumber, cleanText);

    // Opportunistic stale-conversation digest — piggybacks on this webhook
    // invocation rather than a dedicated cron (Vercel Hobby caps us at 2
    // crons/day, both already spoken for). `after()` schedules this to run
    // once the response has been sent, so it adds no latency to the
    // patient-facing reply, and — unlike a bare un-awaited promise — Next
    // keeps the serverless function alive until it settles.
    try {
      after(() => dispatchStaleConversationDigests().catch((err) => {
        console.error('[whatsapp/webhook] stale digest dispatch failed:', err.message);
      }));
      // Schedule a single 2h re-engagement nudge (best-effort, no-op without
      // QSTASH_TOKEN). Runs after the response is flushed, adds no reply latency.
      after(() => scheduleFollowup(phoneNumber).catch((err) => {
        console.error('[whatsapp/webhook] scheduleFollowup failed:', err.message);
      }));
    } catch (err) {
      console.error('[whatsapp/webhook] after() scheduling failed:', err.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp/webhook]', err);
    captureException(err instanceof Error ? err : new Error(String(err)), {
      scope: '[POST /api/whatsapp/webhook]',
      phoneNumber,
    }).catch(() => {});

    // Best-effort apology to the user — its own try/catch so a send failure
    // never masks the original error handling.
    try {
      await sendWhatsAppMessage(
        phoneNumber,
        'Estamos teniendo un problema técnico. Inténtalo de nuevo en unos minutos o escríbenos a través de medconnect.es 🙏'
      );
    } catch (sendErr) {
      console.error('[whatsapp/webhook] apology send failed:', sendErr.message);
    }

    // Return 200 (not 500) to stop 360dialog retry storms.
    return NextResponse.json({ ok: true, handled_error: true });
  }
}


// ---------------------------------------------------------------------------
// HTML escaping for team notification emails — lead fields come from
// user-derived text and must never be interpolated raw into HTML.
// ---------------------------------------------------------------------------
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Team notifications
// ---------------------------------------------------------------------------
// Renders the full conversation history (all messages, oldest first) as an
// HTML block for archive/audit purposes in team notification emails. A
// failure here (DB hiccup) must never block the notification email itself —
// callers wrap this in try/catch, same protection as saveLead.
async function transcriptHtmlBlock(phoneNumber) {
  try {
    const transcript = await getFullConversationTranscript(phoneNumber);
    if (!transcript.length) return '';
    const rows = transcript.map((m) => {
      const roleLabel = m.role === 'user' ? '🧑 Paciente' : '🤖 Asistente';
      return `<tr><td style="padding:4px 8px;font-size:12px;color:#6b7280;font-weight:700;white-space:nowrap;vertical-align:top;">${roleLabel}</td><td style="padding:4px 8px;font-size:13px;color:#374151;">${escapeHtml(m.content).replace(/\n/g, '<br>')}</td></tr>`;
    }).join('');
    return `
      <h3 style="margin:20px 0 8px;font-size:13px;color:#1a3c5e;text-transform:uppercase;letter-spacing:0.05em;">Transcripción completa</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${rows}</table>
    `;
  } catch (err) {
    console.error('[whatsapp] transcriptHtmlBlock failed:', err.message);
    return '';
  }
}

async function notifyTeamLead(data) {
  const to = process.env.EXEC_REPORT_TO_EMAIL;
  if (!to) return;
  const linksHtml = [
    data.mainLink && `<a href="${escapeHtml(data.mainLink)}" style="margin-right:8px">🔍 Búsqueda general</a>`,
    data.videoLink && `<a href="${escapeHtml(data.videoLink)}" style="margin-right:8px">📹 Videoconsulta</a>`,
    data.ceaLink && `<a href="${escapeHtml(data.ceaLink)}">🏥 Cea Bermúdez</a>`,
  ].filter(Boolean).join(' · ');
  const transcriptHtml = await transcriptHtmlBlock(data.phone_number);

  try {
    await sendEmail({
      to,
      subject: `🟢 Nuevo lead WhatsApp — ${data.specialty_requested || 'Especialidad pendiente'}`,
      html: `
        <h2>Nuevo lead por WhatsApp</h2>
        <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Teléfono</td><td><b>${escapeHtml(data.phone_number)}</b></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Nombre</td><td>${escapeHtml(data.patient_name || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Especialidad</td><td>${escapeHtml(data.specialty_requested || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Seguro</td><td>${escapeHtml(data.insurance_company || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Ciudad</td><td>${escapeHtml(data.city || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Modalidad</td><td>${escapeHtml(data.preferred_modality || 'presencial')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Fecha preferida</td><td>${escapeHtml(data.preferred_date || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Franja horaria</td><td>${escapeHtml(data.preferred_time_range || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Motivo</td><td>${escapeHtml(data.visit_reason || '—')}</td></tr>
        </table>
        <p style="margin-top:16px">${linksHtml}</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">
          Panel: <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://medconnect.es'}/admin/exec">/admin/exec → WhatsApp Leads</a>
        </p>
        ${transcriptHtml}
      `,
    });
  } catch (err) {
    console.error('[whatsapp] notifyTeamLead email failed:', err.message);
  }
}

async function notifyTeamEscalation(data) {
  const to = process.env.EXEC_REPORT_TO_EMAIL;
  if (!to) return;
  const transcriptHtml = await transcriptHtmlBlock(data.phone_number);
  try {
    await sendEmail({
      to,
      subject: `🔶 WhatsApp — paciente pide atención humana`,
      html: `
        <h2>Solicitud de atención humana por WhatsApp</h2>
        <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Teléfono</td><td><b>${escapeHtml(data.phone_number)}</b></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Nombre</td><td>${escapeHtml(data.patient_name || '—')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Horario preferido</td><td><b>${escapeHtml(data.preferred_contact_time || '—')}</b></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Teléfono de contacto</td><td>${escapeHtml(data.contact_phone || data.phone_number)}</td></tr>
        </table>
        ${data.conversation_summary ? `<p style="font-size:13px;color:#374151"><b>Resumen:</b> ${escapeHtml(data.conversation_summary)}</p>` : ''}
        ${transcriptHtml}
      `,
    });
  } catch (err) {
    console.error('[whatsapp] notifyTeamEscalation email failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Security-flag notification — fired when the bot's anti-manipulation
// guardrail triggers (see SECURITY_FLAG in the system prompt below). Reports
// to both Sentry (for alerting/aggregation) and ops email (last 6 transcript
// lines for immediate human review). Never blocks the patient-facing reply —
// callers must call this from within their own try/catch or accept its own
// internal swallow-and-log behavior.
async function notifySecurityFlag({ reason, excerpt, phoneNumber }) {
  captureMessage(`WhatsApp bot security flag: ${reason || 'sin especificar'}`, {
    phoneNumber,
    reason,
    excerpt,
  }, { level: 'warning' }).catch(() => {});

  const to = process.env.EXEC_REPORT_TO_EMAIL;
  if (!to) return;
  try {
    const fullTranscript = await getFullConversationTranscript(phoneNumber);
    const lastLines = fullTranscript.slice(-SECURITY_ALERT_TRANSCRIPT_LINES);
    const { subject, html } = whatsappSecurityAlert({
      phoneNumber,
      reason,
      excerpt,
      transcript: lastLines,
    });
    await sendEmail({ to, subject, html });
  } catch (err) {
    console.error('[whatsapp] notifySecurityFlag email failed:', err.message);
  }
}
