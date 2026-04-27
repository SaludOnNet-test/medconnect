/** @type {import('next').NextConfig} */
const nextConfig = {
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
