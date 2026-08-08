'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
    ArrowLeftRight,
    BarChart3,
    CalendarClock,
    CalendarRange,
    ChevronRight,
    Ellipsis,
    LayoutDashboard,
    LineChart,
    Landmark,
    Minus,
    PiggyBank,
    Plus,
    Receipt,
    Repeat,
    Settings as SettingsIcon,
    TrendingUp,
    Wallet,
    X
} from 'lucide-react';

import { computeBalances, netWorthSummary } from '@/lib/finance/calc';
import { useFinance } from '@/lib/finance/store';
import { cn } from '@/lib/utils';

import { useMoneyFormat } from './money';
import { Button } from './ui';

export interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    group: 'main' | 'plan' | 'system';
}

export const NAV_ITEMS: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className='size-4' />, group: 'main' },
    { id: 'transactions', label: 'Transactions', icon: <Receipt className='size-4' />, group: 'main' },
    { id: 'budgets', label: 'Budgets', icon: <PiggyBank className='size-4' />, group: 'main' },
    { id: 'accounts', label: 'Accounts', icon: <Landmark className='size-4' />, group: 'main' },
    { id: 'upcoming', label: 'Upcoming', icon: <CalendarClock className='size-4' />, group: 'plan' },
    { id: 'recurring', label: 'Recurring', icon: <Repeat className='size-4' />, group: 'plan' },
    { id: 'projection', label: 'Projection', icon: <LineChart className='size-4' />, group: 'plan' },
    { id: 'monthly', label: 'Monthly', icon: <CalendarRange className='size-4' />, group: 'plan' },
    { id: 'reports', label: 'Reports', icon: <BarChart3 className='size-4' />, group: 'plan' },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className='size-4' />, group: 'system' }
];

/** Primary destinations on mobile; the rest live behind "More". */
const MOBILE_PRIMARY = ['overview', 'transactions', 'budgets', 'upcoming'];

export type QuickAddAction =
    | 'expense'
    | 'income'
    | 'transfer'
    | 'future'
    | 'recurring'
    | 'account'
    | 'pocket';

