/**
 * All dates in the app are handled as local-time `YYYY-MM-DD` strings.
 * Constructing `new Date('2026-08-01')` parses as UTC and can shift the day
 * backwards in negative-offset timezones, so every parse goes through
 * `parseISO` below, which builds a local-midnight Date instead.
 */

export const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local-midnight Date from a `YYYY-MM-DD` string. */
export function parseISO(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);

    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** `YYYY-MM-DD` from a Date, using local calendar fields. */
export function toISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

export function todayISO(): string {
    return toISO(new Date());
}

/** `YYYY-MM` bucket key for an ISO date. */
export function monthKeyOf(iso: string): string {
    return iso.slice(0, 7);
}

export function currentMonthKey(): string {
    return todayISO().slice(0, 7);
}

export function monthKeyFromDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Shift a `YYYY-MM` key by N months (negative shifts backwards). */
export function addMonthsToKey(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);

    return monthKeyFromDate(date);
}

export function monthLabel(monthKey: string, short = false): string {
    const [y, m] = monthKey.split('-').map(Number);
    const names = short ? MONTH_SHORT : MONTH_NAMES;

    return `${names[m - 1]} ${y}`;
}

export function monthLabelShort(monthKey: string): string {
    const [, m] = monthKey.split('-').map(Number);

    return MONTH_SHORT[m - 1];
}

export function monthRange(monthKey: string): { start: string; end: string } {
    const [y, m] = monthKey.split('-').map(Number);

    return { start: `${monthKey}-01`, end: toISO(new Date(y, m, 0)) };
}

export function isInMonth(iso: string, monthKey: string): boolean {
    return iso.slice(0, 7) === monthKey;
}

export function isWithin(iso: string, start: string, end: string): boolean {
    return iso >= start && iso <= end;
}

export function addDays(iso: string, days: number): string {
    const d = parseISO(iso);
    d.setDate(d.getDate() + days);

    return toISO(d);
}

/**
 * Add months while clamping the day to the target month's length, so a rule
 * anchored on the 31st lands on the 30th/28th rather than rolling into the
 * next month.
 */
export function addMonthsClamped(iso: string, months: number, anchorDay?: number): string {
    const d = parseISO(iso);
    const day = anchorDay ?? d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));

    return toISO(target);
}

/** Inclusive list of `YYYY-MM` keys between two keys. */
export function monthKeysBetween(startKey: string, endKey: string): string[] {
    const keys: string[] = [];
    let cur = startKey;
    let guard = 0;
    while (cur <= endKey && guard < 1200) {
        keys.push(cur);
        cur = addMonthsToKey(cur, 1);
        guard += 1;
    }

    return keys;
}

export function formatDisplayDate(iso: string, opts: { withYear?: boolean; weekday?: boolean } = {}): string {
    const d = parseISO(iso);
    const weekday = opts.weekday ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ` : '';
    const year = opts.withYear ? ` ${d.getFullYear()}` : '';

    return `${weekday}${MONTH_SHORT[d.getMonth()]} ${d.getDate()}${year}`;
}

export function daysBetween(fromISO: string, toISOStr: string): number {
    const a = parseISO(fromISO).getTime();
    const b = parseISO(toISOStr).getTime();

    return Math.round((b - a) / 86_400_000);
}

/** End of the current week, honouring the user's start-of-week preference. */
export function endOfWeekISO(fromISO: string, startDay: 0 | 1): string {
    const d = parseISO(fromISO);
    const dow = d.getDay();
    const offset = startDay === 1 ? (dow === 0 ? 0 : 7 - dow) : 6 - dow;

    return addDays(fromISO, offset);
}

export function endOfMonthISO(iso: string): string {
    return monthRange(monthKeyOf(iso)).end;
}

export function relativeDayLabel(iso: string, today = todayISO()): string {
    const diff = daysBetween(today, iso);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return `In ${diff} days`;
    if (diff < -1 && diff > -7) return `${Math.abs(diff)} days ago`;

    return formatDisplayDate(iso);
}
