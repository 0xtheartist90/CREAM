'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { describeError, getSupabase } from '@/lib/supabase/client';

import { useAuth } from './auth';
import { currentMonthKey, todayISO } from './dates';
import { roundMoney } from './format';
import {
    accountRow,
    categoryRow,
    fetchAll,
    initialiseIfNew,
    recurringRow,
    replaceAll,
    resetToEmpty,
    settingsRow,
    transactionRow
} from './remote';
import { DEFAULT_SETTINGS, emptyDB, exportToJSON, makeId, validateAndNormalise } from './storage';
import { WriteQueue, type SyncStatus } from './sync';
import type {
    Account,
    BudgetMap,
    Category,
    FinanceDB,
    RecurringRule,
    Settings,
    Transaction,
    UiPrefs
} from './types';
import { DEFAULT_UI_PREFS, loadUiPrefs, saveUiPrefs, type StoredUi } from './ui-prefs';

export interface ActionResult {
    ok: boolean;
    error?: string;
    id?: string;
}

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

export type NewAccount = Omit<Account, 'id' | 'createdAt'>;
export type NewCategory = Omit<Category, 'id' | 'createdAt'>;
export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>;
export type NewRecurring = Omit<RecurringRule, 'id' | 'createdAt' | 'skipped'>;

interface StoreValue {
    db: FinanceDB;
    hydrated: boolean;
    /** False while a write is failing — surfaced in Settings. */
    persisted: boolean;
    syncStatus: SyncStatus;
    /** Set when the initial load from Supabase failed (e.g. missing tables). */
    loadError: string | null;
    reload: () => void;

    addAccount: (input: NewAccount) => ActionResult;
    updateAccount: (id: string, patch: Partial<NewAccount>) => ActionResult;
    setAccountArchived: (id: string, archived: boolean) => ActionResult;
    deleteAccount: (id: string) => ActionResult;

    addCategory: (input: NewCategory) => ActionResult;
    updateCategory: (id: string, patch: Partial<NewCategory>) => ActionResult;
    setCategoryArchived: (id: string, archived: boolean) => ActionResult;
    deleteCategory: (id: string, replacementId: string | null) => ActionResult;

    addTransaction: (input: NewTransaction) => ActionResult;
    updateTransaction: (id: string, patch: Partial<NewTransaction>) => ActionResult;
    deleteTransaction: (id: string) => ActionResult;
    duplicateTransaction: (id: string) => ActionResult;
    markTransactionActual: (id: string, date?: string) => ActionResult;
    materialiseOccurrence: (ruleId: string, occurrenceDate: string, asActual: boolean) => ActionResult;
    skipOccurrence: (ruleId: string, occurrenceDate: string) => ActionResult;

    addRecurring: (input: NewRecurring) => ActionResult;
    updateRecurring: (id: string, patch: Partial<NewRecurring>) => ActionResult;
    deleteRecurring: (id: string) => ActionResult;
    setRecurringActive: (id: string, active: boolean) => ActionResult;

    setBudget: (monthKey: string, categoryId: string, limit: number) => ActionResult;
    removeBudget: (monthKey: string, categoryId: string) => ActionResult;
    copyBudgets: (fromMonth: string, toMonth: string) => ActionResult;

    updateSettings: (patch: Partial<Settings>) => void;
    updateUi: (patch: Partial<UiPrefs>) => void;

