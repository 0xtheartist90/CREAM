'use client';

import { useMemo, useRef, useState } from 'react';

import {
    Archive,
    ArchiveRestore,
    Check,
    CloudCheck,
    Download,
    LogOut,
    Moon,
    Pencil,
    Plus,
    RefreshCw,
    Shapes,
    Sun,
    Trash2,
    TriangleAlert,
    Upload,
    UserRound
} from 'lucide-react';

import { useAuth } from '@/lib/finance/auth';
import { CURRENCY_PRESETS } from '@/lib/finance/format';
import { useFinance } from '@/lib/finance/store';
import type { Category } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { CategoryForm, DeleteCategoryDialog } from './forms';
import { IconTile } from './icons';
import { useMoneyFormat } from './money';
import { Banner, Button, Card, ConfirmDialog, EmptyState, Field, Pill, SectionHeader, Segmented, Select, Toggle } from './ui';

export function SettingsView() {
    const { db, updateSettings, exportData, importData, resetData, syncStatus } = useFinance();
    const { user, signOut } = useAuth();
    const { format } = useMoneyFormat();

    const fileRef = useRef<HTMLInputElement>(null);
    const [resetOpen, setResetOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [signOutOpen, setSignOutOpen] = useState(false);
    const [importResult, setImportResult] = useState<{ ok: boolean; errors: string[]; warnings: string[] } | null>(null);

    const activeAccounts = db.accounts.filter((a) => !a.archived);

    const stats = useMemo(
        () => ({
            accounts: db.accounts.length,
            transactions: db.transactions.length,
            recurring: db.recurring.length,
            categories: db.categories.length,
            budgetMonths: Object.keys(db.budgets).length
        }),
        [db]
    );

    const doExport = () => {
        const blob = new Blob([exportData()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cream-money-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const doImport = async (file: File) => {
        setImporting(true);
        setImportResult(null);
        const text = await file.text();
        // Import now replaces the rows in Supabase, so this is a real await.
        const result = await importData(text);
        setImportResult(result);
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div className='space-y-4'>
            <div>
                <h1 className='text-text text-[20px] font-semibold tracking-tight'>Settings</h1>
                <p className='text-text-muted mt-0.5 text-[12.5px]'>
                    Your finances sync to your Supabase project. Only view preferences stay on this device.
                </p>
            </div>

            {syncStatus.state === 'error' ? (
                <Banner tone='negative' icon={<TriangleAlert className='size-4' />}>
                    {syncStatus.error ?? 'A change could not be saved.'} Your screen may be ahead of the database —
                    reload to see what was actually stored.
                </Banner>
            ) : null}

            <Card>
                <SectionHeader title='Account' />
                <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div className='flex items-center gap-3'>
                        <div className='bg-accent-soft text-accent flex size-10 items-center justify-center rounded-[12px]'>
                            <UserRound className='size-5' />
                        </div>
                        <div className='min-w-0'>
                            <p className='text-text truncate text-[13.5px] font-medium'>{user?.email ?? 'Signed in'}</p>
                            <p className='text-text-muted mt-0.5 flex items-center gap-1.5 text-[11.5px]'>
                                {syncStatus.state === 'saving' ? (
                                    <>
                                        <RefreshCw className='size-3 animate-spin' />
                                        Saving {syncStatus.pending} change{syncStatus.pending === 1 ? '' : 's'}…
                                    </>
                                ) : syncStatus.state === 'error' ? (
                                    <>
                                        <TriangleAlert className='text-negative size-3' />
                                        Not saved
                                    </>
                                ) : (
                                    <>
                                        <CloudCheck className='text-positive size-3' />
                                        All changes saved
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                    <Button variant='outline' onClick={() => setSignOutOpen(true)}>
                        <LogOut className='size-3.5' />
                        Sign out
                    </Button>
                </div>
            </Card>

            <div className='grid gap-4 lg:grid-cols-2'>
                <Card>
                    <SectionHeader title='Appearance' />
                    <div className='space-y-4'>
                        <Field label='Theme'>
                            <Segmented
                                value={db.settings.theme}
                                onChange={(v) => updateSettings({ theme: v })}
                                options={[
                                    { value: 'dark', label: 'Dark', icon: <Moon className='size-3.5' /> },
                                    { value: 'light', label: 'Light', icon: <Sun className='size-3.5' /> }
                                ]}
                            />
                        </Field>

                        <div className='border-line flex items-center justify-between gap-4 border-t pt-4'>
                            <div>
                                <p className='text-text text-[13px] font-medium'>Compact large numbers</p>
                                <p className='text-text-muted mt-0.5 text-[11.5px]'>
                                    Show {format(1250000, { compact: true })} instead of the full figure.
                                </p>
                            </div>
                            <Toggle
                                checked={db.settings.compactLargeNumbers}
                                onChange={(v) => updateSettings({ compactLargeNumbers: v })}
                                label='Compact large numbers'
                            />
                        </div>
                    </div>
                </Card>

                <Card>
                    <SectionHeader title='Currency & numbers' />
                    <div className='space-y-4'>
                        <Field label='Currency' hint='Single currency — no conversion is applied.'>
                            <Select
                                value={db.settings.currency}
                                onChange={(e) => {
                                    const preset = CURRENCY_PRESETS.find((c) => c.code === e.target.value);
                                    if (!preset) return;
                                    updateSettings({
                                        currency: preset.code,
                                        currencySymbol: preset.symbol,
                                        locale: preset.locale
                                    });
                                }}>
                                {CURRENCY_PRESETS.map((c) => (
                                    <option key={c.code} value={c.code}>
                                        {c.symbol} {c.code} — {c.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label='Decimal places'>
                            <Segmented
                                value={String(db.settings.decimals)}
                                onChange={(v) => updateSettings({ decimals: v === '2' ? 2 : 0 })}
                                options={[
                                    { value: '0', label: 'None (฿1,250)' },
                                    { value: '2', label: 'Two (฿1,250.00)' }
                                ]}
                            />
                        </Field>

                        <Field label='Week starts on'>
                            <Segmented
                                value={String(db.settings.startDayOfWeek)}
                                onChange={(v) => updateSettings({ startDayOfWeek: v === '0' ? 0 : 1 })}
                                options={[
                                    { value: '1', label: 'Monday' },
                                    { value: '0', label: 'Sunday' }
                                ]}
                            />
                        </Field>
                    </div>
                </Card>
            </div>

            <Card>
                <SectionHeader title='Defaults' />
                <Field label='Default account for new transactions'>
                    <Select
                        value={db.settings.defaultAccountId ?? ''}
                        onChange={(e) => updateSettings({ defaultAccountId: e.target.value || null })}>
                        <option value=''>No default</option>
                        {activeAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </Select>
                </Field>
            </Card>

            <CategoriesSection />

            <Card>
                <SectionHeader
                    title='Backup & restore'
                    subtitle='Export a JSON snapshot, or replace everything from a previous export'
                />

                <div className='border-line mb-4 grid grid-cols-2 gap-3 rounded-[12px] border p-3 sm:grid-cols-5'>
                    {[
                        { label: 'Accounts', value: stats.accounts },
                        { label: 'Transactions', value: stats.transactions },
                        { label: 'Recurring', value: stats.recurring },
                        { label: 'Categories', value: stats.categories },
                        { label: 'Budget months', value: stats.budgetMonths }
                    ].map((s) => (
                        <div key={s.label}>
                            <p className='tnum text-text text-[17px] font-semibold'>{s.value}</p>
                            <p className='text-text-muted text-[11px]'>{s.label}</p>
                        </div>
                    ))}
                </div>

                <div className='flex flex-wrap gap-2'>
                    <Button variant='secondary' onClick={doExport}>
                        <Download className='size-3.5' />
                        Export JSON
                    </Button>
                    <Button variant='secondary' onClick={() => fileRef.current?.click()} loading={importing}>
                        <Upload className='size-3.5' />
                        Import JSON
                    </Button>
                    <input
                        ref={fileRef}
                        type='file'
                        accept='application/json,.json'
                        className='hidden'
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void doImport(file);
                        }}
                    />
                    <Button variant='danger' onClick={() => setResetOpen(true)}>
                        <Trash2 className='size-3.5' />
                        Reset all data
                    </Button>
                </div>

                {importResult ? (
                    <div className='mt-3 space-y-2'>
                        {importResult.ok ? (
                            <Banner tone='positive' icon={<Check className='size-4' />}>
                                Import successful — your data has been replaced.
                            </Banner>
                        ) : (
                            <Banner tone='negative' icon={<TriangleAlert className='size-4' />}>
                                <p className='font-medium'>Import rejected — your existing data is untouched.</p>
                                <ul className='mt-1 list-inside list-disc'>
                                    {importResult.errors.map((e, i) => (
                                        <li key={i}>{e}</li>
                                    ))}
                                </ul>
                            </Banner>
                        )}
                        {importResult.warnings.length ? (
                            <Banner tone='warning'>
                                <ul className='list-inside list-disc'>
                                    {importResult.warnings.slice(0, 5).map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            </Banner>
                        ) : null}
                    </div>
                ) : null}
            </Card>

            <ConfirmDialog
                open={resetOpen}
                onClose={() => setResetOpen(false)}
                onConfirm={resetData}
                title='Reset all data'
                confirmLabel='Delete everything'
                requirePhrase='RESET'
                message={
                    <>
                        This permanently deletes every account, transaction, budget and recurring rule from your
                        Supabase database. Export a backup first if you might want this data back — it cannot be
                        recovered.
                    </>
                }
            />

            <ConfirmDialog
                open={signOutOpen}
                onClose={() => setSignOutOpen(false)}
                onConfirm={() => void signOut()}
                title='Sign out'
                confirmLabel='Sign out'
                tone='primary'
                message={
                    <>
                        Sign out of <strong className='text-text'>{user?.email}</strong>? Your data stays safely in
                        Supabase and will be here when you sign back in.
                    </>
                }
            />
        </div>
    );
}

/* ── Categories ─────────────────────────────────────────────────────────── */

function CategoriesSection() {
    const { db, setCategoryArchived } = useFinance();

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Category | null>(null);
    const [initialKind, setInitialKind] = useState<'income' | 'expense'>('expense');
    const [deleting, setDeleting] = useState<Category | null>(null);

    const usage = useMemo(() => {
        const map = new Map<string, number>();
        for (const t of db.transactions) {
            if (!t.categoryId) continue;
            map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + 1);
        }

        return map;
    }, [db.transactions]);

    const groups = [
        { kind: 'expense' as const, title: 'Expense categories' },
        { kind: 'income' as const, title: 'Income categories' }
    ];

    const openNew = (kind: 'income' | 'expense') => {
        setEditing(null);
        setInitialKind(kind);
        setFormOpen(true);
    };

    return (
        <Card>
            <SectionHeader
                title='Categories'
                subtitle='Budgets apply to expense categories only'
                action={
                    <Button size='sm' variant='primary' onClick={() => openNew('expense')}>
                        <Plus className='size-3.5' />
                        New
                    </Button>
                }
            />

            <div className='space-y-5'>
                {groups.map((group) => {
                    const items = db.categories.filter((c) => c.kind === group.kind);
                    const active = items.filter((c) => !c.archived);
                    const archived = items.filter((c) => c.archived);

                    return (
                        <div key={group.kind}>
                            <div className='mb-2 flex items-center justify-between'>
                                <h3 className='text-text-muted text-[12px] font-medium'>{group.title}</h3>
                                <Button size='sm' variant='ghost' onClick={() => openNew(group.kind)}>
                                    <Plus className='size-3' />
                                    Add
                                </Button>
                            </div>

                            {active.length || archived.length ? (
                                <div className='flex flex-wrap gap-2'>
                                    {[...active, ...archived].map((category) => {
                                        const count = usage.get(category.id) ?? 0;

                                        return (
                                            <div
                                                key={category.id}
                                                className={cn(
                                                    'border-line bg-surface-2 group flex items-center gap-2 rounded-[11px] border py-1.5 pr-1.5 pl-2',
                                                    category.archived && 'opacity-55'
                                                )}>
                                                <IconTile name={category.icon} size='sm' />
                                                <div className='min-w-0'>
                                                    <p className='text-text text-[12.5px] font-medium'>
                                                        {category.name}
                                                    </p>
                                                    <p className='text-text-faint text-[10.5px]'>
                                                        {count} transaction{count === 1 ? '' : 's'}
                                                        {category.archived ? ' · archived' : ''}
                                                    </p>
                                                </div>
                                                <div className='flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100'>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        className='size-7'
                                                        aria-label={`Edit ${category.name}`}
                                                        onClick={() => {
                                                            setEditing(category);
                                                            setFormOpen(true);
                                                        }}>
                                                        <Pencil className='size-3' />
                                                    </Button>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        className='size-7'
                                                        aria-label={
                                                            category.archived
                                                                ? `Restore ${category.name}`
                                                                : `Archive ${category.name}`
                                                        }
                                                        onClick={() =>
                                                            setCategoryArchived(category.id, !category.archived)
                                                        }>
                                                        {category.archived ? (
                                                            <ArchiveRestore className='size-3' />
                                                        ) : (
                                                            <Archive className='size-3' />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        size='icon'
                                                        variant='ghost'
                                                        className='size-7'
                                                        aria-label={`Delete ${category.name}`}
                                                        onClick={() => setDeleting(category)}>
                                                        <Trash2 className='size-3' />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyState
                                    compact
                                    icon={<Shapes className='size-4' />}
                                    title={`No ${group.kind} categories`}
                                    action={
                                        <Button size='sm' variant='secondary' onClick={() => openNew(group.kind)}>
                                            Add one
                                        </Button>
                                    }
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            <CategoryForm
                open={formOpen}
                onClose={() => setFormOpen(false)}
                editing={editing}
                initialKind={initialKind}
            />
            <DeleteCategoryDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} category={deleting} />
        </Card>
    );
}
