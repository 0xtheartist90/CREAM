import {
    addMonthsToKey,
    currentMonthKey,
    endOfMonthISO,
    isInMonth,
    monthKeyOf,
    monthLabel,
    monthLabelShort,
    monthRange,
    todayISO
} from './dates';
import { roundMoney } from './format';
import { pendingOccurrences, ruleToUpcomingItem } from './recurring';
import type {
    Account,
    AccountBalance,
    BudgetProgress,
    BudgetState,
    BudgetTotals,
    Category,
    FinanceDB,
    MonthSummary,
    NetWorthSummary,
    ProjectionMonth,
    Transaction,
    UpcomingItem
} from './types';

/* ── Balances ───────────────────────────────────────────────────────────────
   Only `actual` transactions move real balances. Projected rows are forecast
   inputs and must never leak into today's numbers.                          */

export function isActual(t: Transaction): boolean {
    return t.status === 'actual';
}

/**
 * Signed effect of one transaction on one account.
 * Transfers debit the source and credit the destination.
 */
export function effectOnAccount(t: Transaction, accountId: string): number {
    if (t.type === 'income') return t.accountId === accountId ? t.amount : 0;
    if (t.type === 'expense') return t.accountId === accountId ? -t.amount : 0;
    // transfer
    let delta = 0;
    if (t.accountId === accountId) delta -= t.amount;
    if (t.toAccountId === accountId) delta += t.amount;

    return delta;
}

/**
 * Current balance for every account, computed in a single pass.
 * `asOf` bounds the transactions considered, enabling historical net worth.
 */
export function computeBalances(db: FinanceDB, asOf?: string): Map<string, number> {
    const balances = new Map<string, number>();
    for (const acc of db.accounts) balances.set(acc.id, acc.startingBalance);

    for (const t of db.transactions) {
        if (!isActual(t)) continue;
        if (asOf && t.date > asOf) continue;

        if (t.type === 'transfer') {
            if (t.accountId && balances.has(t.accountId)) {
                balances.set(t.accountId, (balances.get(t.accountId) ?? 0) - t.amount);
            }
            if (t.toAccountId && balances.has(t.toAccountId)) {
                balances.set(t.toAccountId, (balances.get(t.toAccountId) ?? 0) + t.amount);
            }
        } else if (t.accountId && balances.has(t.accountId)) {
            const delta = t.type === 'income' ? t.amount : -t.amount;
            balances.set(t.accountId, (balances.get(t.accountId) ?? 0) + delta);
        }
    }

    for (const [id, v] of balances) balances.set(id, roundMoney(v));

    return balances;
}

export function activeAccounts(db: FinanceDB): Account[] {
    return db.accounts.filter((a) => !a.archived);
}

export function netWorthSummary(db: FinanceDB, balances?: Map<string, number>): NetWorthSummary {
    const bal = balances ?? computeBalances(db);
    const sum = { total: 0, bank: 0, savings: 0, pockets: 0 };

    for (const acc of db.accounts) {
        if (acc.archived) continue;
        const v = bal.get(acc.id) ?? 0;
        sum.total += v;
        if (acc.type === 'bank') sum.bank += v;
        else if (acc.type === 'savings') sum.savings += v;
        else sum.pockets += v;
    }

    return {
        total: roundMoney(sum.total),
        bank: roundMoney(sum.bank),
        savings: roundMoney(sum.savings),
        pockets: roundMoney(sum.pockets)
    };
}

/** Net worth as it stood at the end of `asOf` (inclusive). */
export function netWorthAsOf(db: FinanceDB, asOf: string): number {
    const balances = computeBalances(db, asOf);
    let total = 0;
    for (const acc of db.accounts) {
        if (acc.archived) continue;
        total += balances.get(acc.id) ?? 0;
    }

    return roundMoney(total);
}

export function accountBalancesWithShare(db: FinanceDB, balances?: Map<string, number>): AccountBalance[] {
    const bal = balances ?? computeBalances(db);
    const total = netWorthSummary(db, bal).total;

    return db.accounts
        .filter((a) => !a.archived)
        .map((account) => {
            const balance = bal.get(account.id) ?? 0;

            return {
                account,
                balance,
                shareOfNetWorth: total !== 0 ? (balance / total) * 100 : 0
            };
        })
        .sort((a, b) => b.balance - a.balance);
}

/* ── Monthly aggregation ────────────────────────────────────────────────── */

