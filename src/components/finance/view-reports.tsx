'use client';

import { useMemo, useState } from 'react';

import { BarChart3, ChevronLeft, ChevronRight, LineChart, TrendingUp, Wallet } from 'lucide-react';

import {
    accountBalancesWithShare,
    budgetProgress,
    budgetTotals,
    buildProjection,
    computeBalances,
    incomeByCategoryInRange,
    largestTransactions,
    monthSummary,
    netWorthAsOf,
    netWorthSeries,
    netWorthSummary,
    rangeSummary,
    spendingByCategoryInRange,
    topSpendingCategories
} from '@/lib/finance/calc';
import {
    addMonthsToKey,
    currentMonthKey,
    monthKeysBetween,
    monthLabel,
    monthLabelShort,
    monthRange,
    todayISO
} from '@/lib/finance/dates';
import { percentChange } from '@/lib/finance/format';
import { useFinance } from '@/lib/finance/store';
import type { ProjectionMonth } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { CategoryBars, DistributionDonut, DONUT_COLORS, IncomeExpenseChart, ProjectionChart, SpendingTrendChart } from './charts';
import { IconTile } from './icons';
import { useMoneyFormat } from './money';
import { buildLookups } from './rows';
import { Button, Card, EmptyState, Input, Pill, ProgressBar, SectionHeader, Segmented, Select } from './ui';

/* ── Projection ─────────────────────────────────────────────────────────── */

type ProjectionMode = 'networth' | 'cashflow' | 'account';

