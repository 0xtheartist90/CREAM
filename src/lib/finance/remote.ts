'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import { describeError } from '@/lib/supabase/client';

import { defaultCategories, DEFAULT_SETTINGS, emptyDB } from './storage';
import type {
    Account,
    BudgetMap,
    Category,
    FinanceDB,
    RecurringRule,
    Settings,
    Transaction
} from './types';

/**
 * Maps the app's in-memory `FinanceDB` onto Supabase tables.
 *
 * The domain model is deliberately unchanged — calculations, charts and views
 * keep operating on exactly the same shapes they did under localStorage. This
 * module only translates between camelCase objects and snake_case rows.
 */

const num = (v: unknown, fallback = 0): number => {
    // PostgREST can return NUMERIC as a string depending on size/driver.
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : NaN;

    return Number.isFinite(n) ? n : fallback;
};

/* ── Row shapes ─────────────────────────────────────────────────────────── */

interface AccountRow {
    id: string;
    user_id: string;
    name: string;
    type: Account['type'];
    starting_balance: number | string;
    icon: string;
    description: string;
    target_amount: number | string | null;
    archived: boolean;
    created_at: string;
}

interface CategoryRow {
    id: string;
    user_id: string;
    name: string;
    kind: Category['kind'];
    icon: string;
    archived: boolean;
    created_at: string;
}

interface TransactionRow {
    id: string;
    user_id: string;
    date: string;
    description: string;
    type: Transaction['type'];
    status: Transaction['status'];
    amount: number | string;
    account_id: string | null;
    to_account_id: string | null;
    category_id: string | null;
    notes: string;
    recurring_id: string | null;
    occurrence_date: string | null;
    created_at: string;
}

interface RecurringRow {
    id: string;
    user_id: string;
    description: string;
    amount: number | string;
    type: RecurringRule['type'];
    account_id: string | null;
    to_account_id: string | null;
    category_id: string | null;
    frequency: RecurringRule['frequency'];
    interval: number;
    start_date: string;
    end_date: string | null;
    active: boolean;
    skipped: string[] | null;
    created_at: string;
}

interface BudgetRow {
    user_id: string;
    month_key: string;
    category_id: string;
    limit_amount: number | string;
}

interface SettingsRow {
    user_id: string;
    currency: string;
    currency_symbol: string;
    locale: string;
    decimals: number;
    compact_large_numbers: boolean;
    theme: Settings['theme'];
    default_account_id: string | null;
    start_day_of_week: number;
}

/* ── Row → domain ───────────────────────────────────────────────────────── */

const toAccount = (r: AccountRow): Account => ({
    id: r.id,
    name: r.name,
    type: r.type,
    startingBalance: num(r.starting_balance),
    icon: r.icon || 'Landmark',
    description: r.description ?? '',
    targetAmount: r.target_amount === null ? null : num(r.target_amount),
    archived: r.archived,
    createdAt: r.created_at
});

const toCategory = (r: CategoryRow): Category => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    icon: r.icon || 'Shapes',
    archived: r.archived,
    createdAt: r.created_at
});

const toTransaction = (r: TransactionRow): Transaction => ({
    id: r.id,
    date: r.date,
    description: r.description ?? '',
    type: r.type,
    status: r.status,
    amount: num(r.amount),
    accountId: r.account_id,
    toAccountId: r.to_account_id,
    categoryId: r.category_id,
    notes: r.notes ?? '',
    recurringId: r.recurring_id,
    occurrenceDate: r.occurrence_date,
    createdAt: r.created_at
});

const toRecurring = (r: RecurringRow): RecurringRule => ({
    id: r.id,
    description: r.description ?? '',
    amount: num(r.amount),
    type: r.type,
    accountId: r.account_id,
    toAccountId: r.to_account_id,
    categoryId: r.category_id,
    frequency: r.frequency,
    interval: r.interval || 1,
    startDate: r.start_date,
    endDate: r.end_date,
    active: r.active,
    createdAt: r.created_at,
    skipped: r.skipped ?? []
});

const toSettings = (r: SettingsRow): Settings => ({
    currency: r.currency,
    currencySymbol: r.currency_symbol,
    locale: r.locale,
    decimals: r.decimals === 2 ? 2 : 0,
    compactLargeNumbers: r.compact_large_numbers,
    theme: r.theme === 'light' ? 'light' : 'dark',
    defaultAccountId: r.default_account_id,
    startDayOfWeek: r.start_day_of_week === 0 ? 0 : 1
});

