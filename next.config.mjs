/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  env: {
    API_SERVER: process.env.API_SERVER
  }
};

export default nextConfig;
