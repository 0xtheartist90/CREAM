'use client';

import { useMemo, useState } from 'react';

import { CalendarClock, Check, Pause, Pencil, Play, Plus, Repeat, SkipForward, Trash2 } from 'lucide-react';

import { upcomingItems } from '@/lib/finance/calc';
import {
    addMonthsToKey,
    currentMonthKey,
    endOfWeekISO,
    monthLabel,
    monthRange,
    todayISO
} from '@/lib/finance/dates';
import { frequencyLabel, nextOccurrence } from '@/lib/finance/recurring';
import { useFinance } from '@/lib/finance/store';
import type { RecurringRule, UpcomingItem } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { RecurringForm } from './forms';
import { IconTile } from './icons';
import { useMoneyFormat } from './money';
import { buildLookups, UpcomingRow } from './rows';
import { Button, Card, ConfirmDialog, EmptyState, Pill, SectionHeader } from './ui';

/* ── Upcoming ───────────────────────────────────────────────────────────── */

interface Bucket {
    key: string;
    title: string;
    items: UpcomingItem[];
}

export function UpcomingView({ onAddScheduled }: { onAddScheduled: () => void }) {
    const { db, markTransactionActual, materialiseOccurrence, skipOccurrence } = useFinance();
    const { format } = useMoneyFormat();
    const lookups = useMemo(() => buildLookups(db.accounts, db.categories), [db.accounts, db.categories]);

    const today = todayISO();
    const horizon = monthRange(addMonthsToKey(currentMonthKey(), 12)).end;

    const buckets = useMemo<Bucket[]>(() => {
        const items = upcomingItems(db, today, horizon);
        const weekEnd = endOfWeekISO(today, db.settings.startDayOfWeek);
        const monthEnd = monthRange(currentMonthKey()).end;
        const nextMonthEnd = monthRange(addMonthsToKey(currentMonthKey(), 1)).end;

        const thisWeek: UpcomingItem[] = [];
        const laterThisMonth: UpcomingItem[] = [];
        const nextMonth: UpcomingItem[] = [];
        const later: UpcomingItem[] = [];

        for (const item of items) {
            if (item.date <= weekEnd) thisWeek.push(item);
            else if (item.date <= monthEnd) laterThisMonth.push(item);
            else if (item.date <= nextMonthEnd) nextMonth.push(item);
            else later.push(item);
        }

        return [
            { key: 'week', title: 'This week', items: thisWeek },
            { key: 'month', title: 'Later this month', items: laterThisMonth },
            { key: 'next', title: `Next month · ${monthLabel(addMonthsToKey(currentMonthKey(), 1), true)}`, items: nextMonth },
            { key: 'later', title: 'Later', items: later }
        ].filter((b) => b.items.length > 0);
    }, [db, today, horizon]);

    const totals = useMemo(() => {
        const all = buckets.flatMap((b) => b.items);
        let income = 0;
        let expenses = 0;
        for (const i of all) {
            if (i.type === 'income') income += i.amount;
            else if (i.type === 'expense') expenses += i.amount;
        }

        return { income, expenses, net: income - expenses, count: all.length };
    }, [buckets]);

    const confirm = (item: UpcomingItem) => {
        if (item.source === 'recurring' && item.recurringId) {
            materialiseOccurrence(item.recurringId, item.date, true);

            return;
        }
        markTransactionActual(item.id);
    };

    return (
        <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>Upcoming</h1>
                    <p className='text-text-muted mt-0.5 text-[12.5px]'>
                        Scheduled money for the next 12 months. Marking an item done moves it into your real balance.
                    </p>
                </div>
                <Button variant='primary' onClick={onAddScheduled}>
                    <Plus className='size-4' />
                    Add scheduled
                </Button>
            </div>

            {totals.count ? (
                <div className='grid grid-cols-3 gap-3'>
                    <Card>
                        <p className='text-text-muted text-[11.5px]'>Expected in</p>
                        <p className='tnum text-positive mt-1 text-[19px] leading-none font-semibold'>
                            {format(totals.income)}
                        </p>
                    </Card>
                    <Card>
                        <p className='text-text-muted text-[11.5px]'>Expected out</p>
                        <p className='tnum text-negative mt-1 text-[19px] leading-none font-semibold'>
                            {format(totals.expenses)}
                        </p>
                    </Card>
                    <Card>
                        <p className='text-text-muted text-[11.5px]'>Net</p>
                        <p
                            className={cn(
                                'tnum mt-1 text-[19px] leading-none font-semibold',
                                totals.net >= 0 ? 'text-positive' : 'text-negative'
                            )}>
                            {format(totals.net, { signed: true })}
                        </p>
                    </Card>
                </div>
            ) : null}

            {buckets.length ? (
                buckets.map((bucket) => (
                    <Card key={bucket.key} padded={false}>
                        <div className='border-line flex items-center justify-between border-b px-4 py-3'>
                            <h2 className='text-text text-[13.5px] font-semibold'>{bucket.title}</h2>
                            <span className='text-text-muted text-[11.5px]'>
                                {bucket.items.length} item{bucket.items.length === 1 ? '' : 's'}
                            </span>
                        </div>
                        <div className='p-2'>
                            {bucket.items.map((item) => (
                                <UpcomingRow
                                    key={item.id}
                                    item={item}
                                    lookups={lookups}
                                    actions={
                                        <div className='flex items-center gap-1'>
                                            <Button size='sm' variant='secondary' onClick={() => confirm(item)}>
                                                <Check className='size-3.5' />
                                                {item.type === 'income' ? 'Received' : 'Paid'}
                                            </Button>
                                            {item.source === 'recurring' && item.recurringId ? (
                                                <Button
                                                    size='icon'
                                                    variant='ghost'
                                                    aria-label='Skip this occurrence'
                                                    title='Skip this occurrence'
                                                    onClick={() =>
                                                        skipOccurrence(item.recurringId as string, item.date)
                                                    }>
                                                    <SkipForward className='size-3.5' />
                                                </Button>
                                            ) : null}
                                        </div>
                                    }
                                />
                            ))}
                        </div>
                    </Card>
                ))
            ) : (
                <Card>
                    <EmptyState
                        icon={<CalendarClock className='size-5' />}
                        title='Nothing scheduled'
                        message='Add a future transaction or set up a recurring rule — salary, rent, subscriptions — and they will appear here and in your projections.'
                        action={
                            <Button variant='primary' onClick={onAddScheduled}>
                                <Plus className='size-4' />
                                Add scheduled transaction
                            </Button>
                        }
                    />
                </Card>
            )}
        </div>
    );
}

