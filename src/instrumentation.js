// Next.js 16 server-side observability hook. Runs once at server start
// (`register`) and on every uncaught request error (`onRequestError`). We use
// it to forward server errors to Sentry through the lightweight transport in
// `src/lib/sentry.js`. No-op until SENTRY_DSN is set in the environment.

export function register() {
  // Reserved for future OpenTelemetry / startup hooks. Nothing to do today.
}

export async function onRequestError(error, request, context) {
  // Avoid importing sentry at module-load time so the lambda cold-start cost
  // stays minimal when no error happens. Dynamic import is cached after the
  // first call.
  try {
    const { captureException } = await import('@/lib/sentry');
    await captureException(error, {
      request: {
        path: request?.path,
        method: request?.method,
      },
      context: {
        routerKind: context?.routerKind,
        routePath: context?.routePath,
        routeType: context?.routeType,
        renderSource: context?.renderSource,
      },
    });
  } catch {
    // Last-ditch — never let observability crash the server.
  }
}
