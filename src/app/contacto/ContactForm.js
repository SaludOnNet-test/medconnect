'use client';
import { useState } from 'react';
import Button from '@/components/brand/Button';
import Input from '@/components/brand/Input';

/**
 * General contact form. Until we have an /api/contact endpoint, opens
 * a prefilled mailto: to hola@medconnect.es so leads still reach ops.
 */
export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', subject: 'Consulta general', message: '',
  });

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const subject = encodeURIComponent(`[Contacto] ${form.subject || 'Consulta general'}`);
    const body = encodeURIComponent(
      `${form.message}\n\n— ${form.name}\n${form.email}`
    );
    window.location.href = `mailto:hola@medconnect.es?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <Input label="Nombre" placeholder="Lucía Fernández" value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
      <Input label="Email" type="email" placeholder="lucia@ejemplo.es" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required />
      <Input label="Asunto" placeholder="Consulta general" value={form.subject} onChange={(e) => handleChange('subject', e.target.value)} />
      <Input label="Mensaje" as="textarea" placeholder="Cuéntanos qué necesitas…" value={form.message} onChange={(e) => handleChange('message', e.target.value)} required />
      <Button type="submit" variant="secondary" size="lg" full>
        {submitted ? '¡Enviado!' : 'Enviar mensaje'}
      </Button>
    </form>
  );
}
