import Eyebrow from '@/components/brand/Eyebrow';
import Accordion from '@/components/brand/Accordion';

const FAQS = [
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
    a: <p>Te conseguimos cita privada en la misma red de clínicas. En este caso pagas la consulta completa, con precio cerrado de antemano y sin sorpresas en recepción.</p>,
  },
  {
    q: '¿Puedo cancelar?',
    a: <p>Sí, hasta 24 horas antes de la cita y la tarifa de prioridad se reembolsa íntegramente. Pasado ese plazo, la tarifa no es reembolsable salvo causa justificada.</p>,
  },
];

export default function HomeFAQ() {
  return (
    <section className="home-faq-section">
      <div className="container faq-container">
        <Eyebrow>Preguntas que todo asegurado se hace</Eyebrow>
        <h2 className="home-faq-title">
          Lo que te aclaramos antes de que lo preguntes <em>en recepción</em>.
        </h2>
        <Accordion items={FAQS} defaultOpen={0} />
      </div>
    </section>
  );
}
