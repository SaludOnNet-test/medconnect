import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Eyebrow from '@/components/brand/Eyebrow';
import { PriceLadder } from '@/components/brand/PriceTier';
import Button from '@/components/brand/Button';
import HowItWorks from '@/components/HowItWorks';

export const metadata = {
  title: 'Cómo funciona — Med Connect',
  description: 'Reserva prioritaria en clínicas concertadas con tu aseguradora. Pagas la prioridad, no la consulta. Tarifas transparentes desde 4,99 €.',
};

const REALITIES = [
  {
    n: '01',
    title: 'Tu cuadro médico está saturado, no completo',
    body: 'Cuando tu seguro dice "no hay citas disponibles", no significa que la clínica esté llena. Significa que la clínica reserva ciertos huecos a otras vías de captación. Una de esas vías es la nuestra.',
  },
  {
    n: '02',
    title: 'La consulta no cuesta más por venir con nosotros',
    body: 'La factura va de la clínica a tu aseguradora, exactamente igual que si hubieras pedido cita por la app del seguro. Nada cambia para tu póliza ni para tu copago.',
  },
  {
    n: '03',
    title: 'La tarifa de prioridad es transparente y separada',
    body: 'No hay letra pequeña. Lo que pagas a Med Connect aparece desglosado y nunca tocamos el acto médico. Si cancelas con 24 h de antelación, te lo devolvemos íntegro.',
  },
];

export default function ComoFuncionaPage() {
  return (
    <>
      <Header />
      <PageHeader
        eyebrow="Cómo funciona"
        title={<>El atajo <em>legítimo</em> cuando tu seguro no te da cita.</>}
        lede="No somos una alternativa a tu seguro. Somos lo que pasa entre tu seguro y tu cita."
      />
      <HowItWorks />

      <section className="info-section">
        <div className="container info-section-inner">
          <Eyebrow>Lo que tu seguro no te explica</Eyebrow>
          <h2 className="info-section-title">
            Tres realidades que la app de tu aseguradora no te <em>va a contar</em>.
          </h2>
          <div className="reality-list">
            {REALITIES.map((r) => (
              <div key={r.n} className="reality-row">
                <span className="reality-n">{r.n}</span>
                <div>
                  <h3 className="reality-title">{r.title}</h3>
                  <p className="reality-body">{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="info-section info-section--alt" id="tarifas">
        <div className="container">
          <Eyebrow>Tarifa de prioridad</Eyebrow>
          <h2 className="info-section-title">
            Pagas la prioridad, <em>no la consulta.</em>
          </h2>
          <p className="info-section-lede">
            Cuanta más urgencia, mayor la tarifa. Eliges tú.
          </p>
          <PriceLadder highlight={2} />
          <p className="info-section-note">
            La consulta médica la cubre tu aseguradora. Med Connect cobra solo la tarifa de prioridad, separada y desglosada.
          </p>
        </div>
      </section>

      <section className="cta-section on-inverse">
        <div className="cta-noise" aria-hidden="true" />
        <div className="container cta-inner">
          <Eyebrow dark>Tu cuenta · gratis</Eyebrow>
          <h2 className="cta-title">
            Empieza a reservar <em>en un minuto</em>.
          </h2>
          <p className="cta-lede">
            Crea tu cuenta gratuita y accede a tu historial de reservas, recibe recordatorios y gestiona tus citas desde cualquier dispositivo.
          </p>
          <div className="cta-actions">
            <Button href="/sign-up" variant="primary" size="lg">Crear cuenta gratis</Button>
            <Button href="/" variant="ghostInv" size="lg">Buscar mi cita</Button>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
