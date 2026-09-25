import { fileURLToPath } from 'node:url';

// ---- API_URL is read at build time, so Docker and Vercel must pass it as a build argument (red-team #43) ----

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('..', import.meta.url)),
  transpilePackages: ['@seat-ase/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
