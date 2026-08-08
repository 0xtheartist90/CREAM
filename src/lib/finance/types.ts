/** Domain model for the CREAM money finance database. */

export type AccountType = 'bank' | 'savings' | 'pocket';

export interface Account {
    id: string;
    name: string;
    type: AccountType;
    /** Opening balance the account had before any tracked transaction. */
    startingBalance: number;
    icon: string;
    description: string;
    /** Pockets only. `null` means no savings target set. */
    targetAmount: number | null;
    archived: boolean;
    createdAt: string;
}

export type CategoryKind = 'income' | 'expense';

export interface Category {
    id: string;
    name: string;
    kind: CategoryKind;
    icon: string;
    archived: boolean;
    createdAt: string;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

/**
 * `actual` — money that has really moved; affects current balances.
 * `projected` — scheduled/expected; affects forecasts only, never current balances.
 */
export type TransactionStatus = 'actual' | 'projected';

export interface Transaction {
    id: string;
    /** ISO date, `YYYY-MM-DD`. */
    date: string;
    description: string;
    type: TransactionType;
    status: TransactionStatus;
    /** Always stored positive; direction is carried by `type`. */
    amount: number;
    /** Source account for income/expense/transfer-out. */
    accountId: string | null;
    /** Destination account, transfers only. */
    toAccountId: string | null;
    /** `null` for transfers — transfers are never categorised. */
    categoryId: string | null;
    notes: string;
    /** Set when this row was materialised from a recurring rule occurrence. */
    recurringId: string | null;
    /** The occurrence date this row satisfies, so the generator can skip it. */
    occurrenceDate: string | null;
    createdAt: string;
}

export type Frequency = 'weekly' | 'monthly' | 'everyXMonths' | 'yearly';

export interface RecurringRule {
    id: string;
    description: string;
    amount: number;
    type: TransactionType;
    accountId: string | null;
    toAccountId: string | null;
    categoryId: string | null;
    frequency: Frequency;
    /** Step size: weeks for `weekly`, months for `everyXMonths`. */
    interval: number;
    startDate: string;
    endDate: string | null;
    active: boolean;
    createdAt: string;
    /** Occurrence dates the user dismissed without recording a transaction. */
    skipped: string[];
}

/** `budgets[YYYY-MM][categoryId] = limit`. Keyed by id so renames never orphan history. */
export type BudgetMap = Record<string, Record<string, number>>;

export interface Settings {
    currency: string;
    currencySymbol: string;
    locale: string;
    decimals: 0 | 2;
    /** Compact rendering of large figures on KPI tiles (฿1.2M). */
    compactLargeNumbers: boolean;
    theme: 'dark' | 'light';
    defaultAccountId: string | null;
    startDayOfWeek: 0 | 1;
}

export interface UiPrefs {
    lastView: string;
    hideBalances: boolean;
}

export interface FinanceDB {
    version: number;
    accounts: Account[];
    transactions: Transaction[];
    recurring: RecurringRule[];
    categories: Category[];
    budgets: BudgetMap;
    settings: Settings;
    ui: UiPrefs;
}

/* ── Derived / computed shapes ──────────────────────────────────────────── */

export interface AccountBalance {
    account: Account;
    balance: number;
    /** Share of total net worth, 0–100. */
    shareOfNetWorth: number;
}

export interface NetWorthSummary {
    total: number;
    bank: number;
    savings: number;
    pockets: number;
}

export interface MonthSummary {
    monthKey: string;
    income: number;
    expenses: number;
    netCashFlow: number;
}

export type BudgetState = 'normal' | 'approaching' | 'near-limit' | 'over';

export interface BudgetProgress {
    category: Category;
    limit: number;
    spent: number;
    remaining: number;
    /** Unclamped, so >100 is meaningful for over-budget rows. */
    percentUsed: number;
    state: BudgetState;
}

export interface BudgetTotals {
    limit: number;
    spent: number;
    remaining: number;
    percentUsed: number;
}

/** One materialised occurrence of a recurring rule, generated on demand. */
export interface UpcomingItem {
    /** Stable synthetic id: real transaction id, or `ruleId::date`. */
    id: string;
    date: string;
    description: string;
    type: TransactionType;
    amount: number;
    accountId: string | null;
    toAccountId: string | null;
    categoryId: string | null;
    /** Present when this came from a recurring rule rather than a stored row. */
    recurringId: string | null;
    source: 'transaction' | 'recurring';
}

export interface ProjectionMonth {
    monthKey: string;
    label: string;
    startingBalance: number;
    income: number;
    expenses: number;
    netCashFlow: number;
    endingBalance: number;
    isHistorical: boolean;
}