    exportData: () => string;
    importData: (json: string) => Promise<{ ok: boolean; errors: string[]; warnings: string[] }>;
    resetData: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useFinance(): StoreValue {
    const ctx = useContext(StoreContext);
    if (!ctx) throw new Error('useFinance must be used inside <FinanceProvider>');

    return ctx;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function validAmount(amount: number): string | null {
    if (!Number.isFinite(amount)) return 'Amount must be a number.';
    if (amount <= 0) return 'Amount must be greater than zero.';

    return null;
}

/** Shape returned by every supabase-js query builder we enqueue. */
type QueryResult = { error: PostgrestError | null };

export function FinanceProvider({ children }: { children: ReactNode }) {
    const { user, ready: authReady } = useAuth();
    const supabase = getSupabase();
    const userId = user?.id ?? null;

    const [uiPrefs, setUiPrefs] = useState<StoredUi>(() => ({ ...DEFAULT_UI_PREFS }));
    const [db, setDb] = useState<FinanceDB>(() => emptyDB());
    const [hydrated, setHydrated] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>({
        state: 'idle',
        pending: 0,
        error: null,
        lastSavedAt: null
    });
    const [reloadToken, setReloadToken] = useState(0);

    const queueRef = useRef<WriteQueue>(null as unknown as WriteQueue);
    if (queueRef.current === null) queueRef.current = new WriteQueue();

    /* UI preferences live on the device, so they load before auth resolves. */
    useEffect(() => {
        setUiPrefs(loadUiPrefs());
    }, []);

    useEffect(() => queueRef.current.subscribe(setSyncStatus), []);

    /* ── Load the dataset whenever the signed-in user changes ─────────────── */
    useEffect(() => {
        if (!authReady) return;

        // Signed out: drop everything from memory so no data leaks between users.
        if (!userId || !supabase) {
            queueRef.current.clear();
            setDb(emptyDB());
            setHydrated(authReady && !userId);
            setLoadError(null);

            return;
        }

        let active = true;
        setHydrated(false);
        setLoadError(null);
        queueRef.current.clear();

        void (async () => {
            const init = await initialiseIfNew(supabase, userId);
            if (!active) return;
            if (!init.ok) {
                setLoadError(init.error ?? 'Could not initialise your account.');
                setHydrated(true);

                return;
            }

            const result = await fetchAll(supabase, userId);
            if (!active) return;

            if (!result.ok || !result.db) {
                setLoadError(result.error ?? 'Could not load your data.');
                setHydrated(true);

                return;
            }

            setDb({ ...result.db, ui: { lastView: uiPrefs.lastView, hideBalances: uiPrefs.hideBalances } });
            setHydrated(true);
        })();

        return () => {
            active = false;
        };
        // uiPrefs intentionally omitted: it seeds the initial ui slice only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, supabase, authReady, reloadToken]);

    /* Theme: apply from settings, and mirror to localStorage for pre-paint. */
    useEffect(() => {
        const theme = hydrated && userId ? db.settings.theme : uiPrefs.theme;
        const root = document.documentElement;
        root.classList.toggle('dark', theme === 'dark');
        root.style.colorScheme = theme;
    }, [db.settings.theme, uiPrefs.theme, hydrated, userId]);

    useEffect(() => {
        if (!hydrated || !userId) return;
        if (db.settings.theme === uiPrefs.theme) return;
        const next = { ...uiPrefs, theme: db.settings.theme };
        setUiPrefs(next);
        saveUiPrefs(next);
    }, [db.settings.theme, hydrated, userId, uiPrefs]);

    const mutate = useCallback((fn: (draft: FinanceDB) => FinanceDB) => {
        setDb((prev) => fn(prev));
    }, []);

    /**
     * Enqueue a database write. Local state has already been updated
     * optimistically by the caller; this persists it in order.
     */
    const push = useCallback(
        (label: string, run: (sb: SupabaseClient, uid: string) => PromiseLike<QueryResult>) => {
            if (!supabase || !userId) return;
            queueRef.current.enqueue(label, async () => {
                const { error } = await run(supabase, userId);

                return error ? { ok: false, error: describeError(error) } : { ok: true };
            });
        },
        [supabase, userId]
    );

    /* ── Accounts ───────────────────────────────────────────────────────── */

    const addAccount = useCallback<StoreValue['addAccount']>(
        (input) => {
            const name = input.name.trim();
            if (!name) return fail('Account name is required.');
            if (!Number.isFinite(input.startingBalance)) return fail('Starting balance must be a number.');
            if (input.targetAmount !== null && input.targetAmount !== undefined && input.targetAmount < 0) {
                return fail('Target amount cannot be negative.');
            }

            const account: Account = {
                ...input,
                name,
                startingBalance: roundMoney(input.startingBalance),
                targetAmount: input.type === 'pocket' ? (input.targetAmount ?? null) : null,
                id: makeId('acc'),
                createdAt: new Date().toISOString()
            };

            const becomesDefault = !db.settings.defaultAccountId;
            const nextSettings: Settings = becomesDefault
                ? { ...db.settings, defaultAccountId: account.id }
                : db.settings;

            mutate((prev) => ({
                ...prev,
                accounts: [...prev.accounts, account],
                settings: becomesDefault ? { ...prev.settings, defaultAccountId: account.id } : prev.settings
            }));

            push('add account', (sb, uid) => sb.from('accounts').insert(accountRow(account, uid)));
            if (becomesDefault) {
                push('set default account', (sb, uid) =>
                    sb.from('settings').upsert(settingsRow(nextSettings, uid), { onConflict: 'user_id' })
                );
            }

            return { ok: true, id: account.id };
        },
        [db.settings, mutate, push]
    );

    const updateAccount = useCallback<StoreValue['updateAccount']>(
        (id, patch) => {
            if (patch.name !== undefined && !patch.name.trim()) return fail('Account name is required.');
            if (patch.startingBalance !== undefined && !Number.isFinite(patch.startingBalance)) {
                return fail('Starting balance must be a number.');
            }

            const existing = db.accounts.find((a) => a.id === id);
            if (!existing) return fail('Account not found.');

            const next: Account = { ...existing, ...patch };
            if (patch.name !== undefined) next.name = patch.name.trim();
            if (patch.startingBalance !== undefined) next.startingBalance = roundMoney(patch.startingBalance);
            if (next.type !== 'pocket') next.targetAmount = null;

            mutate((prev) => ({ ...prev, accounts: prev.accounts.map((a) => (a.id === id ? next : a)) }));
            push('update account', (sb, uid) => sb.from('accounts').update(accountRow(next, uid)).eq('id', id));

            return OK;
        },
        [db.accounts, mutate, push]
    );

    const setAccountArchived = useCallback<StoreValue['setAccountArchived']>(
        (id, archived) => {
            const clearsDefault = archived && db.settings.defaultAccountId === id;
            const nextSettings: Settings = clearsDefault ? { ...db.settings, defaultAccountId: null } : db.settings;

            mutate((prev) => ({
                ...prev,
                accounts: prev.accounts.map((a) => (a.id === id ? { ...a, archived } : a)),
                settings: clearsDefault ? { ...prev.settings, defaultAccountId: null } : prev.settings
            }));

            push('archive account', (sb) => sb.from('accounts').update({ archived }).eq('id', id));
            if (clearsDefault) {
                push('clear default account', (sb, uid) =>
                    sb.from('settings').upsert(settingsRow(nextSettings, uid), { onConflict: 'user_id' })
                );
            }

            return OK;
        },
        [db.settings, mutate, push]
    );

    const deleteAccount = useCallback<StoreValue['deleteAccount']>(
        (id) => {
            const used = db.transactions.some((t) => t.accountId === id || t.toAccountId === id);
            if (used) return fail('This account has transactions. Archive it instead to keep your history intact.');
            const usedByRule = db.recurring.some((r) => r.accountId === id || r.toAccountId === id);
            if (usedByRule) return fail('This account is used by a recurring rule. Remove the rule first.');

            const clearsDefault = db.settings.defaultAccountId === id;
            const nextSettings: Settings = clearsDefault ? { ...db.settings, defaultAccountId: null } : db.settings;

            mutate((prev) => ({
                ...prev,
                accounts: prev.accounts.filter((a) => a.id !== id),
                settings: clearsDefault ? { ...prev.settings, defaultAccountId: null } : prev.settings
            }));

            if (clearsDefault) {
                push('clear default account', (sb, uid) =>
                    sb.from('settings').upsert(settingsRow(nextSettings, uid), { onConflict: 'user_id' })
                );
            }
            push('delete account', (sb) => sb.from('accounts').delete().eq('id', id));

            return OK;
        },
        [db.transactions, db.recurring, db.settings, mutate, push]
    );

    /* ── Categories ─────────────────────────────────────────────────────── */

    const addCategory = useCallback<StoreValue['addCategory']>(
        (input) => {
            const name = input.name.trim();
            if (!name) return fail('Category name is required.');
            const clash = db.categories.some(
                (c) => c.name.toLowerCase() === name.toLowerCase() && c.kind === input.kind && !c.archived
            );
            if (clash) return fail(`A ${input.kind} category called "${name}" already exists.`);

            const category: Category = { ...input, name, id: makeId('cat'), createdAt: new Date().toISOString() };

            mutate((prev) => ({ ...prev, categories: [...prev.categories, category] }));
            push('add category', (sb, uid) => sb.from('categories').insert(categoryRow(category, uid)));

            return { ok: true, id: category.id };
        },
        [db.categories, mutate, push]
    );

    const updateCategory = useCallback<StoreValue['updateCategory']>(
        (id, patch) => {
            if (patch.name !== undefined && !patch.name.trim()) return fail('Category name is required.');

            const existing = db.categories.find((c) => c.id === id);
            if (!existing) return fail('Category not found.');

            // Flipping income⇄expense would orphan existing transactions.
            if (patch.kind !== undefined && existing.kind !== patch.kind) {
                const inUse = db.transactions.some((t) => t.categoryId === id);
                if (inUse) {
                    return fail('This category is used by transactions and cannot change between income and expense.');
                }
            }

            const next: Category = { ...existing, ...patch, name: patch.name?.trim() ?? existing.name };
            const dropsBudgets = patch.kind === 'income';

            mutate((prev) => ({
                ...prev,
                categories: prev.categories.map((c) => (c.id === id ? next : c)),
                budgets: dropsBudgets
                    ? Object.fromEntries(
                          Object.entries(prev.budgets).map(([month, entry]) => {
                              const copy = { ...entry };
                              delete copy[id];

                              return [month, copy];
                          })
                      )
                    : prev.budgets
            }));

            push('update category', (sb, uid) => sb.from('categories').update(categoryRow(next, uid)).eq('id', id));
            if (dropsBudgets) {
                push('drop budgets for income category', (sb, uid) =>
                    sb.from('budgets').delete().eq('user_id', uid).eq('category_id', id)
                );
            }

            return OK;
        },
        [db.categories, db.transactions, mutate, push]
    );

    const setCategoryArchived = useCallback<StoreValue['setCategoryArchived']>(
        (id, archived) => {
            mutate((prev) => ({
                ...prev,
                categories: prev.categories.map((c) => (c.id === id ? { ...c, archived } : c))
            }));
            push('archive category', (sb) => sb.from('categories').update({ archived }).eq('id', id));

            return OK;
        },
        [mutate, push]
    );

    const deleteCategory = useCallback<StoreValue['deleteCategory']>(
        (id, replacementId) => {
            const target = db.categories.find((c) => c.id === id);
            if (!target) return fail('Category not found.');

            const inUse =
                db.transactions.some((t) => t.categoryId === id) || db.recurring.some((r) => r.categoryId === id);

            if (inUse) {
                if (!replacementId) return fail('Choose a replacement category, or archive this one instead.');
                const replacement = db.categories.find((c) => c.id === replacementId);
                if (!replacement) return fail('Replacement category not found.');
                if (replacement.kind !== target.kind) {
                    return fail('The replacement must be the same type (income or expense).');
                }
            }

            // Merge this category's budget limits into the replacement so the
            // month's total is preserved rather than silently dropping.
            const mergedBudgets: { month_key: string; category_id: string; limit_amount: number }[] = [];
            const nextBudgets: BudgetMap = {};
            for (const [month, entry] of Object.entries(db.budgets)) {
                const copy = { ...entry };
                const limit = copy[id];
                delete copy[id];
                if (limit !== undefined && replacementId) {
                    copy[replacementId] = roundMoney((copy[replacementId] ?? 0) + limit);
                    mergedBudgets.push({
                        month_key: month,
                        category_id: replacementId,
                        limit_amount: copy[replacementId]
                    });
                }
                if (Object.keys(copy).length) nextBudgets[month] = copy;
            }

            mutate((prev) => ({
                ...prev,
                categories: prev.categories.filter((c) => c.id !== id),
                transactions: prev.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: replacementId } : t)),
                recurring: prev.recurring.map((r) => (r.categoryId === id ? { ...r, categoryId: replacementId } : r)),
                budgets: nextBudgets
            }));

            push('repoint transactions', (sb, uid) =>
                sb.from('transactions').update({ category_id: replacementId }).eq('user_id', uid).eq('category_id', id)
            );
            push('repoint recurring rules', (sb, uid) =>
                sb.from('recurring_rules').update({ category_id: replacementId }).eq('user_id', uid).eq('category_id', id)
            );
            if (mergedBudgets.length) {
                push('merge budgets', (sb, uid) =>
                    sb
                        .from('budgets')
                        .upsert(
                            mergedBudgets.map((b) => ({ ...b, user_id: uid })),
                            { onConflict: 'user_id,month_key,category_id' }
                        )
                );
            }
            // Remaining budget rows for this category cascade away with it.
            push('delete category', (sb) => sb.from('categories').delete().eq('id', id));

            return OK;
        },
        [db.categories, db.transactions, db.recurring, db.budgets, mutate, push]
    );

    /* ── Transactions ───────────────────────────────────────────────────── */

    const validateTransaction = useCallback(
        (input: NewTransaction): string | null => {
            const amountError = validAmount(input.amount);
            if (amountError) return amountError;
            if (!ISO_RE.test(input.date)) return 'Enter a valid date.';

            if (input.type === 'transfer') {
                if (!input.accountId || !input.toAccountId) return 'Choose both a source and destination account.';
                if (input.accountId === input.toAccountId) return 'Source and destination must be different accounts.';
                if (!db.accounts.some((a) => a.id === input.accountId)) return 'Source account no longer exists.';
                if (!db.accounts.some((a) => a.id === input.toAccountId)) return 'Destination account no longer exists.';

                return null;
            }

            if (!input.accountId) return 'Choose an account.';
            if (!db.accounts.some((a) => a.id === input.accountId)) return 'Account no longer exists.';
            if (!input.categoryId) return 'Choose a category.';

            const category = db.categories.find((c) => c.id === input.categoryId);
            if (!category) return 'Category no longer exists.';
            if (category.kind !== input.type) return `A ${input.type} must use an ${input.type} category.`;

            return null;
        },
        [db.accounts, db.categories]
    );

    const addTransaction = useCallback<StoreValue['addTransaction']>(
        (input) => {
            const error = validateTransaction(input);
            if (error) return fail(error);

            const tx: Transaction = {
                ...input,
                id: makeId('tx'),
                amount: roundMoney(input.amount),
                description: input.description.trim(),
                categoryId: input.type === 'transfer' ? null : input.categoryId,
                toAccountId: input.type === 'transfer' ? input.toAccountId : null,
                createdAt: new Date().toISOString()
            };

            mutate((prev) => ({ ...prev, transactions: [...prev.transactions, tx] }));
            push('add transaction', (sb, uid) => sb.from('transactions').insert(transactionRow(tx, uid)));

            return { ok: true, id: tx.id };
        },
        [mutate, push, validateTransaction]
    );

    const updateTransaction = useCallback<StoreValue['updateTransaction']>(
        (id, patch) => {
            const existing = db.transactions.find((t) => t.id === id);
            if (!existing) return fail('Transaction not found.');
            const merged = { ...existing, ...patch } as NewTransaction;
            const error = validateTransaction(merged);
            if (error) return fail(error);

            const next: Transaction = {
                ...existing,
                ...patch,
                amount: patch.amount !== undefined ? roundMoney(patch.amount) : existing.amount,
                description: patch.description !== undefined ? patch.description.trim() : existing.description,
                categoryId: merged.type === 'transfer' ? null : merged.categoryId,
                toAccountId: merged.type === 'transfer' ? merged.toAccountId : null
            };

            mutate((prev) => ({ ...prev, transactions: prev.transactions.map((t) => (t.id === id ? next : t)) }));
            push('update transaction', (sb, uid) => sb.from('transactions').update(transactionRow(next, uid)).eq('id', id));

            return OK;
        },
        [db.transactions, mutate, push, validateTransaction]
    );

    const deleteTransaction = useCallback<StoreValue['deleteTransaction']>(
        (id) => {
            mutate((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));
            push('delete transaction', (sb) => sb.from('transactions').delete().eq('id', id));

            return OK;
        },
        [mutate, push]
    );

    const duplicateTransaction = useCallback<StoreValue['duplicateTransaction']>(
        (id) => {
            const source = db.transactions.find((t) => t.id === id);
            if (!source) return fail('Transaction not found.');

            const copy: Transaction = {
                ...source,
                id: makeId('tx'),
                // A duplicate is a new event, not another instance of the rule.
                recurringId: null,
                occurrenceDate: null,
                createdAt: new Date().toISOString()
            };

            mutate((prev) => ({ ...prev, transactions: [...prev.transactions, copy] }));
            push('duplicate transaction', (sb, uid) => sb.from('transactions').insert(transactionRow(copy, uid)));

            return { ok: true, id: copy.id };
        },
        [db.transactions, mutate, push]
    );

    const markTransactionActual = useCallback<StoreValue['markTransactionActual']>(
        (id, date) => {
            const tx = db.transactions.find((t) => t.id === id);
            if (!tx) return fail('Transaction not found.');
            const nextDate = date ?? tx.date;

            mutate((prev) => ({
                ...prev,
                transactions: prev.transactions.map((t) =>
                    t.id === id ? { ...t, status: 'actual', date: nextDate } : t
                )
            }));
            push('mark as done', (sb) =>
                sb.from('transactions').update({ status: 'actual', date: nextDate }).eq('id', id)
            );

            return OK;
        },
        [db.transactions, mutate, push]
    );

    const materialiseOccurrence = useCallback<StoreValue['materialiseOccurrence']>(
        (ruleId, occurrenceDate, asActual) => {
            const rule = db.recurring.find((r) => r.id === ruleId);
            if (!rule) return fail('Recurring rule not found.');
            const already = db.transactions.some((t) => t.recurringId === ruleId && t.occurrenceDate === occurrenceDate);
            if (already) return fail('This occurrence has already been recorded.');

            const tx: Transaction = {
                id: makeId('tx'),
                date: occurrenceDate,
                description: rule.description,
                type: rule.type,
                status: asActual ? 'actual' : 'projected',
                amount: rule.amount,
                accountId: rule.accountId,
                toAccountId: rule.type === 'transfer' ? rule.toAccountId : null,
                categoryId: rule.type === 'transfer' ? null : rule.categoryId,
                notes: '',
                recurringId: rule.id,
                occurrenceDate,
                createdAt: new Date().toISOString()
            };

            mutate((prev) => ({ ...prev, transactions: [...prev.transactions, tx] }));
            push('record occurrence', (sb, uid) => sb.from('transactions').insert(transactionRow(tx, uid)));

            return { ok: true, id: tx.id };
        },
        [db.recurring, db.transactions, mutate, push]
    );

    const skipOccurrence = useCallback<StoreValue['skipOccurrence']>(
        (ruleId, occurrenceDate) => {
            const rule = db.recurring.find((r) => r.id === ruleId);
            if (!rule || rule.skipped.includes(occurrenceDate)) return OK;
            const nextSkipped = [...rule.skipped, occurrenceDate];

            mutate((prev) => ({
                ...prev,
                recurring: prev.recurring.map((r) => (r.id === ruleId ? { ...r, skipped: nextSkipped } : r))
            }));
            push('skip occurrence', (sb) =>
                sb.from('recurring_rules').update({ skipped: nextSkipped }).eq('id', ruleId)
            );

            return OK;
        },
        [db.recurring, mutate, push]
    );

    /* ── Recurring rules ────────────────────────────────────────────────── */

    const validateRecurring = useCallback(
        (input: NewRecurring): string | null => {
            if (!input.description.trim()) return 'Description is required.';
            const amountError = validAmount(input.amount);
            if (amountError) return amountError;
            if (!ISO_RE.test(input.startDate)) return 'Enter a valid start date.';
            if (input.endDate && !ISO_RE.test(input.endDate)) return 'Enter a valid end date.';
            if (input.endDate && input.endDate < input.startDate) return 'End date must be after the start date.';
            if (!Number.isFinite(input.interval) || input.interval < 1) return 'Interval must be at least 1.';

            if (input.type === 'transfer') {
                if (!input.accountId || !input.toAccountId) return 'Choose both accounts.';
                if (input.accountId === input.toAccountId) return 'Source and destination must differ.';

                return null;
            }
            if (!input.accountId) return 'Choose an account.';
            if (!input.categoryId) return 'Choose a category.';
            const category = db.categories.find((c) => c.id === input.categoryId);
            if (!category) return 'Category no longer exists.';
            if (category.kind !== input.type) return `A ${input.type} must use an ${input.type} category.`;

            return null;
        },
        [db.categories]
    );

    const addRecurring = useCallback<StoreValue['addRecurring']>(
        (input) => {
            const error = validateRecurring(input);
            if (error) return fail(error);

            const rule: RecurringRule = {
                ...input,
                id: makeId('rec'),
                description: input.description.trim(),
                amount: roundMoney(input.amount),
                categoryId: input.type === 'transfer' ? null : input.categoryId,
                toAccountId: input.type === 'transfer' ? input.toAccountId : null,
                skipped: [],
                createdAt: new Date().toISOString()
            };

            mutate((prev) => ({ ...prev, recurring: [...prev.recurring, rule] }));
            push('add recurring rule', (sb, uid) => sb.from('recurring_rules').insert(recurringRow(rule, uid)));

            return { ok: true, id: rule.id };
        },
        [mutate, push, validateRecurring]
    );

    const updateRecurring = useCallback<StoreValue['updateRecurring']>(
        (id, patch) => {
            const existing = db.recurring.find((r) => r.id === id);
            if (!existing) return fail('Recurring rule not found.');
            const merged = { ...existing, ...patch } as NewRecurring;
            const error = validateRecurring(merged);
            if (error) return fail(error);

            const next: RecurringRule = {
                ...existing,
                ...patch,
                description: patch.description?.trim() ?? existing.description,
                amount: patch.amount !== undefined ? roundMoney(patch.amount) : existing.amount,
                categoryId: merged.type === 'transfer' ? null : merged.categoryId,
                toAccountId: merged.type === 'transfer' ? merged.toAccountId : null
            };

            mutate((prev) => ({ ...prev, recurring: prev.recurring.map((r) => (r.id === id ? next : r)) }));
            push('update recurring rule', (sb, uid) =>
                sb.from('recurring_rules').update(recurringRow(next, uid)).eq('id', id)
            );

            return OK;
        },
        [db.recurring, mutate, push, validateRecurring]
    );

    const deleteRecurring = useCallback<StoreValue['deleteRecurring']>(
        (id) => {
            mutate((prev) => ({
                ...prev,
                recurring: prev.recurring.filter((r) => r.id !== id),
                // Keep already-recorded transactions, just detach them.
                transactions: prev.transactions.map((t) =>
                    t.recurringId === id ? { ...t, recurringId: null, occurrenceDate: null } : t
                )
            }));

            push('detach recorded occurrences', (sb, uid) =>
                sb
                    .from('transactions')
                    .update({ recurring_id: null, occurrence_date: null })
                    .eq('user_id', uid)
                    .eq('recurring_id', id)
            );
            push('delete recurring rule', (sb) => sb.from('recurring_rules').delete().eq('id', id));

            return OK;
        },
        [mutate, push]
    );

    const setRecurringActive = useCallback<StoreValue['setRecurringActive']>(
        (id, active) => {
            mutate((prev) => ({ ...prev, recurring: prev.recurring.map((r) => (r.id === id ? { ...r, active } : r)) }));
            push('toggle recurring rule', (sb) => sb.from('recurring_rules').update({ active }).eq('id', id));

            return OK;
        },
        [mutate, push]
    );

    /* ── Budgets ────────────────────────────────────────────────────────── */

    const setBudget = useCallback<StoreValue['setBudget']>(
        (monthKey, categoryId, limit) => {
            if (!Number.isFinite(limit) || limit < 0) return fail('Budget must be zero or more.');
            const category = db.categories.find((c) => c.id === categoryId);
            if (!category) return fail('Category not found.');
            if (category.kind !== 'expense') return fail('Budgets can only be set on expense categories.');

            const value = roundMoney(limit);
            mutate((prev) => ({
                ...prev,
                budgets: { ...prev.budgets, [monthKey]: { ...(prev.budgets[monthKey] ?? {}), [categoryId]: value } }
            }));

            push('set budget', (sb, uid) =>
                sb
                    .from('budgets')
                    .upsert(
                        { user_id: uid, month_key: monthKey, category_id: categoryId, limit_amount: value },
                        { onConflict: 'user_id,month_key,category_id' }
                    )
            );

            return OK;
        },
        [db.categories, mutate, push]
    );

    const removeBudget = useCallback<StoreValue['removeBudget']>(
        (monthKey, categoryId) => {
            mutate((prev) => {
                const entry = { ...(prev.budgets[monthKey] ?? {}) };
                delete entry[categoryId];
                const budgets = { ...prev.budgets };
                if (Object.keys(entry).length) budgets[monthKey] = entry;
                else delete budgets[monthKey];

                return { ...prev, budgets };
            });

            push('remove budget', (sb, uid) =>
                sb
                    .from('budgets')
                    .delete()
                    .eq('user_id', uid)
                    .eq('month_key', monthKey)
                    .eq('category_id', categoryId)
            );

            return OK;
        },
        [mutate, push]
    );

    const copyBudgets = useCallback<StoreValue['copyBudgets']>(
        (fromMonth, toMonth) => {
            const source = db.budgets[fromMonth];
            if (!source || !Object.keys(source).length) return fail('That month has no budgets to copy.');

            // Limits only — spending always comes from real transactions.
            const rows = Object.entries(source).map(([categoryId, limit]) => ({
                month_key: toMonth,
                category_id: categoryId,
                limit_amount: limit
            }));

            mutate((prev) => ({
                ...prev,
                budgets: { ...prev.budgets, [toMonth]: { ...(prev.budgets[toMonth] ?? {}), ...source } }
            }));

            push('copy budgets', (sb, uid) =>
                sb
                    .from('budgets')
                    .upsert(
                        rows.map((r) => ({ ...r, user_id: uid })),
                        { onConflict: 'user_id,month_key,category_id' }
                    )
            );

            return OK;
        },
        [db.budgets, mutate, push]
    );

    /* ── Settings & UI ──────────────────────────────────────────────────── */

    const updateSettings = useCallback<StoreValue['updateSettings']>(
        (patch) => {
            const next: Settings = { ...db.settings, ...patch };
            mutate((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
            push('save settings', (sb, uid) =>
                sb.from('settings').upsert(settingsRow(next, uid), { onConflict: 'user_id' })
            );
        },
        [db.settings, mutate, push]
    );

    const updateUi = useCallback<StoreValue['updateUi']>(
        (patch) => {
            mutate((prev) => ({ ...prev, ui: { ...prev.ui, ...patch } }));
            setUiPrefs((prev) => {
                const next = { ...prev, ...patch };
                saveUiPrefs(next);

                return next;
            });
        },
        [mutate]
    );

    /* ── Data management ────────────────────────────────────────────────── */

    const exportData = useCallback(() => exportToJSON(db), [db]);

    const importData = useCallback<StoreValue['importData']>(
        async (json) => {
            if (!supabase || !userId) {
                return { ok: false, errors: ['You must be signed in to import data.'], warnings: [] };
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(json);
            } catch {
                return { ok: false, errors: ['That file is not valid JSON.'], warnings: [] };
            }

            const result = validateAndNormalise(parsed);
            // Existing data is only replaced once the payload is known-good.
            if (!result.ok || !result.db) {
                return { ok: false, errors: result.errors, warnings: result.warnings };
            }

            queueRef.current.clear();
            const written = await replaceAll(supabase, userId, result.db);
            if (!written.ok) {
                return { ok: false, errors: [written.error ?? 'Could not write the imported data.'], warnings: [] };
            }

            setDb({ ...result.db, ui: { lastView: uiPrefs.lastView, hideBalances: uiPrefs.hideBalances } });

            return { ok: true, errors: [], warnings: result.warnings };
        },
        [supabase, userId, uiPrefs.lastView, uiPrefs.hideBalances]
    );

    const resetData = useCallback(() => {
        if (!supabase || !userId) return;
        const keepTheme = db.settings.theme;
        queueRef.current.clear();

        void (async () => {
            const result = await resetToEmpty(supabase, userId, keepTheme);
            if (!result.ok || !result.db) {
                setLoadError(result.error ?? 'Could not reset your data.');

                return;
            }
            setDb({ ...result.db, ui: { lastView: uiPrefs.lastView, hideBalances: uiPrefs.hideBalances } });
        })();
    }, [supabase, userId, db.settings.theme, uiPrefs.lastView, uiPrefs.hideBalances]);

    const reload = useCallback(() => setReloadToken((n) => n + 1), []);

    const value = useMemo<StoreValue>(
        () => ({
            db,
            hydrated,
            persisted: syncStatus.state !== 'error',
            syncStatus,
            loadError,
            reload,
            addAccount,
            updateAccount,
            setAccountArchived,
            deleteAccount,
            addCategory,
            updateCategory,
            setCategoryArchived,
            deleteCategory,
            addTransaction,
            updateTransaction,
            deleteTransaction,
            duplicateTransaction,
            markTransactionActual,
            materialiseOccurrence,
            skipOccurrence,
            addRecurring,
            updateRecurring,
            deleteRecurring,
            setRecurringActive,
            setBudget,
            removeBudget,
            copyBudgets,
            updateSettings,
            updateUi,
            exportData,
            importData,
            resetData
        }),
        [
            db,
            hydrated,
            syncStatus,
            loadError,
            reload,
            addAccount,
            updateAccount,
            setAccountArchived,
            deleteAccount,
            addCategory,
            updateCategory,
            setCategoryArchived,
            deleteCategory,
            addTransaction,
            updateTransaction,
            deleteTransaction,
            duplicateTransaction,
            markTransactionActual,
            materialiseOccurrence,
            skipOccurrence,
            addRecurring,
            updateRecurring,
            deleteRecurring,
            setRecurringActive,
            setBudget,
            removeBudget,
            copyBudgets,
            updateSettings,
            updateUi,
            exportData,
            importData,
            resetData
        ]
    );

    return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Convenience selectors that need the live db from context. */
export function useToday(): string {
    return useMemo(() => todayISO(), []);
}

export function useCurrentMonthKey(): string {
    return useMemo(() => currentMonthKey(), []);
}

export { DEFAULT_SETTINGS };
