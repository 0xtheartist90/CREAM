'use client';

import { useMemo, useState } from 'react';

import {
    Archive,
    ArchiveRestore,
    ArrowLeftRight,
    Landmark,
    MoreHorizontal,
    Pencil,
    PiggyBank,
    Plus,
    Target,
    Trash2,
    Wallet
} from 'lucide-react';

import { accountBalancesWithShare, computeBalances, netWorthSummary } from '@/lib/finance/calc';
import { useFinance } from '@/lib/finance/store';
import type { Account, AccountType } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { AccountForm } from './forms';
import { IconTile } from './icons';
import { useMoneyFormat } from './money';
import { Banner, Button, Card, ConfirmDialog, EmptyState, Pill, ProgressBar, SectionHeader } from './ui';

const GROUPS: { type: AccountType; title: string; blurb: string; icon: React.ReactNode }[] = [
    { type: 'bank', title: 'Bank accounts', blurb: 'Everyday spending', icon: <Landmark className='size-4' /> },
    { type: 'savings', title: 'Savings', blurb: 'Money set aside', icon: <PiggyBank className='size-4' /> },
    { type: 'pocket', title: 'Pockets', blurb: 'Reserved for a purpose', icon: <Wallet className='size-4' /> }
];

export function AccountsView({ onTransfer }: { onTransfer: () => void }) {
    const { db, setAccountArchived, deleteAccount } = useFinance();
    const { format } = useMoneyFormat();

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Account | null>(null);
    const [initialType, setInitialType] = useState<AccountType>('bank');
    const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [menuFor, setMenuFor] = useState<string | null>(null);

    const balances = useMemo(() => computeBalances(db), [db]);
    const nw = useMemo(() => netWorthSummary(db, balances), [db, balances]);
    const withShare = useMemo(() => accountBalancesWithShare(db, balances), [db, balances]);
    const shareById = useMemo(() => new Map(withShare.map((a) => [a.account.id, a])), [withShare]);

    const archived = db.accounts.filter((a) => a.archived);

    const openNew = (type: AccountType) => {
        setEditing(null);
        setInitialType(type);
        setFormOpen(true);
    };

    const openEdit = (account: Account) => {
        setEditing(account);
        setInitialType(account.type);
        setFormOpen(true);
        setMenuFor(null);
    };

    const confirmDelete = () => {
        if (!pendingDelete) return;
        const result = deleteAccount(pendingDelete.id);
        if (!result.ok) {
            setDeleteError(result.error ?? 'Could not delete this account.');

            return;
        }
        setDeleteError(null);
        setPendingDelete(null);
    };

    return (
        <div className='space-y-5' onClick={() => setMenuFor(null)}>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h1 className='text-text text-[20px] font-semibold tracking-tight'>Accounts</h1>
                    <p className='text-text-muted mt-0.5 text-[12.5px]'>
                        Net worth {format(nw.total)} across {db.accounts.filter((a) => !a.archived).length} active
                        account{db.accounts.filter((a) => !a.archived).length === 1 ? '' : 's'}
                    </p>
                </div>
                <div className='flex items-center gap-2'>
                    <Button variant='secondary' onClick={onTransfer} disabled={db.accounts.filter((a) => !a.archived).length < 2}>
                        <ArrowLeftRight className='size-3.5' />
                        Transfer
                    </Button>
                    <Button variant='primary' onClick={() => openNew('bank')}>
                        <Plus className='size-4' />
                        Add account
                    </Button>
                </div>
            </div>

            {GROUPS.map((group) => {
                const items = db.accounts.filter((a) => a.type === group.type && !a.archived);
                const groupTotal = items.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);

                return (
                    <div key={group.type}>
                        <SectionHeader
                            title={group.title}
                            subtitle={`${group.blurb} · ${format(groupTotal)}`}
                            action={
                                <Button size='sm' variant='ghost' onClick={() => openNew(group.type)}>
                                    <Plus className='size-3.5' />
                                    Add
                                </Button>
                            }
                        />

                        {items.length ? (
                            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                                {items.map((account) => {
                                    const balance = balances.get(account.id) ?? 0;
                                    const share = shareById.get(account.id)?.shareOfNetWorth ?? 0;
                                    const target = account.targetAmount;
                                    const targetPct = target && target > 0 ? (balance / target) * 100 : null;

                                    return (
                                        <Card key={account.id} className='relative'>
                                            <div className='flex items-start gap-3'>
                                                <IconTile name={account.icon} size='lg' tone='accent' />
                                                <div className='min-w-0 flex-1'>
                                                    <p className='text-text truncate text-[14px] font-semibold'>
                                                        {account.name}
                                                    </p>
                                                    {account.description ? (
                                                        <p className='text-text-muted mt-0.5 truncate text-[11.5px]'>
                                                            {account.description}
                                                        </p>
                                                    ) : (
                                                        <p className='text-text-faint mt-0.5 text-[11.5px] capitalize'>
                                                            {account.type}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className='relative shrink-0'>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        aria-label={`Actions for ${account.name}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMenuFor(menuFor === account.id ? null : account.id);
                                                        }}>
                                                        <MoreHorizontal className='size-4' />
                                                    </Button>
                                                    {menuFor === account.id ? (
                                                        <div
                                                            onClick={(e) => e.stopPropagation()}
                                                            className='bg-surface border-line animate-pop-in absolute top-9 right-0 z-20 w-44 overflow-hidden rounded-[12px] border shadow-xl'>
                                                            <MenuItem
                                                                icon={<Pencil className='size-3.5' />}
                                                                onClick={() => openEdit(account)}>
                                                                Edit account
                                                            </MenuItem>
                                                            <MenuItem
                                                                icon={<Archive className='size-3.5' />}
                                                                onClick={() => {
                                                                    setAccountArchived(account.id, true);
                                                                    setMenuFor(null);
                                                                }}>
                                                                Archive
                                                            </MenuItem>
                                                            <MenuItem
                                                                icon={<Trash2 className='size-3.5' />}
                                                                destructive
                                                                onClick={() => {
                                                                    setDeleteError(null);
                                                                    setPendingDelete(account);
                                                                    setMenuFor(null);
                                                                }}>
                                                                Delete
                                                            </MenuItem>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className='mt-4'>
                                                <p className='tnum text-text text-[24px] leading-none font-semibold'>
                                                    {format(balance)}
                                                </p>
                                                <div className='mt-2 flex items-center gap-2'>
                                                    <Pill tone='neutral'>{share.toFixed(1)}% of net worth</Pill>
                                                    {balance < 0 ? <Pill tone='negative'>Overdrawn</Pill> : null}
                                                </div>
                                            </div>

                                            {account.type === 'pocket' && target && target > 0 ? (
                                                <div className='border-line mt-4 border-t pt-3'>
                                                    <div className='mb-1.5 flex items-center justify-between gap-2'>
                                                        <span className='text-text-muted flex items-center gap-1 text-[11.5px]'>
                                                            <Target className='size-3' />
                                                            Target
                                                        </span>
                                                        <span className='tnum text-text-muted text-[11.5px]'>
                                                            {format(balance)} / {format(target)}
                                                        </span>
                                                    </div>
                                                    <ProgressBar
                                                        value={targetPct ?? 0}
                                                        tone={(targetPct ?? 0) >= 100 ? 'positive' : 'accent'}
                                                    />
                                                    <p className='text-text-faint mt-1.5 text-[11px]'>
                                                        {(targetPct ?? 0) >= 100
                                                            ? 'Target reached'
                                                            : `${(targetPct ?? 0).toFixed(1)}% of target`}
                                                    </p>
                                                </div>
                                            ) : null}
                                        </Card>
                                    );
                                })}
                            </div>
                        ) : (
                            <Card>
                                <EmptyState
                                    compact
                                    icon={group.icon}
                                    title={`No ${group.title.toLowerCase()} yet`}
                                    message={
                                        group.type === 'pocket'
                                            ? 'Pockets hold money reserved for a purpose — an emergency fund, travel, or tax.'
                                            : `Add a ${group.type} account to start tracking it.`
                                    }
                                    action={
                                        <Button size='sm' variant='secondary' onClick={() => openNew(group.type)}>
                                            <Plus className='size-3.5' />
                                            Add {group.type}
                                        </Button>
                                    }
                                />
                            </Card>
                        )}
                    </div>
                );
            })}

            {archived.length ? (
                <div>
                    <SectionHeader title='Archived' subtitle='Kept for history, excluded from net worth' />
                    <Card padded={false}>
                        <div className='divide-line divide-y'>
                            {archived.map((account) => (
                                <div key={account.id} className='flex items-center gap-3 px-4 py-3'>
                                    <IconTile name={account.icon} size='sm' />
                                    <div className='min-w-0 flex-1'>
                                        <p className='text-text truncate text-[13px] font-medium'>{account.name}</p>
                                        <p className='text-text-faint text-[11px] capitalize'>{account.type}</p>
                                    </div>
                                    <span className='tnum text-text-muted text-[13px]'>
                                        {format(balances.get(account.id) ?? 0)}
                                    </span>
                                    <Button
                                        size='sm'
                                        variant='ghost'
                                        onClick={() => setAccountArchived(account.id, false)}>
                                        <ArchiveRestore className='size-3.5' />
                                        Restore
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            ) : null}

            <AccountForm
                open={formOpen}
                onClose={() => setFormOpen(false)}
                editing={editing}
                initialType={initialType}
            />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onClose={() => {
                    setPendingDelete(null);
                    setDeleteError(null);
                }}
                onConfirm={confirmDelete}
                title='Delete account'
                confirmLabel='Delete'
                message={
                    <div className='space-y-2'>
                        <p>
                            Delete <strong className='text-text'>{pendingDelete?.name}</strong>? Accounts with
                            transactions cannot be deleted — archive them instead to keep your history.
                        </p>
                        {deleteError ? <Banner tone='negative'>{deleteError}</Banner> : null}
                    </div>
                }
            />
        </div>
    );
}

function MenuItem({
    children,
    icon,
    onClick,
    destructive
}: {
    children: React.ReactNode;
    icon: React.ReactNode;
    onClick: () => void;
    destructive?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'hover:bg-surface-2 flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-[12.5px] transition-colors',
                destructive ? 'text-negative' : 'text-text'
            )}>
            {icon}
            {children}
        </button>
    );
}
