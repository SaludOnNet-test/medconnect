import './globals.css';

export const metadata = {
  title: 'Med Connect — Tu cita médica privada, sin esperas',
  description: 'Reserva citas médicas privadas y diagnósticos con acceso prioritario. Tu salud no puede esperar.',
};

// Build-time flag — safe to check here because NEXT_PUBLIC_ vars are inlined at build time
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
        </body>
      </html>
    );
  }

  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
