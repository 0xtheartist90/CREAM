'use client';

import { useMemo, useState } from 'react';

import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Copy,
    Info,
    Pencil,
    PiggyBank,
    Plus,
    Trash2,
    TriangleAlert
} from 'lucide-react';

import {
    BUDGET_STATE_LABEL,
    budgetProgress,
    budgetTotals,
    unbudgetedSpending
} from '@/lib/finance/calc';
import { addMonthsToKey, currentMonthKey, monthLabel } from '@/lib/finance/dates';
import { useFinance } from '@/lib/finance/store';
import type { BudgetState } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { BudgetForm } from './forms';
import { IconTile } from './icons';
import { useMoneyFormat } from './money';
import { Banner, Button, Card, ConfirmDialog, EmptyState, Pill, ProgressBar, SectionHeader, type Tone } from './ui';

const STATE_TONE: Record<BudgetState, Tone> = {
    normal: 'positive',
    approaching: 'warning',
    'near-limit': 'warning',
    over: 'negative'
};

const STATE_ICON: Record<BudgetState, React.ReactNode> = {
    normal: <CheckCircle2 className='size-3' />,
    approaching: <Info className='size-3' />,
    'near-limit': <TriangleAlert className='size-3' />,
    over: <AlertTriangle className='size-3' />
};

const BAR_TONE: Record<BudgetState, Tone> = {
    normal: 'accent',
    approaching: 'warning',
    'near-limit': 'warning',
    over: 'negative'
};