export function ProjectionView() {
    const { db } = useFinance();
    const { format } = useMoneyFormat();

    const [mode, setMode] = useState<ProjectionMode>('networth');
    const [accountId, setAccountId] = useState<string>('');

    const activeAccounts = useMemo(() => db.accounts.filter((a) => !a.archived), [db.accounts]);
    const selectedAccount = accountId || activeAccounts[0]?.id || '';

    const data = useMemo(
        () =>
            buildProjection(db, {
                months: 12,
                historyMonths: 6,
                accountId: mode === 'account' ? selectedAccount : null
            }),
        [db, mode, selectedAccount]
    );

    const forward = data.filter((d) => !d.isHistorical);
    const startValue = forward[0]?.startingBalance ?? 0;
    const endValue = forward[forward.length - 1]?.endingBalance ?? 0;
    const change = endValue - startValue;
    const changePct = percentChange(endValue, startValue);

    const totalIncome = forward.reduce((s, m) => s + m.income, 0);
    const totalExpenses = forward.reduce((s, m) => s + m.expenses, 0);

    if (!activeAccounts.length) {
        return (
            <Card>
                <EmptyState
                    icon={<LineChart className='size-5' />}
                    title='No accounts to project'
                    message='Add an account and schedule some recurring money to see where your finances are heading.'
                />
            </Card>
        );
    }

    return (
        <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>Projection</h1>
                    <p className='text-text-muted mt-0.5 text-[12.5px]'>
                        Next 12 months, driven by your scheduled and recurring transactions.
                    </p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                    <Segmented
                        value={mode}
                        onChange={setMode}
                        options={[
                            { value: 'networth', label: 'Net worth' },
                            { value: 'cashflow', label: 'Cash flow' },
                            { value: 'account', label: 'Account' }
                        ]}
                    />
                    {mode === 'account' ? (
                        <Select
                            value={selectedAccount}
                            onChange={(e) => setAccountId(e.target.value)}
                            className='w-auto min-w-[150px]'>
                            {activeAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                </option>
                            ))}
                        </Select>
                    ) : null}
                </div>
            </div>

            <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                <Card>
                    <p className='text-text-muted text-[11.5px]'>{mode === 'account' ? 'Balance now' : 'Net worth now'}</p>
                    <p className='tnum text-text mt-1 text-[19px] leading-none font-semibold'>{format(startValue)}</p>
                </Card>
                <Card>
                    <p className='text-text-muted text-[11.5px]'>In 12 months</p>
                    <p className='tnum text-text mt-1 text-[19px] leading-none font-semibold'>{format(endValue)}</p>
                </Card>
                <Card>
                    <p className='text-text-muted text-[11.5px]'>Expected change</p>
                    <p
                        className={cn(
                            'tnum mt-1 text-[19px] leading-none font-semibold',
                            change >= 0 ? 'text-positive' : 'text-negative'
                        )}>
                        {format(change, { signed: true })}
                    </p>
                    {changePct !== null ? (
                        <Pill tone={change >= 0 ? 'positive' : 'negative'} className='mt-2'>
                            {change >= 0 ? '+' : '−'}
                            {Math.abs(changePct).toFixed(1)}%
                        </Pill>
                    ) : null}
                </Card>
                <Card>
                    <p className='text-text-muted text-[11.5px]'>Scheduled in / out</p>
                    <p className='tnum text-positive mt-1 text-[15px] leading-none font-semibold'>
                        {format(totalIncome)}
                    </p>
                    <p className='tnum text-negative mt-1 text-[15px] leading-none font-semibold'>
                        {format(totalExpenses)}
                    </p>
                </Card>
            </div>

            <Card>
                <SectionHeader
                    title={mode === 'cashflow' ? 'Monthly cash flow' : 'Projected balance'}
                    subtitle={
                        mode === 'cashflow'
                            ? 'Solid bars are recorded months, faded bars are projected'
                            : 'Solid line is recorded history · dashed is projected'
                    }
                />
                <ProjectionChart data={data} height={300} mode={mode === 'cashflow' ? 'cashflow' : 'networth'} />
            </Card>

            <Card padded={false}>
                <div className='border-line border-b px-4 py-3'>
                    <SectionHeader title='Month by month' className='mb-0' />
                </div>
                <div className='overflow-x-auto'>
                    <table className='w-full min-w-[620px]'>
                        <thead>
                            <tr className='border-line text-text-muted border-b text-left text-[11.5px]'>
                                <th className='px-4 py-2.5 font-medium'>Month</th>
                                <th className='px-4 py-2.5 text-right font-medium'>Starting</th>
                                <th className='px-4 py-2.5 text-right font-medium'>Income</th>
                                <th className='px-4 py-2.5 text-right font-medium'>Expenses</th>
                                <th className='px-4 py-2.5 text-right font-medium'>Net flow</th>
                                <th className='px-4 py-2.5 text-right font-medium'>Ending</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((m: ProjectionMonth) => (
                                <tr
                                    key={m.monthKey}
                                    className={cn(
                                        'border-line hover:bg-surface-2 border-b text-[12.5px] transition-colors last:border-0',
                                        !m.isHistorical && 'bg-accent-soft/20'
                                    )}>
                                    <td className='px-4 py-2.5'>
                                        <div className='flex items-center gap-2'>
                                            <span className='text-text font-medium'>{monthLabel(m.monthKey, true)}</span>
                                            {!m.isHistorical ? <Pill tone='accent'>projected</Pill> : null}
                                        </div>
                                    </td>
                                    <td className='tnum text-text-muted px-4 py-2.5 text-right'>
                                        {format(m.startingBalance)}
                                    </td>
                                    <td className='tnum text-positive px-4 py-2.5 text-right'>{format(m.income)}</td>
                                    <td className='tnum text-negative px-4 py-2.5 text-right'>{format(m.expenses)}</td>
                                    <td
                                        className={cn(
                                            'tnum px-4 py-2.5 text-right',
                                            m.netCashFlow >= 0 ? 'text-positive' : 'text-negative'
                                        )}>
                                        {format(m.netCashFlow, { signed: true })}
                                    </td>
                                    <td className='tnum text-text px-4 py-2.5 text-right font-semibold'>
                                        {format(m.endingBalance)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

/* ── Monthly overview ───────────────────────────────────────────────────── */

export function MonthlyOverviewView() {
    const { db } = useFinance();
    const { format } = useMoneyFormat();
    const lookups = useMemo(() => buildLookups(db.accounts, db.categories), [db.accounts, db.categories]);

    const [monthKey, setMonthKey] = useState(() => currentMonthKey());

    const summary = useMemo(() => monthSummary(db, monthKey), [db, monthKey]);
    const prevSummary = useMemo(() => monthSummary(db, addMonthsToKey(monthKey, -1)), [db, monthKey]);
    const budgets = useMemo(() => budgetProgress(db, monthKey), [db, monthKey]);
    const totals = useMemo(() => budgetTotals(budgets), [budgets]);
    const topCategories = useMemo(() => topSpendingCategories(db, monthKey, 6), [db, monthKey]);
    const largest = useMemo(() => largestTransactions(db, monthKey, 5), [db, monthKey]);
    const endingNetWorth = useMemo(() => netWorthAsOf(db, monthRange(monthKey).end), [db, monthKey]);

    const trailing = useMemo(
        () =>
            Array.from({ length: 6 }, (_, i) => addMonthsToKey(monthKey, -(5 - i))).map((key) => {
                const s = monthSummary(db, key);

                return { label: monthLabelShort(key), monthKey: key, income: s.income, expenses: s.expenses };
            }),
        [db, monthKey]
    );

    const incomeChange = percentChange(summary.income, prevSummary.income);
    const expenseChange = percentChange(summary.expenses, prevSummary.expenses);
    const hasData = summary.income > 0 || summary.expenses > 0;

    return (
        <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>Monthly overview</h1>
                    <p className='text-text-muted mt-0.5 text-[12.5px]'>A full picture of one month.</p>
                </div>
                <div className='flex items-center gap-1'>
                    <Button size='icon' variant='ghost' aria-label='Previous month' onClick={() => setMonthKey(addMonthsToKey(monthKey, -1))}>
                        <ChevronLeft className='size-4' />
                    </Button>
                    <span className='text-text min-w-[130px] text-center text-[13.5px] font-semibold'>
                        {monthLabel(monthKey)}
                    </span>
                    <Button size='icon' variant='ghost' aria-label='Next month' onClick={() => setMonthKey(addMonthsToKey(monthKey, 1))}>
                        <ChevronRight className='size-4' />
                    </Button>
                </div>
            </div>

            <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                <StatCard label='Income' value={format(summary.income)} delta={incomeChange} goodWhenUp />
                <StatCard label='Expenses' value={format(summary.expenses)} delta={expenseChange} />
                <StatCard
                    label='Net cash flow'
                    value={format(summary.netCashFlow, { signed: true })}
                    valueClass={summary.netCashFlow >= 0 ? 'text-positive' : 'text-negative'}
                />
                <StatCard label='Net worth at month end' value={format(endingNetWorth)} />
            </div>

            {budgets.length ? (
                <div className='grid grid-cols-2 gap-3 lg:grid-cols-3'>
                    <StatCard label='Monthly budget' value={format(totals.limit)} />
                    <StatCard label='Budget used' value={`${totals.percentUsed.toFixed(1)}%`} />
                    <StatCard
                        label='Budget remaining'
                        value={format(totals.remaining)}
                        valueClass={totals.remaining < 0 ? 'text-negative' : 'text-positive'}
                    />
                </div>
            ) : null}

            <div className='grid gap-4 lg:grid-cols-2'>
                <Card>
                    <SectionHeader title='Income vs expenses' subtitle='Trailing 6 months' />
                    {trailing.some((t) => t.income > 0 || t.expenses > 0) ? (
                        <IncomeExpenseChart data={trailing} height={220} />
                    ) : (
                        <EmptyState compact icon={<BarChart3 className='size-5' />} title='No activity in this window' />
                    )}
                </Card>

                <Card>
                    <SectionHeader title='Top spending categories' subtitle={monthLabel(monthKey, true)} />
                    {topCategories.length ? (
                        <div className='space-y-3'>
                            {topCategories.map((c, i) => (
                                <div key={c.category.id}>
                                    <div className='mb-1.5 flex items-center gap-2.5'>
                                        <IconTile name={c.category.icon} size='sm' />
                                        <span className='text-text min-w-0 flex-1 truncate text-[12.5px]'>
                                            {c.category.name}
                                        </span>
                                        <span className='tnum text-text shrink-0 text-[12.5px] font-medium'>
                                            {format(c.amount)}
                                        </span>
                                        <span className='tnum text-text-faint w-10 shrink-0 text-right text-[11px]'>
                                            {c.share.toFixed(0)}%
                                        </span>
                                    </div>
                                    <ProgressBar value={c.share} tone='accent' />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState compact icon={<Wallet className='size-5' />} title='No expenses this month' />
                    )}
                </Card>
            </div>

            <div className='grid gap-4 lg:grid-cols-2'>
                <Card>
                    <SectionHeader title='Budget progress' subtitle={monthLabel(monthKey, true)} />
                    {budgets.length ? (
                        <div className='space-y-3'>
                            {budgets.map((row) => (
                                <div key={row.category.id}>
                                    <div className='mb-1.5 flex items-center justify-between gap-3'>
                                        <span className='text-text truncate text-[12.5px]'>{row.category.name}</span>
                                        <span className='tnum text-text-muted shrink-0 text-[11.5px]'>
                                            {format(row.spent)} / {format(row.limit)}
                                        </span>
                                    </div>
                                    <ProgressBar
                                        value={row.percentUsed}
                                        tone={
                                            row.state === 'over'
                                                ? 'negative'
                                                : row.state === 'normal'
                                                  ? 'accent'
                                                  : 'warning'
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState compact title='No budgets for this month' />
                    )}
                </Card>

                <Card>
                    <SectionHeader title='Largest transactions' subtitle={monthLabel(monthKey, true)} />
                    {largest.length ? (
                        <div className='space-y-2'>
                            {largest.map((tx) => {
                                const category = tx.categoryId ? lookups.categoryById.get(tx.categoryId) : undefined;

                                return (
                                    <div key={tx.id} className='flex items-center gap-3'>
                                        <IconTile
                                            name={category?.icon}
                                            size='sm'
                                            tone={tx.type === 'income' ? 'positive' : 'muted'}
                                        />
                                        <div className='min-w-0 flex-1'>
                                            <p className='text-text truncate text-[12.5px] font-medium'>
                                                {tx.description || category?.name || 'Transaction'}
                                            </p>
                                            <p className='text-text-faint text-[11px]'>{tx.date}</p>
                                        </div>
                                        <span
                                            className={cn(
                                                'tnum shrink-0 text-[12.5px] font-semibold',
                                                tx.type === 'income' ? 'text-positive' : 'text-text'
                                            )}>
                                            {format(tx.type === 'income' ? tx.amount : -tx.amount, { signed: true })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState compact title='No transactions this month' />
                    )}
                </Card>
            </div>

            {!hasData ? (
                <Card>
                    <EmptyState
                        icon={<TrendingUp className='size-5' />}
                        title={`Nothing recorded in ${monthLabel(monthKey)}`}
                        message='Add transactions for this month, or use the arrows above to browse another month.'
                    />
                </Card>
            ) : null}
        </div>
    );
}

function StatCard({
    label,
    value,
    delta,
    goodWhenUp,
    valueClass
}: {
    label: string;
    value: string;
    delta?: number | null;
    goodWhenUp?: boolean;
    valueClass?: string;
}) {
    const good = delta === null || delta === undefined ? null : goodWhenUp ? delta >= 0 : delta <= 0;

    return (
        <Card>
            <p className='text-text-muted text-[11.5px]'>{label}</p>
            <p className={cn('tnum text-text mt-1 text-[19px] leading-none font-semibold', valueClass)}>{value}</p>
            {delta !== null && delta !== undefined ? (
                <p className={cn('mt-1.5 text-[11px]', good ? 'text-positive' : 'text-negative')}>
                    {Math.abs(delta) < 0.05
                        ? 'Same as last month'
                        : `${Math.abs(delta).toFixed(1)}% ${delta > 0 ? 'higher' : 'lower'} than last month`}
                </p>
            ) : null}
        </Card>
    );
}

/* ── Reports ────────────────────────────────────────────────────────────── */

type RangeKey = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'this-year' | 'custom';

export function ReportsView() {
    const { db } = useFinance();
    const { format } = useMoneyFormat();

    const [rangeKey, setRangeKey] = useState<RangeKey>('last-6');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const today = todayISO();
    const thisMonth = currentMonthKey();

    const bounds = useMemo(() => {
        switch (rangeKey) {
            case 'this-month':
                return monthRange(thisMonth);
            case 'last-month':
                return monthRange(addMonthsToKey(thisMonth, -1));
            case 'last-3':
                return { start: monthRange(addMonthsToKey(thisMonth, -2)).start, end: monthRange(thisMonth).end };
            case 'last-6':
                return { start: monthRange(addMonthsToKey(thisMonth, -5)).start, end: monthRange(thisMonth).end };
            case 'this-year':
                return { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` };
            case 'custom':
                return {
                    start: customStart || monthRange(addMonthsToKey(thisMonth, -5)).start,
                    end: customEnd || monthRange(thisMonth).end
                };
        }
    }, [rangeKey, customStart, customEnd, thisMonth, today]);

    const monthKeys = useMemo(
        () => monthKeysBetween(bounds.start.slice(0, 7), bounds.end.slice(0, 7)),
        [bounds]
    );

    const totals = useMemo(() => rangeSummary(db, bounds.start, bounds.end), [db, bounds]);

    const monthly = useMemo(
        () =>
            monthKeys.map((key) => {
                const s = monthSummary(db, key);

                return {
                    label: monthLabelShort(key),
                    monthKey: key,
                    income: s.income,
                    expenses: s.expenses,
                    net: s.netCashFlow
                };
            }),
        [db, monthKeys]
    );

    const expenseBreakdown = useMemo(() => {
        const map = spendingByCategoryInRange(db, bounds.start, bounds.end);
        const byId = new Map(db.categories.map((c) => [c.id, c]));

        return [...map.entries()]
            .map(([id, value]) => ({ name: byId.get(id)?.name ?? 'Uncategorised', value }))
            .sort((a, b) => b.value - a.value);
    }, [db, bounds]);

    const incomeBreakdown = useMemo(() => {
        const map = incomeByCategoryInRange(db, bounds.start, bounds.end);
        const byId = new Map(db.categories.map((c) => [c.id, c]));

        return [...map.entries()]
            .map(([id, value]) => ({ name: byId.get(id)?.name ?? 'Uncategorised', value }))
            .sort((a, b) => b.value - a.value);
    }, [db, bounds]);

    const nwSeries = useMemo(() => netWorthSeries(db, monthKeys), [db, monthKeys]);
    const spendTrend = useMemo(
        () => monthly.map((m) => ({ label: m.label, monthKey: m.monthKey, value: m.expenses })),
        [monthly]
    );

    const balances = useMemo(() => computeBalances(db), [db]);
    const nw = useMemo(() => netWorthSummary(db, balances), [db, balances]);
    const distribution = useMemo(
        () =>
            [
                { name: 'Bank', value: nw.bank },
                { name: 'Savings', value: nw.savings },
                { name: 'Pockets', value: nw.pockets }
            ].filter((d) => d.value > 0),
        [nw]
    );
    const accountRows = useMemo(() => accountBalancesWithShare(db, balances), [db, balances]);

    /* Budget vs actual across the selected months. */
    const budgetPerformance = useMemo(
        () =>
            monthKeys
                .map((key) => {
                    const rows = budgetProgress(db, key);
                    const t = budgetTotals(rows);

                    return { monthKey: key, label: monthLabelShort(key), ...t };
                })
                .filter((m) => m.limit > 0),
        [db, monthKeys]
    );

    const hasAnyData = totals.income > 0 || totals.expenses > 0;

    return (
        <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>Reports</h1>
                    <p className='text-text-muted mt-0.5 text-[12.5px]'>
                        Built only from actual transactions — projections are excluded.
                    </p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                    <Select
                        value={rangeKey}
                        onChange={(e) => setRangeKey(e.target.value as RangeKey)}
                        className='w-auto min-w-[150px]'>
                        <option value='this-month'>This month</option>
                        <option value='last-month'>Last month</option>
                        <option value='last-3'>Last 3 months</option>
                        <option value='last-6'>Last 6 months</option>
                        <option value='this-year'>This year</option>
                        <option value='custom'>Custom range</option>
                    </Select>
                    {rangeKey === 'custom' ? (
                        <>
                            <Input
                                type='date'
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className='w-auto'
                                aria-label='Start date'
                            />
                            <Input
                                type='date'
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className='w-auto'
                                aria-label='End date'
                            />
                        </>
                    ) : null}
                </div>
            </div>

            {!hasAnyData ? (
                <Card>
                    <EmptyState
                        icon={<BarChart3 className='size-5' />}
                        title='No data in this range'
                        message='Record some transactions, or widen the date range to see your reports.'
                    />
                </Card>
            ) : (
                <>
                    <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                        <StatCard label='Total income' value={format(totals.income)} />
                        <StatCard label='Total expenses' value={format(totals.expenses)} />
                        <StatCard
                            label='Net cash flow'
                            value={format(totals.net, { signed: true })}
                            valueClass={totals.net >= 0 ? 'text-positive' : 'text-negative'}
                        />
                        <StatCard
                            label='Avg. monthly spend'
                            value={format(monthKeys.length ? totals.expenses / monthKeys.length : 0)}
                        />
                    </div>

                    <Card>
                        <SectionHeader title='Income vs expenses' subtitle='By month' />
                        <IncomeExpenseChart data={monthly} height={250} />
                    </Card>

                    <div className='grid gap-4 lg:grid-cols-2'>
                        <Card>
                            <SectionHeader title='Expense breakdown' subtitle='By category' />
                            {expenseBreakdown.length ? (
                                <div className='grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center'>
                                    <DistributionDonut
                                        data={expenseBreakdown.slice(0, 8)}
                                        height={170}
                                        centerLabel='Spent'
                                        centerValue={format(totals.expenses, { compact: true })}
                                    />
                                    <CategoryBars data={expenseBreakdown.slice(0, 6)} />
                                </div>
                            ) : (
                                <EmptyState compact title='No expenses in this range' />
                            )}
                        </Card>

                        <Card>
                            <SectionHeader title='Income breakdown' subtitle='By category' />
                            {incomeBreakdown.length ? (
                                <div className='grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center'>
                                    <DistributionDonut
                                        data={incomeBreakdown.slice(0, 8)}
                                        height={170}
                                        centerLabel='Earned'
                                        centerValue={format(totals.income, { compact: true })}
                                    />
                                    <CategoryBars data={incomeBreakdown.slice(0, 6)} />
                                </div>
                            ) : (
                                <EmptyState compact title='No income in this range' />
                            )}
                        </Card>
                    </div>

                    <div className='grid gap-4 lg:grid-cols-2'>
                        <Card>
                            <SectionHeader title='Spending trend' subtitle='Monthly expenses over time' />
                            <SpendingTrendChart data={spendTrend} height={210} />
                        </Card>

                        <Card>
                            <SectionHeader title='Net worth over time' subtitle='Month-end, actual data only' />
                            <SpendingTrendChart data={nwSeries} height={210} />
                        </Card>
                    </div>

                    <div className='grid gap-4 lg:grid-cols-2'>
                        <Card>
                            <SectionHeader title='Account distribution' subtitle='Bank vs savings vs pockets' />
                            {distribution.length ? (
                                <div className='grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center'>
                                    <DistributionDonut
                                        data={distribution}
                                        height={170}
                                        centerLabel='Net worth'
                                        centerValue={format(nw.total, { compact: true })}
                                    />
                                    <div className='space-y-2.5'>
                                        {accountRows.map((a, i) => (
                                            <div key={a.account.id} className='flex items-center gap-2.5'>
                                                <span
                                                    className='size-2 shrink-0 rounded-full'
                                                    style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                                                />
                                                <span className='text-text-muted min-w-0 flex-1 truncate text-[12px]'>
                                                    {a.account.name}
                                                </span>
                                                <span className='tnum text-text shrink-0 text-[12px] font-medium'>
                                                    {format(a.balance, { compact: true })}
                                                </span>
                                                <span className='tnum text-text-faint w-11 shrink-0 text-right text-[11px]'>
                                                    {a.shareOfNetWorth.toFixed(0)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <EmptyState compact title='No positive balances yet' />
                            )}
                        </Card>

                        <Card>
                            <SectionHeader title='Budget performance' subtitle='Budget vs actual spending' />
                            {budgetPerformance.length ? (
                                <div className='space-y-3'>
                                    {budgetPerformance.map((m) => (
                                        <div key={m.monthKey}>
                                            <div className='mb-1.5 flex items-center justify-between gap-3'>
                                                <span className='text-text text-[12.5px]'>
                                                    {monthLabel(m.monthKey, true)}
                                                </span>
                                                <span className='tnum text-text-muted text-[11.5px]'>
                                                    {format(m.spent)} / {format(m.limit)} ·{' '}
                                                    {m.percentUsed.toFixed(0)}%
                                                </span>
                                            </div>
                                            <ProgressBar
                                                value={m.percentUsed}
                                                tone={
                                                    m.percentUsed >= 100
                                                        ? 'negative'
                                                        : m.percentUsed >= 90
                                                          ? 'warning'
                                                          : 'accent'
                                                }
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    compact
                                    title='No budgets in this range'
                                    message='Set monthly budgets to compare them against actual spending here.'
                                />
                            )}
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
