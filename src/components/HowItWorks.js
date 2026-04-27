const STEPS = [
  {
    n: '1',
    title: 'Buscas',
    body: 'Especialidad y ciudad. Te mostramos reservas prioritarias en clínicas concertadas con tu aseguradora.',
  },
  {
    n: '2',
    title: 'Reservas y pagas la prioridad',
    body: 'Solo la tarifa de prioridad: 4,99 € · 9,99 € · 19 € · 29 € según la urgencia. El acto médico no se cobra aquí — eso lo cubre tu seguro.',
  },
  {
    n: '3',
    title: 'Acudes con tu tarjeta',
    body: 'La clínica te atiende bajo tu póliza, como cualquier otra cita concertada. Sin sorpresas, sin doble pago.',
  },
];

export default function HowItWorks() {
  return (
    <section className="how-it-works">
      <div className="container">
        <h2 className="how-it-works-title">Cómo funciona en 3 pasos</h2>
        <p className="how-it-works-subtitle">
          Para asegurados que necesitan cita ya y para quien no tiene seguro y prefiere ir privado.
        </p>
        <div className="how-it-works-grid">
          {STEPS.map((step) => (
            <div key={step.n} className="how-it-works-step">
              <span className="how-it-works-number">{step.n}</span>
              <h3 className="how-it-works-step-title">{step.title}</h3>
              <p className="how-it-works-step-body">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
