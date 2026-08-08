'use client';

import { useCallback, useMemo } from 'react';

import { formatAxisMoney, formatMoney, maskAmount, type FormatOptions } from '@/lib/finance/format';
import { useFinance } from '@/lib/finance/store';
import { cn } from '@/lib/utils';

/**
 * Central money formatter. Every figure in the app renders through this so
 * currency, decimals and the "hide balances" preference stay consistent.
 */
export function useMoneyFormat() {
    const { db } = useFinance();
    const { settings, ui } = db;

    const format = useCallback(
        (value: number, opts: FormatOptions = {}) => {
            const out = formatMoney(value, settings, {
                ...opts,
                compact: opts.compact ?? settings.compactLargeNumbers
            });

            return ui.hideBalances ? maskAmount(out) : out;
        },
        [settings, ui.hideBalances]
    );

    /** Charts must keep real numbers even while balances are hidden on screen. */
    const formatAxis = useCallback((value: number) => formatAxisMoney(value, settings), [settings]);

    const formatRaw = useCallback(
        (value: number, opts: FormatOptions = {}) => formatMoney(value, settings, opts),
        [settings]
    );

    return useMemo(
        () => ({ format, formatAxis, formatRaw, symbol: settings.currencySymbol, settings, hidden: ui.hideBalances }),
        [format, formatAxis, formatRaw, settings, ui.hideBalances]
    );
}

export function Money({
    value,
    signed,
    compact,
    decimals,
    className,
    colorBySign
}: {
    value: number;
    signed?: boolean;
    compact?: boolean;
    decimals?: number;
    className?: string;
    /** Tint positive green / negative red — used for cash-flow figures. */
    colorBySign?: boolean;
}) {
    const { format } = useMoneyFormat();
    const tone = colorBySign ? (value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : 'text-text') : '';

    return <span className={cn('tnum', tone, className)}>{format(value, { signed, compact, decimals })}</span>;
}
