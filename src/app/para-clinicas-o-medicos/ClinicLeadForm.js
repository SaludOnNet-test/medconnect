'use client';
import { useState } from 'react';
import Button from '@/components/brand/Button';
import Input from '@/components/brand/Input';

/**
 * Para clínicas o médicos — alta lead form. No DB endpoint exists yet,
 * so the form opens a prefilled mailto: to operations. When
 * /api/clinics/leads is built, swap the handler over.
 */
export default function ClinicLeadForm() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    clinicName: '', contactName: '', email: '', phone: '', insurers: '', model: 'ambos',
  });

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const body = encodeURIComponent(
      `Solicitud de alta — clínica / médico\n\n` +
      `Modelo de interés: ${form.model}\n` +
      `Clínica / consulta: ${form.clinicName}\nContacto: ${form.contactName}\n` +
      `Email: ${form.email}\nTeléfono: ${form.phone}\n` +
      (form.insurers ? `Aseguradoras concertadas: ${form.insurers}\n` : '')
    );
    window.location.href = `mailto:hola@medconnect.es?subject=Alta%20cl%C3%ADnica%20o%20m%C3%A9dico&body=${body}`;
    setSubmitted(true);
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <Input label="Nombre de la clínica o consulta" placeholder="Centro Médico Velázquez" value={form.clinicName} onChange={(e) => handleChange('clinicName', e.target.value)} required />
      <Input label="Persona de contacto" placeholder="Dra. María López" value={form.contactName} onChange={(e) => handleChange('contactName', e.target.value)} required />
      <Input label="Email" type="email" placeholder="direccion@centromedico.es" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required />
      <Input label="Teléfono" type="tel" placeholder="+34 91 234 56 78" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} required />
      <Input label="Aseguradoras concertadas (si vas a vender huecos)" placeholder="Sanitas, Adeslas, DKV…" value={form.insurers} onChange={(e) => handleChange('insurers', e.target.value)} />
      <Button type="submit" variant="secondary" size="lg" full>
        {submitted ? '¡Solicitud enviada!' : 'Enviar solicitud'}
      </Button>
      <p className="info-section-note" style={{ textAlign: 'left', marginTop: 0 }}>
        Te respondemos en 48 h. Sin compromiso.
      </p>
    </form>
  );
}
