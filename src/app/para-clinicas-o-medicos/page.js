import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Eyebrow from '@/components/brand/Eyebrow';
import Button from '@/components/brand/Button';
import Icon from '@/components/icons/Icon';
import ClinicLeadForm from './ClinicLeadForm';

export const metadata = {
  title: 'Para clínicas o médicos — Med Connect',
  description: 'Dos formas de ganar con Med Connect: vende huecos prioritarios de tu agenda y cobra una compensación por cada uno, o deriva pacientes a otras clínicas y cobra una comisión por cada derivación confirmada.',
};

const loginUrl = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? '/sign-up?role=professional'
  : '/pro/login';

const SELL_BENEFITS = [
  {
    icon: 'trending-up',
    title: 'Ingreso adicional por hueco',
    body: 'Por cada paciente que te enviamos cobras tu tarifa concertada habitual de la aseguradora más una compensación nuestra por la prioridad. Mismo trabajo, más ingreso.',
  },
  {
    icon: 'calendar-check-2',
    title: 'Tú decides los huecos',
    body: 'Reservas qué huecos de agenda quedan disponibles para Med Connect. El resto, sigue siendo tuyo y de tu cuadro médico habitual.',
  },
  {
    icon: 'shield-check',
    title: 'Pacientes verificados',
    body: 'Antes de confirmar, verificamos que la póliza está activa y cubre la especialidad. Tasa de no-shows inferior al 4 %.',
  },
];

const SELL_REVCALC = [
  {
    label: 'Lo que ya cobras',
    value: 'Tarifa concertada',
    sub: 'Igual que cualquier cita de tu cuadro médico — facturas a la aseguradora a tu precio habitual.',
    accent: false,
  },
  {
    label: '+ Lo que te pagamos',
    value: 'Compensación por prioridad',
    sub: 'Med Connect te abona una parte de la tarifa que el paciente paga por el hueco prioritario.',
    accent: true,
  },
  {
    label: '= Tu ingreso real',
    value: 'Mayor que una cita normal',
    sub: 'Sin cambiar tarifa concertada, sin coste de captación, sin trabajo administrativo extra.',
    accent: false,
  },
];

