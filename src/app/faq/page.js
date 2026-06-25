import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Accordion from '@/components/brand/Accordion';
import Button from '@/components/brand/Button';
import Eyebrow from '@/components/brand/Eyebrow';

export const metadata = {
  title: 'Preguntas frecuentes — Med Connect',
  description: 'Lo que aclaramos antes de que lo preguntes en recepción. Tarifa de prioridad, seguros, cancelaciones y más.',
  alternates: { canonical: '/faq' },
};

const FAQ_ITEMS = [
  {
    q: 'Si ya tengo seguro, ¿por qué tengo que pagaros algo?',
    a: <p>Porque tu seguro te garantiza la consulta, pero no el cuándo. Cuando necesitas cita esta semana y tu cuadro médico te ofrece dentro de un mes, somos el atajo legítimo: clínicas que ya tienen acuerdo con tu aseguradora, con una reserva prioritaria reservada para ti.</p>,
  },
  {
    q: '¿Qué pasa exactamente cuando llegue a la clínica?',
    a: <p>Acudes con tu tarjeta de asegurado. Te atienden bajo tu póliza. La clínica factura la consulta a tu aseguradora, no a ti. Lo único nuevo es que la cita es para mañana, no para dentro de seis semanas.</p>,
  },
  {
    q: '¿Mi aseguradora se entera? ¿Me penaliza?',
    a: <p>No. Para tu aseguradora es una cita concertada normal — la clínica está en su cuadro y tú estás cubierto por tu póliza. La tarifa de prioridad es un acuerdo entre tú y Med Connect, separado.</p>,
  },
  {
    q: '¿Qué incluye la tarifa de prioridad?',
    a: <p>Una reserva prioritaria, escalonada por urgencia: <strong>5&nbsp;€</strong> si la cita es a más de 30 días, <strong>10&nbsp;€</strong> entre 15 y 30 días, <strong>19&nbsp;€</strong> entre 7 y 14 días, y <strong>29&nbsp;€</strong> si necesitas cita en menos de 7 días. Nada más — el acto médico es entre tu aseguradora y la clínica.</p>,
  },
  {
    q: '¿Y si no tengo seguro?',
    a: <p>Te conseguimos cita privada en la misma red de clínicas. En este caso pagas la consulta completa, con precio cerrado de antemano y sin sorpresas en recepción. Te decimos el total antes de pagar.</p>,
  },
  {
    q: '¿Puedo cancelar?',
    a: <p>Sí. Hasta <strong>24 horas antes</strong> de la cita cancelas gratis por cualquier motivo y te devolvemos el importe íntegro en 72 h. Pasado ese plazo, la tarifa de prioridad no es reembolsable salvo causa justificada.</p>,
  },
  {
    q: '¿Mis datos están seguros?',
    a: <p>Sí. No tratamos historiales clínicos — la información médica de la consulta se queda en la clínica y en tu aseguradora. Solo manejamos los datos mínimos para gestionar la reserva (nombre, contacto, póliza). Más detalle en nuestra <a href="/privacidad">política de privacidad</a>.</p>,
  },
  {
    q: '¿Qué pasa si la clínica cancela el día de la cita?',
    a: <p>Te avisamos por email + SMS y te ofrecemos un slot alternativo en otra clínica concertada con tu aseguradora. Si no encaja, te reembolsamos la tarifa íntegra.</p>,
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Si ya tengo seguro, ¿por qué tengo que pagaros algo?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Porque tu seguro te garantiza la consulta, pero no el cuándo. Cuando necesitas cita esta semana y tu cuadro médico te ofrece dentro de un mes, somos el atajo legítimo: clínicas que ya tienen acuerdo con tu aseguradora, con una reserva prioritaria reservada para ti.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Qué pasa exactamente cuando llegue a la clínica?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Acudes con tu tarjeta de asegurado. Te atienden bajo tu póliza. La clínica factura la consulta a tu aseguradora, no a ti. Lo único nuevo es que la cita es para mañana, no para dentro de seis semanas.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Mi aseguradora se entera? ¿Me penaliza?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Para tu aseguradora es una cita concertada normal — la clínica está en su cuadro y tú estás cubierto por tu póliza. La tarifa de prioridad es un acuerdo entre tú y Med Connect, separado.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Qué incluye la tarifa de prioridad?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Una reserva prioritaria, escalonada por urgencia: 4 € si la cita es a más de 30 días, 8 € entre 15 y 30 días, 15 € entre 7 y 14 días, y 19 € si necesitas cita en menos de 7 días. Nada más — el acto médico es entre tu aseguradora y la clínica.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Y si no tengo seguro?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Te conseguimos cita privada en la misma red de clínicas. En este caso pagas la consulta completa, con precio cerrado de antemano y sin sorpresas en recepción. Te decimos el total antes de pagar.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Puedo cancelar?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sí. Hasta 24 horas antes de la cita cancelas gratis por cualquier motivo y te devolvemos el importe íntegro en 72 h. Pasado ese plazo, la tarifa de prioridad no es reembolsable salvo causa justificada.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Mis datos están seguros?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sí. No tratamos historiales clínicos — la información médica de la consulta se queda en la clínica y en tu aseguradora. Solo manejamos los datos mínimos para gestionar la reserva (nombre, contacto, póliza).',
      },
    },
    {
      '@type': 'Question',
      name: '¿Qué pasa si la clínica cancela el día de la cita?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Te avisamos por email + SMS y te ofrecemos un slot alternativo en otra clínica concertada con tu aseguradora. Si no encaja, te reembolsamos la tarifa íntegra.',
      },
    },
  ],
};

export default function FAQPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Header />
      <PageHeader
        eyebrow="Preguntas frecuentes"
        title={<>Lo que te aclaramos antes de que lo preguntes <em>en recepción.</em></>}
        lede="Si tu duda no está aquí, escríbenos a info@medconnect.es y te respondemos en menos de 24 h."
      />

      <section className="info-section info-section--alt">
        <div className="container faq-container">
          <Accordion items={FAQ_ITEMS} defaultOpen={0} />
        </div>
      </section>

      <section className="cta-section on-inverse">
        <div className="cta-noise" aria-hidden="true" />
        <div className="container cta-inner">
          <Eyebrow dark>Lista para reservar</Eyebrow>
          <h2 className="cta-title">¿Resuelta la duda?</h2>
          <p className="cta-lede">
            Tu cita está esperándote. Búscala por especialidad y ciudad y elige el horario que más te conviene.
          </p>
          <div className="cta-actions">
            <Button href="/search-v2" variant="primary" size="lg">Buscar mi cita</Button>
            <Button href="mailto:info@medconnect.es" variant="ghostInv" size="lg">Escribirnos</Button>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