/** Actual income/expense totals for a month. Transfers are always excluded. */
export function monthSummary(db: FinanceDB, monthKey: string): MonthSummary {
    let income = 0;
    let expenses = 0;

    for (const t of db.transactions) {
        if (!isActual(t) || t.type === 'transfer') continue;
        if (!isInMonth(t.date, monthKey)) continue;
        if (t.type === 'income') income += t.amount;
        else expenses += t.amount;
    }

    return {
        monthKey,
        income: roundMoney(income),
        expenses: roundMoney(expenses),
        netCashFlow: roundMoney(income - expenses)
    };
}

export function monthSummaries(db: FinanceDB, monthKeys: string[]): MonthSummary[] {
    return monthKeys.map((k) => monthSummary(db, k));
}

/** Actual expense total for one category in one month — the budget input. */
export function categorySpending(db: FinanceDB, monthKey: string, categoryId: string): number {
    let total = 0;
    for (const t of db.transactions) {
        if (!isActual(t) || t.type !== 'expense') continue;
        if (t.categoryId !== categoryId) continue;
        if (!isInMonth(t.date, monthKey)) continue;
        total += t.amount;
    }

    return roundMoney(total);
}

/** Actual expenses grouped by category id for a month. */
export function spendingByCategory(db: FinanceDB, monthKey: string): Map<string, number> {
    const map = new Map<string, number>();
    for (const t of db.transactions) {
        if (!isActual(t) || t.type !== 'expense') continue;
        if (!isInMonth(t.date, monthKey)) continue;
        const key = t.categoryId ?? 'uncategorised';
        map.set(key, roundMoney((map.get(key) ?? 0) + t.amount));
    }

    return map;
}

export function spendingByCategoryInRange(db: FinanceDB, start: string, end: string): Map<string, number> {
    const map = new Map<string, number>();
    for (const t of db.transactions) {
        if (!isActual(t) || t.type !== 'expense') continue;
        if (t.date < start || t.date > end) continue;
        const key = t.categoryId ?? 'uncategorised';
        map.set(key, roundMoney((map.get(key) ?? 0) + t.amount));
    }

    return map;
}

export function incomeByCategoryInRange(db: FinanceDB, start: string, end: string): Map<string, number> {
    const map = new Map<string, number>();
    for (const t of db.transactions) {
        if (!isActual(t) || t.type !== 'income') continue;
        if (t.date < start || t.date > end) continue;
        const key = t.categoryId ?? 'uncategorised';
        map.set(key, roundMoney((map.get(key) ?? 0) + t.amount));
    }

    return map;
}

export function rangeSummary(db: FinanceDB, start: string, end: string): { income: number; expenses: number; net: number } {
    let income = 0;
    let expenses = 0;
    for (const t of db.transactions) {
        if (!isActual(t) || t.type === 'transfer') continue;
        if (t.date < start || t.date > end) continue;
        if (t.type === 'income') income += t.amount;
        else expenses += t.amount;
    }

    return { income: roundMoney(income), expenses: roundMoney(expenses), net: roundMoney(income - expenses) };
}

/* ── Budgets ────────────────────────────────────────────────────────────── */

export function budgetState(percentUsed: number): BudgetState {
    if (percentUsed >= 100) return 'over';
    if (percentUsed >= 90) return 'near-limit';
    if (percentUsed >= 70) return 'approaching';

    return 'normal';
}

export const BUDGET_STATE_LABEL: Record<BudgetState, string> = {
    normal: 'On track',
    approaching: 'Approaching budget',
    'near-limit': 'Near limit',
    over: 'Over budget'
};

/** Budget rows for a month, one per category that has a limit set. */
export function budgetProgress(db: FinanceDB, monthKey: string): BudgetProgress[] {
    const limits = db.budgets[monthKey] ?? {};
    const spendMap = spendingByCategory(db, monthKey);
    const catById = new Map(db.categories.map((c) => [c.id, c]));

    const rows: BudgetProgress[] = [];
    for (const [categoryId, limit] of Object.entries(limits)) {
        const category = catById.get(categoryId);
        if (!category || category.kind !== 'expense') continue;
        const spent = spendMap.get(categoryId) ?? 0;
        const percentUsed = limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0;
        rows.push({
            category,
            limit,
            spent,
            remaining: roundMoney(limit - spent),
            percentUsed,
            state: budgetState(percentUsed)
        });
    }

    return rows.sort((a, b) => b.percentUsed - a.percentUsed);
}

