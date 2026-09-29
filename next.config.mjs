/** @type {import('next').NextConfig} */
const nextConfig = {
    // Self-contained server bundle used by the Docker image (node server.js).
    output: 'standalone',
    experimental: {
        // Enables src/instrumentation.ts, which starts the background scheduler.
        instrumentationHook: true,
        // Loaded with require() at runtime instead of bundled; systeminformation
        // references optional macOS-only modules that webpack cannot resolve.
        serverComponentsExternalPackages: ['systeminformation'],
    },
};

export default nextConfig;
