import { Fraunces, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import CookieBanner from '@/components/CookieBanner';

// Brand 2026 typography. Variables here flow into `var(--font-display)`,
// `--font-body`, and `--font-mono` declared in globals.css. Fraunces is loaded
// across its full optical-size axis so headings scale (opsz 9 → 144).
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
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

// GA4 and Clarity are loaded ONLY after cookie consent (inside CookieBanner)
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function RootLayout({ children }) {
  if (publishableKey) {
    const { ClerkProvider } = await import('@clerk/nextjs');
    return (
      <html lang="es" className={fontClassNames}>
        <body>
          <ClerkProvider>
            {children}
          </ClerkProvider>
          <CookieBanner />
        </body>
      </html>
    );
  }

  return (
    <html lang="es" className={fontClassNames}>
      <body>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
