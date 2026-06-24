import { Suspense } from 'react';
import { Fraunces, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import CookieBanner from '@/components/CookieBanner';
import WhatsAppFAB from '@/components/WhatsAppFAB';
import PageViewTracker from '@/components/PageViewTracker';
import AnonVisitTracker from '@/components/AnonVisitTracker';

// Brand 2026 typography. Variables here flow into `var(--font-display)`,
// `--font-body`, and `--font-mono` declared in globals.css. Fraunces is loaded
// across its full optical-size axis so headings scale (opsz 9 → 144).
//
// `adjustFontFallback` (next/font default: enabled for sans, opt-in for serif)
// emits a `@font-face fallback` block with `size-adjust`, `ascent-override`
// and `descent-override` tuned to match the real font's metrics. Without
// this, the fallback serif is wider/narrower than Fraunces and every H1/H2
// reflows on font swap — primary CLS-via-FOUT cause on
// /especialistas/[especialidad]/[ciudad] (Clarity 1.1 → reduced once swap
// is metric-matched). `preload: true` and explicit `fallback` arrays make
// the swap as cheap as possible.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
  preload: true,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
});
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  adjustFontFallback: 'Arial',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

const fontClassNames = `${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable}`;

export const metadata = {
  metadataBase: new URL('https://www.medconnect.es'),
  title: 'Med Connect — Tu cita médica privada, sin esperas',
  description: 'Reserva citas médicas privadas y diagnósticos con acceso prioritario. Tu salud no puede esperar.',
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: 'https://www.medconnect.es',
    siteName: 'Med Connect',
    title: 'Med Connect — Tu cita médica privada, sin esperas',
    description: 'Reserva citas médicas privadas y diagnósticos con acceso prioritario. Tu salud no puede esperar.',
    // og:image is injected automatically by src/app/opengraph-image.js
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Med Connect — Tu cita médica privada, sin esperas',
    description: 'Reserva citas médicas privadas y diagnósticos con acceso prioritario. Tu salud no puede esperar.',
    // twitter:image is injected automatically by src/app/twitter-image.js
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Med Connect',
  url: 'https://www.medconnect.es',
  logo: 'https://www.medconnect.es/logo.png',
  description: 'Plataforma de reserva de citas médicas privadas con acceso prioritario. Especialistas de todas las especialidades en las principales ciudades de España.',
  email: 'info@medconnect.es',
  areaServed: { '@type': 'Country', name: 'España' },
  serviceType: 'Reserva de citas médicas privadas',
  sameAs: [
    'https://www.google.com/maps/place/MedConnect/data=!4m2!3m1!1s0xd4183a410c7f5e1:0x6aeb657b640c08c9',
  ],
};

// GA4 and Clarity are loaded ONLY after cookie consent (inside CookieBanner)
//
// Defensive trim — the Vercel env var was set with a trailing newline
// (`pk_test_…JA\n`) which made Clerk reject the key silently. ClerkJS would
// fail to initialize, and any page that calls `useUser()` (incl.
// /search-v2, /sign-in, /sign-up via the SignIn/SignUp widgets) would
// hang forever inside its Suspense boundary. Sanitizing here keeps the
// app working even if the env var picks up whitespace again. The proper
// fix is on the Vercel side — edit NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and
// strip the trailing whitespace.
const rawPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const publishableKey = rawPublishableKey ? rawPublishableKey.trim() : '';

// Preconnect hints — start the TLS handshake to third-party origins
// during the initial paint so that, when the corresponding script/tile
// is requested later, the connection is already warm and the resource
// downloads in one RTT instead of three.
//
//   js.stripe.com    — Stripe Elements bundle. Lazy-loaded via PaymentForm
//                      (PR #69) so the warm handshake matters most for the
//                      first patient that reaches the payment step.
//   api.stripe.com   — POST /api/payments + 3-D Secure round-trip.
//   tile.openstreetmap.org — Leaflet tile server, used in
//                      /especialistas + /search-v2.
//
// Clerk is NOT preconnected because clerk.medconnect.es is on our own
// domain (already warm via the apex connection) and over-using
// preconnect hurts more than helps (browsers cap at ~6 origins).
function PerformanceHints() {
  return (
    <>
      <link rel="preconnect" href="https://js.stripe.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://api.stripe.com" />
      <link rel="dns-prefetch" href="https://tile.openstreetmap.org" />
    </>
  );
}

export default async function RootLayout({ children }) {
  if (publishableKey) {
    const { ClerkProvider } = await import('@clerk/nextjs');
    return (
      <html lang="es" className={fontClassNames}>
        <head>
          <PerformanceHints />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
          />
        </head>
        <body>
          <ClerkProvider publishableKey={publishableKey}>
            {children}
          </ClerkProvider>
          <CookieBanner />
          <WhatsAppFAB />
          {/* 2026-06-08 — fires page_viewed on every route change.
              useSearchParams forces Suspense in Next 16. The tracker
              is no-op until consent is granted. */}
          <Suspense fallback={null}>
            <PageViewTracker />
          </Suspense>
          {/* 2026-06-22 — anon visit counter, fires unconditionally.
              No PII; aggregate-only (path, date, count). Cierra el 8×
              gap entre Clarity y analytics_events que viene del consent
              gate sobre page_viewed. */}
          <Suspense fallback={null}>
            <AnonVisitTracker />
          </Suspense>
        </body>
      </html>
    );
  }

  return (
    <html lang="es" className={fontClassNames}>
      <head>
        <PerformanceHints />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body>
        {children}
        <CookieBanner />
        <WhatsAppFAB />
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        <Suspense fallback={null}>
          <AnonVisitTracker />
        </Suspense>
      </body>
    </html>
  );
}
