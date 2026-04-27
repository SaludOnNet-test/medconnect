// Client-side observability bootstrap. Runs before the app becomes interactive.
// Forwards uncaught errors and unhandled promise rejections to Sentry via the
// lightweight transport in `src/lib/sentry.js`. No-op when SENTRY_DSN is not
// exposed to the client (NEXT_PUBLIC_SENTRY_DSN).

if (typeof window !== 'undefined') {
  // Inline the public DSN check so we don't import the Sentry module on every
  // page when no DSN is configured.
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (dsn) {
    // Bridge process.env so the shared transport reads the same DSN. The
    // server-side helper looks at SENTRY_DSN; on the client we only have the
    // NEXT_PUBLIC_ variant. Mirror it onto the same name.
    if (typeof process !== 'undefined' && process.env && !process.env.SENTRY_DSN) {
      process.env.SENTRY_DSN = dsn;
    }

    let cachedTransport = null;
    const getTransport = async () => {
      if (cachedTransport) return cachedTransport;
      try {
        cachedTransport = await import('@/lib/sentry');
      } catch {
        cachedTransport = { captureException: () => {} };
      }
      return cachedTransport;
    };

    window.addEventListener('error', async (e) => {
      const { captureException } = await getTransport();
      captureException(e.error || new Error(e.message), {
        url: window.location?.href,
        userAgent: navigator?.userAgent,
        from: 'window.onerror',
      });
    });

    window.addEventListener('unhandledrejection', async (e) => {
      const { captureException } = await getTransport();
      const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason ?? 'unhandledrejection'));
      captureException(err, {
        url: window.location?.href,
        userAgent: navigator?.userAgent,
        from: 'unhandledrejection',
      });
    });
  }
}
