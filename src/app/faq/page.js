import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Accordion from '@/components/brand/Accordion';
import Button from '@/components/brand/Button';
import Eyebrow from '@/components/brand/Eyebrow';

export const metadata = {
  title: 'Preguntas frecuentes — Med Connect',
  description: 'Lo que aclaramos antes de que lo preguntes en recepción. Tarifa de prioridad, seguros, cancelaciones y más.',
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
    a: <p>Una reserva prioritaria, escalonada por urgencia: <strong>4,99&nbsp;€</strong> si la cita es a más de 30 días, <strong>9,99&nbsp;€</strong> entre 15 y 30 días, <strong>19&nbsp;€</strong> entre 7 y 14 días, y <strong>29&nbsp;€</strong> si necesitas cita en menos de 7 días. Nada más — el acto médico es entre tu aseguradora y la clínica.</p>,
  },
  {
    q: '¿Y si no tengo seguro?',
    a: <p>Te conseguimos cita privada en la misma red de clínicas. En este caso pagas la consulta completa, con precio cerrado de antemano y sin sorpresas en recepción. Te decimos el total antes de pagar.</p>,
  },
  {
    q: '¿Puedo cancelar?',
    a: <p>Sí, hasta 24 horas antes de la cita y la tarifa de prioridad se reembolsa íntegramente. Pasado ese plazo, la tarifa no es reembolsable salvo causa justificada.</p>,
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

export default function FAQPage() {
  return (
    <>
      <Header />
      <PageHeader
        eyebrow="Preguntas frecuentes"
        title={<>Lo que te aclaramos antes de que lo preguntes <em>en recepción.</em></>}
        lede="Si tu duda no está aquí, escríbenos a hola@medconnect.es y te respondemos en menos de 24 h."
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
            <Button href="/" variant="primary" size="lg">Buscar mi cita</Button>
            <Button href="mailto:hola@medconnect.es" variant="ghostInv" size="lg">Escribirnos</Button>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