/* ── Recurring ──────────────────────────────────────────────────────────── */

export function RecurringView() {
    const { db, setRecurringActive, deleteRecurring } = useFinance();
    const { format } = useMoneyFormat();
    const lookups = useMemo(() => buildLookups(db.accounts, db.categories), [db.accounts, db.categories]);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<RecurringRule | null>(null);
    const [pendingDelete, setPendingDelete] = useState<RecurringRule | null>(null);

    const today = todayISO();

    const monthlyImpact = useMemo(() => {
        // Normalise every active rule to a monthly figure for a quick read.
        let income = 0;
        let expenses = 0;
        for (const r of db.recurring) {
            if (!r.active || r.type === 'transfer') continue;
            const perMonth =
                r.frequency === 'weekly'
                    ? (r.amount * 52) / 12 / Math.max(1, r.interval)
                    : r.frequency === 'monthly'
                      ? r.amount
                      : r.frequency === 'everyXMonths'
                        ? r.amount / Math.max(1, r.interval)
                        : r.amount / 12;
            if (r.type === 'income') income += perMonth;
            else expenses += perMonth;
        }

        return { income, expenses, net: income - expenses };
    }, [db.recurring]);

    const openNew = () => {
        setEditing(null);
        setFormOpen(true);
    };

    return (
        <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>Recurring</h1>
                    <p className='text-text-muted mt-0.5 text-[12.5px]'>
                        Future occurrences are generated on demand — nothing is written until you mark it done.
                    </p>
                </div>
                <Button variant='primary' onClick={openNew}>
                    <Plus className='size-4' />
                    New rule
                </Button>
            </div>

            {db.recurring.length ? (
                <>
                    <div className='grid grid-cols-3 gap-3'>
                        <Card>
                            <p className='text-text-muted text-[11.5px]'>Recurring income / mo</p>
                            <p className='tnum text-positive mt-1 text-[19px] leading-none font-semibold'>
                                {format(monthlyImpact.income)}
                            </p>
                        </Card>
                        <Card>
                            <p className='text-text-muted text-[11.5px]'>Recurring costs / mo</p>
                            <p className='tnum text-negative mt-1 text-[19px] leading-none font-semibold'>
                                {format(monthlyImpact.expenses)}
                            </p>
                        </Card>
                        <Card>
                            <p className='text-text-muted text-[11.5px]'>Net per month</p>
                            <p
                                className={cn(
                                    'tnum mt-1 text-[19px] leading-none font-semibold',
                                    monthlyImpact.net >= 0 ? 'text-positive' : 'text-negative'
                                )}>
                                {format(monthlyImpact.net, { signed: true })}
                            </p>
                        </Card>
                    </div>

                    <Card padded={false}>
                        <div className='divide-line divide-y'>
                            {db.recurring.map((rule) => {
                                const category = rule.categoryId ? lookups.categoryById.get(rule.categoryId) : undefined;
                                const account = rule.accountId ? lookups.accountById.get(rule.accountId) : undefined;
                                const next = nextOccurrence(rule, today, db.transactions);
                                const value = rule.type === 'income' ? rule.amount : -rule.amount;

                                return (
                                    <div
                                        key={rule.id}
                                        className={cn(
                                            'group flex items-center gap-3 px-4 py-3.5 transition-opacity',
                                            !rule.active && 'opacity-55'
                                        )}>
                                        <IconTile
                                            name={rule.type === 'transfer' ? 'Repeat' : (category?.icon ?? 'Repeat')}
                                            tone={
                                                rule.type === 'transfer'
                                                    ? 'accent'
                                                    : rule.type === 'income'
                                                      ? 'positive'
                                                      : 'muted'
                                            }
                                        />
                                        <div className='min-w-0 flex-1'>
                                            <div className='flex flex-wrap items-center gap-2'>
                                                <span className='text-text text-[13.5px] font-medium'>
                                                    {rule.description}
                                                </span>
                                                {!rule.active ? <Pill tone='neutral'>Paused</Pill> : null}
                                                {rule.endDate ? (
                                                    <Pill tone='neutral'>Ends {rule.endDate}</Pill>
                                                ) : null}
                                            </div>
                                            <p className='text-text-muted mt-0.5 text-[11.5px]'>
                                                {frequencyLabel(rule)} · {category?.name ?? 'Transfer'} ·{' '}
                                                {account?.name ?? '—'}
                                            </p>
                                        </div>
                                        <div className='hidden shrink-0 text-right sm:block'>
                                            <p className='text-text-muted text-[11px]'>Next</p>
                                            <p className='text-text text-[12px] font-medium'>
                                                {rule.active && next ? next : '—'}
                                            </p>
                                        </div>
                                        <p
                                            className={cn(
                                                'tnum w-24 shrink-0 text-right text-[13.5px] font-semibold',
                                                rule.type === 'transfer'
                                                    ? 'text-text-muted'
                                                    : value > 0
                                                      ? 'text-positive'
                                                      : 'text-text'
                                            )}>
                                            {rule.type === 'transfer'
                                                ? format(rule.amount)
                                                : format(value, { signed: true })}
                                        </p>
                                        <div className='flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100'>
                                            <Button
                                                size='icon'
                                                variant='ghost'
                                                aria-label={rule.active ? 'Pause rule' : 'Resume rule'}
                                                title={rule.active ? 'Pause' : 'Resume'}
                                                onClick={() => setRecurringActive(rule.id, !rule.active)}>
                                                {rule.active ? (
                                                    <Pause className='size-3.5' />
                                                ) : (
                                                    <Play className='size-3.5' />
                                                )}
                                            </Button>
                                            <Button
                                                size='icon'
                                                variant='ghost'
                                                aria-label='Edit rule'
                                                onClick={() => {
                                                    setEditing(rule);
                                                    setFormOpen(true);
                                                }}>
                                                <Pencil className='size-3.5' />
                                            </Button>
                                            <Button
                                                size='icon'
                                                variant='ghost'
                                                aria-label='Delete rule'
                                                onClick={() => setPendingDelete(rule)}>
                                                <Trash2 className='size-3.5' />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </>
            ) : (
                <Card>
                    <EmptyState
                        icon={<Repeat className='size-5' />}
                        title='No recurring transactions'
                        message='Set up salary, rent, subscriptions or insurance once. They flow into Upcoming and your 12-month projection automatically.'
                        action={
                            <Button variant='primary' onClick={openNew}>
                                <Plus className='size-4' />
                                Create your first rule
                            </Button>
                        }
                    />
                </Card>
            )}

            <RecurringForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onClose={() => setPendingDelete(null)}
                onConfirm={() => pendingDelete && deleteRecurring(pendingDelete.id)}
                title='Delete recurring rule'
                confirmLabel='Delete'
                message={
                    <>
                        Delete <strong className='text-text'>{pendingDelete?.description}</strong>? Transactions you
                        already recorded from it are kept — only the schedule is removed.
                    </>
                }
            />
        </div>
    );
}
