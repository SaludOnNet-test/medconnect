import Eyebrow from '@/components/brand/Eyebrow';

/**
 * "Cómo funciona en tres pasos" section. Mounted on / and on
 * /como-funciona. Uses the same `.info-section` container as the rest of
 * the brand pages so its left margin lines up with adjacent sections.
 *
 * Numbers are padded to two digits ("01"…"03") and rendered in Fraunces
 * italic at display size — same editorial treatment as the .reality-n
 * pattern in /como-funciona, so they read as a coherent kit.
 */

const STEPS = [
  {
    n: '01',
    title: 'Buscas',
    body: 'Especialidad y ciudad. Te mostramos reservas prioritarias en clínicas concertadas con tu aseguradora.',
  },
  {
    n: '02',
    title: 'Reservas y pagas la prioridad',
    body: 'Solo la tarifa de prioridad: 4,99 € · 9,99 € · 19 € · 29 € según la urgencia. El acto médico no se cobra aquí — eso lo cubre tu seguro.',
  },
  {
    n: '03',
    title: 'Acudes con tu tarjeta',
    body: 'La clínica te atiende bajo tu póliza, como cualquier otra cita concertada. Sin sorpresas, sin doble pago.',
  },
];

export default function HowItWorks() {
  return (
    <section className="info-section how-it-works-section">
      <div className="container">
        <Eyebrow>El proceso</Eyebrow>
        <h2 className="info-section-title">
          Cómo funciona en <em>tres pasos.</em>
        </h2>
        <p className="info-section-lede">
          Para asegurados que necesitan cita ya y para quien no tiene seguro y prefiere ir privado.
        </p>
        <ol className="how-it-works-grid">
          {STEPS.map((step) => (
            <li key={step.n} className="how-it-works-step">
              <span className="how-it-works-number" aria-hidden="true">{step.n}</span>
              <h3 className="how-it-works-step-title">{step.title}</h3>
              <p className="how-it-works-step-body">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