/* ── Domain → row ───────────────────────────────────────────────────────── */

export const accountRow = (a: Account, userId: string) => ({
    id: a.id,
    user_id: userId,
    name: a.name,
    type: a.type,
    starting_balance: a.startingBalance,
    icon: a.icon,
    description: a.description,
    target_amount: a.type === 'pocket' ? a.targetAmount : null,
    archived: a.archived,
    created_at: a.createdAt
});

export const categoryRow = (c: Category, userId: string) => ({
    id: c.id,
    user_id: userId,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    archived: c.archived,
    created_at: c.createdAt
});

export const transactionRow = (t: Transaction, userId: string) => ({
    id: t.id,
    user_id: userId,
    date: t.date,
    description: t.description,
    type: t.type,
    status: t.status,
    amount: t.amount,
    account_id: t.accountId,
    to_account_id: t.type === 'transfer' ? t.toAccountId : null,
    category_id: t.type === 'transfer' ? null : t.categoryId,
    notes: t.notes,
    recurring_id: t.recurringId,
    occurrence_date: t.occurrenceDate,
    created_at: t.createdAt
});

export const recurringRow = (r: RecurringRule, userId: string) => ({
    id: r.id,
    user_id: userId,
    description: r.description,
    amount: r.amount,
    type: r.type,
    account_id: r.accountId,
    to_account_id: r.type === 'transfer' ? r.toAccountId : null,
    category_id: r.type === 'transfer' ? null : r.categoryId,
    frequency: r.frequency,
    interval: r.interval,
    start_date: r.startDate,
    end_date: r.endDate,
    active: r.active,
    skipped: r.skipped,
    created_at: r.createdAt
});

export const settingsRow = (s: Settings, userId: string) => ({
    user_id: userId,
    currency: s.currency,
    currency_symbol: s.currencySymbol,
    locale: s.locale,
    decimals: s.decimals,
    compact_large_numbers: s.compactLargeNumbers,
    theme: s.theme,
    default_account_id: s.defaultAccountId,
    start_day_of_week: s.startDayOfWeek,
    updated_at: new Date().toISOString()
});

/* ── Load ───────────────────────────────────────────────────────────────── */

export interface LoadResult {
    ok: boolean;
    error?: string;
    db?: Omit<FinanceDB, 'ui'>;
}

/**
 * Pulls the user's entire dataset in one round of parallel queries.
 * The volume a personal finance app produces is small enough that loading it
 * all up-front keeps every existing synchronous calculation working unchanged.
 */
export async function fetchAll(supabase: SupabaseClient, userId: string): Promise<LoadResult> {
    try {
        const [accountsQ, categoriesQ, transactionsQ, recurringQ, budgetsQ, settingsQ] = await Promise.all([
            supabase.from('accounts').select('*').eq('user_id', userId),
            supabase.from('categories').select('*').eq('user_id', userId),
            supabase.from('transactions').select('*').eq('user_id', userId),
            supabase.from('recurring_rules').select('*').eq('user_id', userId),
            supabase.from('budgets').select('*').eq('user_id', userId),
            supabase.from('settings').select('*').eq('user_id', userId).maybeSingle()
        ]);

        const firstError =
            accountsQ.error ?? categoriesQ.error ?? transactionsQ.error ?? recurringQ.error ?? budgetsQ.error ?? settingsQ.error;
        if (firstError) return { ok: false, error: describeError(firstError) };

        const budgets: BudgetMap = {};
        for (const row of (budgetsQ.data ?? []) as BudgetRow[]) {
            budgets[row.month_key] ??= {};
            budgets[row.month_key][row.category_id] = num(row.limit_amount);
        }

        return {
            ok: true,
            db: {
                version: 1,
                accounts: ((accountsQ.data ?? []) as AccountRow[]).map(toAccount),
                categories: ((categoriesQ.data ?? []) as CategoryRow[]).map(toCategory),
                transactions: ((transactionsQ.data ?? []) as TransactionRow[]).map(toTransaction),
                recurring: ((recurringQ.data ?? []) as RecurringRow[]).map(toRecurring),
                budgets,
                settings: settingsQ.data ? toSettings(settingsQ.data as SettingsRow) : { ...DEFAULT_SETTINGS }
            }
        };
    } catch (e) {
        return { ok: false, error: describeError(e) };
    }
}

/**
 * First login for an account: create the settings row and seed the small
 * default category set. The settings row doubles as the "initialised" marker,
 * so deleting every category later never re-seeds them.
 */
