'use client';

import { useState } from 'react';

import { CheckCircle2, Database, Loader2, Lock, Mail, TriangleAlert, Wallet } from 'lucide-react';

import { useAuth } from '@/lib/finance/auth';

import { Banner, Button, Card, Field, Input } from './ui';

type Mode = 'signin' | 'signup';

/** Shown when the Supabase environment variables are absent. */
export function SetupScreen({ missing }: { missing: string[] }) {
    return (
        <div className='bg-bg flex min-h-screen items-center justify-center p-4'>
            <Card className='w-full max-w-lg'>
                <div className='bg-warning-soft text-warning mb-4 flex size-11 items-center justify-center rounded-[13px]'>
                    <Database className='size-5' />
                </div>
                <h1 className='text-text text-[18px] font-semibold tracking-tight'>Supabase isn&apos;t configured</h1>
                <p className='text-text-muted mt-1.5 text-[13px] leading-relaxed'>
                    CREAM money stores your finances in Supabase. Add these environment variables and redeploy:
                </p>

                <div className='bg-surface-2 border-line mt-4 space-y-2 rounded-[12px] border p-3'>
                    {missing.map((key) => (
                        <div key={key} className='flex items-center gap-2'>
                            <TriangleAlert className='text-warning size-3.5 shrink-0' />
                            <code className='text-text font-mono text-[12px]'>
                                NEXT_PUBLIC_{key} <span className='text-text-faint'>or</span> VITE_{key}
                            </code>
                        </div>
                    ))}
                </div>

                <p className='text-text-faint mt-4 text-[11.5px] leading-relaxed'>
                    Find both values in your Supabase dashboard under <strong>Project Settings → API</strong>. Then run{' '}
                    <code className='font-mono'>supabase/migrations/0001_init.sql</code> in the SQL Editor to create the
                    tables and row level security policies.
                </p>
            </Card>
        </div>
    );
}

export function AuthScreen() {
    const { signIn, signUp, sendPasswordReset } = useAuth();

    const [mode, setMode] = useState<Mode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        setNotice(null);

        const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password);

        setBusy(false);
        if (!result.ok) {
            setError(result.error ?? 'Something went wrong.');

            return;
        }
        if (result.needsEmailConfirmation) {
            setNotice(`Check ${email.trim()} for a confirmation link, then sign in.`);
            setMode('signin');
            setPassword('');
        }
        // On success the auth listener swaps this screen for the app.
    };

    const resetPassword = async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        const result = await sendPasswordReset(email);
        setBusy(false);
        if (!result.ok) {
            setError(result.error ?? 'Could not send the reset email.');

            return;
        }
        setNotice(`If an account exists for ${email.trim()}, a reset link is on its way.`);
    };

    return (
        <div className='bg-bg flex min-h-screen flex-col items-center justify-center p-4'>
            <div className='w-full max-w-[400px]'>
                <div className='mb-6 flex flex-col items-center text-center'>
                    <div className='bg-accent mb-3 flex size-11 items-center justify-center rounded-[14px]'>
                        <Wallet className='size-5.5 text-white' />
                    </div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>CREAM money</h1>
                    <p className='text-text-muted mt-1 text-[13px]'>
                        {mode === 'signin' ? 'Sign in to your finances' : 'Create your account'}
                    </p>
                </div>

                <Card>
                    <div className='bg-surface-2 border-line mb-4 grid grid-cols-2 gap-1 rounded-[12px] border p-1'>
                        {(['signin', 'signup'] as const).map((m) => (
                            <button
                                key={m}
                                type='button'
                                onClick={() => {
                                    setMode(m);
                                    setError(null);
                                    setNotice(null);
                                }}
                                className={`h-9 cursor-pointer rounded-[9px] text-[12.5px] font-medium transition-all ${
                                    mode === m ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
                                }`}>
                                {m === 'signin' ? 'Sign in' : 'Sign up'}
                            </button>
                        ))}
                    </div>

                    <div className='space-y-3'>
                        <Field label='Email' required>
                            <div className='relative'>
                                <Mail className='text-text-faint pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2' />
                                <Input
                                    type='email'
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder='you@example.com'
                                    autoComplete='email'
                                    className='pl-9'
                                    onKeyDown={(e) => e.key === 'Enter' && void submit()}
                                />
                            </div>
                        </Field>

                        <Field
                            label='Password'
                            required
                            hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
                            <div className='relative'>
                                <Lock className='text-text-faint pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2' />
                                <Input
                                    type='password'
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder='••••••••'
                                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                    className='pl-9'
                                    onKeyDown={(e) => e.key === 'Enter' && void submit()}
                                />
                            </div>
                        </Field>

                        {error ? (
                            <Banner tone='negative' icon={<TriangleAlert className='size-4' />}>
                                {error}
                            </Banner>
                        ) : null}
                        {notice ? (
                            <Banner tone='positive' icon={<CheckCircle2 className='size-4' />}>
                                {notice}
                            </Banner>
                        ) : null}

                        <Button variant='primary' size='lg' className='w-full' onClick={submit} disabled={busy}>
                            {busy ? (
                                <Loader2 className='size-4 animate-spin' />
                            ) : mode === 'signin' ? (
                                'Sign in'
                            ) : (
                                'Create account'
                            )}
                        </Button>

                        {mode === 'signin' ? (
                            <button
                                type='button'
                                onClick={resetPassword}
                                disabled={busy}
                                className='text-text-muted hover:text-accent w-full cursor-pointer text-center text-[12px] transition-colors disabled:opacity-50'>
                                Forgot your password?
                            </button>
                        ) : null}
                    </div>
                </Card>

                <p className='text-text-faint mt-4 text-center text-[11.5px] leading-relaxed'>
                    Your financial data is stored in your own Supabase project and protected by row level security — only
                    you can read it.
                </p>
            </div>
        </div>
    );
}
