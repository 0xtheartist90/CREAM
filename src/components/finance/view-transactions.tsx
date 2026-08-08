'use client';

import { useMemo, useState } from 'react';

import { ArrowRight, Copy, Filter, Pencil, Plus, Receipt, Search, Trash2, X } from 'lucide-react';

import { formatDisplayDate, monthKeyOf, monthLabel, monthRange, todayISO } from '@/lib/finance/dates';
import { useFinance } from '@/lib/finance/store';
import type { Transaction, TransactionType } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { IconTile } from './icons';
import { useMoneyFormat } from './money';
import { buildLookups } from './rows';
import { Button, Card, ConfirmDialog, EmptyState, Input, Pill, Select, SectionHeader } from './ui';

type StatusFilter = 'all' | 'actual' | 'projected';
type TypeFilter = 'all' | TransactionType;
type RangePreset = 'all' | 'this-month' | 'last-month' | 'last-3' | 'this-year' | 'custom';

export function TransactionsView({
    onEdit,
    onAdd
}: {
    onEdit: (tx: Transaction) => void;
    onAdd: () => void;
}) {
    const { db, deleteTransaction, duplicateTransaction } = useFinance();
    const { format } = useMoneyFormat();
    const lookups = useMemo(() => buildLookups(db.accounts, db.categories), [db.accounts, db.categories]);

    const [search, setSearch] = useState('');
    const [range, setRange] = useState<RangePreset>('this-month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [accountId, setAccountId] = useState('all');
    const [categoryId, setCategoryId] = useState('all');
    const [type, setType] = useState<TypeFilter>('all');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

    const bounds = useMemo(() => {
        const today = todayISO();
        const thisMonth = monthKeyOf(today);
        switch (range) {
            case 'this-month':
                return monthRange(thisMonth);
            case 'last-month': {
                const [y, m] = thisMonth.split('-').map(Number);
                const prev = new Date(y, m - 2, 1);
                const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

                return monthRange(key);
            }
            case 'last-3': {
                const [y, m] = thisMonth.split('-').map(Number);
                const start = new Date(y, m - 3, 1);

                return {
                    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
                    end: monthRange(thisMonth).end
                };
            }
            case 'this-year':
                return { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` };
            case 'custom':
                return { start: customStart || '0000-01-01', end: customEnd || '9999-12-31' };
            default:
                return { start: '0000-01-01', end: '9999-12-31' };
        }
    }, [range, customStart, customEnd]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();

        return db.transactions
            .filter((t) => {
                if (t.date < bounds.start || t.date > bounds.end) return false;
                if (status !== 'all' && t.status !== status) return false;
                if (type !== 'all' && t.type !== type) return false;
                if (accountId !== 'all' && t.accountId !== accountId && t.toAccountId !== accountId) return false;
                if (categoryId !== 'all' && t.categoryId !== categoryId) return false;
                if (term) {
                    const category = t.categoryId ? lookups.categoryById.get(t.categoryId)?.name ?? '' : '';
                    const account = t.accountId ? lookups.accountById.get(t.accountId)?.name ?? '' : '';
                    const haystack = `${t.description} ${t.notes} ${category} ${account}`.toLowerCase();
                    if (!haystack.includes(term)) return false;
                }

                return true;
            })
            .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1));
    }, [db.transactions, bounds, status, type, accountId, categoryId, search, lookups]);

    const totals = useMemo(() => {
        let income = 0;
        let expenses = 0;
        for (const t of filtered) {
            if (t.status !== 'actual' || t.type === 'transfer') continue;
            if (t.type === 'income') income += t.amount;
            else expenses += t.amount;
        }

        return { income, expenses, net: income - expenses, count: filtered.length };
    }, [filtered]);

    const activeFilterCount = [
        accountId !== 'all',
        categoryId !== 'all',
        type !== 'all',
        status !== 'all',
        range !== 'this-month'
    ].filter(Boolean).length;

    const resetFilters = () => {
        setAccountId('all');
        setCategoryId('all');
        setType('all');
        setStatus('all');
        setRange('this-month');
        setSearch('');
    };

    return (
        <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>Transactions</h1>
                    <p className='text-text-muted mt-0.5 text-[12.5px]'>
                        {totals.count} record{totals.count === 1 ? '' : 's'} · {format(totals.income)} in ·{' '}
                        {format(totals.expenses)} out
                    </p>
                </div>
                <Button variant='primary' onClick={onAdd}>
                    <Plus className='size-4' />
                    Add transaction
                </Button>
            </div>

            {/* Search + filter controls */}
            <Card padded={false}>
                <div className='flex flex-wrap items-center gap-2 p-3'>
                    <div className='relative min-w-[180px] flex-1'>
                        <Search className='text-text-faint pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2' />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder='Search description, notes, category…'
                            className='pl-9'
                        />
                    </div>
                    <Select
                        value={range}
                        onChange={(e) => setRange(e.target.value as RangePreset)}
                        className='w-auto min-w-[140px]'>
                        <option value='this-month'>This month</option>
                        <option value='last-month'>Last month</option>
                        <option value='last-3'>Last 3 months</option>
                        <option value='this-year'>This year</option>
                        <option value='all'>All time</option>
                        <option value='custom'>Custom range</option>
                    </Select>
                    <Button
                        variant={showFilters || activeFilterCount ? 'secondary' : 'ghost'}
                        onClick={() => setShowFilters((v) => !v)}>
                        <Filter className='size-3.5' />
                        Filters
                        {activeFilterCount ? (
                            <span className='bg-accent ml-1 rounded-full px-1.5 text-[10px] font-semibold text-white'>
                                {activeFilterCount}
                            </span>
                        ) : null}
                    </Button>
                </div>

                {showFilters ? (
                    <div className='border-line grid gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-4'>
                        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                            <option value='all'>All accounts</option>
                            {db.accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                    {a.archived ? ' (archived)' : ''}
                                </option>
                            ))}
                        </Select>
                        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                            <option value='all'>All categories</option>
                            {db.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </Select>
                        <Select value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
                            <option value='all'>All types</option>
                            <option value='expense'>Expense</option>
                            <option value='income'>Income</option>
                            <option value='transfer'>Transfer</option>
                        </Select>
                        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                            <option value='all'>Actual & scheduled</option>
                            <option value='actual'>Actual only</option>
                            <option value='projected'>Scheduled only</option>
                        </Select>

                        {range === 'custom' ? (
                            <>
                                <Input
                                    type='date'
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    aria-label='Start date'
                                />
                                <Input
                                    type='date'
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    aria-label='End date'
                                />
                            </>
                        ) : null}

                        {activeFilterCount || search ? (
                            <Button variant='ghost' onClick={resetFilters} className='justify-self-start'>
                                <X className='size-3.5' />
                                Clear filters
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </Card>

            {filtered.length ? (
                <>
                    {/* Desktop ledger.
                        `table-fixed` is load-bearing: with auto layout, long
                        imported descriptions/notes expand their column until
                        the amount is clipped by the card's overflow-hidden.
                        Fixed layout pins every column so truncation happens
                        inside cells instead. */}
                    <Card padded={false} className='hidden overflow-hidden md:block'>
                        <table className='w-full table-fixed'>
                            <thead>
                                <tr className='border-line text-text-muted border-b text-left text-[11.5px]'>
                                    <th className='w-[106px] px-4 py-2.5 font-medium'>Date</th>
                                    <th className='px-4 py-2.5 font-medium'>Description</th>
                                    <th className='hidden w-[128px] px-4 py-2.5 font-medium xl:table-cell'>
                                        Category
                                    </th>
                                    <th className='hidden w-[178px] px-4 py-2.5 font-medium lg:table-cell'>Account</th>
                                    <th className='w-[124px] px-4 py-2.5 text-right font-medium'>Amount</th>
                                    <th className='w-[100px] px-4 py-2.5' />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((tx) => {
                                    const category = tx.categoryId ? lookups.categoryById.get(tx.categoryId) : undefined;
                                    const account = tx.accountId ? lookups.accountById.get(tx.accountId) : undefined;
                                    const toAccount = tx.toAccountId
                                        ? lookups.accountById.get(tx.toAccountId)
                                        : undefined;
                                    const value = tx.type === 'income' ? tx.amount : -tx.amount;

                                    return (
                                        <tr
                                            key={tx.id}
                                            onClick={() => onEdit(tx)}
                                            className='border-line hover:bg-surface-2 group cursor-pointer border-b transition-colors last:border-0'>
                                            <td className='text-text-muted tnum px-4 py-2.5 text-[12px] whitespace-nowrap'>
                                                {formatDisplayDate(tx.date, { withYear: true })}
                                            </td>
                                            <td className='px-4 py-2.5'>
                                                <div className='flex items-center gap-2.5'>
                                                    <IconTile
                                                        name={tx.type === 'transfer' ? 'Repeat' : category?.icon}
                                                        tone={
                                                            tx.type === 'transfer'
                                                                ? 'accent'
                                                                : tx.type === 'income'
                                                                  ? 'positive'
                                                                  : 'muted'
                                                        }
                                                        size='sm'
                                                        className='shrink-0'
                                                    />
                                                    <div className='min-w-0 flex-1'>
                                                        <div className='flex items-center gap-1.5'>
                                                            <span
                                                                className='text-text block truncate text-[13px] font-medium'
                                                                title={tx.description}>
                                                                {tx.description ||
                                                                    (tx.type === 'transfer' ? 'Transfer' : '—')}
                                                            </span>
                                                            {tx.status === 'projected' ? (
                                                                <Pill tone='accent' className='shrink-0'>
                                                                    Scheduled
                                                                </Pill>
                                                            ) : null}
                                                        </div>
                                                        {/* When the category/account columns are hidden at
                                                            narrower widths, surface them here instead. */}
                                                        <p className='text-text-faint truncate text-[11px] xl:hidden'>
                                                            {tx.type === 'transfer'
                                                                ? `${account?.name ?? '—'} → ${toAccount?.name ?? '—'}`
                                                                : `${category?.name ?? 'Uncategorised'} · ${account?.name ?? '—'}`}
                                                        </p>
                                                        {tx.notes ? (
                                                            <p
                                                                className='text-text-faint hidden truncate text-[11px] xl:block'
                                                                title={tx.notes}>
                                                                {tx.notes}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className='text-text-muted hidden px-4 py-2.5 text-[12.5px] xl:table-cell'>
                                                <span className='block truncate'>
                                                    {tx.type === 'transfer' ? '—' : (category?.name ?? 'Uncategorised')}
                                                </span>
                                            </td>
                                            <td className='text-text-muted hidden px-4 py-2.5 text-[12.5px] lg:table-cell'>
                                                {tx.type === 'transfer' ? (
                                                    <span
                                                        className='flex items-center gap-1'
                                                        title={`${account?.name ?? '—'} → ${toAccount?.name ?? '—'}`}>
                                                        <span className='truncate'>{account?.name ?? '—'}</span>
                                                        <ArrowRight className='size-3 shrink-0' />
                                                        <span className='truncate'>{toAccount?.name ?? '—'}</span>
                                                    </span>
                                                ) : (
                                                    <span className='block truncate' title={account?.name}>
                                                        {account?.name ?? '—'}
                                                    </span>
                                                )}
                                            </td>
                                            <td
                                                className={cn(
                                                    'tnum px-4 py-2.5 text-right text-[13px] font-semibold whitespace-nowrap',
                                                    tx.type === 'transfer'
                                                        ? 'text-text-muted'
                                                        : value > 0
                                                          ? 'text-positive'
                                                          : 'text-text'
                                                )}>
                                                {tx.type === 'transfer'
                                                    ? format(tx.amount)
                                                    : format(value, { signed: true })}
                                            </td>
                                            {/* The row itself opens the editor; these must not bubble. */}
                                            <td className='px-4 py-2.5' onClick={(e) => e.stopPropagation()}>
                                                <div className='flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        aria-label='Edit'
                                                        onClick={() => onEdit(tx)}>
                                                        <Pencil className='size-3.5' />
                                                    </Button>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        aria-label='Duplicate'
                                                        onClick={() => duplicateTransaction(tx.id)}>
                                                        <Copy className='size-3.5' />
                                                    </Button>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        aria-label='Delete'
                                                        onClick={() => setPendingDelete(tx)}>
                                                        <Trash2 className='size-3.5' />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </Card>

                    {/* Mobile cards — a wide table is unusable on a phone */}
                    <div className='space-y-2 md:hidden'>
                        {filtered.map((tx) => {
                            const category = tx.categoryId ? lookups.categoryById.get(tx.categoryId) : undefined;
                            const account = tx.accountId ? lookups.accountById.get(tx.accountId) : undefined;
                            const toAccount = tx.toAccountId ? lookups.accountById.get(tx.toAccountId) : undefined;
                            const value = tx.type === 'income' ? tx.amount : -tx.amount;

                            return (
                                <Card
                                    key={tx.id}
                                    padded={false}
                                    className='cursor-pointer p-3 transition-colors active:bg-surface-2'
                                    onClick={() => onEdit(tx)}>
                                    <div className='flex items-start gap-3'>
                                        <IconTile
                                            name={tx.type === 'transfer' ? 'Repeat' : category?.icon}
                                            tone={
                                                tx.type === 'transfer'
                                                    ? 'accent'
                                                    : tx.type === 'income'
                                                      ? 'positive'
                                                      : 'muted'
                                            }
                                        />
                                        <div className='min-w-0 flex-1'>
                                            <div className='flex items-start justify-between gap-2'>
                                                <div className='min-w-0'>
                                                    <p className='text-text truncate text-[13.5px] font-medium'>
                                                        {tx.description || (tx.type === 'transfer' ? 'Transfer' : '—')}
                                                    </p>
                                                    <p className='text-text-muted mt-0.5 truncate text-[11.5px]'>
                                                        {tx.type === 'transfer'
                                                            ? `${account?.name ?? '—'} → ${toAccount?.name ?? '—'}`
                                                            : `${category?.name ?? 'Uncategorised'} · ${account?.name ?? '—'}`}
                                                    </p>
                                                </div>
                                                <p
                                                    className={cn(
                                                        'tnum shrink-0 text-[14px] font-semibold',
                                                        tx.type === 'transfer'
                                                            ? 'text-text-muted'
                                                            : value > 0
                                                              ? 'text-positive'
                                                              : 'text-text'
                                                    )}>
                                                    {tx.type === 'transfer'
                                                        ? format(tx.amount)
                                                        : format(value, { signed: true })}
                                                </p>
                                            </div>
                                            <div className='mt-2 flex items-center justify-between gap-2'>
                                                <div className='flex items-center gap-1.5'>
                                                    <span className='text-text-faint text-[11px]'>
                                                        {formatDisplayDate(tx.date, { withYear: true })}
                                                    </span>
                                                    {tx.status === 'projected' ? (
                                                        <Pill tone='accent'>Scheduled</Pill>
                                                    ) : null}
                                                </div>
                                                {/* The card itself opens the editor; these must not bubble. */}
                                                <div
                                                    className='flex items-center gap-0.5'
                                                    onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        aria-label='Edit'
                                                        onClick={() => onEdit(tx)}>
                                                        <Pencil className='size-3.5' />
                                                    </Button>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        aria-label='Duplicate'
                                                        onClick={() => duplicateTransaction(tx.id)}>
                                                        <Copy className='size-3.5' />
                                                    </Button>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        aria-label='Delete'
                                                        onClick={() => setPendingDelete(tx)}>
                                                        <Trash2 className='size-3.5' />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </>
            ) : (
                <Card>
                    <EmptyState
                        icon={<Receipt className='size-5' />}
                        title={db.transactions.length ? 'No matching transactions' : 'No transactions yet'}
                        message={
                            db.transactions.length
                                ? 'Try widening the date range or clearing the filters.'
                                : 'Record your first expense, income or transfer to start building your ledger.'
                        }
                        action={
                            db.transactions.length ? (
                                <Button variant='secondary' onClick={resetFilters}>
                                    Clear filters
                                </Button>
                            ) : (
                                <Button variant='primary' onClick={onAdd}>
                                    <Plus className='size-4' />
                                    Add transaction
                                </Button>
                            )
                        }
                    />
                </Card>
            )}

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onClose={() => setPendingDelete(null)}
                onConfirm={() => pendingDelete && deleteTransaction(pendingDelete.id)}
                title='Delete transaction'
                confirmLabel='Delete'
                message={
                    <>
                        Delete <strong className='text-text'>{pendingDelete?.description || 'this transaction'}</strong>{' '}
                        for {pendingDelete ? format(pendingDelete.amount) : ''}? Balances and budgets update
                        immediately. This cannot be undone.
                    </>
                }
            />
        </div>
    );
}
