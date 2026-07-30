// ---------------------------------------------------------------------------
// Signal parsing for the WhatsApp bot.
// Claude appends machine-readable markers at the end of its messages:
//   <!--LEAD:{...}-->
//   <!--ESCALATION:{...}-->
//   <!--SECURITY_FLAG:{...}-->
// We strip them before sending to the user.
// Extracted from src/app/api/whatsapp/webhook/route.js so it is unit-testable.
// ---------------------------------------------------------------------------
export function parseSignals(text, _phoneNumber) {
  let cleanText = text;
  let leadData = null;
  let escalationData = null;
  let securityFlag = null;

  const leadMatch = text.match(/<!--LEAD:(.*?)-->/s);
  if (leadMatch) {
    try {
      const raw = JSON.parse(leadMatch[1]);
      leadData = {
        patient_name: raw.name || null,
        email: raw.email || null,
        insurance_company: raw.insurance || null,
        specialty_requested: raw.specialty || null,
        preferred_doctor: raw.doctor || null,
        city: raw.city || null,
        preferred_modality: raw.modality || null,
        preferred_date: raw.date || null,
        preferred_time_range: raw.time || null,
        visit_reason: raw.reason || null,
        urgency_level: raw.urgency || 'normal',
      };
    } catch {
      // malformed JSON — ignore
    }
    cleanText = cleanText.replace(/<!--LEAD:.*?-->/s, '').trim();
  }

  const escalationMatch = text.match(/<!--ESCALATION:(.*?)-->/s);
  if (escalationMatch) {
    try {
      const raw = JSON.parse(escalationMatch[1]);
      escalationData = {
        patient_name: raw.name || null,
        preferred_contact_time: raw.time || null,
        contact_phone: raw.phone || null,
        conversation_summary: raw.summary || null,
      };
    } catch {
      // ignore
    }
    cleanText = cleanText.replace(/<!--ESCALATION:.*?-->/s, '').trim();
  }

  const securityMatch = text.match(/<!--SECURITY_FLAG:(.*?)-->/s);
  if (securityMatch) {
    try {
      const raw = JSON.parse(securityMatch[1]);
      securityFlag = {
        reason: raw.reason || null,
        excerpt: raw.excerpt || null,
      };
    } catch {
      // malformed JSON — ignore
    }
    cleanText = cleanText.replace(/<!--SECURITY_FLAG:.*?-->/s, '').trim();
  }

  return { cleanText, leadData, escalationData, securityFlag };
}
