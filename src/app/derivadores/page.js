import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Eyebrow from '@/components/brand/Eyebrow';
import Button from '@/components/brand/Button';
import Icon from '@/components/icons/Icon';

export const metadata = {
  title: 'Derivar paciente — Med Connect',
  description: 'Deriva pacientes a especialistas concertados con sus aseguradoras y cobra una comisión por cada derivación confirmada. Sin coste para tu paciente.',
};

const loginUrl = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? '/sign-up?role=professional'
  : '/pro/login';

const BENEFITS = [
  {
    icon: 'euro',
    title: 'Comisión por cada derivación',
    body: 'Por cada paciente que derivas y reserva, te abonamos una comisión. Cobro mensual a la cuenta que nos indiques, con factura desglosada. Sin invertir en recursos, equipos ni personal.',
  },
  {
    icon: 'user-round-check',
    title: 'Tu paciente, atendido en días',
    body: 'Resuelves su problema sin perderlo en la espera del cuadro médico. Sigue siendo tu paciente — tú no dejas de verlo, simplemente lo derivas a un colega para esa especialidad.',
  },
  {
    icon: 'receipt',
    title: 'Sin cobrarle a tu paciente',
    body: 'La tarifa de prioridad la paga el paciente directamente a Med Connect, transparente y desglosada. Tú no manejas dinero del paciente ni intervienes en el cobro.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Identifica la especialidad',
    body: 'Eliges la especialidad y la urgencia. Te mostramos clínicas concertadas con la aseguradora del paciente.',
  },
  {
    n: '02',
    title: 'Comparte el enlace',
    body: 'Generamos un enlace personalizado con el motivo de la derivación. Lo envías por WhatsApp o email al paciente — sin registro previo.',
  },
  {
    n: '03',
    title: 'El paciente reserva — tú cobras',
    body: 'El paciente confirma día y hora y paga la tarifa de prioridad. Cuando la cita se realiza, te abonamos automáticamente tu comisión.',
  },
];

export default function DerivadoresPage() {
  return (
    <>
      <Header />
      <PageHeader
        dark
        eyebrow="Derivar paciente"
        title={<>Deriva un paciente. <em>Cobra por hacerlo.</em></>}
        lede="Cuando tienes un paciente que necesita otra especialidad y tu cuadro médico no le da cita a tiempo, derívalo con nosotros: tu paciente consigue cita en días, y tú cobras una comisión por cada derivación que se confirma."
      >
        <Button href={loginUrl} variant="primary" size="lg">Empezar a derivar pacientes</Button>
      </PageHeader>

      <section className="info-section">
        <div className="container">
          <Eyebrow>Lo que ganas tú</Eyebrow>
          <h2 className="info-section-title">
            Tu paciente, atendido. <em>Tú, compensado.</em>
          </h2>
          <div className="benefit-grid">
            {BENEFITS.map((b) => (
              <div key={b.title} className="benefit-item">
                <Icon name={b.icon} size={28} className="benefit-icon" />
                <h3 className="benefit-title">{b.title}</h3>
                <p className="benefit-body">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="info-section info-section--alt">
        <div className="container faq-container">
          <Eyebrow>Cómo funciona</Eyebrow>
          <h2 className="info-section-title">
            Tres pasos. Sin papeleo, sin <em>cambiar tu consulta</em>.
          </h2>
          <div className="reality-list">
            {STEPS.map((s) => (
              <div key={s.n} className="reality-row">
                <span className="reality-n">{s.n}</span>
                <div>
                  <h3 className="reality-title">{s.title}</h3>
                  <p className="reality-body">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section on-inverse">
        <div className="cta-noise" aria-hidden="true" />
        <div className="container cta-inner">
          <Eyebrow dark>Sin compromiso, sin coste inicial</Eyebrow>
          <h2 className="cta-title">
            Empieza <em>hoy</em>.
          </h2>
          <p className="cta-lede">
            Tu primer enlace de derivación lo generas en menos de un minuto.
          </p>
          <div className="cta-actions">
            <Button href={loginUrl} variant="primary" size="lg">Empezar a derivar pacientes</Button>
            <Button href="mailto:hola@medconnect.es" variant="ghostInv" size="lg">Hablar con ventas</Button>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
