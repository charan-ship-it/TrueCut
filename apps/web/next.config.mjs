import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the repo-root .env.local / .env (one config for the web app, the worker and the tools) so that
// middleware sees the same sign-in settings as the API routes. Real environment variables win.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const f of ['.env.local', '.env']) {
  const file = path.join(root, f);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // We don't use next/image. Turning the optimizer off removes the /_next/image endpoint that most of
  // Next 14's open advisories go through (DoS, disk growth, AVIF RCE) until we move to a newer Next.
  images: { unoptimized: true },
  async headers() {
    const h = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    if (process.env.NODE_ENV === 'production' && (process.env.NEXTAUTH_URL || '').startsWith('https://')) h.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    return [{ source: '/:path*', headers: h }];
  },
  // workspace packages ship TypeScript source; Next compiles them
  transpilePackages: ['@truecut/shared', '@truecut/config', '@truecut/db', '@truecut/queue', '@truecut/core', '@truecut/engine', '@truecut/storage'],
  experimental: { serverComponentsExternalPackages: ['playwright', 'playwright-core', 'ffmpeg-static', 'image-size', '@anthropic-ai/sdk', 'pg-boss', 'postgres', '@aws-sdk/client-s3', '@aws-sdk/lib-storage', '@aws-sdk/s3-request-presigner'] },
  webpack: (config) => { config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }; return config; },
};
export default nextConfig;
