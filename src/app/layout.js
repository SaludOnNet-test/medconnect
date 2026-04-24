import './globals.css';
import CookieBanner from '@/components/CookieBanner';

export const metadata = {
  title: 'Med Connect — Tu cita médica privada, sin esperas',
  description: 'Reserva citas médicas privadas y diagnósticos con acceso prioritario. Tu salud no puede esperar.',
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
