/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow HMR from local network IP (fixes "Blocked cross-origin request" warning)
  allowedDevOrigins: ['192.168.56.1', '192.168.1.*', '10.*.*.*', '172.*.*.*'],
};

export default nextConfig;
