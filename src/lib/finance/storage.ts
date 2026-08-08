import { todayISO } from './dates';
import type {
    AccountType,
    Category,
    FinanceDB,
    Frequency,
    Settings,
    TransactionType,
    UiPrefs
} from './types';

export const STORAGE_KEY = 'cream-money.db';
export const SCHEMA_VERSION = 1;

export function makeId(prefix = 'id'): string {
    const rand =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(36).slice(2, 10);

    return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export const DEFAULT_SETTINGS: Settings = {
    currency: 'THB',
    currencySymbol: '฿',
    locale: 'en-US',
    decimals: 0,
    compactLargeNumbers: false,
    theme: 'dark',
    defaultAccountId: null,
    startDayOfWeek: 1
};

export const DEFAULT_UI: UiPrefs = {
    lastView: 'overview',
    hideBalances: false
};

/**
 * The only seed data the app ships with. Deliberately minimal — the spec
 * requires starting with no accounts, transactions or budgets.
 */
export function defaultCategories(): Category[] {
    const now = new Date().toISOString();
    const base = [
        { name: 'Income', kind: 'income' as const, icon: 'Wallet' },
        { name: 'Food', kind: 'expense' as const, icon: 'UtensilsCrossed' },
        { name: 'Housing', kind: 'expense' as const, icon: 'Home' },
        { name: 'Transport', kind: 'expense' as const, icon: 'Car' },
        { name: 'Entertainment', kind: 'expense' as const, icon: 'Clapperboard' },
        { name: 'Other', kind: 'expense' as const, icon: 'Shapes' }
    ];

    return base.map((c) => ({
        id: makeId('cat'),
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        archived: false,
        createdAt: now
    }));
}

export function emptyDB(): FinanceDB {
    return {
        version: SCHEMA_VERSION,
        accounts: [],
        transactions: [],
        recurring: [],
        categories: defaultCategories(),
        budgets: {},
        settings: { ...DEFAULT_SETTINGS },
        ui: { ...DEFAULT_UI }
    };
}

/* ── Validation ─────────────────────────────────────────────────────────── */

export interface ValidationResult {
    ok: boolean;
    errors: string[];
    /** Non-fatal repairs applied while normalising. */
    warnings: string[];
    db?: FinanceDB;
}

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const NUM = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const STR = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const BOOL = (v: unknown, fallback = false) => (typeof v === 'boolean' ? v : fallback);
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/* Coercion helpers — a ternary chain over `unknown` widens back to `string`,
   so each union is narrowed through an explicitly typed function instead. */
const toAccountType = (v: unknown): AccountType =>
    v === 'savings' ? 'savings' : v === 'pocket' ? 'pocket' : 'bank';

const toTransactionType = (v: unknown): TransactionType =>
    v === 'income' ? 'income' : v === 'transfer' ? 'transfer' : 'expense';

const toFrequency = (v: unknown): Frequency =>
    v === 'weekly' ? 'weekly' : v === 'everyXMonths' ? 'everyXMonths' : v === 'yearly' ? 'yearly' : 'monthly';

/**
 * Normalises an unknown payload (localStorage blob or imported file) into a
 * valid `FinanceDB`. Structurally broken payloads are rejected outright rather
 * than silently overwriting good data.
 */
export function validateAndNormalise(raw: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!isObj(raw)) {
        return { ok: false, errors: ['File is not a JSON object.'], warnings };
    }
    for (const key of ['accounts', 'transactions', 'categories'] as const) {
        if (!Array.isArray(raw[key])) errors.push(`Missing or invalid "${key}" array.`);
    }
    if (raw.budgets !== undefined && !isObj(raw.budgets)) errors.push('"budgets" must be an object.');
    if (errors.length) return { ok: false, errors, warnings };

    const base = emptyDB();

    const categories = (raw.categories as unknown[])
        .filter(isObj)
        .map((c) => ({
            id: STR(c.id) || makeId('cat'),
            name: STR(c.name, 'Untitled'),
            kind: c.kind === 'income' ? ('income' as const) : ('expense' as const),
            icon: STR(c.icon, 'Shapes'),
            archived: BOOL(c.archived),
            createdAt: STR(c.createdAt, new Date().toISOString())
        }))
        .filter((c) => c.name.trim().length > 0);

    if (!categories.length) {
        warnings.push('No categories in file — restored the default category set.');
        categories.push(...base.categories);
    }

    const accounts = (raw.accounts as unknown[]).filter(isObj).map((a) => ({
        id: STR(a.id) || makeId('acc'),
        name: STR(a.name, 'Untitled account'),
        type: toAccountType(a.type),
        startingBalance: NUM(a.startingBalance),
        icon: STR(a.icon, 'Landmark'),
        description: STR(a.description),
        targetAmount: typeof a.targetAmount === 'number' ? a.targetAmount : null,
        archived: BOOL(a.archived),
        createdAt: STR(a.createdAt, new Date().toISOString())
    }));

    const accountIds = new Set(accounts.map((a) => a.id));
    const categoryIds = new Set(categories.map((c) => c.id));

    let droppedTx = 0;
    const transactions = (raw.transactions as unknown[])
        .filter(isObj)
        .map((t) => {
            const type = toTransactionType(t.type);

            return {
                id: STR(t.id) || makeId('tx'),
                date: ISO_RE.test(STR(t.date)) ? STR(t.date) : todayISO(),
                description: STR(t.description),
                type,
                status: t.status === 'projected' ? ('projected' as const) : ('actual' as const),
                amount: Math.abs(NUM(t.amount)),
                accountId: STR(t.accountId) || null,
                toAccountId: STR(t.toAccountId) || null,
                categoryId: type === 'transfer' ? null : STR(t.categoryId) || null,
                notes: STR(t.notes),
                recurringId: STR(t.recurringId) || null,
                occurrenceDate: ISO_RE.test(STR(t.occurrenceDate)) ? STR(t.occurrenceDate) : null,
                createdAt: STR(t.createdAt, new Date().toISOString())
            };
        })
        .filter((t) => {
            // A transaction pointing at a deleted account can never be rendered
            // or balanced correctly, so drop it rather than corrupt totals.
            const validAccount = t.accountId !== null && accountIds.has(t.accountId);
            if (!validAccount) {
                droppedTx += 1;

                return false;
            }
            if (t.type === 'transfer' && (!t.toAccountId || !accountIds.has(t.toAccountId))) {
                droppedTx += 1;

                return false;
            }
            if (t.type !== 'transfer' && t.categoryId && !categoryIds.has(t.categoryId)) {
                t.categoryId = null;
                warnings.push(`Transaction "${t.description || t.id}" referenced a missing category.`);
            }

            return t.amount > 0;
        });

    if (droppedTx > 0) warnings.push(`${droppedTx} transaction(s) referenced missing accounts and were skipped.`);

    const recurring = Array.isArray(raw.recurring)
        ? (raw.recurring as unknown[])
              .filter(isObj)
              .map((r) => {
                  const type = toTransactionType(r.type);
                  const freq = toFrequency(r.frequency);

                  return {
                      id: STR(r.id) || makeId('rec'),
                      description: STR(r.description, 'Recurring'),
                      amount: Math.abs(NUM(r.amount)),
                      type,
                      accountId: STR(r.accountId) || null,
                      toAccountId: STR(r.toAccountId) || null,
                      categoryId: type === 'transfer' ? null : STR(r.categoryId) || null,
                      frequency: freq,
                      interval: Math.max(1, Math.round(NUM(r.interval, 1))),
                      startDate: ISO_RE.test(STR(r.startDate)) ? STR(r.startDate) : todayISO(),
                      endDate: ISO_RE.test(STR(r.endDate)) ? STR(r.endDate) : null,
                      active: BOOL(r.active, true),
                      createdAt: STR(r.createdAt, new Date().toISOString()),
                      skipped: Array.isArray(r.skipped) ? (r.skipped as unknown[]).filter((s) => ISO_RE.test(STR(s))).map(String) : []
                  };
              })
              .filter((r) => r.amount > 0 && r.accountId !== null && accountIds.has(r.accountId))
        : [];

    const budgets: FinanceDB['budgets'] = {};
    if (isObj(raw.budgets)) {
        for (const [monthKey, entry] of Object.entries(raw.budgets)) {
            if (!/^\d{4}-\d{2}$/.test(monthKey) || !isObj(entry)) continue;
            const month: Record<string, number> = {};
            for (const [catId, limit] of Object.entries(entry)) {
                if (categoryIds.has(catId) && typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
                    month[catId] = limit;
                }
            }
            if (Object.keys(month).length) budgets[monthKey] = month;
        }
    }

    const rawSettings = isObj(raw.settings) ? raw.settings : {};
    const settings: Settings = {
        ...base.settings,
        currency: STR(rawSettings.currency, base.settings.currency),
        currencySymbol: STR(rawSettings.currencySymbol, base.settings.currencySymbol),
        locale: STR(rawSettings.locale, base.settings.locale),
        decimals: rawSettings.decimals === 2 ? 2 : 0,
        compactLargeNumbers: BOOL(rawSettings.compactLargeNumbers),
        theme: rawSettings.theme === 'light' ? 'light' : 'dark',
        defaultAccountId:
            typeof rawSettings.defaultAccountId === 'string' && accountIds.has(rawSettings.defaultAccountId)
                ? rawSettings.defaultAccountId
                : null,
        startDayOfWeek: rawSettings.startDayOfWeek === 0 ? 0 : 1
    };

    const rawUi = isObj(raw.ui) ? raw.ui : {};
    const ui: UiPrefs = {
        lastView: STR(rawUi.lastView, DEFAULT_UI.lastView),
        hideBalances: BOOL(rawUi.hideBalances)
    };

    return {
        ok: true,
        errors,
        warnings,
        db: { version: SCHEMA_VERSION, accounts, transactions, recurring, categories, budgets, settings, ui }
    };
}

/* ── Persistence ────────────────────────────────────────────────────────── */

export function loadDB(): FinanceDB {
    if (typeof window === 'undefined') return emptyDB();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyDB();
        const parsed = JSON.parse(raw);
        const result = validateAndNormalise(migrate(parsed));

        return result.ok && result.db ? result.db : emptyDB();
    } catch {
        // A corrupt blob should not brick the app; fall back to an empty DB.
        return emptyDB();
    }
}

export function saveDB(db: FinanceDB): boolean {
    if (typeof window === 'undefined') return false;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

        return true;
    } catch {
        return false;
    }
}

export function clearDB(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_KEY);
}

/** Forward-migration hook. v1 is the initial schema, so this is a pass-through. */
function migrate(raw: unknown): unknown {
    if (!isObj(raw)) return raw;
    const version = NUM(raw.version, 1);
    if (version >= SCHEMA_VERSION) return raw;

    return { ...raw, version: SCHEMA_VERSION };
}

export function exportToJSON(db: FinanceDB): string {
    return JSON.stringify({ ...db, exportedAt: new Date().toISOString(), app: 'CREAM money' }, null, 2);
}
