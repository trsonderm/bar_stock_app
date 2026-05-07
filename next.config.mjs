/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {
        instrumentationHook: true,
        serverActions: {
            bodySizeLimit: '15mb',
        },
    },
};

export default nextConfig;
