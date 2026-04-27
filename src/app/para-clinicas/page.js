import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Eyebrow from '@/components/brand/Eyebrow';
import Icon from '@/components/icons/Icon';
import ClinicLeadForm from './ClinicLeadForm';

export const metadata = {
  title: 'Para clínicas — Med Connect',
  description: 'Recibe pacientes asegurados y cobra una compensación adicional por cada hueco prioritario. Sin coste para tu clínica.',
};

const BENEFITS = [
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

const REV_CELLS = [
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

export default function ParaClinicasPage() {
  return (
    <>
      <Header />
      <PageHeader
        dark
        eyebrow="Para clínicas"
        title={<>Cobra <em>más</em> por los mismos pacientes asegurados.</>}
        lede="Tú sigues facturando la consulta a la aseguradora como siempre. Med Connect te paga, además, una compensación por cada hueco prioritario que cubras. Mismo paciente, mismo acto médico, ingreso adicional."
      />

      <section className="info-section info-section--alt">
        <div className="container">
          <Eyebrow>El cálculo</Eyebrow>
          <h2 className="info-section-title">
            Misma agenda. <em>Más ingreso por hueco.</em>
          </h2>
          <div className="revcalc">
            {REV_CELLS.map((c) => (
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
        </div>
      </section>

      <section className="info-section">
        <div className="container">
          <Eyebrow>Por qué clínicas como la tuya nos eligen</Eyebrow>
          <h2 className="info-section-title">
            Tres razones <em>que ya no se discuten</em>.
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

      <section className="info-section info-section--alt" id="alta">
        <div className="container">
          <div className="form-split">
            <div>
              <Eyebrow>Solicitar alta</Eyebrow>
              <h2 className="info-section-title">Cuéntanos sobre tu clínica.</h2>
              <p className="info-section-lede">
                Te respondemos en 48 h con un plan de integración. Sin compromiso.
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