const DERIVE_BENEFITS = [
  {
    icon: 'euro',
    title: 'Comisión por cada derivación',
    body: 'Por cada paciente que derivas y reserva, te abonamos una comisión. Cobro mensual a tu cuenta, con factura desglosada. Sin invertir en recursos, equipos ni personal.',
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

const DERIVE_STEPS = [
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

export default function ParaClinicasOMedicosPage() {
  return (
    <>
      <Header />
      <PageHeader
        dark
        eyebrow="Para clínicas o médicos"
        title={<>Dos formas de ganar con <em>Med Connect</em>.</>}
        lede="Si tienes agenda propia, vende huecos prioritarios y cobra una compensación por cada uno. Si derivas pacientes a otras especialidades, cobra una comisión por cada derivación que se confirma. Puedes hacer las dos cosas."
      >
        <div className="cta-actions">
          <Button href="#vender-huecos" variant="primary" size="lg">Vender huecos</Button>
          <Button href="#derivar-pacientes" variant="ghostInv" size="lg">Derivar pacientes</Button>
        </div>
      </PageHeader>

      {/* ── Modelo A — Vender huecos (clínicas con agenda propia) ─────── */}
      <section className="info-section info-section--alt" id="vender-huecos">
        <div className="container">
          <Eyebrow>Modelo A · vender huecos</Eyebrow>
          <h2 className="info-section-title">
            <em>Tienes agenda propia.</em> Cobra más por los mismos pacientes.
          </h2>
          <p className="info-section-lede">
            Para clínicas y centros médicos. Tú sigues facturando la consulta a la aseguradora como
            siempre. Med Connect te paga, además, una compensación por cada hueco prioritario que
            cubras. Mismo paciente, mismo acto médico, ingreso adicional.
          </p>

          <h3 className="info-subsection-title">El cálculo</h3>
          <div className="revcalc">
            {SELL_REVCALC.map((c) => (
              <div key={c.label} className={`revcalc-cell${c.accent ? ' revcalc-cell--accent' : ''}`}>
                <div className="revcalc-label">{c.label}</div>
                <div className="revcalc-value">{c.value}</div>
                <p className="revcalc-sub">{c.sub}</p>
              </div>
            ))}
          </div>
          <p className="info-section-note">
            La compensación exacta depende de especialidad, ciudad y horario. Hablamos contigo en la demo.
          </p>

          <h3 className="info-subsection-title" style={{ marginTop: 'var(--space-9)' }}>Por qué clínicas como la tuya nos eligen</h3>
          <div className="benefit-grid">
            {SELL_BENEFITS.map((b) => (
              <div key={b.title} className="benefit-item">
                <Icon name={b.icon} size={28} className="benefit-icon" />
                <h4 className="benefit-title">{b.title}</h4>
                <p className="benefit-body">{b.body}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'var(--space-7)', display: 'flex', justifyContent: 'center' }}>
            <Button href="#alta" variant="primary" size="lg">Solicitar alta de mi clínica</Button>
          </div>
        </div>
      </section>

      {/* ── Modelo B — Derivar pacientes (médicos sin agenda propia) ──── */}
      <section className="info-section" id="derivar-pacientes">
        <div className="container">
          <Eyebrow>Modelo B · derivar pacientes</Eyebrow>
          <h2 className="info-section-title">
            <em>No cubres esa especialidad.</em> Derívalo y cobra una comisión.
          </h2>
          <p className="info-section-lede">
            Para médicos y profesionales que ven a un paciente que necesita otra especialidad y no
            tienen agenda interna para resolverlo a tiempo. Lo derivas a una clínica de nuestra red,
            tu paciente consigue cita en días y tú cobras una comisión por cada derivación confirmada.
            Sin cobrarle nada al paciente.
          </p>

          <h3 className="info-subsection-title">Lo que ganas tú</h3>
          <div className="benefit-grid">
            {DERIVE_BENEFITS.map((b) => (
              <div key={b.title} className="benefit-item">
                <Icon name={b.icon} size={28} className="benefit-icon" />
                <h4 className="benefit-title">{b.title}</h4>
                <p className="benefit-body">{b.body}</p>
              </div>
            ))}
          </div>

          <h3 className="info-subsection-title" style={{ marginTop: 'var(--space-9)' }}>Tres pasos. Sin papeleo.</h3>
          <div className="reality-list">
            {DERIVE_STEPS.map((s) => (
              <div key={s.n} className="reality-row">
                <span className="reality-n">{s.n}</span>
                <div>
                  <h4 className="reality-title">{s.title}</h4>
                  <p className="reality-body">{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'var(--space-7)', display: 'flex', justifyContent: 'center' }}>
            <Button href={loginUrl} variant="primary" size="lg">Empezar a derivar pacientes</Button>
          </div>
        </div>
      </section>

      {/* ── Combinar ambos modelos ─────────────────────────────────────── */}
      <section className="info-section info-section--alt">
        <div className="container">
          <Eyebrow>Y si haces las dos cosas</Eyebrow>
          <h2 className="info-section-title">
            Tu clínica como <em>red</em>: vendes tus huecos y derivas lo que no cubres.
          </h2>
          <p className="info-section-lede">
            Muchos centros operan los dos modelos a la vez. Con tu agenda interna te llegan pacientes
            asegurados con prioridad y cobras la compensación; cuando un paciente tuyo necesita una
            especialidad que no tienes, lo derivas a la red y cobras una comisión. La misma cuenta
            gestiona ambos flujos.
          </p>
          <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Button href="#alta" variant="primary" size="lg">Solicitar alta</Button>
            <Button href="mailto:hola@medconnect.es" variant="ghost" size="lg">Hablar con ventas</Button>
          </div>
        </div>
      </section>

      {/* ── Alta form ─────────────────────────────────────────────────── */}
      <section className="info-section" id="alta">
        <div className="container">
          <div className="form-split">
            <div>
              <Eyebrow>Solicitar alta</Eyebrow>
              <h2 className="info-section-title" style={{ marginTop: 'var(--space-3)' }}>
                Cuéntanos sobre tu clínica o consulta.
              </h2>
              <p className="info-section-lede">
                Te respondemos en 48 h con un plan adaptado a si quieres vender huecos, derivar pacientes
                o ambas cosas. Sin compromiso.
              </p>
            </div>
            <ClinicLeadForm />
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
