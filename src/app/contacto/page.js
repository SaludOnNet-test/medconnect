import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Eyebrow from '@/components/brand/Eyebrow';
import Icon from '@/components/icons/Icon';
import ContactForm from './ContactForm';

export const metadata = {
  title: 'Contacto — Med Connect',
  description: 'Escríbenos a hola@medconnect.es o envíanos un mensaje. Respuesta en menos de 24 h hábiles.',
};

const ROWS = [
  {
    icon: 'mail',
    label: 'Email',
    value: 'hola@medconnect.es',
    href: 'mailto:hola@medconnect.es',
    sub: 'Respuesta en menos de 24 h hábiles',
  },
  {
    icon: 'phone',
    label: 'Teléfono',
    value: '91 197 70 52',
    href: 'tel:+34911977052',
    sub: 'Lunes a viernes de 9:00 a 20:00',
  },
  {
    icon: 'map-pin',
    label: 'Oficina',
    value: 'Madrid, España',
    sub: 'Atención exclusivamente online y telefónica',
  },
  {
    icon: 'briefcase-medical',
    label: 'Para clínicas',
    value: 'hola@medconnect.es',
    href: 'mailto:hola@medconnect.es?subject=Alta%20cl%C3%ADnica',
    sub: 'Demo en 48 h',
  },
];

export default function ContactoPage() {
  return (
    <>
      <Header />
      <PageHeader
        eyebrow="Contacto"
        title={<>Te <em>escuchamos.</em></>}
        lede="Lo más probable es que la respuesta esté en la FAQ. Si no, dinos y te respondemos en menos de 24 h hábiles."
      />

      <section className="info-section">
        <div className="container">
          <div className="form-split">
            <div className="contact-rows">
              {ROWS.map((r) => (
                <div key={r.label} className="contact-row">
                  <Icon name={r.icon} size={22} className="contact-row-icon" />
                  <div>
                    <div className="contact-row-label">{r.label}</div>
                    {r.href
                      ? <a className="contact-row-value" href={r.href}>{r.value}</a>
                      : <div className="contact-row-value">{r.value}</div>}
                    {r.sub && <div className="contact-row-sub">{r.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Eyebrow style={{ marginBottom: 'var(--space-3)' }}>Mensaje directo</Eyebrow>
              <h2 className="info-section-title" style={{ marginTop: 0 }}>
                Cuéntanos qué <em>necesitas</em>.
              </h2>
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
