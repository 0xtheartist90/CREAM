'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Session, User } from '@supabase/supabase-js';

import { describeError, envStatus, getSupabase } from '@/lib/supabase/client';

export interface AuthResult {
    ok: boolean;
    error?: string;
    /** Set when sign-up succeeded but the address still needs confirming. */
    needsEmailConfirmation?: boolean;
}

interface AuthValue {
    user: User | null;
    session: Session | null;
    /** False until the initial session lookup resolves. */
    ready: boolean;
    configured: boolean;
    missingEnv: string[];
    signIn: (email: string, password: string) => Promise<AuthResult>;
    signUp: (email: string, password: string) => Promise<AuthResult>;
    signOut: () => Promise<void>;
    sendPasswordReset: (email: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');

    return ctx;
}

function validate(email: string, password: string): string | null {
    if (!email.trim()) return 'Enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (!password) return 'Enter your password.';
    if (password.length < 6) return 'Password must be at least 6 characters.';

    return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const env = envStatus();
    const supabase = getSupabase();

    const [session, setSession] = useState<Session | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!supabase) {
            setReady(true);

            return;
        }

        let active = true;

        supabase.auth
            .getSession()
            .then(({ data }) => {
                if (!active) return;
                setSession(data.session);
                setReady(true);
            })
            .catch(() => active && setReady(true));

        // Keeps the app in step with token refreshes, sign-out in another tab,
        // and email-confirmation redirects.
        const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
            if (!active) return;
            setSession(next);
            setReady(true);
        });

        return () => {
            active = false;
            sub.subscription.unsubscribe();
        };
    }, [supabase]);

    const signIn = useCallback<AuthValue['signIn']>(
        async (email, password) => {
            if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
            const invalid = validate(email, password);
            if (invalid) return { ok: false, error: invalid };

            const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
            if (error) {
                return {
                    ok: false,
                    error:
                        error.message === 'Invalid login credentials'
                            ? 'That email and password combination did not match an account.'
                            : describeError(error)
                };
            }

            return { ok: true };
        },
        [supabase]
    );

    const signUp = useCallback<AuthValue['signUp']>(
        async (email, password) => {
            if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
            const invalid = validate(email, password);
            if (invalid) return { ok: false, error: invalid };

            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                    emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
                }
            });
            if (error) return { ok: false, error: describeError(error) };

            // With "Confirm email" enabled, Supabase returns a user but no
            // session until the link is clicked.
            const needsEmailConfirmation = Boolean(data.user) && !data.session;

            return { ok: true, needsEmailConfirmation };
        },
        [supabase]
    );

    const signOut = useCallback(async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        setSession(null);
    }, [supabase]);

    const sendPasswordReset = useCallback<AuthValue['sendPasswordReset']>(
        async (email) => {
            if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
            if (!email.trim()) return { ok: false, error: 'Enter your email address first.' };

            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
            });
            if (error) return { ok: false, error: describeError(error) };

            return { ok: true };
        },
        [supabase]
    );

    const value = useMemo<AuthValue>(
        () => ({
            user: session?.user ?? null,
            session,
            ready,
            configured: env.configured,
            missingEnv: env.missing,
            signIn,
            signUp,
            signOut,
            sendPasswordReset
        }),
        [session, ready, env.configured, env.missing, signIn, signUp, signOut, sendPasswordReset]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
