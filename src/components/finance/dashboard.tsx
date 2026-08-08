'use client';

import { useMemo } from 'react';

import {
    ArrowDownLeft,
    ArrowUpRight,
    CalendarClock,
    Eye,
    EyeOff,
    Landmark,
    PiggyBank,
    Plus,
    TrendingUp,
    Wallet,
    WalletMinimal
} from 'lucide-react';

import {
    accountBalancesWithShare,
    budgetProgress,
    budgetTotals,
    buildProjection,
    computeBalances,
    monthSummary,
    netWorthAsOf,
    netWorthSummary,
    recentTransactions,
    upcomingItems
} from '@/lib/finance/calc';
import { addMonthsToKey, currentMonthKey, endOfMonthISO, monthLabel, monthRange, todayISO } from '@/lib/finance/dates';
import { percentChange } from '@/lib/finance/format';
import { useFinance } from '@/lib/finance/store';
import { cn } from '@/lib/utils';

import { DistributionDonut, DONUT_COLORS, IncomeExpenseChart, ProjectionChart } from './charts';
import { useMoneyFormat } from './money';
import { buildLookups, TransactionRow, UpcomingRow } from './rows';
import { Button, Card, EmptyState, Pill, ProgressBar, SectionHeader } from './ui';

export interface DashboardProps {
    onNavigate: (view: string) => void;
    onAddAccount: () => void;
    onAddTransaction: () => void;
    onEditTransaction: (id: string) => void;
}

