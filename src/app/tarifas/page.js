import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { STANDARD_TIERS, PARTNER_DISCOUNT_PCT } from '@/lib/pricing';
import { formatEUR } from '@/lib/format';

/**
 * /tarifas — published list of our "tarifa habitual" rates.
 *
 * 2026-06-08. Publishing this page satisfies Real Decreto-ley 24/2021's
 * requirement that any "precio anterior" anchor be a price actually in
 * effect — by listing €39/€29/€19/€10 here as our official list rate,
 * the strikethrough used across the funnel (cards, modal, /book,
 * Stripe summary) is defensible. The "Oferta de lanzamiento" framing
 * is then a current promotion on the listed rates, not a fabricated
 * past-price claim.
 *
 * Marked dynamic = false (force-static) — content is fixed.
 */

export const metadata = {
  title: 'Tarifas — Med Connect',
  description: 'Tarifa habitual y precios actuales de la tarifa de prioridad de Med Connect.',
  alternates: { canonical: 'https://www.medconnect.es/tarifas' },
};

// Mirrors the ACTIVE_PRICE_BY_TIER in src/lib/pricing.js.
// Duplicated here to render the table on the server; do not edit one
// without editing the other.
// 2026-06-24 — Bajada de precios. Owner-approved.
const ACTIVE = { 1: 19, 2: 15, 3: 8, 4: 4 };
const LABELS = {
  1: 'Cita esta semana',
  2: 'Cita la próxima semana',
  3: 'Cita este mes',
  4: 'Cita más adelante',
};

export default function TarifasPage() {
  return (
    <>
      <Header />
      <main style={{ padding: 'var(--space-6) 0 var(--space-7)' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.75rem, 4vw, 2.4rem)',
              fontWeight: 800,
              color: 'var(--ink-1000)',
              marginBottom: 'var(--space-3)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Nuestras tarifas de prioridad
          </h1>
          <p
            style={{
              color: 'var(--fg-muted)',
              fontSize: '1.05rem',
              lineHeight: 1.6,
              marginBottom: 'var(--space-5)',
            }}
          >
            Med Connect cobra una tarifa fija por gestionarte una cita prioritaria con
            clínicas concertadas con tu seguro. La <strong>tarifa habitual</strong> depende de
            cuándo necesites la cita. Actualmente todas las tarifas tienen un descuento
            de <strong>oferta de lanzamiento</strong>.
          </p>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: 'var(--space-6)',
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden',
              fontSize: '0.95rem',
            }}
          >
            <thead style={{ background: 'var(--bone-100)' }}>
              <tr>
                <th style={cellHeadStyle}>Cuándo es la cita</th>
                <th style={cellHeadStyle}>Tarifa habitual</th>
                <th style={cellHeadStyle}>Oferta de lanzamiento</th>
                <th style={cellHeadStyle}>Ahorras</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD_TIERS.map((row) => {
                const active = ACTIVE[row.tier];
                const savings = row.standard - active;
                return (
                  <tr key={row.tier} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={cellStyle}>{LABELS[row.tier]}</td>
                    <td style={{ ...cellStyle, textDecoration: 'line-through', color: 'var(--fg-muted)' }}>
                      {formatEUR(row.standard)}
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--ink-1000)' }}>
                      {formatEUR(active)}
                    </td>
                    <td style={{ ...cellStyle, color: '#1b4332', fontWeight: 600 }}>
                      −{formatEUR(savings)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2
            style={{
              fontSize: '1.3rem',
              fontWeight: 700,
              color: 'var(--ink-1000)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Descuento adicional en centros destacados
          </h2>
          <p style={{ color: 'var(--fg-muted)', lineHeight: 1.65, marginBottom: 'var(--space-4)' }}>
            Algunas clínicas de nuestra red, identificadas como{' '}
            <strong>centros destacados</strong>, ofrecen un descuento adicional del{' '}
            <strong>{Math.round(PARTNER_DISCOUNT_PCT * 100)}%</strong> sobre la oferta de
            lanzamiento. Verás el descuento aplicado directamente en la tarjeta del centro y
            en el resumen del pago antes de confirmar la reserva.
          </p>
          <p style={{ color: 'var(--fg-muted)', lineHeight: 1.65, marginBottom: 'var(--space-6)' }}>
            La lista de centros destacados se actualiza periódicamente. Centros actualmente
            destacados: <strong>Centro Médico Cea Bermúdez</strong>.
          </p>

          <h2
            style={{
              fontSize: '1.3rem',
              fontWeight: 700,
              color: 'var(--ink-1000)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Qué incluye la tarifa
          </h2>
          <ul style={{ color: 'var(--fg-muted)', lineHeight: 1.8, paddingLeft: '1.25rem', marginBottom: 'var(--space-5)' }}>
            <li>Gestión y reserva del hueco prioritario con la clínica.</li>
            <li>Confirmación por email + recordatorios automáticos antes de la cita.</li>
            <li>
              <strong>Cancelación gratuita hasta 24 h antes de la cita</strong> — por
              cualquier motivo. Reembolso íntegro en 72 h. También si no encontramos
              hueco con tu seguro.
            </li>
          </ul>

          <h2
            style={{
              fontSize: '1.3rem',
              fontWeight: 700,
              color: 'var(--ink-1000)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Qué NO incluye
          </h2>
          <p style={{ color: 'var(--fg-muted)', lineHeight: 1.65, marginBottom: 'var(--space-6)' }}>
            La consulta médica en sí. Si tienes seguro privado, tu póliza cubre la consulta
            directamente con la clínica — solo nos pagas la tarifa de prioridad. Si no
            tienes seguro, el coste de la consulta se añade aparte y se muestra
            transparentemente antes de pagar.
          </p>

          <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)', fontStyle: 'italic' }}>
            Estas tarifas están vigentes desde el 24 de junio de 2026. Cualquier
            actualización se publicará en esta misma página con la nueva fecha de vigencia.
            Consulta los{' '}
            <Link href="/legal" style={{ color: 'var(--ink-1000)', textDecoration: 'underline' }}>
              términos legales
            </Link>{' '}
            para más información.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

const cellHeadStyle = {
  padding: '14px 16px',
  textAlign: 'left',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: 'var(--ink-1000)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const cellStyle = {
  padding: '14px 16px',
  fontSize: '0.95rem',
  color: 'var(--fg)',
};
