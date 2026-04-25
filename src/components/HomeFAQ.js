'use client';

import { useState } from 'react';

const FAQS = [
  {
    q: 'Si ya tengo seguro, ¿por qué tengo que pagaros algo?',
    a: 'Tu seguro te cubre la consulta, pero no te garantiza cuándo. Pagas la tarifa de prioridad solo por que te consigamos una reserva prioritaria en una clínica de tu cuadro médico — esa gestión es lo único que nos cobramos.',
  },
  {
    q: '¿Qué pasa exactamente cuando llegue a la clínica?',
    a: 'Entregas tu tarjeta de asegurado en recepción, como en cualquier otra cita concertada. La clínica te atiende bajo tu póliza y factura la consulta a tu aseguradora. No te vuelven a cobrar nada.',
  },
  {
    q: '¿Mi aseguradora se entera? ¿Me penaliza?',
    a: 'No. Es una cita normal en una clínica de tu cuadro médico. Tu aseguradora factura la consulta como siempre. Para ellos es indistinguible de una cita gestionada por su app o teléfono.',
  },
  {
    q: '¿Qué incluye la tarifa de prioridad?',
    a: 'La gestión, la reserva del hueco urgente y el acceso prioritario que negociamos con la clínica. No incluye el acto médico — eso lo cubre tu seguro.',
  },
  {
    q: '¿Y si no tengo seguro?',
    a: 'También te conseguimos cita privada. En ese caso pagas el acto médico de la clínica + la tarifa de prioridad. Te mostramos siempre el total antes de pagar.',
  },
  {
    q: '¿Puedo cancelar?',
    a: 'Sí, cancelación gratuita hasta 24 horas antes de la cita. Si cancelas antes, te devolvemos íntegra la tarifa de prioridad.',
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`home-faq-item ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="home-faq-question"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <span className="home-faq-icon" aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="home-faq-answer">{a}</div>}
    </div>
  );
}

export default function HomeFAQ() {
  return (
    <section className="home-faq">
      <div className="container">
        <h2 className="home-faq-title">Preguntas que todo asegurado se hace</h2>
        <p className="home-faq-subtitle">
          Lo que te aclaramos antes de que lo preguntes en recepción.
        </p>
        <div className="home-faq-list">
          {FAQS.map((faq, i) => (
            <FAQItem key={i} q={faq.q} a={faq.a} />
          ))}
        </div>
      </div>
    </section>
  );
}