export async function initialiseIfNew(
    supabase: SupabaseClient,
    userId: string
): Promise<{ ok: boolean; error?: string; seeded: boolean }> {
    const existing = await supabase.from('settings').select('user_id').eq('user_id', userId).maybeSingle();
    if (existing.error) return { ok: false, error: describeError(existing.error), seeded: false };
    if (existing.data) return { ok: true, seeded: false };

    const categories = defaultCategories();
    const catInsert = await supabase.from('categories').insert(categories.map((c) => categoryRow(c, userId)));
    if (catInsert.error) return { ok: false, error: describeError(catInsert.error), seeded: false };

    const setInsert = await supabase.from('settings').insert(settingsRow({ ...DEFAULT_SETTINGS }, userId));
    if (setInsert.error) return { ok: false, error: describeError(setInsert.error), seeded: false };

    return { ok: true, seeded: true };
}

/* ── Bulk replace (import / reset) ──────────────────────────────────────── */

/** Deletes every row owned by the user. Order respects foreign keys. */
export async function deleteAll(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; error?: string }> {
    for (const table of ['transactions', 'recurring_rules', 'budgets', 'accounts', 'categories', 'settings']) {
        const { error } = await supabase.from(table).delete().eq('user_id', userId);
        if (error) return { ok: false, error: describeError(error) };
    }

    return { ok: true };
}

/**
 * Replaces the user's dataset wholesale — used by JSON import.
 * Inserts run parents-first so foreign keys resolve; settings goes last
 * because it may reference an account.
 */
export async function replaceAll(
    supabase: SupabaseClient,
    userId: string,
    db: Omit<FinanceDB, 'ui'>
): Promise<{ ok: boolean; error?: string }> {
    const cleared = await deleteAll(supabase, userId);
    if (!cleared.ok) return cleared;

    if (db.categories.length) {
        const { error } = await supabase.from('categories').insert(db.categories.map((c) => categoryRow(c, userId)));
        if (error) return { ok: false, error: describeError(error) };
    }
    if (db.accounts.length) {
        const { error } = await supabase.from('accounts').insert(db.accounts.map((a) => accountRow(a, userId)));
        if (error) return { ok: false, error: describeError(error) };
    }
    if (db.transactions.length) {
        // Chunked: a large history can exceed the request size limit.
        for (let i = 0; i < db.transactions.length; i += 500) {
            const slice = db.transactions.slice(i, i + 500).map((t) => transactionRow(t, userId));
            const { error } = await supabase.from('transactions').insert(slice);
            if (error) return { ok: false, error: describeError(error) };
        }
    }
    if (db.recurring.length) {
        const { error } = await supabase.from('recurring_rules').insert(db.recurring.map((r) => recurringRow(r, userId)));
        if (error) return { ok: false, error: describeError(error) };
    }

    const budgetRows: BudgetRow[] = [];
    for (const [monthKey, entry] of Object.entries(db.budgets)) {
        for (const [categoryId, limit] of Object.entries(entry)) {
            budgetRows.push({ user_id: userId, month_key: monthKey, category_id: categoryId, limit_amount: limit });
        }
    }
    if (budgetRows.length) {
        const { error } = await supabase.from('budgets').insert(budgetRows);
        if (error) return { ok: false, error: describeError(error) };
    }

    const { error: settingsError } = await supabase.from('settings').insert(settingsRow(db.settings, userId));
    if (settingsError) return { ok: false, error: describeError(settingsError) };

    return { ok: true };
}

/** A fresh, empty dataset for a user who just reset their data. */
export async function resetToEmpty(
    supabase: SupabaseClient,
    userId: string,
    keepTheme: Settings['theme']
): Promise<{ ok: boolean; error?: string; db?: Omit<FinanceDB, 'ui'> }> {
    const cleared = await deleteAll(supabase, userId);
    if (!cleared.ok) return cleared;

    const fresh = emptyDB();
    fresh.settings = { ...DEFAULT_SETTINGS, theme: keepTheme };

    const { error: catError } = await supabase
        .from('categories')
        .insert(fresh.categories.map((c) => categoryRow(c, userId)));
    if (catError) return { ok: false, error: describeError(catError) };

    const { error: setError } = await supabase.from('settings').insert(settingsRow(fresh.settings, userId));
    if (setError) return { ok: false, error: describeError(setError) };

    return {
        ok: true,
        db: {
            version: 1,
            accounts: [],
            categories: fresh.categories,
            transactions: [],
            recurring: [],
            budgets: {},
            settings: fresh.settings
        }
    };
}