export function Dashboard({ onNavigate, onAddAccount, onAddTransaction, onEditTransaction }: DashboardProps) {
    const { db, updateUi, markTransactionActual, materialiseOccurrence } = useFinance();
    const { format, formatRaw } = useMoneyFormat();

    const today = todayISO();
    const thisMonth = currentMonthKey();
    const prevMonth = addMonthsToKey(thisMonth, -1);

    const derived = useMemo(() => {
        const balances = computeBalances(db);
        const nw = netWorthSummary(db, balances);
        const prevNw = netWorthAsOf(db, monthRange(prevMonth).end);
        const thisMonthSummary = monthSummary(db, thisMonth);
        const prevMonthSummary = monthSummary(db, prevMonth);
        const budgets = budgetProgress(db, thisMonth);
        const totals = budgetTotals(budgets);
        const projection = buildProjection(db, { months: 12, historyMonths: 5 });
        const forward = projection.filter((p) => !p.isHistorical);
        const accounts = accountBalancesWithShare(db, balances);
        const upcoming = upcomingItems(db, today, endOfMonthISO(addMonthsToKey(thisMonth, 1) + '-01'));
        const recent = recentTransactions(db, 5);

        const trailing = Array.from({ length: 6 }, (_, i) => addMonthsToKey(thisMonth, -(5 - i))).map((key) => {
            const s = monthSummary(db, key);

            return { label: key.slice(5), monthKey: key, income: s.income, expenses: s.expenses };
        });

        return {
            balances,
            nw,
            prevNw,
            thisMonthSummary,
            prevMonthSummary,
            budgets,
            totals,
            projection,
            forward,
            accounts,
            upcoming,
            recent,
            trailing
        };
    }, [db, prevMonth, thisMonth, today]);

    const {
        nw,
        prevNw,
        thisMonthSummary,
        prevMonthSummary,
        budgets,
        totals,
        projection,
        forward,
        accounts,
        upcoming,
        recent,
        trailing
    } = derived;

    const lookups = useMemo(() => buildLookups(db.accounts, db.categories), [db.accounts, db.categories]);

    const hasAccounts = db.accounts.some((a) => !a.archived);
    const monthChange = nw.total - prevNw;
    const monthChangePct = percentChange(nw.total, prevNw);

    const projected3 = forward[2]?.endingBalance ?? nw.total;
    const projected6 = forward[5]?.endingBalance ?? nw.total;
    const projected12 = forward[11]?.endingBalance ?? nw.total;
    const projectedChange = projected12 - nw.total;
    const projectedPct = percentChange(projected12, nw.total);

    const expenseChange = percentChange(thisMonthSummary.expenses, prevMonthSummary.expenses);
    const incomeChange = percentChange(thisMonthSummary.income, prevMonthSummary.income);

    /* First run: nothing exists yet, so guide toward the first account. */
    if (!hasAccounts) {
        return (
            <div className='mx-auto max-w-2xl'>
                <Card className='mt-6 text-center' padded={false}>
                    <div className='px-6 py-12'>
                        <div className='bg-accent-soft text-accent mx-auto mb-4 flex size-14 items-center justify-center rounded-[18px]'>
                            <Wallet className='size-7' />
                        </div>
                        <h2 className='text-text text-[19px] font-semibold tracking-tight'>
                            Start by adding your first account
                        </h2>
                        <p className='text-text-muted mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed'>
                            CREAM money works out every balance from your transactions — you never maintain a running
                            total by hand. Add a bank account, savings account or pocket to begin.
                        </p>
                        <div className='mt-6 flex flex-wrap items-center justify-center gap-2'>
                            <Button variant='primary' size='lg' onClick={onAddAccount}>
                                <Plus className='size-4' />
                                Add account
                            </Button>
                            <Button variant='outline' size='lg' onClick={() => onNavigate('settings')}>
                                Import a backup
                            </Button>
                        </div>
                    </div>

                    <div className='border-line grid gap-px border-t sm:grid-cols-3'>
                        {[
                            { icon: <Landmark className='size-4' />, title: 'Bank', body: 'Everyday spending' },
                            { icon: <PiggyBank className='size-4' />, title: 'Savings', body: 'Money set aside' },
                            { icon: <WalletMinimal className='size-4' />, title: 'Pockets', body: 'Reserved for a purpose' }
                        ].map((c) => (
                            <div key={c.title} className='px-5 py-4 text-center'>
                                <div className='text-text-muted mb-1.5 flex justify-center'>{c.icon}</div>
                                <p className='text-text text-[13px] font-medium'>{c.title}</p>
                                <p className='text-text-muted mt-0.5 text-[11.5px]'>{c.body}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className='space-y-5'>
            {/* ── Net worth hero + projection horizons ────────────────────── */}
            <div className='grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]'>
                <div className='relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#ff7a35] via-[#f4570f] to-[#c8390a] p-5 sm:p-6'>
                    {/* soft light bloom, mirrors the reference card treatment */}
                    <div
                        className='pointer-events-none absolute -top-16 -right-10 size-56 rounded-full opacity-40 blur-2xl'
                        style={{ background: 'radial-gradient(circle, rgba(255,255,255,.55), transparent 65%)' }}
                    />
                    <div className='relative'>
                        <div className='flex items-start justify-between gap-3'>
                            <div>
                                <p className='text-[12px] font-medium text-white/75'>Total net worth</p>
                                <p className='tnum mt-1.5 text-[30px] leading-none font-semibold text-white sm:text-[36px]'>
                                    {format(nw.total)}
                                </p>
                            </div>
                            <button
                                onClick={() => updateUi({ hideBalances: !db.ui.hideBalances })}
                                aria-label={db.ui.hideBalances ? 'Show balances' : 'Hide balances'}
                                className='cursor-pointer rounded-[10px] bg-white/15 p-2 text-white transition-colors hover:bg-white/25'>
                                {db.ui.hideBalances ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                            </button>
                        </div>

                        <div className='mt-4 flex flex-wrap items-center gap-2'>
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-medium',
                                    monthChange >= 0 ? 'bg-white/20 text-white' : 'bg-black/25 text-white'
                                )}>
                                {monthChange >= 0 ? (
                                    <ArrowUpRight className='size-3' />
                                ) : (
                                    <ArrowDownLeft className='size-3' />
                                )}
                                {format(Math.abs(monthChange))}
                                {monthChangePct !== null ? ` (${monthChangePct >= 0 ? '+' : '−'}${Math.abs(monthChangePct).toFixed(1)}%)` : ''}
                            </span>
                            <span className='text-[11.5px] text-white/70'>vs end of {monthLabel(prevMonth, true)}</span>
                        </div>

                        <div className='mt-5 grid grid-cols-3 gap-2 border-t border-white/20 pt-4'>
                            {[
                                { label: 'Bank', value: nw.bank },
                                { label: 'Savings', value: nw.savings },
                                { label: 'Pockets', value: nw.pockets }
                            ].map((s) => (
                                <div key={s.label}>
                                    <p className='text-[11px] text-white/70'>{s.label}</p>
                                    <p className='tnum mt-0.5 text-[15px] font-semibold text-white'>
                                        {format(s.value, { compact: true })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <Card className='flex flex-col justify-between'>
                    <SectionHeader
                        title='Where this is heading'
                        subtitle='Based on your scheduled and recurring money'
                        action={
                            <Button size='sm' variant='ghost' onClick={() => onNavigate('projection')}>
                                Details
                            </Button>
                        }
                    />
                    <div className='grid grid-cols-3 gap-3'>
                        {[
                            { label: '3 months', value: projected3 },
                            { label: '6 months', value: projected6 },
                            { label: '12 months', value: projected12 }
                        ].map((h) => (
                            <div key={h.label} className='bg-surface-2 border-line rounded-[12px] border p-3'>
                                <p className='text-text-muted text-[11px]'>{h.label}</p>
                                <p className='tnum text-text mt-1 text-[15px] font-semibold'>
                                    {format(h.value, { compact: true })}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className='border-line mt-4 flex items-center justify-between gap-3 border-t pt-3.5'>
                        <div>
                            <p className='text-text-muted text-[11.5px]'>Expected 12-month change</p>
                            <p
                                className={cn(
                                    'tnum mt-0.5 text-[17px] font-semibold',
                                    projectedChange >= 0 ? 'text-positive' : 'text-negative'
                                )}>
                                {format(projectedChange, { signed: true })}
                            </p>
                        </div>
                        {projectedPct !== null ? (
                            <Pill tone={projectedChange >= 0 ? 'positive' : 'negative'}>
                                {projectedChange >= 0 ? '+' : '−'}
                                {Math.abs(projectedPct).toFixed(1)}%
                            </Pill>
                        ) : null}
                    </div>
                </Card>
            </div>

            {/* ── KPI strip ───────────────────────────────────────────────── */}
            <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                <KpiTile
                    label='Income this month'
                    value={thisMonthSummary.income}
                    icon={<ArrowDownLeft className='size-4' />}
                    tone='positive'
                    delta={incomeChange}
                    deltaGoodWhenUp
                />
                <KpiTile
                    label='Expenses this month'
                    value={thisMonthSummary.expenses}
                    icon={<ArrowUpRight className='size-4' />}
                    tone='negative'
                    delta={expenseChange}
                />
                <KpiTile
                    label='Net cash flow'
                    value={thisMonthSummary.netCashFlow}
                    icon={<TrendingUp className='size-4' />}
                    tone={thisMonthSummary.netCashFlow >= 0 ? 'positive' : 'negative'}
                    signed
                />
                <KpiTile
                    label='Available in bank'
                    value={nw.bank}
                    icon={<Landmark className='size-4' />}
                    tone='accent'
                />
            </div>

            {/* ── Projection chart ────────────────────────────────────────── */}
            <Card>
                <SectionHeader
                    title='Net worth projection'
                    subtitle='Solid line is recorded history · dashed is projected'
                    action={
                        <Button size='sm' variant='ghost' onClick={() => onNavigate('projection')}>
                            Open
                        </Button>
                    }
                />
                <ProjectionChart data={projection} height={250} />
            </Card>

            {/* ── Budgets + upcoming ──────────────────────────────────────── */}
            <div className='grid gap-4 lg:grid-cols-2'>
                <Card>
                    <SectionHeader
                        title='Monthly budget'
                        subtitle={monthLabel(thisMonth)}
                        action={
                            <Button size='sm' variant='ghost' onClick={() => onNavigate('budgets')}>
                                Manage
                            </Button>
                        }
                    />
                    {budgets.length ? (
                        <>
                            <div className='bg-surface-2 border-line mb-4 rounded-[13px] border p-3.5'>
                                <div className='flex items-end justify-between gap-3'>
                                    <div>
                                        <p className='text-text-muted text-[11.5px]'>Spent of {format(totals.limit)}</p>
                                        <p className='tnum text-text mt-0.5 text-[22px] leading-none font-semibold'>
                                            {format(totals.spent)}
                                        </p>
                                    </div>
                                    <div className='text-right'>
                                        <p className='text-text-muted text-[11.5px]'>Remaining</p>
                                        <p
                                            className={cn(
                                                'tnum mt-0.5 text-[15px] font-semibold',
                                                totals.remaining < 0 ? 'text-negative' : 'text-positive'
                                            )}>
                                            {format(totals.remaining)}
                                        </p>
                                    </div>
                                </div>
                                <div className='mt-3'>
                                    <ProgressBar
                                        value={totals.percentUsed}
                                        tone={
                                            totals.percentUsed >= 100
                                                ? 'negative'
                                                : totals.percentUsed >= 90
                                                  ? 'warning'
                                                  : 'accent'
                                        }
                                    />
                                    <p className='text-text-muted mt-1.5 text-[11.5px]'>
                                        {totals.percentUsed.toFixed(1)}% of budget used
                                    </p>
                                </div>
                            </div>

                            <div className='space-y-3'>
                                {budgets.slice(0, 4).map((row) => (
                                    <div key={row.category.id}>
                                        <div className='mb-1.5 flex items-center justify-between gap-3'>
                                            <span className='text-text truncate text-[12.5px] font-medium'>
                                                {row.category.name}
                                            </span>
                                            <span className='tnum text-text-muted shrink-0 text-[11.5px]'>
                                                {format(row.spent)} / {format(row.limit)}
                                            </span>
                                        </div>
                                        <ProgressBar
                                            value={row.percentUsed}
                                            tone={
                                                row.state === 'over'
                                                    ? 'negative'
                                                    : row.state === 'near-limit'
                                                      ? 'warning'
                                                      : row.state === 'approaching'
                                                        ? 'warning'
                                                        : 'accent'
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <EmptyState
                            compact
                            icon={<PiggyBank className='size-5' />}
                            title='No budgets for this month'
                            message='Set a limit per category to track spending as it happens.'
                            action={
                                <Button size='sm' variant='primary' onClick={() => onNavigate('budgets')}>
                                    Set a budget
                                </Button>
                            }
                        />
                    )}
                </Card>

                <Card>
                    <SectionHeader
                        title='Coming up'
                        subtitle='Next 60 days'
                        action={
                            <Button size='sm' variant='ghost' onClick={() => onNavigate('upcoming')}>
                                View all
                            </Button>
                        }
                    />
                    {upcoming.length ? (
                        <div className='-mx-2'>
                            {upcoming.slice(0, 5).map((item) => (
                                <UpcomingRow
                                    key={item.id}
                                    item={item}
                                    lookups={lookups}
                                    actions={
                                        <Button
                                            size='sm'
                                            variant='secondary'
                                            onClick={() =>
                                                item.source === 'recurring' && item.recurringId
                                                    ? materialiseOccurrence(item.recurringId, item.date, true)
                                                    : markTransactionActual(item.id)
                                            }>
                                            {item.type === 'income' ? 'Received' : 'Paid'}
                                        </Button>
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            compact
                            icon={<CalendarClock className='size-5' />}
                            title='Nothing scheduled'
                            message='Add a future transaction or a recurring rule to see what is coming.'
                            action={
                                <Button size='sm' variant='primary' onClick={() => onNavigate('recurring')}>
                                    Add recurring
                                </Button>
                            }
                        />
                    )}
                </Card>
            </div>

            {/* ── Distribution + income/expense + recent ──────────────────── */}
            <div className='grid gap-4 lg:grid-cols-3'>
                <Card>
                    <SectionHeader
                        title='Where your money sits'
                        action={
                            <Button size='sm' variant='ghost' onClick={() => onNavigate('accounts')}>
                                Accounts
                            </Button>
                        }
                    />
                    {accounts.length && nw.total !== 0 ? (
                        <>
                            <DistributionDonut
                                data={accounts.filter((a) => a.balance > 0).map((a) => ({ name: a.account.name, value: a.balance }))}
                                centerLabel='Net worth'
                                centerValue={format(nw.total, { compact: true })}
                                height={168}
                            />
                            <div className='mt-3 space-y-2'>
                                {accounts.slice(0, 5).map((a, i) => (
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
                        </>
                    ) : (
                        <EmptyState
                            compact
                            icon={<Wallet className='size-5' />}
                            title='No balances yet'
                            message='Record some transactions to see how your money is distributed.'
                        />
                    )}
                </Card>

                <Card className='lg:col-span-2'>
                    <SectionHeader
                        title='Income vs expenses'
                        subtitle='Last 6 months, actual transactions only'
                        action={
                            <Button size='sm' variant='ghost' onClick={() => onNavigate('reports')}>
                                Reports
                            </Button>
                        }
                    />
                    {trailing.some((t) => t.income > 0 || t.expenses > 0) ? (
                        <IncomeExpenseChart data={trailing} height={214} />
                    ) : (
                        <EmptyState
                            compact
                            icon={<TrendingUp className='size-5' />}
                            title='No activity yet'
                            message='Once you record income and expenses this chart compares them month by month.'
                            action={
                                <Button size='sm' variant='primary' onClick={onAddTransaction}>
                                    Add transaction
                                </Button>
                            }
                        />
                    )}
                </Card>
            </div>

            <Card>
                <SectionHeader
                    title='Recent transactions'
                    action={
                        <Button size='sm' variant='ghost' onClick={() => onNavigate('transactions')}>
                            View all
                        </Button>
                    }
                />
                {recent.length ? (
                    <div className='-mx-2'>
                        {recent.map((tx) => (
                            <TransactionRow
                                key={tx.id}
                                tx={tx}
                                lookups={lookups}
                                onClick={() => onEditTransaction(tx.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        compact
                        icon={<Wallet className='size-5' />}
                        title='No transactions yet'
                        message='Log your first expense or income to bring the dashboard to life.'
                        action={
                            <Button size='sm' variant='primary' onClick={onAddTransaction}>
                                <Plus className='size-3.5' />
                                Add transaction
                            </Button>
                        }
                    />
                )}
            </Card>
        </div>
    );
}

/* ── KPI tile ───────────────────────────────────────────────────────────── */

function KpiTile({
    label,
    value,
    icon,
    tone,
    delta,
    signed,
    deltaGoodWhenUp
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
    tone: 'positive' | 'negative' | 'accent' | 'muted';
    delta?: number | null;
    signed?: boolean;
    /** For income, up is good; for expenses, down is good. */
    deltaGoodWhenUp?: boolean;
}) {
    const { format } = useMoneyFormat();
    const iconTone = tone === 'muted' ? 'muted' : tone;

    const deltaGood = delta === null || delta === undefined ? null : deltaGoodWhenUp ? delta >= 0 : delta <= 0;

    return (
        <Card className='flex flex-col justify-between gap-3'>
            <div className='flex items-start justify-between gap-2'>
                <p className='text-text-muted text-[11.5px] leading-tight font-medium'>{label}</p>
                <span
                    className={cn(
                        'inline-flex size-8 shrink-0 items-center justify-center rounded-[9px]',
                        iconTone === 'accent'
                            ? 'bg-accent-soft text-accent'
                            : iconTone === 'positive'
                              ? 'bg-positive-soft text-positive'
                              : iconTone === 'negative'
                                ? 'bg-negative-soft text-negative'
                                : 'bg-surface-3 text-text-muted'
                    )}>
                    {icon}
                </span>
            </div>
            <div>
                <p className='tnum text-text text-[19px] leading-none font-semibold sm:text-[21px]'>
                    {format(value, { signed })}
                </p>
                {delta !== null && delta !== undefined ? (
                    <p
                        className={cn(
                            'mt-1.5 text-[11px]',
                            deltaGood === null ? 'text-text-muted' : deltaGood ? 'text-positive' : 'text-negative'
                        )}>
                        {Math.abs(delta) < 0.05
                            ? 'Same as last month'
                            : `${Math.abs(delta).toFixed(1)}% ${delta > 0 ? 'higher' : 'lower'} than last month`}
                    </p>
                ) : (
                    <p className='text-text-faint mt-1.5 text-[11px]'>No comparison yet</p>
                )}
            </div>
        </Card>
    );
}
