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

// Image generator routes (`/icon`, `/apple-icon`, `/opengraph-image`,
// `/twitter-image`, `/favicon.ico`) return PNG/ICO bytes — they're
// referenced from `<link rel="icon">` and OG tags, never browsed
// directly. Google was registering them in the "Crawled - currently
// not indexed" bucket because it followed the bytes from the parent
// HTML and tried to index the binary URL itself as a separate page
// (Search Console 2026-05-07 export). Tagging them noindex stops that
// without affecting how social-media scrapers fetch the OG image (they
// don't care about the X-Robots-Tag, only Google does).
const imageGeneratorHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/api/:path*', headers: [...securityHeaders, ...apiHeaders] },
      // The route segments below need explicit matchers (no glob)
      // because the file-based routes don't include trailing path
      // segments — `/icon` is the full path Next.js generates from
      // `src/app/icon.js`, etc. The `(:hash)?` optional capture
      // handles Next.js's content-hash query suffix
      // (e.g. `/icon?26ae491debae8993`) which Google was treating as a
      // distinct URL.
      { source: '/icon', headers: imageGeneratorHeaders },
      { source: '/apple-icon', headers: imageGeneratorHeaders },
      { source: '/opengraph-image', headers: imageGeneratorHeaders },
      { source: '/twitter-image', headers: imageGeneratorHeaders },
      { source: '/favicon.ico', headers: imageGeneratorHeaders },
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
