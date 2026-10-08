/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // workspace packages ship TypeScript source; Next compiles them
  transpilePackages: ['@truecut/shared', '@truecut/config', '@truecut/db', '@truecut/queue', '@truecut/core', '@truecut/engine'],
  experimental: { serverComponentsExternalPackages: ['playwright', 'playwright-core', 'ffmpeg-static', 'image-size', '@anthropic-ai/sdk', 'pg-boss', 'postgres'] },
  webpack: (config) => { config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }; return config; },
};
export default nextConfig;
