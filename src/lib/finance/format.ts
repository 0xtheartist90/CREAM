import type { Settings } from './types';

/**
 * Money is stored as a plain number in the single app currency.
 * Rounding happens at the edges (input + display) so arithmetic stays exact
 * enough for the balances we deal with.
 */

export function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface FormatOptions {
    /** Always render a leading + or −. */
    signed?: boolean;
    /** Drop the currency symbol. */
    bare?: boolean;
    /** Allow 1.2K / 1.2M shortening (KPI tiles, chart axes). */
    compact?: boolean;
    /** Override the settings' decimal preference. */
    decimals?: number;
}

export function formatMoney(value: number, settings: Settings, opts: FormatOptions = {}): string {
    const safe = Number.isFinite(value) ? value : 0;
    const decimals = opts.decimals ?? settings.decimals;
    const abs = Math.abs(safe);

    let body: string;
    if (opts.compact && abs >= 1_000_000) {
        body = `${trimZeros((abs / 1_000_000).toFixed(2))}M`;
    } else if (opts.compact && abs >= 10_000) {
        body = `${trimZeros((abs / 1_000).toFixed(1))}K`;
    } else {
        body = abs.toLocaleString(settings.locale || 'en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    const symbol = opts.bare ? '' : settings.currencySymbol;
    const sign = opts.signed ? (safe > 0 ? '+' : safe < 0 ? '−' : '') : safe < 0 ? '−' : '';

    return `${sign}${symbol}${body}`;
}

/**
 * Drops trailing zeros from a decimal fraction only. Guarding on the decimal
 * point matters: a bare `replace(/\.?0+$/)` turns "400" into "4", which would
 * render a ฿400K axis tick as ฿4K.
 */
function trimZeros(s: string): string {
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Compact axis/tick label — never shows decimals for readability. */
export function formatAxisMoney(value: number, settings: Settings): string {
    const abs = Math.abs(value);
    const sign = value < 0 ? '−' : '';
    if (abs >= 1_000_000) return `${sign}${settings.currencySymbol}${trimZeros((abs / 1_000_000).toFixed(1))}M`;
    if (abs >= 1_000) return `${sign}${settings.currencySymbol}${trimZeros((abs / 1_000).toFixed(0))}K`;

    return `${sign}${settings.currencySymbol}${Math.round(abs)}`;
}

export function formatPercent(value: number, decimals = 1): string {
    if (!Number.isFinite(value)) return '—';

    return `${value.toFixed(decimals).replace(/\.0+$/, '')}%`;
}

export function formatSignedPercent(value: number, decimals = 1): string {
    if (!Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';

    return `${sign}${Math.abs(value).toFixed(decimals).replace(/\.0+$/, '')}%`;
}

/**
 * Percentage change between two values, guarding the divide-by-zero case that
 * shows up constantly in month-over-month comparisons on a fresh database.
 */
export function percentChange(current: number, previous: number): number | null {
    if (previous === 0) return current === 0 ? 0 : null;

    return ((current - previous) / Math.abs(previous)) * 100;
}

export function maskAmount(formatted: string): string {
    return formatted.replace(/[\d.,]/g, '•');
}

/** Parse free-typed amount input ("1,250.50", "฿1 200") into a number. */
export function parseAmountInput(raw: string): number {
    const cleaned = raw.replace(/[^\d.-]/g, '');
    const value = Number.parseFloat(cleaned);

    return Number.isFinite(value) ? value : NaN;
}

export const CURRENCY_PRESETS: { code: string; symbol: string; label: string; locale: string }[] = [
    { code: 'THB', symbol: '฿', label: 'Thai Baht', locale: 'en-US' },
    { code: 'USD', symbol: '$', label: 'US Dollar', locale: 'en-US' },
    { code: 'EUR', symbol: '€', label: 'Euro', locale: 'de-DE' },
    { code: 'GBP', symbol: '£', label: 'British Pound', locale: 'en-GB' },
    { code: 'JPY', symbol: '¥', label: 'Japanese Yen', locale: 'ja-JP' },
    { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar', locale: 'en-SG' },
    { code: 'AUD', symbol: 'A$', label: 'Australian Dollar', locale: 'en-AU' },
    { code: 'INR', symbol: '₹', label: 'Indian Rupee', locale: 'en-IN' }
];
