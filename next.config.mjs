/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {
        instrumentationHook: true,
        serverActions: {
            bodySizeLimit: '50mb',
        },
    },
};

export default nextConfig;
