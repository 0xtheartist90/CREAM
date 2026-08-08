import { addDays, addMonthsClamped, parseISO } from './dates';
import type { RecurringRule, Transaction, UpcomingItem } from './types';

/**
 * Occurrences are generated on demand for a bounded window rather than being
 * written into the database, so a rule running for years never bloats storage.
 */

const MAX_OCCURRENCES = 600;

function stepMonths(rule: RecurringRule): number {
    switch (rule.frequency) {
        case 'monthly':
            return 1;
        case 'everyXMonths':
            return Math.max(1, rule.interval);
        case 'yearly':
            return 12;
        default:
            return 0;
    }
}

/**
 * Every occurrence date for a rule within `[from, to]` (inclusive), ignoring
 * whether it has already been recorded as a real transaction.
 */
export function occurrenceDates(rule: RecurringRule, from: string, to: string): string[] {
    const out: string[] = [];
    if (!rule.active) return out;

    const hardEnd = rule.endDate && rule.endDate < to ? rule.endDate : to;
    if (rule.startDate > hardEnd) return out;

    if (rule.frequency === 'weekly') {
        const stepDays = 7 * Math.max(1, rule.interval);
        // Jump straight to the first occurrence >= `from` instead of walking
        // from startDate, which could be years earlier.
        const daysFromStart = Math.round(
            (parseISO(from).getTime() - parseISO(rule.startDate).getTime()) / 86_400_000
        );
        const skipSteps = daysFromStart > 0 ? Math.floor(daysFromStart / stepDays) : 0;
        let cursor = addDays(rule.startDate, skipSteps * stepDays);
        let guard = 0;
        while (cursor <= hardEnd && guard < MAX_OCCURRENCES) {
            if (cursor >= from && cursor >= rule.startDate) out.push(cursor);
            cursor = addDays(cursor, stepDays);
            guard += 1;
        }

        return out;
    }

    const step = stepMonths(rule);
    if (step <= 0) return out;

    const anchorDay = parseISO(rule.startDate).getDate();
    let index = 0;
    let guard = 0;
    let cursor = rule.startDate;
    while (cursor <= hardEnd && guard < MAX_OCCURRENCES) {
        if (cursor >= from) out.push(cursor);
        index += step;
        cursor = addMonthsClamped(rule.startDate, index, anchorDay);
        guard += 1;
    }

    return out;
}

/**
 * Occurrences that still need to happen — excludes dates the user skipped and
 * dates already satisfied by a stored transaction, so nothing double-counts.
 */
export function pendingOccurrences(
    rule: RecurringRule,
    from: string,
    to: string,
    transactions: Transaction[]
): string[] {
    const satisfied = new Set(
        transactions.filter((t) => t.recurringId === rule.id && t.occurrenceDate).map((t) => t.occurrenceDate as string)
    );
    const skipped = new Set(rule.skipped);

    return occurrenceDates(rule, from, to).filter((d) => !satisfied.has(d) && !skipped.has(d));
}

export function ruleToUpcomingItem(rule: RecurringRule, date: string): UpcomingItem {
    return {
        id: `${rule.id}::${date}`,
        date,
        description: rule.description,
        type: rule.type,
        amount: rule.amount,
        accountId: rule.accountId,
        toAccountId: rule.toAccountId,
        categoryId: rule.categoryId,
        recurringId: rule.id,
        source: 'recurring'
    };
}

export function frequencyLabel(rule: RecurringRule): string {
    const day = parseISO(rule.startDate).getDate();
    const ordinal = (n: number) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;

        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    switch (rule.frequency) {
        case 'weekly': {
            const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
                parseISO(rule.startDate).getDay()
            ];

            return rule.interval === 1 ? `Weekly on ${weekday}` : `Every ${rule.interval} weeks on ${weekday}`;
        }
        case 'monthly':
            return `Monthly on the ${ordinal(day)}`;
        case 'everyXMonths':
            return `Every ${rule.interval} months on the ${ordinal(day)}`;
        case 'yearly':
            return `Yearly on ${parseISO(rule.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
        default:
            return 'Recurring';
    }
}

export function nextOccurrence(rule: RecurringRule, fromDate: string, transactions: Transaction[]): string | null {
    // Two years is a generous bound: any active rule fires well within it.
    const horizon = addMonthsClamped(fromDate, 24);

    return pendingOccurrences(rule, fromDate, horizon, transactions)[0] ?? null;
}
