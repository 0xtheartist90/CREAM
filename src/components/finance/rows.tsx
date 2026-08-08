'use client';

import { ArrowLeftRight, ArrowRight } from 'lucide-react';

import { formatDisplayDate } from '@/lib/finance/dates';
import type { Account, Category, Transaction, UpcomingItem } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { IconTile } from './icons';
import { useMoneyFormat } from './money';
import { Pill } from './ui';

export interface Lookups {
    accountById: Map<string, Account>;
    categoryById: Map<string, Category>;
}

export function buildLookups(accounts: Account[], categories: Category[]): Lookups {
    return {
        accountById: new Map(accounts.map((a) => [a.id, a])),
        categoryById: new Map(categories.map((c) => [c.id, c]))
    };
}

function signedAmount(type: Transaction['type'] | UpcomingItem['type'], amount: number): number {
    if (type === 'income') return amount;
    if (type === 'expense') return -amount;

    return amount;
}

/** Shared presentation for a ledger line — used by lists on every screen. */
export function TransactionRow({
    tx,
    lookups,
    onClick,
    trailing,
    dense
}: {
    tx: Transaction;
    lookups: Lookups;
    onClick?: () => void;
    trailing?: React.ReactNode;
    dense?: boolean;
}) {
    const { format } = useMoneyFormat();
    const category = tx.categoryId ? lookups.categoryById.get(tx.categoryId) : undefined;
    const account = tx.accountId ? lookups.accountById.get(tx.accountId) : undefined;
    const toAccount = tx.toAccountId ? lookups.accountById.get(tx.toAccountId) : undefined;
    const isTransfer = tx.type === 'transfer';
    const value = signedAmount(tx.type, tx.amount);

    const subtitle = isTransfer ? (
        <span className='flex items-center gap-1'>
            {account?.name ?? 'Unknown'}
            <ArrowRight className='size-3 shrink-0' />
            {toAccount?.name ?? 'Unknown'}
        </span>
    ) : (
        <span className='truncate'>
            {category?.name ?? 'Uncategorised'}
            <span className='text-text-faint'> · </span>
            {account?.name ?? 'Unknown'}
        </span>
    );

    const Wrapper = onClick ? 'button' : 'div';

    return (
        <Wrapper
            onClick={onClick}
            className={cn(
                'group flex w-full items-center gap-3 rounded-[12px] text-left transition-colors',
                dense ? 'px-2 py-2' : 'px-2 py-2.5',
                onClick && 'hover:bg-surface-2 cursor-pointer'
            )}>
            <IconTile
                name={isTransfer ? 'Repeat' : (category?.icon ?? 'Shapes')}
                tone={isTransfer ? 'accent' : tx.type === 'income' ? 'positive' : 'muted'}
                size={dense ? 'sm' : 'md'}
            />

            <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-1.5'>
                    <p className='text-text truncate text-[13.5px] font-medium'>
                        {tx.description || (isTransfer ? 'Transfer' : (category?.name ?? 'Transaction'))}
                    </p>
                    {tx.status === 'projected' ? (
                        <Pill tone='accent' className='shrink-0'>
                            Scheduled
                        </Pill>
                    ) : null}
                </div>
                <div className='text-text-muted mt-0.5 flex items-center gap-1 truncate text-[11.5px]'>{subtitle}</div>
            </div>

            <div className='shrink-0 text-right'>
                <p
                    className={cn(
                        'tnum text-[13.5px] font-semibold',
                        isTransfer ? 'text-text-muted' : value > 0 ? 'text-positive' : 'text-text'
                    )}>
                    {isTransfer ? format(tx.amount) : format(value, { signed: true })}
                </p>
                <p className='text-text-faint mt-0.5 text-[11px]'>{formatDisplayDate(tx.date)}</p>
            </div>

            {trailing}
        </Wrapper>
    );
}

export function UpcomingRow({
    item,
    lookups,
    actions
}: {
    item: UpcomingItem;
    lookups: Lookups;
    actions?: React.ReactNode;
}) {
    const { format } = useMoneyFormat();
    const category = item.categoryId ? lookups.categoryById.get(item.categoryId) : undefined;
    const account = item.accountId ? lookups.accountById.get(item.accountId) : undefined;
    const toAccount = item.toAccountId ? lookups.accountById.get(item.toAccountId) : undefined;
    const isTransfer = item.type === 'transfer';
    const value = signedAmount(item.type, item.amount);

    return (
        <div className='group hover:bg-surface-2 flex items-center gap-3 rounded-[12px] px-2 py-2.5 transition-colors'>
            <IconTile
                name={isTransfer ? 'Repeat' : (category?.icon ?? 'Shapes')}
                tone={isTransfer ? 'accent' : item.type === 'income' ? 'positive' : 'muted'}
            />

            <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-1.5'>
                    <p className='text-text truncate text-[13.5px] font-medium'>{item.description || 'Scheduled'}</p>
                    {item.source === 'recurring' ? (
                        <Pill tone='neutral' className='shrink-0' icon={<ArrowLeftRight className='size-2.5' />}>
                            Recurring
                        </Pill>
                    ) : null}
                </div>
                <p className='text-text-muted mt-0.5 truncate text-[11.5px]'>
                    {isTransfer
                        ? `${account?.name ?? '—'} → ${toAccount?.name ?? '—'}`
                        : `${category?.name ?? 'Uncategorised'} · ${account?.name ?? '—'}`}
                </p>
            </div>

            <div className='shrink-0 text-right'>
                <p
                    className={cn(
                        'tnum text-[13.5px] font-semibold',
                        isTransfer ? 'text-text-muted' : value > 0 ? 'text-positive' : 'text-text'
                    )}>
                    {isTransfer ? format(item.amount) : format(value, { signed: true })}
                </p>
                <p className='text-text-faint mt-0.5 text-[11px]'>{formatDisplayDate(item.date)}</p>
            </div>

            {actions ? (
                <div className='shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100'>
                    {actions}
                </div>
            ) : null}
        </div>
    );
}
