// Dev-only brand preview page — render every primitive on a single page
// for design review. Not linked from anywhere; navigate to /brand-preview
// in dev. Mirrors the kit's preview/components-*.html demos.
import Eyebrow from '@/components/brand/Eyebrow';
import Button from '@/components/brand/Button';
import Card from '@/components/brand/Card';
import Input from '@/components/brand/Input';
import Accordion from '@/components/brand/Accordion';
import { PriceLadder } from '@/components/brand/PriceTier';
import StatBlock from '@/components/brand/StatBlock';
import PageHeader from '@/components/brand/PageHeader';
import AnnouncementBar from '@/components/brand/AnnouncementBar';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/icons/Icon';

export const metadata = {
  title: 'Brand preview — Med Connect (dev only)',
  robots: { index: false, follow: false },
};

const FAQ_ITEMS = [
  { q: 'Si ya tengo seguro, ¿por qué tengo que pagaros algo?', a: <p>Porque tu seguro te garantiza la consulta, pero no el cuándo. Cuando necesitas cita esta semana y tu cuadro médico te ofrece dentro de un mes, somos el atajo legítimo.</p> },
  { q: '¿Qué pasa cuando llegue a la clínica?', a: <p>Acudes con tu tarjeta de asegurado. Te atienden bajo tu póliza. La clínica factura la consulta a tu aseguradora.</p> },
  { q: '¿Puedo cancelar?', a: <p>Sí, hasta 24 horas antes de la cita y la tarifa de prioridad se reembolsa íntegramente.</p> },
];

export default function BrandPreview() {
  return (
    <>
      <AnnouncementBar />
      <Header />

      <PageHeader
        eyebrow="Brand preview"
        title={<>Sistema visual <em>Med Connect 2026</em>.</>}
        lede="Una página única con todos los primitivos del nuevo sistema de marca: tipografía, botones, inputs, tarjetas, escalera de precios y más. No accesible públicamente."
      />

      <main style={{ maxWidth: 'var(--container)', margin: '0 auto', padding: '0 var(--gutter-desktop) var(--space-9)' }}>

        <section style={{ marginTop: 'var(--space-7)' }}>
          <Eyebrow>Tipografía</Eyebrow>
          <h2 style={{ marginTop: 'var(--space-3)' }}>Editorial display <em>en Fraunces</em></h2>
          <p className="lede" style={{ marginTop: 'var(--space-3)' }}>
            Body en Inter Tight, números y timestamps en JetBrains Mono. Cursivas
            son la única emfática.
          </p>
          <h3 style={{ marginTop: 'var(--space-5)' }}>Heading 3 — sección secundaria</h3>
          <h4 style={{ marginTop: 'var(--space-4)' }}>Heading 4 — subsección</h4>
          <p style={{ marginTop: 'var(--space-3)' }}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
            tempor incididunt ut labore et dolore magna aliqua.
          </p>
          <p className="body-sm" style={{ marginTop: 'var(--space-2)' }}>
            Body small — usado en captions y meta. <code>const x = 9.99;</code>
          </p>
          <div className="price" style={{ marginTop: 'var(--space-4)' }}>9,99 €</div>
        </section>

        <section style={{ marginTop: 'var(--space-9)' }}>
          <Eyebrow>Buttons</Eyebrow>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
            <Button variant="primary" icon={<Icon name="search" size={16} />}>Buscar cita</Button>
            <Button variant="secondary">Iniciar sesión</Button>
            <Button variant="ghost">Cancelar</Button>
            <Button variant="primary" size="sm">Crear cuenta</Button>
            <Button variant="primary" size="lg">Reserva ahora</Button>
          </div>
          <div style={{ background: 'var(--ink-1000)', padding: 'var(--space-5)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Button variant="primary">CTA en Ink</Button>
            <Button variant="ghostInv">Acción secundaria</Button>
          </div>
        </section>

        <section style={{ marginTop: 'var(--space-9)' }}>
          <Eyebrow>Inputs</Eyebrow>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-4)', maxWidth: 720 }}>
            <Input label="Especialidad" placeholder="Dermatología, cardiología…" iconLeft={<Icon name="stethoscope" size={18} />} />
            <Input label="Ciudad" placeholder="Madrid, Valencia…" iconLeft={<Icon name="map-pin" size={18} />} />
            <Input label="Mensaje" as="textarea" placeholder="Cuéntanos qué necesitas…" />
          </div>
        </section>

        <section style={{ marginTop: 'var(--space-9)' }}>
          <Eyebrow>Cards (surface step)</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
            <Card surface="100">
              <h4>Bone 100</h4>
              <p className="body-sm">Default card on the page (Bone 200 background).</p>
            </Card>
            <Card surface="50">
              <h4>Bone 50</h4>
              <p className="body-sm">Elevated, used for cards inside cards.</p>
            </Card>
            <Card surface="ink">
              <h4 style={{ color: 'var(--fg-on-inverse)' }}>Ink</h4>
              <p className="body-sm" style={{ color: 'var(--fg-on-inverse-muted)' }}>Dark surface for contrast.</p>
            </Card>
          </div>
        </section>

        <section style={{ marginTop: 'var(--space-9)' }}>
          <Eyebrow>Stats</Eyebrow>
          <div style={{ display: 'flex', gap: 'var(--space-7)', marginTop: 'var(--space-4)' }}>
            <StatBlock value="214" label="Reseñas verificadas" />
            <StatBlock value="4,8 / 5" label="Trustpilot" accent />
            <StatBlock value="48 h" label="Tiempo medio de respuesta" />
          </div>
        </section>

        <section style={{ marginTop: 'var(--space-9)' }}>
          <Eyebrow>Price ladder</Eyebrow>
          <h2 style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            Tarifa de prioridad
          </h2>
          <PriceLadder highlight={2} />
        </section>

        <section style={{ marginTop: 'var(--space-9)' }}>
          <Eyebrow>Accordion</Eyebrow>
          <h2 style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            Preguntas frecuentes
          </h2>
          <Accordion items={FAQ_ITEMS} defaultOpen={0} />
        </section>

      </main>

      <Footer />
    </>
  );
}
