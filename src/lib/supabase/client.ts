'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Env resolution.
 *
 * This is a Next.js app, so only `NEXT_PUBLIC_*` variables are inlined into the
 * client bundle by the compiler. `VITE_*` names are supported as well because
 * next.config.ts maps them through the `env` option — without that mapping they
 * would be `undefined` in the browser. Both spellings are accepted so whichever
 * pair is configured in Vercel works.
 *
 * References must be to the full `process.env.X` expression, not a computed
 * lookup: the compiler performs a literal text substitution at build time.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';

const SUPABASE_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    '';

export interface EnvStatus {
    configured: boolean;
    missing: string[];
}

export function envStatus(): EnvStatus {
    const missing: string[] = [];
    if (!SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!SUPABASE_KEY) missing.push('SUPABASE_PUBLISHABLE_KEY');

    return { configured: missing.length === 0, missing };
}

let cached: SupabaseClient | null = null;

/**
 * Lazily created browser client. Returns `null` when env vars are absent so the
 * app can render a setup screen instead of throwing during module evaluation
 * (which would blank the page on a misconfigured deploy).
 */
export function getSupabase(): SupabaseClient | null {
    if (!envStatus().configured) return null;
    if (cached) return cached;

    cached = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'cream-money.auth'
        }
    });

    return cached;
}

/** Human-readable message for a Supabase/PostgREST error. */
export function describeError(error: unknown): string {
    if (!error) return 'Unknown error.';
    if (typeof error === 'string') return error;
    const e = error as { message?: string; code?: string; details?: string; hint?: string };

    // The two failures most likely to hit a fresh install, translated into
    // something actionable rather than a raw PostgREST code.
    if (e.code === '42P01') {
        return 'Database tables are missing. Run the SQL migration in your Supabase project (supabase/migrations/0001_init.sql).';
    }
    if (e.code === '42501' || e.message?.includes('row-level security')) {
        return 'Blocked by row level security. Make sure the RLS policies from the migration were applied.';
    }

    return e.message ?? e.details ?? 'Unexpected database error.';
}
