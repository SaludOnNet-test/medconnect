'use client';
import { useEffect, useId, useState } from 'react';
import Button from '@/components/brand/Button';
import Input from '@/components/brand/Input';
import Eyebrow from '@/components/brand/Eyebrow';

/**
 * General contact form. Until we have an /api/contact endpoint, opens a
 * prefilled mailto: to hola@medconnect.es so leads still reach ops.
 *
 * Reason selector — added so the team can route incoming messages without
 * reading the whole body. Pages that link here can pre-select a reason via
 * `?reason=alta | ventas | consulta | otro` (e.g. the "Hablar con ventas"
 * CTA on /para-clinicas-o-medicos).
 */

const REASONS = [
  { value: 'alta',     label: 'Solicitar alta de mi clínica' },
  { value: 'ventas',   label: 'Quiero que me contacte alguien del equipo comercial' },
  { value: 'consulta', label: 'Consulta general' },
  { value: 'otro',     label: 'Otro' },
];

const REASON_VALUES = REASONS.map((r) => r.value);

function reasonLabel(value) {
  const r = REASONS.find((x) => x.value === value);
  return r ? r.label : 'Consulta general';
}

export default function ContactForm() {
  const reasonId = useId();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    reason: 'consulta',
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  // Pre-select the reason from ?reason=… so deep links from other pages
  // ("Hablar con ventas", "Solicitar alta", etc.) land on the right option
  // without the user having to pick it again.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const r = params.get('reason');
    if (r && REASON_VALUES.includes(r)) {
      setForm((prev) => ({ ...prev, reason: r }));
    }
  }, []);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const reasonText = reasonLabel(form.reason);
    const subjectLine = form.subject?.trim() || reasonText;
    const subject = encodeURIComponent(`[Contacto] ${reasonText} — ${subjectLine}`);
    const body = encodeURIComponent(
      `Razón de contacto: ${reasonText}\n\n${form.message}\n\n— ${form.name}\n${form.email}`,
    );
    window.location.href = `mailto:hola@medconnect.es?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="brand-input">
        <Eyebrow as="label" htmlFor={reasonId} className="brand-input__label">
          Razón de contacto
        </Eyebrow>
        <div className="brand-input__field">
          <select
            id={reasonId}
            className="brand-input__control"
            value={form.reason}
            onChange={(e) => handleChange('reason', e.target.value)}
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>
      <Input label="Nombre" placeholder="Lucía Fernández" value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
      <Input label="Email" type="email" placeholder="lucia@ejemplo.es" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required />
      <Input label="Asunto" placeholder="Resumen breve" value={form.subject} onChange={(e) => handleChange('subject', e.target.value)} />
      <Input label="Mensaje" as="textarea" placeholder="Cuéntanos qué necesitas…" value={form.message} onChange={(e) => handleChange('message', e.target.value)} required />
      <Button type="submit" variant="secondary" size="lg" full>
        {submitted ? '¡Enviado!' : 'Enviar mensaje'}
      </Button>
    </form>
  );
}
