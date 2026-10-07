/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverComponentsExternalPackages: ['playwright', 'playwright-core', 'ffmpeg-static', 'image-size', '@anthropic-ai/sdk'] },
  webpack: (config) => { config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }; return config; },
};
export default nextConfig;
