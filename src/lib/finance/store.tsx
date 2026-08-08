'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { currentMonthKey, todayISO } from './dates';
import { roundMoney } from './format';
import {
    DEFAULT_SETTINGS,
    STORAGE_KEY,
    clearDB,
    emptyDB,
    exportToJSON,
    loadDB,
    makeId,
    saveDB,
    validateAndNormalise
} from './storage';
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
    /** False when the last write to localStorage failed (quota/private mode). */
    persisted: boolean;

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
    /** Convert a projected row into an actual one (Mark as paid/received). */
    markTransactionActual: (id: string, date?: string) => ActionResult;
    /** Record a recurring occurrence as a real transaction. */
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
    importData: (json: string) => { ok: boolean; errors: string[]; warnings: string[] };
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

export function FinanceProvider({ children }: { children: ReactNode }) {
    const [db, setDb] = useState<FinanceDB>(() => emptyDB());
    const [hydrated, setHydrated] = useState(false);
    const [persisted, setPersisted] = useState(true);
    const skipNextSave = useRef(true);

    /* Load once on the client so SSR markup stays deterministic. */
    useEffect(() => {
        setDb(loadDB());
        setHydrated(true);
    }, []);

    /* Persist on every change after hydration. */
    useEffect(() => {
        if (!hydrated) return;
        if (skipNextSave.current) {
            skipNextSave.current = false;

            return;
        }
        setPersisted(saveDB(db));
    }, [db, hydrated]);

    /* Keep multiple tabs of the app consistent. */
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key !== STORAGE_KEY || !e.newValue) return;
            try {
                const result = validateAndNormalise(JSON.parse(e.newValue));
                if (result.ok && result.db) {
                    skipNextSave.current = true;
                    setDb(result.db);
                }
            } catch {
                /* ignore malformed cross-tab payloads */
            }
        };
        window.addEventListener('storage', onStorage);

        return () => window.removeEventListener('storage', onStorage);
    }, []);

    /* Apply the theme class from settings. */
    useEffect(() => {
        if (!hydrated) return;
        const root = document.documentElement;
        root.classList.toggle('dark', db.settings.theme === 'dark');
        root.style.colorScheme = db.settings.theme;
    }, [db.settings.theme, hydrated]);

    const mutate = useCallback((fn: (draft: FinanceDB) => FinanceDB) => {
        setDb((prev) => fn(prev));
    }, []);

    /* ── Accounts ───────────────────────────────────────────────────────── */

    const addAccount = useCallback<StoreValue['addAccount']>(
        (input) => {
            const name = input.name.trim();
            if (!name) return fail('Account name is required.');
            if (!Number.isFinite(input.startingBalance)) return fail('Starting balance must be a number.');
            if (input.targetAmount !== null && input.targetAmount !== undefined && input.targetAmount < 0) {
                return fail('Target amount cannot be negative.');
            }

            const id = makeId('acc');
            mutate((prev) => ({
                ...prev,
                accounts: [
                    ...prev.accounts,
                    {
                        ...input,
                        name,
                        startingBalance: roundMoney(input.startingBalance),
                        targetAmount: input.type === 'pocket' ? (input.targetAmount ?? null) : null,
                        id,
                        createdAt: new Date().toISOString()
                    }
                ],
                // First account becomes the default for quick-add.
                settings: prev.settings.defaultAccountId
                    ? prev.settings
                    : { ...prev.settings, defaultAccountId: id }
            }));

            return { ok: true, id };
        },
        [mutate]
    );

    const updateAccount = useCallback<StoreValue['updateAccount']>(
        (id, patch) => {
            if (patch.name !== undefined && !patch.name.trim()) return fail('Account name is required.');
            if (patch.startingBalance !== undefined && !Number.isFinite(patch.startingBalance)) {
                return fail('Starting balance must be a number.');
            }
            mutate((prev) => ({
                ...prev,
                accounts: prev.accounts.map((a) => {
                    if (a.id !== id) return a;
                    const next = { ...a, ...patch };
                    if (patch.name !== undefined) next.name = patch.name.trim();
                    if (patch.startingBalance !== undefined) next.startingBalance = roundMoney(patch.startingBalance);
                    if (next.type !== 'pocket') next.targetAmount = null;

                    return next;
                })
            }));

            return OK;
        },
        [mutate]
    );

    const setAccountArchived = useCallback<StoreValue['setAccountArchived']>(
        (id, archived) => {
            mutate((prev) => ({
                ...prev,
                accounts: prev.accounts.map((a) => (a.id === id ? { ...a, archived } : a)),
                settings:
                    archived && prev.settings.defaultAccountId === id
                        ? { ...prev.settings, defaultAccountId: null }
                        : prev.settings
            }));

            return OK;
        },
        [mutate]
    );

    const deleteAccount = useCallback<StoreValue['deleteAccount']>(
        (id) => {
            const used = db.transactions.some((t) => t.accountId === id || t.toAccountId === id);
            if (used) return fail('This account has transactions. Archive it instead to keep your history intact.');
            const usedByRule = db.recurring.some((r) => r.accountId === id || r.toAccountId === id);
            if (usedByRule) return fail('This account is used by a recurring rule. Remove the rule first.');

            mutate((prev) => ({
                ...prev,
                accounts: prev.accounts.filter((a) => a.id !== id),
                settings:
                    prev.settings.defaultAccountId === id
                        ? { ...prev.settings, defaultAccountId: null }
                        : prev.settings
            }));

            return OK;
        },
        [db.transactions, db.recurring, mutate]
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

            const id = makeId('cat');
            mutate((prev) => ({
                ...prev,
                categories: [...prev.categories, { ...input, name, id, createdAt: new Date().toISOString() }]
            }));

            return { ok: true, id };
        },
        [db.categories, mutate]
    );

    const updateCategory = useCallback<StoreValue['updateCategory']>(
        (id, patch) => {
            if (patch.name !== undefined && !patch.name.trim()) return fail('Category name is required.');

            // Flipping income⇄expense would orphan existing transactions.
            if (patch.kind !== undefined) {
                const current = db.categories.find((c) => c.id === id);
                if (current && current.kind !== patch.kind) {
                    const inUse = db.transactions.some((t) => t.categoryId === id);
                    if (inUse) {
                        return fail('This category is used by transactions and cannot change between income and expense.');
                    }
                }
            }

            mutate((prev) => ({
                ...prev,
                categories: prev.categories.map((c) =>
                    c.id === id ? { ...c, ...patch, name: patch.name?.trim() ?? c.name } : c
                ),
                // A category that is no longer an expense cannot hold budgets.
                budgets:
                    patch.kind === 'income'
                        ? Object.fromEntries(
                              Object.entries(prev.budgets).map(([month, entry]) => {
                                  const next = { ...entry };
                                  delete next[id];

                                  return [month, next];
                              })
                          )
                        : prev.budgets
            }));

            return OK;
        },
        [db.categories, db.transactions, mutate]
    );

    const setCategoryArchived = useCallback<StoreValue['setCategoryArchived']>(
        (id, archived) => {
            mutate((prev) => ({
                ...prev,
                categories: prev.categories.map((c) => (c.id === id ? { ...c, archived } : c))
            }));

            return OK;
        },
        [mutate]
    );

    const deleteCategory = useCallback<StoreValue['deleteCategory']>(
        (id, replacementId) => {
            const target = db.categories.find((c) => c.id === id);
            if (!target) return fail('Category not found.');

            const inUse =
                db.transactions.some((t) => t.categoryId === id) || db.recurring.some((r) => r.categoryId === id);

            if (inUse) {
                if (!replacementId) {
                    return fail('Choose a replacement category, or archive this one instead.');
                }
                const replacement = db.categories.find((c) => c.id === replacementId);
                if (!replacement) return fail('Replacement category not found.');
                if (replacement.kind !== target.kind) {
                    return fail('The replacement must be the same type (income or expense).');
                }
            }

            mutate((prev) => {
                const budgets: BudgetMap = {};
                for (const [month, entry] of Object.entries(prev.budgets)) {
                    const next = { ...entry };
                    const limit = next[id];
                    delete next[id];
                    // Re-point the budget at the replacement rather than losing it.
                    if (limit !== undefined && replacementId) {
                        next[replacementId] = roundMoney((next[replacementId] ?? 0) + limit);
                    }
                    if (Object.keys(next).length) budgets[month] = next;
                }

                return {
                    ...prev,
                    categories: prev.categories.filter((c) => c.id !== id),
                    transactions: prev.transactions.map((t) =>
                        t.categoryId === id ? { ...t, categoryId: replacementId } : t
                    ),
                    recurring: prev.recurring.map((r) =>
                        r.categoryId === id ? { ...r, categoryId: replacementId } : r
                    ),
                    budgets
                };
            });

            return OK;
        },
        [db.categories, db.transactions, db.recurring, mutate]
    );

    /* ── Transactions ───────────────────────────────────────────────────── */

    const validateTransaction = useCallback(
        (input: NewTransaction): string | null => {
            const amountError = validAmount(input.amount);
            if (amountError) return amountError;
            if (!ISO_RE.test(input.date)) return 'Enter a valid date.';

            if (input.type === 'transfer') {
                if (!input.accountId || !input.toAccountId) return 'Choose both a source and destination account.';
                if (input.accountId === input.toAccountId) {
                    return 'Source and destination must be different accounts.';
                }
                if (!db.accounts.some((a) => a.id === input.accountId)) return 'Source account no longer exists.';
                if (!db.accounts.some((a) => a.id === input.toAccountId)) return 'Destination account no longer exists.';

                return null;
            }

            if (!input.accountId) return 'Choose an account.';
            if (!db.accounts.some((a) => a.id === input.accountId)) return 'Account no longer exists.';
            if (!input.categoryId) return 'Choose a category.';

            const category = db.categories.find((c) => c.id === input.categoryId);
            if (!category) return 'Category no longer exists.';
            if (category.kind !== input.type) {
                return `A ${input.type} must use an ${input.type} category.`;
            }

            return null;
        },
        [db.accounts, db.categories]
    );

    const addTransaction = useCallback<StoreValue['addTransaction']>(
        (input) => {
            const error = validateTransaction(input);
            if (error) return fail(error);

            const id = makeId('tx');
            mutate((prev) => ({
                ...prev,
                transactions: [
                    ...prev.transactions,
                    {
                        ...input,
                        id,
                        amount: roundMoney(input.amount),
                        description: input.description.trim(),
                        categoryId: input.type === 'transfer' ? null : input.categoryId,
                        toAccountId: input.type === 'transfer' ? input.toAccountId : null,
                        createdAt: new Date().toISOString()
                    }
                ]
            }));

            return { ok: true, id };
        },
        [mutate, validateTransaction]
    );

    const updateTransaction = useCallback<StoreValue['updateTransaction']>(
        (id, patch) => {
            const existing = db.transactions.find((t) => t.id === id);
            if (!existing) return fail('Transaction not found.');
            const merged = { ...existing, ...patch } as NewTransaction;
            const error = validateTransaction(merged);
            if (error) return fail(error);

            mutate((prev) => ({
                ...prev,
                transactions: prev.transactions.map((t) =>
                    t.id === id
                        ? {
                              ...t,
                              ...patch,
                              amount: patch.amount !== undefined ? roundMoney(patch.amount) : t.amount,
                              description: patch.description !== undefined ? patch.description.trim() : t.description,
                              categoryId: merged.type === 'transfer' ? null : merged.categoryId,
                              toAccountId: merged.type === 'transfer' ? merged.toAccountId : null
                          }
                        : t
                )
            }));

            return OK;
        },
        [db.transactions, mutate, validateTransaction]
    );

    const deleteTransaction = useCallback<StoreValue['deleteTransaction']>(
        (id) => {
            mutate((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));

            return OK;
        },
        [mutate]
    );

    const duplicateTransaction = useCallback<StoreValue['duplicateTransaction']>(
        (id) => {
            const source = db.transactions.find((t) => t.id === id);
            if (!source) return fail('Transaction not found.');
            const newId = makeId('tx');
            mutate((prev) => ({
                ...prev,
                transactions: [
                    ...prev.transactions,
                    {
                        ...source,
                        id: newId,
                        // A duplicate is a new event, not another instance of the rule.
                        recurringId: null,
                        occurrenceDate: null,
                        createdAt: new Date().toISOString()
                    }
                ]
            }));

            return { ok: true, id: newId };
        },
        [db.transactions, mutate]
    );

    const markTransactionActual = useCallback<StoreValue['markTransactionActual']>(
        (id, date) => {
            const tx = db.transactions.find((t) => t.id === id);
            if (!tx) return fail('Transaction not found.');
            mutate((prev) => ({
                ...prev,
                transactions: prev.transactions.map((t) =>
                    t.id === id ? { ...t, status: 'actual', date: date ?? t.date } : t
                )
            }));

            return OK;
        },
        [db.transactions, mutate]
    );

    const materialiseOccurrence = useCallback<StoreValue['materialiseOccurrence']>(
        (ruleId, occurrenceDate, asActual) => {
            const rule = db.recurring.find((r) => r.id === ruleId);
            if (!rule) return fail('Recurring rule not found.');
            const already = db.transactions.some(
                (t) => t.recurringId === ruleId && t.occurrenceDate === occurrenceDate
            );
            if (already) return fail('This occurrence has already been recorded.');

            const id = makeId('tx');
            mutate((prev) => ({
                ...prev,
                transactions: [
                    ...prev.transactions,
                    {
                        id,
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
                    }
                ]
            }));

            return { ok: true, id };
        },
        [db.recurring, db.transactions, mutate]
    );

    const skipOccurrence = useCallback<StoreValue['skipOccurrence']>(
        (ruleId, occurrenceDate) => {
            mutate((prev) => ({
                ...prev,
                recurring: prev.recurring.map((r) =>
                    r.id === ruleId && !r.skipped.includes(occurrenceDate)
                        ? { ...r, skipped: [...r.skipped, occurrenceDate] }
                        : r
                )
            }));

            return OK;
        },
        [mutate]
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
            const id = makeId('rec');
            mutate((prev) => ({
                ...prev,
                recurring: [
                    ...prev.recurring,
                    {
                        ...input,
                        id,
                        description: input.description.trim(),
                        amount: roundMoney(input.amount),
                        categoryId: input.type === 'transfer' ? null : input.categoryId,
                        toAccountId: input.type === 'transfer' ? input.toAccountId : null,
                        skipped: [],
                        createdAt: new Date().toISOString()
                    }
                ]
            }));

            return { ok: true, id };
        },
        [mutate, validateRecurring]
    );

    const updateRecurring = useCallback<StoreValue['updateRecurring']>(
        (id, patch) => {
            const existing = db.recurring.find((r) => r.id === id);
            if (!existing) return fail('Recurring rule not found.');
            const merged = { ...existing, ...patch } as NewRecurring;
            const error = validateRecurring(merged);
            if (error) return fail(error);

            mutate((prev) => ({
                ...prev,
                recurring: prev.recurring.map((r) =>
                    r.id === id
                        ? {
                              ...r,
                              ...patch,
                              description: patch.description?.trim() ?? r.description,
                              amount: patch.amount !== undefined ? roundMoney(patch.amount) : r.amount,
                              categoryId: merged.type === 'transfer' ? null : merged.categoryId,
                              toAccountId: merged.type === 'transfer' ? merged.toAccountId : null
                          }
                        : r
                )
            }));

            return OK;
        },
        [db.recurring, mutate, validateRecurring]
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

            return OK;
        },
        [mutate]
    );

    const setRecurringActive = useCallback<StoreValue['setRecurringActive']>(
        (id, active) => {
            mutate((prev) => ({
                ...prev,
                recurring: prev.recurring.map((r) => (r.id === id ? { ...r, active } : r))
            }));

            return OK;
        },
        [mutate]
    );

    /* ── Budgets ────────────────────────────────────────────────────────── */

    const setBudget = useCallback<StoreValue['setBudget']>(
        (monthKey, categoryId, limit) => {
            if (!Number.isFinite(limit) || limit < 0) return fail('Budget must be zero or more.');
            const category = db.categories.find((c) => c.id === categoryId);
            if (!category) return fail('Category not found.');
            if (category.kind !== 'expense') return fail('Budgets can only be set on expense categories.');

            mutate((prev) => ({
                ...prev,
                budgets: {
                    ...prev.budgets,
                    [monthKey]: { ...(prev.budgets[monthKey] ?? {}), [categoryId]: roundMoney(limit) }
                }
            }));

            return OK;
        },
        [db.categories, mutate]
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

            return OK;
        },
        [mutate]
    );

    const copyBudgets = useCallback<StoreValue['copyBudgets']>(
        (fromMonth, toMonth) => {
            const source = db.budgets[fromMonth];
            if (!source || !Object.keys(source).length) return fail('That month has no budgets to copy.');

            mutate((prev) => ({
                ...prev,
                // Limits only — spending always comes from real transactions.
                budgets: { ...prev.budgets, [toMonth]: { ...(prev.budgets[toMonth] ?? {}), ...source } }
            }));

            return OK;
        },
        [db.budgets, mutate]
    );

    /* ── Settings, data ─────────────────────────────────────────────────── */

    const updateSettings = useCallback<StoreValue['updateSettings']>(
        (patch) => {
            mutate((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
        },
        [mutate]
    );

    const updateUi = useCallback<StoreValue['updateUi']>(
        (patch) => {
            mutate((prev) => ({ ...prev, ui: { ...prev.ui, ...patch } }));
        },
        [mutate]
    );

    const exportData = useCallback(() => exportToJSON(db), [db]);

    const importData = useCallback<StoreValue['importData']>(
        (json) => {
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
            setDb(result.db);

            return { ok: true, errors: [], warnings: result.warnings };
        },
        []
    );

    const resetData = useCallback(() => {
        clearDB();
        const fresh = emptyDB();
        fresh.settings = { ...DEFAULT_SETTINGS, theme: db.settings.theme };
        setDb(fresh);
    }, [db.settings.theme]);

    const value = useMemo<StoreValue>(
        () => ({
            db,
            hydrated,
            persisted,
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
            persisted,
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
