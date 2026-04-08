import './globals.css';

export const metadata = {
  title: 'Med Connect — Tu cita médica privada, sin esperas',
  description: 'Reserva citas médicas privadas y diagnósticos con acceso prioritario. Tu salud no puede esperar.',
};

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function RootLayout({ children }) {
  if (hasClerkKeys) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ClerkProvider } = require('@clerk/nextjs');
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
