import Script from 'next/script';
import './globals.css';

export const metadata = {
  title: 'Med Connect — Tu cita médica privada, sin esperas',
  description: 'Reserva citas médicas privadas y diagnósticos con acceso prioritario. Tu salud no puede esperar.',
};

// Build-time flags — NEXT_PUBLIC_ vars are inlined at build time
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const GA4_ID         = process.env.NEXT_PUBLIC_GA4_ID;
const CLARITY_ID     = process.env.NEXT_PUBLIC_CLARITY_ID;

function AnalyticsScripts() {
  return (
    <>
      {/* Google Analytics 4 */}
      {GA4_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA4_ID}', { page_path: window.location.pathname });
          `}</Script>
        </>
      )}

      {/* Microsoft Clarity */}
      {CLARITY_ID && (
        <Script id="clarity-init" strategy="afterInteractive">{`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window,document,"clarity","script","${CLARITY_ID}");
        `}</Script>
      )}
    </>
  );
}

export default async function RootLayout({ children }) {
  if (publishableKey) {
    const { ClerkProvider } = await import('@clerk/nextjs');
    return (
      <html lang="es">
        <body>
          <AnalyticsScripts />
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
        <AnalyticsScripts />
        {children}
      </body>
    </html>
  );
}
