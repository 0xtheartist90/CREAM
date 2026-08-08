import type { NextConfig } from 'next';

// https://nextjs.org/docs/pages/api-reference/next-config-js
const nextConfig: NextConfig = {
    // `standalone` exists for self-hosting via the bundled Dockerfiles. On
    // Vercel it emits a second copy of the build for no benefit, so it is
    // only enabled off-platform (VERCEL is set during Vercel builds).
    output: process.env.VERCEL ? undefined : 'standalone',
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com'
            }
        ]
    }
};

export default nextConfig;