export function budgetTotals(rows: BudgetProgress[]): BudgetTotals {
    const limit = roundMoney(rows.reduce((s, r) => s + r.limit, 0));
    const spent = roundMoney(rows.reduce((s, r) => s + r.spent, 0));

    return {
        limit,
        spent,
        remaining: roundMoney(limit - spent),
        percentUsed: limit > 0 ? (spent / limit) * 100 : 0
    };
}

/** Expense categories that have spending but no budget set for the month. */
export function unbudgetedSpending(db: FinanceDB, monthKey: string): { category: Category; spent: number }[] {
    const limits = db.budgets[monthKey] ?? {};
    const spendMap = spendingByCategory(db, monthKey);
    const catById = new Map(db.categories.map((c) => [c.id, c]));
    const out: { category: Category; spent: number }[] = [];

    for (const [catId, spent] of spendMap) {
        if (limits[catId] !== undefined) continue;
        const category = catById.get(catId);
        if (!category) continue;
        out.push({ category, spent });
    }

    return out.sort((a, b) => b.spent - a.spent);
}

/* ── Upcoming ───────────────────────────────────────────────────────────── */

/**
 * Everything scheduled between `from` and `to`: stored projected rows plus
 * dynamically generated recurring occurrences, merged and sorted by date.
 */
export function upcomingItems(db: FinanceDB, from: string, to: string): UpcomingItem[] {
    const items: UpcomingItem[] = [];

    for (const t of db.transactions) {
        if (t.status !== 'projected') continue;
        if (t.date < from || t.date > to) continue;
        items.push({
            id: t.id,
            date: t.date,
            description: t.description,
            type: t.type,
            amount: t.amount,
            accountId: t.accountId,
            toAccountId: t.toAccountId,
            categoryId: t.categoryId,
            recurringId: t.recurringId,
            source: 'transaction'
        });
    }

    for (const rule of db.recurring) {
        if (!rule.active) continue;
        for (const date of pendingOccurrences(rule, from, to, db.transactions)) {
            items.push(ruleToUpcomingItem(rule, date));
        }
    }

    return items.sort((a, b) => (a.date === b.date ? a.description.localeCompare(b.description) : a.date < b.date ? -1 : 1));
}

/* ── Projection ─────────────────────────────────────────────────────────────
   One engine drives every projection view. Net-worth mode ignores transfers
   (they move money between own accounts and cannot change the total); account
   mode includes them, since they are exactly what moves a single balance.    */

export interface ProjectionOptions {
    months?: number;
    /** `null` = whole net worth. Otherwise scope to a single account. */
    accountId?: string | null;
    /** Historical months to prepend so the actual→projected seam is visible. */
    historyMonths?: number;
}

export function buildProjection(db: FinanceDB, opts: ProjectionOptions = {}): ProjectionMonth[] {
    const months = opts.months ?? 12;
    const historyMonths = opts.historyMonths ?? 0;
    const accountId = opts.accountId ?? null;
    const today = todayISO();
    const thisMonth = currentMonthKey();

    const balanceOf = (asOf?: string) => {
        const balances = computeBalances(db, asOf);
        if (accountId) return roundMoney(balances.get(accountId) ?? 0);
        let total = 0;
        for (const acc of db.accounts) {
            if (acc.archived) continue;
            total += balances.get(acc.id) ?? 0;
        }

        return roundMoney(total);
    };

    const out: ProjectionMonth[] = [];

    /* Historical section: real month-end balances from actual transactions. */
    for (let i = historyMonths; i >= 1; i--) {
        const key = addMonthsToKey(thisMonth, -i);
        const { start, end } = monthRange(key);
        const startingBalance = balanceOf(addDaysISO(start, -1));
        const endingBalance = balanceOf(end);

        let income = 0;
        let expenses = 0;
        for (const t of db.transactions) {
            if (!isActual(t) || !isInMonth(t.date, key)) continue;
            const signed = signedForScope(t, accountId);
            if (signed > 0) income += signed;
            else expenses += -signed;
        }

        out.push({
            monthKey: key,
            label: monthLabelShort(key),
            startingBalance,
            income: roundMoney(income),
            expenses: roundMoney(expenses),
            netCashFlow: roundMoney(income - expenses),
            endingBalance,
            isHistorical: true
        });
    }

    /* Forward section: current balance, then scheduled money month by month. */
    let running = balanceOf();

    // Remaining scheduled items in the current month are counted from today,
    // so the first bucket does not re-apply money that already moved.
    for (let i = 0; i < months; i++) {
        const key = addMonthsToKey(thisMonth, i);
        const { start, end } = monthRange(key);
        const windowStart = i === 0 ? addDaysISO(today, 1) : start;

        const scheduled = upcomingItems(db, windowStart, end);
        let income = 0;
        let expenses = 0;
        for (const item of scheduled) {
            const signed = signedForScopeItem(item, accountId);
            if (signed > 0) income += signed;
            else expenses += -signed;
        }

        const startingBalance = running;
        const endingBalance = roundMoney(startingBalance + income - expenses);
        running = endingBalance;

        out.push({
            monthKey: key,
            label: monthLabelShort(key),
            startingBalance,
            income: roundMoney(income),
            expenses: roundMoney(expenses),
            netCashFlow: roundMoney(income - expenses),
            endingBalance,
            isHistorical: false
        });
    }

    return out;
}

