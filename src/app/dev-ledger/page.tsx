'use client';

/**
 * Dev-only harness: renders the real TransactionsView against a mocked store,
 * so ledger layout/UX can be verified in a browser without a Supabase session.
 *
 * Data comes from /sample.json (never committed — see .gitignore). The route
 * hard-404s outside development builds.
 */
import { useEffect, useState } from 'react';

import { notFound } from 'next/navigation';

import { TransactionsView } from '@/components/finance/view-transactions';
import { StoreContext, type StoreValue } from '@/lib/finance/store';
import { validateAndNormalise } from '@/lib/finance/storage';
import type { FinanceDB } from '@/lib/finance/types';

const ok = { ok: true as const };

function mockStore(db: FinanceDB): StoreValue {
    return {
        db,
        hydrated: true,
        persisted: true,
        syncStatus: { state: 'idle', pending: 0, error: null, lastSavedAt: null },
        loadError: null,
        reload: () => undefined,
        addAccount: () => ok,
        updateAccount: () => ok,
        setAccountArchived: () => ok,
        deleteAccount: () => ok,
        addCategory: () => ok,
        updateCategory: () => ok,
        setCategoryArchived: () => ok,
        deleteCategory: () => ok,
        addTransaction: () => ok,
        updateTransaction: () => ok,
        deleteTransaction: () => ok,
        duplicateTransaction: () => ok,
        markTransactionActual: () => ok,
        materialiseOccurrence: () => ok,
        skipOccurrence: () => ok,
        addRecurring: () => ok,
        updateRecurring: () => ok,
        deleteRecurring: () => ok,
        setRecurringActive: () => ok,
        setBudget: () => ok,
        removeBudget: () => ok,
        copyBudgets: () => ok,
        updateSettings: () => undefined,
        updateUi: () => undefined,
        exportData: () => '',
        importData: () => Promise.resolve({ ok: true, errors: [], warnings: [] }),
        resetData: () => undefined
    };
}

export default function DevLedgerPage() {
    if (process.env.NODE_ENV !== 'development') notFound();

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [db, setDb] = useState<FinanceDB | null>(null);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [status, setStatus] = useState('loading /sample.json…');

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch('/sample.json');
                if (!res.ok) {
                    setStatus('put a dataset at public/sample.json (e.g. a CREAM money export)');

                    return;
                }
                const result = validateAndNormalise(await res.json());
                if (!result.ok || !result.db) {
                    setStatus(`sample.json invalid: ${result.errors.join('; ')}`);

                    return;
                }
                setDb(result.db);
            } catch (e) {
                setStatus(String(e));
            }
        })();
    }, []);

    if (!db) {
        return <div className='text-text-muted p-8 text-[13px]'>{status}</div>;
    }

    return (
        <StoreContext.Provider value={mockStore(db)}>
            <div className='mx-auto max-w-[1400px] px-4 py-6 sm:px-6'>
                <TransactionsView
                    onEdit={(tx) => console.log('edit', tx.id)}
                    onAdd={() => console.log('add')}
                />
            </div>
        </StoreContext.Provider>
    );
}