export function BudgetsView() {
    const { db, removeBudget, copyBudgets } = useFinance();
    const { format } = useMoneyFormat();

    const [monthKey, setMonthKey] = useState(() => currentMonthKey());
    const [formOpen, setFormOpen] = useState(false);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);
    const [copyNotice, setCopyNotice] = useState<string | null>(null);

    const rows = useMemo(() => budgetProgress(db, monthKey), [db, monthKey]);
    const totals = useMemo(() => budgetTotals(rows), [rows]);
    const unbudgeted = useMemo(() => unbudgetedSpending(db, monthKey), [db, monthKey]);

    const prevMonth = addMonthsToKey(monthKey, -1);
    const prevHasBudgets = Object.keys(db.budgets[prevMonth] ?? {}).length > 0;
    const expenseCategoryCount = db.categories.filter((c) => c.kind === 'expense' && !c.archived).length;

    const openNew = () => {
        setEditingCategoryId(null);
        setFormOpen(true);
    };

    const openEdit = (categoryId: string) => {
        setEditingCategoryId(categoryId);
        setFormOpen(true);
    };

    const doCopy = () => {
        const result = copyBudgets(prevMonth, monthKey);
        setCopyNotice(
            result.ok
                ? `Copied ${Object.keys(db.budgets[prevMonth] ?? {}).length} budget(s) from ${monthLabel(prevMonth)}. Limits only — no transactions were copied.`
                : (result.error ?? 'Could not copy budgets.')
        );
        window.setTimeout(() => setCopyNotice(null), 6000);
    };

    return (
        <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>Budgets</h1>
                    <p className='text-text-muted mt-0.5 text-[12.5px]'>
                        Spending is counted from actual expenses only — scheduled items never count as spent.
                    </p>
                </div>
                <div className='flex items-center gap-2'>
                    {prevHasBudgets ? (
                        <Button variant='secondary' onClick={doCopy}>
                            <Copy className='size-3.5' />
                            Copy {monthLabel(prevMonth, true)}
                        </Button>
                    ) : null}
                    <Button variant='primary' onClick={openNew} disabled={!expenseCategoryCount}>
                        <Plus className='size-4' />
                        Set budget
                    </Button>
                </div>
            </div>

            {/* Month selector — each month owns its own limits */}
            <div className='flex items-center justify-center gap-1'>
                <Button size='icon' variant='ghost' aria-label='Previous month' onClick={() => setMonthKey(addMonthsToKey(monthKey, -1))}>
                    <ChevronLeft className='size-4' />
                </Button>
                <div className='min-w-[168px] text-center'>
                    <p className='text-text text-[14px] font-semibold'>{monthLabel(monthKey)}</p>
                    {monthKey !== currentMonthKey() ? (
                        <button
                            onClick={() => setMonthKey(currentMonthKey())}
                            className='text-accent cursor-pointer text-[11px] hover:underline'>
                            Back to this month
                        </button>
                    ) : (
                        <p className='text-text-faint text-[11px]'>Current month</p>
                    )}
                </div>
                <Button size='icon' variant='ghost' aria-label='Next month' onClick={() => setMonthKey(addMonthsToKey(monthKey, 1))}>
                    <ChevronRight className='size-4' />
                </Button>
            </div>

            {copyNotice ? <Banner tone='accent'>{copyNotice}</Banner> : null}

            {!expenseCategoryCount ? (
                <Banner tone='warning'>
                    You have no expense categories yet. Add one in Settings → Categories before setting budgets.
                </Banner>
            ) : null}

            {rows.length ? (
                <>
                    {/* Summary */}
                    <Card>
                        <div className='grid gap-4 sm:grid-cols-4'>
                            <div>
                                <p className='text-text-muted text-[11.5px]'>Monthly budget</p>
                                <p className='tnum text-text mt-1 text-[22px] leading-none font-semibold'>
                                    {format(totals.limit)}
                                </p>
                            </div>
                            <div>
                                <p className='text-text-muted text-[11.5px]'>Spent</p>
                                <p className='tnum text-text mt-1 text-[22px] leading-none font-semibold'>
                                    {format(totals.spent)}
                                </p>
                            </div>
                            <div>
                                <p className='text-text-muted text-[11.5px]'>Remaining</p>
                                <p
                                    className={cn(
                                        'tnum mt-1 text-[22px] leading-none font-semibold',
                                        totals.remaining < 0 ? 'text-negative' : 'text-positive'
                                    )}>
                                    {format(totals.remaining)}
                                </p>
                            </div>
                            <div>
                                <p className='text-text-muted text-[11.5px]'>Used</p>
                                <p className='tnum text-text mt-1 text-[22px] leading-none font-semibold'>
                                    {totals.percentUsed.toFixed(2)}%
                                </p>
                            </div>
                        </div>
                        <div className='mt-4'>
                            <ProgressBar
                                value={totals.percentUsed}
                                tone={totals.percentUsed >= 100 ? 'negative' : totals.percentUsed >= 90 ? 'warning' : 'accent'}
                            />
                        </div>
                    </Card>

                    {/* Category rows */}
                    <Card padded={false}>
                        <div className='border-line border-b px-4 py-3'>
                            <SectionHeader
                                title='By category'
                                subtitle='Highest share of budget first'
                                className='mb-0'
                            />
                        </div>
                        <div className='divide-line divide-y'>
                            {rows.map((row) => (
                                <div key={row.category.id} className='group px-4 py-3.5'>
                                    <div className='flex items-center gap-3'>
                                        <IconTile name={row.category.icon} tone='muted' />
                                        <div className='min-w-0 flex-1'>
                                            <div className='flex flex-wrap items-center gap-2'>
                                                <span className='text-text text-[13.5px] font-medium'>
                                                    {row.category.name}
                                                </span>
                                                <Pill tone={STATE_TONE[row.state]} icon={STATE_ICON[row.state]}>
                                                    {BUDGET_STATE_LABEL[row.state]}
                                                </Pill>
                                            </div>
                                            <p className='text-text-muted mt-0.5 text-[11.5px]'>
                                                {format(row.spent)} of {format(row.limit)} ·{' '}
                                                <span className={row.remaining < 0 ? 'text-negative' : ''}>
                                                    {row.remaining < 0
                                                        ? `${format(Math.abs(row.remaining))} over`
                                                        : `${format(row.remaining)} left`}
                                                </span>
                                            </p>
                                        </div>
                                        <div className='shrink-0 text-right'>
                                            <p className='tnum text-text text-[15px] font-semibold'>
                                                {row.percentUsed.toFixed(1)}%
                                            </p>
                                        </div>
                                        <div className='flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100'>
                                            <Button
                                                size='icon'
                                                variant='ghost'
                                                aria-label={`Edit ${row.category.name} budget`}
                                                onClick={() => openEdit(row.category.id)}>
                                                <Pencil className='size-3.5' />
                                            </Button>
                                            <Button
                                                size='icon'
                                                variant='ghost'
                                                aria-label={`Remove ${row.category.name} budget`}
                                                onClick={() =>
                                                    setPendingRemove({ id: row.category.id, name: row.category.name })
                                                }>
                                                <Trash2 className='size-3.5' />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className='mt-2.5'>
                                        <ProgressBar value={row.percentUsed} tone={BAR_TONE[row.state]} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            ) : (
                <Card>
                    <EmptyState
                        icon={<PiggyBank className='size-5' />}
                        title={`No budgets set for ${monthLabel(monthKey)}`}
                        message='Budgets are per month — set a limit for each expense category you want to track.'
                        action={
                            <div className='flex flex-wrap justify-center gap-2'>
                                <Button variant='primary' onClick={openNew} disabled={!expenseCategoryCount}>
                                    <Plus className='size-4' />
                                    Set a budget
                                </Button>
                                {prevHasBudgets ? (
                                    <Button variant='secondary' onClick={doCopy}>
                                        <Copy className='size-3.5' />
                                        Copy from {monthLabel(prevMonth, true)}
                                    </Button>
                                ) : null}
                            </div>
                        }
                    />
                </Card>
            )}

            {/* Spending with no budget set — a common blind spot */}
            {unbudgeted.length ? (
                <Card>
                    <SectionHeader
                        title='Unbudgeted spending'
                        subtitle={`Categories with spending but no limit in ${monthLabel(monthKey, true)}`}
                    />
                    <div className='space-y-2'>
                        {unbudgeted.map((u) => (
                            <div key={u.category.id} className='flex items-center gap-3'>
                                <IconTile name={u.category.icon} size='sm' />
                                <span className='text-text min-w-0 flex-1 truncate text-[13px]'>{u.category.name}</span>
                                <span className='tnum text-text shrink-0 text-[13px] font-medium'>
                                    {format(u.spent)}
                                </span>
                                <Button size='sm' variant='ghost' onClick={() => openEdit(u.category.id)}>
                                    Set budget
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : null}

            <BudgetForm
                open={formOpen}
                onClose={() => setFormOpen(false)}
                monthKey={monthKey}
                editingCategoryId={editingCategoryId}
            />

            <ConfirmDialog
                open={Boolean(pendingRemove)}
                onClose={() => setPendingRemove(null)}
                onConfirm={() => pendingRemove && removeBudget(monthKey, pendingRemove.id)}
                title='Remove budget'
                confirmLabel='Remove'
                message={
                    <>
                        Remove the {monthLabel(monthKey)} budget for{' '}
                        <strong className='text-text'>{pendingRemove?.name}</strong>? Your transactions stay untouched —
                        only the limit is removed.
                    </>
                }
            />
        </div>
    );
}
