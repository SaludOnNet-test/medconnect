// Strict-but-pragmatic security headers. CSP is intentionally limited to
// frame-ancestors for now (clickjacking defense on the payment flow); a
// full script-src/connect-src CSP needs browser-tested rollout because it
// has to allow Stripe iframes, Clerk session XHR, OpenStreetMap tiles, and
// Vercel Blob — each one a separate origin.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self)' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
];

const apiHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'no-store, max-age=0' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/api/:path*', headers: [...securityHeaders, ...apiHeaders] },
    ];
  },
  async redirects() {
    return [
      // The two B2B pages were merged into a single
      // /para-clinicas-o-medicos route. Existing inbound links (footer,
      // nav from the old shipped build, external SEO) keep working —
      // each anchor points to the right model section.
      { source: '/para-clinicas', destination: '/para-clinicas-o-medicos#vender-huecos', permanent: true },
      { source: '/derivadores',   destination: '/para-clinicas-o-medicos#derivar-pacientes', permanent: true },
    ];
  },
};

export default nextConfig;