export function AppShell({
    view,
    onNavigate,
    onQuickAdd,
    children
}: {
    view: string;
    onNavigate: (id: string) => void;
    onQuickAdd: (action: QuickAddAction) => void;
    children: React.ReactNode;
}) {
    const { db } = useFinance();
    const { format } = useMoneyFormat();
    const [moreOpen, setMoreOpen] = useState(false);
    const [quickOpen, setQuickOpen] = useState(false);
    const quickRef = useRef<HTMLDivElement>(null);

    const nw = useMemo(() => netWorthSummary(db, computeBalances(db)), [db]);
    const activeItem = NAV_ITEMS.find((n) => n.id === view);

    /* Close the quick-add popover on outside click or Escape. */
    useEffect(() => {
        if (!quickOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!quickRef.current?.contains(e.target as Node)) setQuickOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setQuickOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);

        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [quickOpen]);

    const go = (id: string) => {
        onNavigate(id);
        setMoreOpen(false);
    };

    const quickAdd = (action: QuickAddAction) => {
        setQuickOpen(false);
        setMoreOpen(false);
        onQuickAdd(action);
    };

    return (
        <div className='bg-bg min-h-screen'>
            {/* ── Desktop sidebar ─────────────────────────────────────────── */}
            <aside className='border-line bg-surface fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col border-r lg:flex'>
                <div className='px-4 py-5'>
                    <div className='flex items-center gap-2.5'>
                        <div className='bg-accent flex size-8 items-center justify-center rounded-[10px]'>
                            <Wallet className='size-4 text-white' />
                        </div>
                        <div>
                            <p className='text-text text-[14px] leading-tight font-semibold'>CREAM money</p>
                            <p className='text-text-faint text-[10.5px] leading-tight'>Personal finance</p>
                        </div>
                    </div>
                </div>

                <div className='px-3'>
                    <div className='bg-surface-2 border-line rounded-[13px] border p-3'>
                        <p className='text-text-muted text-[10.5px]'>Net worth</p>
                        <p className='tnum text-text mt-1 text-[19px] leading-none font-semibold'>
                            {format(nw.total, { compact: true })}
                        </p>
                    </div>
                </div>

                <nav className='hide-scrollbar mt-4 flex-1 overflow-y-auto px-3 pb-4'>
                    {(['main', 'plan', 'system'] as const).map((group) => (
                        <div key={group} className='mb-4'>
                            <p className='text-text-faint mb-1.5 px-2 text-[10px] font-semibold tracking-wider uppercase'>
                                {group === 'main' ? 'Money' : group === 'plan' ? 'Plan ahead' : 'System'}
                            </p>
                            <div className='space-y-0.5'>
                                {NAV_ITEMS.filter((n) => n.group === group).map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => go(item.id)}
                                        aria-current={view === item.id ? 'page' : undefined}
                                        className={cn(
                                            'flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition-colors',
                                            view === item.id
                                                ? 'bg-accent-soft text-accent'
                                                : 'text-text-muted hover:bg-surface-2 hover:text-text'
                                        )}>
                                        {item.icon}
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className='border-line border-t p-3'>
                    <Button variant='primary' className='w-full' onClick={() => quickAdd('expense')}>
                        <Plus className='size-4' />
                        Add expense
                    </Button>
                </div>
            </aside>

            {/* ── Main column ─────────────────────────────────────────────── */}
            <div className='lg:pl-[228px]'>
                {/* Top bar */}
                <header className='border-line bg-bg/85 sticky top-0 z-20 border-b backdrop-blur-md'>
                    <div className='mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6'>
                        <div className='flex items-center gap-2.5 lg:hidden'>
                            <div className='bg-accent flex size-7 items-center justify-center rounded-[9px]'>
                                <Wallet className='size-3.5 text-white' />
                            </div>
                            <div>
                                <p className='text-text-faint text-[10px] leading-tight'>Net worth</p>
                                <p className='tnum text-text text-[13.5px] leading-tight font-semibold'>
                                    {format(nw.total, { compact: true })}
                                </p>
                            </div>
                        </div>

                        <h1 className='text-text hidden text-[14px] font-semibold lg:block'>
                            {activeItem?.label ?? 'Overview'}
                        </h1>

                        <div className='relative flex items-center gap-2' ref={quickRef}>
                            <Button variant='primary' size='sm' onClick={() => setQuickOpen((v) => !v)}>
                                <Plus className='size-3.5' />
                                Add
                            </Button>

                            {quickOpen ? (
                                <div className='bg-surface border-line animate-pop-in absolute top-10 right-0 z-40 w-[240px] overflow-hidden rounded-[14px] border shadow-2xl'>
                                    <QuickAddItem
                                        icon={<Minus className='size-3.5' />}
                                        tone='negative'
                                        label='Expense'
                                        hint='Money going out'
                                        onClick={() => quickAdd('expense')}
                                    />
                                    <QuickAddItem
                                        icon={<Plus className='size-3.5' />}
                                        tone='positive'
                                        label='Income'
                                        hint='Money coming in'
                                        onClick={() => quickAdd('income')}
                                    />
                                    <QuickAddItem
                                        icon={<ArrowLeftRight className='size-3.5' />}
                                        tone='accent'
                                        label='Transfer'
                                        hint='Between your accounts'
                                        onClick={() => quickAdd('transfer')}
                                    />
                                    <div className='border-line border-t' />
                                    <QuickAddItem
                                        icon={<CalendarClock className='size-3.5' />}
                                        label='Future transaction'
                                        hint='Scheduled, not yet paid'
                                        onClick={() => quickAdd('future')}
                                    />
                                    <QuickAddItem
                                        icon={<Repeat className='size-3.5' />}
                                        label='Recurring rule'
                                        hint='Salary, rent, subscriptions'
                                        onClick={() => quickAdd('recurring')}
                                    />
                                    <div className='border-line border-t' />
                                    <QuickAddItem
                                        icon={<Landmark className='size-3.5' />}
                                        label='Account'
                                        hint='Bank or savings'
                                        onClick={() => quickAdd('account')}
                                    />
                                    <QuickAddItem
                                        icon={<Wallet className='size-3.5' />}
                                        label='Pocket'
                                        hint='Money for a purpose'
                                        onClick={() => quickAdd('pocket')}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>
                </header>

                <main className='mx-auto max-w-[1400px] px-4 py-5 pb-28 sm:px-6 lg:pb-10'>{children}</main>
            </div>

            {/* ── Mobile bottom nav ───────────────────────────────────────── */}
            <nav className='border-line bg-surface/95 safe-bottom fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md lg:hidden'>
                <div className='grid grid-cols-5'>
                    {MOBILE_PRIMARY.map((id) => {
                        const item = NAV_ITEMS.find((n) => n.id === id);
                        if (!item) return null;
                        const active = view === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => go(item.id)}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                                    active ? 'text-accent' : 'text-text-muted'
                                )}>
                                {item.icon}
                                {item.label}
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setMoreOpen(true)}
                        className={cn(
                            'flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                            !MOBILE_PRIMARY.includes(view) ? 'text-accent' : 'text-text-muted'
                        )}>
                        <Ellipsis className='size-4' />
                        More
                    </button>
                </div>
            </nav>

            {/* Mobile "more" sheet */}
            {moreOpen ? (
                <div className='fixed inset-0 z-40 lg:hidden'>
                    <div
                        className='animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-[2px]'
                        onClick={() => setMoreOpen(false)}
                    />
                    <div className='bg-surface border-line animate-slide-up safe-bottom absolute inset-x-0 bottom-0 rounded-t-[22px] border-t p-4'>
                        <div className='mb-3 flex items-center justify-between'>
                            <p className='text-text text-[15px] font-semibold'>All sections</p>
                            <button
                                onClick={() => setMoreOpen(false)}
                                aria-label='Close'
                                className='text-text-muted hover:bg-surface-2 cursor-pointer rounded-lg p-1.5'>
                                <X className='size-4' />
                            </button>
                        </div>
                        <div className='grid grid-cols-2 gap-2'>
                            {NAV_ITEMS.filter((n) => !MOBILE_PRIMARY.includes(n.id)).map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => go(item.id)}
                                    className={cn(
                                        'flex cursor-pointer items-center gap-2.5 rounded-[12px] border px-3 py-3 text-[13px] font-medium transition-colors',
                                        view === item.id
                                            ? 'border-accent/40 bg-accent-soft text-accent'
                                            : 'border-line bg-surface-2 text-text'
                                    )}>
                                    {item.icon}
                                    {item.label}
                                    <ChevronRight className='text-text-faint ml-auto size-3.5' />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function QuickAddItem({
    icon,
    label,
    hint,
    onClick,
    tone = 'muted'
}: {
    icon: React.ReactNode;
    label: string;
    hint: string;
    onClick: () => void;
    tone?: 'muted' | 'positive' | 'negative' | 'accent';
}) {
    return (
        <button
            onClick={onClick}
            className='hover:bg-surface-2 flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors'>
            <span
                className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-[8px]',
                    tone === 'positive'
                        ? 'bg-positive-soft text-positive'
                        : tone === 'negative'
                          ? 'bg-negative-soft text-negative'
                          : tone === 'accent'
                            ? 'bg-accent-soft text-accent'
                            : 'bg-surface-3 text-text-muted'
                )}>
                {icon}
            </span>
            <span className='min-w-0'>
                <span className='text-text block text-[12.5px] font-medium'>{label}</span>
                <span className='text-text-faint block text-[10.5px]'>{hint}</span>
            </span>
        </button>
    );
}
