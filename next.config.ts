import type { NextConfig } from 'next';

// https://nextjs.org/docs/pages/api-reference/next-config-js
const nextConfig: NextConfig = {
    // `standalone` exists for self-hosting via the bundled Dockerfiles. On
    // Vercel it emits a second copy of the build for no benefit, so it is
    // only enabled off-platform (VERCEL is set during Vercel builds).
    output: process.env.VERCEL ? undefined : 'standalone',
    // Next only inlines `NEXT_PUBLIC_*` into the client bundle. `VITE_*` is a
    // Vite convention and would be undefined in the browser, so map it through
    // explicitly — this lets either naming work wherever the app is deployed.
    env: {
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
        VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
    },
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