/** Signed contribution of a stored transaction under the active scope. */
function signedForScope(t: Transaction, accountId: string | null): number {
    if (accountId) return effectOnAccount(t, accountId);
    if (t.type === 'transfer') return 0; // never changes total net worth
    return t.type === 'income' ? t.amount : -t.amount;
}

function signedForScopeItem(item: UpcomingItem, accountId: string | null): number {
    if (accountId) {
        if (item.type === 'transfer') {
            let d = 0;
            if (item.accountId === accountId) d -= item.amount;
            if (item.toAccountId === accountId) d += item.amount;

            return d;
        }
        if (item.accountId !== accountId) return 0;

        return item.type === 'income' ? item.amount : -item.amount;
    }
    if (item.type === 'transfer') return 0;

    return item.type === 'income' ? item.amount : -item.amount;
}

function addDaysISO(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    return `${yy}-${mm}-${dd}`;
}

/** Projected net worth at a horizon, e.g. 3 / 6 / 12 months out. */
export function projectedNetWorthAt(db: FinanceDB, monthsAhead: number): number {
    const series = buildProjection(db, { months: Math.max(1, monthsAhead) });
    const forward = series.filter((m) => !m.isHistorical);
    const target = forward[Math.min(monthsAhead, forward.length) - 1];

    return target ? target.endingBalance : netWorthSummary(db).total;
}

/* ── Reporting helpers ──────────────────────────────────────────────────── */

export function topSpendingCategories(
    db: FinanceDB,
    monthKey: string,
    limit = 5
): { category: Category; amount: number; share: number }[] {
    const map = spendingByCategory(db, monthKey);
    const catById = new Map(db.categories.map((c) => [c.id, c]));
    const total = [...map.values()].reduce((s, v) => s + v, 0);

    return [...map.entries()]
        .map(([id, amount]) => ({ category: catById.get(id), amount }))
        .filter((r): r is { category: Category; amount: number } => Boolean(r.category))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit)
        .map((r) => ({ ...r, share: total > 0 ? (r.amount / total) * 100 : 0 }));
}

export function largestTransactions(db: FinanceDB, monthKey: string, limit = 5): Transaction[] {
    return db.transactions
        .filter((t) => isActual(t) && t.type !== 'transfer' && isInMonth(t.date, monthKey))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit);
}

export function recentTransactions(db: FinanceDB, limit = 6): Transaction[] {
    return [...db.transactions]
        .filter((t) => isActual(t))
        .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1))
        .slice(0, limit);
}

/** Month-end net worth series from actual data only — used by reports. */
export function netWorthSeries(db: FinanceDB, monthKeys: string[]): { monthKey: string; label: string; value: number }[] {
    return monthKeys.map((key) => ({
        monthKey: key,
        label: monthLabelShort(key),
        value: netWorthAsOf(db, monthRange(key).end)
    }));
}

export function categoryById(db: FinanceDB, id: string | null): Category | undefined {
    if (!id) return undefined;

    return db.categories.find((c) => c.id === id);
}

export function accountById(db: FinanceDB, id: string | null): Account | undefined {
    if (!id) return undefined;

    return db.accounts.find((a) => a.id === id);
}

/** Transactions referencing a category — drives safe category deletion. */
export function transactionsUsingCategory(db: FinanceDB, categoryId: string): Transaction[] {
    return db.transactions.filter((t) => t.categoryId === categoryId);
}

export function budgetsUsingCategory(db: FinanceDB, categoryId: string): string[] {
    return Object.entries(db.budgets)
        .filter(([, entry]) => entry[categoryId] !== undefined)
        .map(([monthKey]) => monthKey);
}

export function transactionsUsingAccount(db: FinanceDB, accountId: string): Transaction[] {
    return db.transactions.filter((t) => t.accountId === accountId || t.toAccountId === accountId);
}

export { monthLabel, monthKeyOf, endOfMonthISO };
