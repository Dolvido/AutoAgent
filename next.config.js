/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Completely exclude problematic modules from the client bundle
  webpack: (config, { isServer }) => {
    // If it's a client-side build, exclude Node.js specific modules
    if (!isServer) {
      // Prevent server-only modules from being included in the client bundle
      config.resolve.fallback = {
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        child_process: false,
        net: false,
        tls: false,
      };
    }

    // Add specific exclusions for binary modules
    config.module.rules.push({
      test: /onnxruntime-node|\.node$/,
      use: 'null-loader',
    });

    return config;
  },
};

module.exports = nextConfig; 