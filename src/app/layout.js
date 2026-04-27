import './globals.css';
import CookieBanner from '@/components/CookieBanner';

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
      <html lang="es">
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
    <html lang="es">
      <body>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
