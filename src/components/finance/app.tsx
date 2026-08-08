'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { TriangleAlert } from 'lucide-react';

import { useAuth } from '@/lib/finance/auth';
import { useFinance } from '@/lib/finance/store';
import type { AccountType, Transaction, TransactionType } from '@/lib/finance/types';

import { AppShell, type QuickAddAction } from './app-shell';
import { AuthScreen, SetupScreen } from './auth-screen';
import { Dashboard } from './dashboard';
import { AccountForm, RecurringForm, TransactionForm } from './forms';
import { AccountsView } from './view-accounts';
import { BudgetsView } from './view-budgets';
import { MonthlyOverviewView, ProjectionView, ReportsView } from './view-reports';
import { SettingsView } from './view-settings';
import { TransactionsView } from './view-transactions';
import { RecurringView, UpcomingView } from './view-upcoming';

interface TxFormState {
    open: boolean;
    editing: Transaction | null;
    type: TransactionType;
    status: 'actual' | 'projected';
}

const CLOSED_TX: TxFormState = { open: false, editing: null, type: 'expense', status: 'actual' };

export function FinanceApp() {
    const { db, hydrated, updateUi, loadError, reload } = useFinance();
    const { ready: authReady, user, configured, missingEnv } = useAuth();

    const [view, setView] = useState('overview');
    const [txForm, setTxForm] = useState<TxFormState>(CLOSED_TX);
    const [accountForm, setAccountForm] = useState<{ open: boolean; type: AccountType }>({
        open: false,
        type: 'bank'
    });
    const [recurringOpen, setRecurringOpen] = useState(false);

    /* Restore the last section once the database is available. */
    useEffect(() => {
        if (!hydrated) return;
        setView(db.ui.lastView || 'overview');
        // Only on first hydration — later changes are user navigation.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated]);

    const navigate = useCallback(
        (id: string) => {
            setView(id);
            updateUi({ lastView: id });
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
        },
        [updateUi]
    );

    const openTransaction = useCallback((type: TransactionType, status: 'actual' | 'projected' = 'actual') => {
        setTxForm({ open: true, editing: null, type, status });
    }, []);

    const editTransaction = useCallback((tx: Transaction) => {
        setTxForm({ open: true, editing: tx, type: tx.type, status: tx.status });
    }, []);

    const handleQuickAdd = useCallback(
        (action: QuickAddAction) => {
            switch (action) {
                case 'expense':
                    return openTransaction('expense');
                case 'income':
                    return openTransaction('income');
                case 'transfer':
                    return openTransaction('transfer');
                case 'future':
                    return openTransaction('expense', 'projected');
                case 'recurring':
                    return setRecurringOpen(true);
                case 'account':
                    return setAccountForm({ open: true, type: 'bank' });
                case 'pocket':
                    return setAccountForm({ open: true, type: 'pocket' });
            }
        },
        [openTransaction]
    );

    const txById = useMemo(() => new Map(db.transactions.map((t) => [t.id, t])), [db.transactions]);

    const content = useMemo(() => {
        switch (view) {
            case 'transactions':
                return (
                    <TransactionsView onEdit={editTransaction} onAdd={() => openTransaction('expense')} />
                );
            case 'budgets':
                return <BudgetsView />;
            case 'accounts':
                return <AccountsView onTransfer={() => openTransaction('transfer')} />;
            case 'upcoming':
                return <UpcomingView onAddScheduled={() => openTransaction('expense', 'projected')} />;
            case 'recurring':
                return <RecurringView />;
            case 'projection':
                return <ProjectionView />;
            case 'monthly':
                return <MonthlyOverviewView />;
            case 'reports':
                return <ReportsView />;
            case 'settings':
                return <SettingsView />;
            default:
                return (
                    <Dashboard
                        onNavigate={navigate}
                        onAddAccount={() => setAccountForm({ open: true, type: 'bank' })}
                        onAddTransaction={() => openTransaction('expense')}
                        onEditTransaction={(id) => {
                            const tx = txById.get(id);
                            if (tx) editTransaction(tx);
                        }}
                    />
                );
        }
    }, [view, editTransaction, openTransaction, navigate, txById]);

    /* Env vars absent — show setup instructions rather than a blank page. */
    if (!configured) return <SetupScreen missing={missingEnv} />;

    /* Waiting on the initial session lookup. */
    if (!authReady) {
        return (
            <div className='bg-bg flex min-h-screen items-center justify-center'>
                <div className='text-text-faint text-[13px]'>Loading…</div>
            </div>
        );
    }

    if (!user) return <AuthScreen />;

    /* Signed in, but the first fetch failed (commonly: migration not yet run). */
    if (loadError) {
        return (
            <div className='bg-bg flex min-h-screen items-center justify-center p-4'>
                <div className='bg-surface border-line w-full max-w-md rounded-[16px] border p-5'>
                    <div className='bg-negative-soft text-negative mb-3 flex size-10 items-center justify-center rounded-[12px]'>
                        <TriangleAlert className='size-5' />
                    </div>
                    <h2 className='text-text text-[16px] font-semibold'>Could not load your data</h2>
                    <p className='text-text-muted mt-1.5 text-[13px] leading-relaxed'>{loadError}</p>
                    <button
                        onClick={reload}
                        className='bg-accent hover:bg-accent-hover mt-4 h-10 w-full cursor-pointer rounded-[11px] text-[13.5px] font-medium text-white transition-colors'>
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    /* Avoid rendering data-driven UI until the dataset has arrived. */
    if (!hydrated) {
        return (
            <div className='bg-bg flex min-h-screen items-center justify-center'>
                <div className='text-text-faint text-[13px]'>Loading your finances…</div>
            </div>
        );
    }

    return (
        <>
            <AppShell view={view} onNavigate={navigate} onQuickAdd={handleQuickAdd}>
                {content}
            </AppShell>

            <TransactionForm
                open={txForm.open}
                onClose={() => setTxForm(CLOSED_TX)}
                editing={txForm.editing}
                initialType={txForm.type}
                initialStatus={txForm.status}
            />
            <AccountForm
                open={accountForm.open}
                onClose={() => setAccountForm({ open: false, type: 'bank' })}
                initialType={accountForm.type}
            />
            <RecurringForm open={recurringOpen} onClose={() => setRecurringOpen(false)} />
        </>
    );
}
