/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    // Incident reports include multiple base64-encoded images/videos; raise the limit.
    serverBodySizeLimit: '50mb',
    experimental: {
        instrumentationHook: true,
        serverActions: {
            bodySizeLimit: '50mb',
        },
    },
};

export default nextConfig;
