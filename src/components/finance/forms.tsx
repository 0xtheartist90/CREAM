'use client';

import { useEffect, useMemo, useState } from 'react';

import { ArrowLeftRight, ArrowRight, CalendarClock, Check, MinusCircle, PlusCircle } from 'lucide-react';

import { todayISO } from '@/lib/finance/dates';
import { parseAmountInput } from '@/lib/finance/format';
import { useFinance, type NewRecurring, type NewTransaction } from '@/lib/finance/store';
import type { Account, AccountType, Category, Frequency, RecurringRule, Transaction, TransactionType } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { ACCOUNT_ICON_CHOICES, CATEGORY_ICON_CHOICES, Icon, IconTile } from './icons';
import { useMoneyFormat } from './money';
import { AmountInput, Banner, Button, Field, Input, Modal, Select, Textarea, Toggle } from './ui';

/* ── Shared bits ────────────────────────────────────────────────────────── */

function IconPicker({
    value,
    onChange,
    choices
}: {
    value: string;
    onChange: (v: string) => void;
    choices: string[];
}) {
    return (
        <div className='border-line bg-surface-2 hide-scrollbar grid max-h-[132px] grid-cols-8 gap-1 overflow-y-auto rounded-[11px] border p-2 sm:grid-cols-10'>
            {choices.map((name) => (
                <button
                    key={name}
                    type='button'
                    onClick={() => onChange(name)}
                    aria-label={name}
                    aria-pressed={value === name}
                    className={cn(
                        'flex aspect-square cursor-pointer items-center justify-center rounded-[8px] transition-colors',
                        value === name
                            ? 'bg-accent text-white'
                            : 'text-text-muted hover:bg-surface-3 hover:text-text'
                    )}>
                    <Icon name={name} className='size-4' />
                </button>
            ))}
        </div>
    );
}

const TYPE_TABS: { value: TransactionType; label: string; icon: React.ReactNode }[] = [
    { value: 'expense', label: 'Expense', icon: <MinusCircle className='size-3.5' /> },
    { value: 'income', label: 'Income', icon: <PlusCircle className='size-3.5' /> },
    { value: 'transfer', label: 'Transfer', icon: <ArrowLeftRight className='size-3.5' /> }
];

/* ── Transaction form ───────────────────────────────────────────────────── */

export interface TransactionFormProps {
    open: boolean;
    onClose: () => void;
    /** Existing row to edit; omit to create. */
    editing?: Transaction | null;
    initialType?: TransactionType;
    initialStatus?: 'actual' | 'projected';
    initialDate?: string;
}

export function TransactionForm({
    open,
    onClose,
    editing,
    initialType = 'expense',
    initialStatus = 'actual',
    initialDate
}: TransactionFormProps) {
    const { db, addTransaction, updateTransaction } = useFinance();
    const { symbol } = useMoneyFormat();

    const accounts = useMemo(() => db.accounts.filter((a) => !a.archived), [db.accounts]);
    const [type, setType] = useState<TransactionType>(initialType);
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [accountId, setAccountId] = useState('');
    const [toAccountId, setToAccountId] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(initialDate ?? todayISO());
    const [projected, setProjected] = useState(initialStatus === 'projected');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);

    const categories = useMemo(
        () => db.categories.filter((c) => !c.archived && c.kind === (type === 'income' ? 'income' : 'expense')),
        [db.categories, type]
    );

    /* Reset the form each time it opens, seeded from the row being edited. */
    useEffect(() => {
        if (!open) return;
        setError(null);
        if (editing) {
            setType(editing.type);
            setAmount(String(editing.amount));
            setCategoryId(editing.categoryId ?? '');
            setAccountId(editing.accountId ?? '');
            setToAccountId(editing.toAccountId ?? '');
            setDescription(editing.description);
            setDate(editing.date);
            setProjected(editing.status === 'projected');
            setNotes(editing.notes);

            return;
        }
        setType(initialType);
        setAmount('');
        setDescription('');
        setNotes('');
        setDate(initialDate ?? todayISO());
        setProjected(initialStatus === 'projected');
        const fallbackAccount = db.settings.defaultAccountId ?? accounts[0]?.id ?? '';
        setAccountId(fallbackAccount);
        setToAccountId(accounts.find((a) => a.id !== fallbackAccount)?.id ?? '');
        setCategoryId('');
    }, [open, editing, initialType, initialStatus, initialDate, accounts, db.settings.defaultAccountId]);

    /* Keep the category valid when switching between income and expense. */
    useEffect(() => {
        if (type === 'transfer') return;
        if (categoryId && categories.some((c) => c.id === categoryId)) return;
        setCategoryId(categories[0]?.id ?? '');
    }, [type, categories, categoryId]);

    const submit = () => {
        setError(null);
        const value = parseAmountInput(amount);
        if (!Number.isFinite(value)) {
            setError('Enter an amount.');

            return;
        }

        const payload: NewTransaction = {
            date,
            description: description.trim(),
            type,
            status: projected ? 'projected' : 'actual',
            amount: value,
            accountId: accountId || null,
            toAccountId: type === 'transfer' ? toAccountId || null : null,
            categoryId: type === 'transfer' ? null : categoryId || null,
            notes: notes.trim(),
            recurringId: editing?.recurringId ?? null,
            occurrenceDate: editing?.occurrenceDate ?? null
        };

        const result = editing ? updateTransaction(editing.id, payload) : addTransaction(payload);
        if (!result.ok) {
            setError(result.error ?? 'Could not save this transaction.');

            return;
        }
        onClose();
    };

    if (!accounts.length) {
        return (
            <Modal open={open} onClose={onClose} title='No accounts yet' size='sm'>
                <Banner tone='accent'>
                    You need at least one account before recording transactions. Create a bank account, savings account
                    or pocket first.
                </Banner>
            </Modal>
        );
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={editing ? 'Edit transaction' : 'Add transaction'}
            description={projected ? 'Scheduled — affects forecasts, not current balances.' : undefined}
            footer={
                <>
                    <Button variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant='primary' onClick={submit}>
                        {editing ? 'Save changes' : 'Add transaction'}
                    </Button>
                </>
            }>
            <div className='space-y-4'>
                {/* Type selector — drives which fields and categories apply. */}
                <div className='bg-surface-2 border-line grid grid-cols-3 gap-1 rounded-[12px] border p-1'>
                    {TYPE_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            type='button'
                            onClick={() => setType(tab.value)}
                            className={cn(
                                'flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-medium transition-all',
                                type === tab.value
                                    ? tab.value === 'income'
                                        ? 'bg-positive-soft text-positive'
                                        : tab.value === 'expense'
                                          ? 'bg-negative-soft text-negative'
                                          : 'bg-accent-soft text-accent'
                                    : 'text-text-muted hover:text-text'
                            )}>
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                <Field label='Amount' required>
                    <AmountInput
                        symbol={symbol}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder='0'
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submit();
                        }}
                    />
                </Field>

                {type === 'transfer' ? (
                    <div className='grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end'>
                        <Field label='From' required>
                            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <div className='text-text-faint hidden pb-2.5 sm:block'>
                            <ArrowRight className='size-4' />
                        </div>
                        <Field label='To' required>
                            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                                <option value=''>Select account…</option>
                                {accounts
                                    .filter((a) => a.id !== accountId)
                                    .map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}
                                        </option>
                                    ))}
                            </Select>
                        </Field>
                    </div>
                ) : (
                    <div className='grid gap-3 sm:grid-cols-2'>
                        <Field label='Category' required>
                            {categories.length ? (
                                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </Select>
                            ) : (
                                <Banner tone='warning'>
                                    No {type} categories yet. Add one in Settings → Categories.
                                </Banner>
                            )}
                        </Field>
                        <Field label='Account' required>
                            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                )}

                <div className='grid gap-3 sm:grid-cols-2'>
                    <Field label='Description'>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={type === 'transfer' ? 'Move to savings' : 'Lunch, rent, salary…'}
                        />
                    </Field>
                    <Field label='Date' required>
                        <Input type='date' value={date} onChange={(e) => setDate(e.target.value)} />
                    </Field>
                </div>

                <Field label='Notes'>
                    <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder='Optional details…'
                        rows={2}
                    />
                </Field>

                <div className='border-line bg-surface-2 flex items-center justify-between gap-4 rounded-[12px] border p-3'>
                    <div className='flex items-start gap-2.5'>
                        <CalendarClock className='text-text-muted mt-0.5 size-4 shrink-0' />
                        <div>
                            <p className='text-text text-[13px] font-medium'>Scheduled / future</p>
                            <p className='text-text-muted mt-0.5 text-[11.5px] leading-relaxed'>
                                Counts toward projections only. Your current balance stays unchanged until you mark it
                                as done.
                            </p>
                        </div>
                    </div>
                    <Toggle checked={projected} onChange={setProjected} label='Scheduled transaction' />
                </div>

                {error ? <Banner tone='negative'>{error}</Banner> : null}
            </div>
        </Modal>
    );
}

/* ── Account form ───────────────────────────────────────────────────────── */

const ACCOUNT_TYPES: { value: AccountType; label: string; blurb: string }[] = [
    { value: 'bank', label: 'Bank', blurb: 'Everyday spending account' },
    { value: 'savings', label: 'Savings', blurb: 'Money set aside to grow' },
    { value: 'pocket', label: 'Pocket', blurb: 'Money reserved for a purpose' }
];

export function AccountForm({
    open,
    onClose,
    editing,
    initialType = 'bank'
}: {
    open: boolean;
    onClose: () => void;
    editing?: Account | null;
    initialType?: AccountType;
}) {
    const { addAccount, updateAccount } = useFinance();
    const { symbol } = useMoneyFormat();

    const [name, setName] = useState('');
    const [type, setType] = useState<AccountType>(initialType);
    const [startingBalance, setStartingBalance] = useState('');
    const [icon, setIcon] = useState('Landmark');
    const [description, setDescription] = useState('');
    const [target, setTarget] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        if (editing) {
            setName(editing.name);
            setType(editing.type);
            setStartingBalance(String(editing.startingBalance));
            setIcon(editing.icon);
            setDescription(editing.description);
            setTarget(editing.targetAmount !== null ? String(editing.targetAmount) : '');

            return;
        }
        setName('');
        setType(initialType);
        setStartingBalance('');
        setIcon(initialType === 'pocket' ? 'Wallet' : initialType === 'savings' ? 'PiggyBank' : 'Landmark');
        setDescription('');
        setTarget('');
    }, [open, editing, initialType]);

    const submit = () => {
        setError(null);
        const starting = startingBalance.trim() === '' ? 0 : parseAmountInput(startingBalance);
        if (!Number.isFinite(starting)) {
            setError('Starting balance must be a number.');

            return;
        }
        const targetValue = target.trim() === '' ? null : parseAmountInput(target);
        if (target.trim() !== '' && !Number.isFinite(targetValue as number)) {
            setError('Target amount must be a number.');

            return;
        }

        const payload = {
            name,
            type,
            startingBalance: starting,
            icon,
            description: description.trim(),
            targetAmount: type === 'pocket' ? targetValue : null,
            archived: editing?.archived ?? false
        };

        const result = editing ? updateAccount(editing.id, payload) : addAccount(payload);
        if (!result.ok) {
            setError(result.error ?? 'Could not save this account.');

            return;
        }
        onClose();
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={editing ? 'Edit account' : 'Add account'}
            description={editing ? undefined : 'Balances are calculated from your transactions automatically.'}
            footer={
                <>
                    <Button variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant='primary' onClick={submit}>
                        {editing ? 'Save changes' : 'Create account'}
                    </Button>
                </>
            }>
            <div className='space-y-4'>
                <div className='grid grid-cols-3 gap-2'>
                    {ACCOUNT_TYPES.map((t) => (
                        <button
                            key={t.value}
                            type='button'
                            onClick={() => setType(t.value)}
                            className={cn(
                                'cursor-pointer rounded-[12px] border p-3 text-left transition-all',
                                type === t.value
                                    ? 'border-accent bg-accent-soft'
                                    : 'border-line bg-surface-2 hover:border-line-strong'
                            )}>
                            <span
                                className={cn(
                                    'block text-[13px] font-semibold',
                                    type === t.value ? 'text-accent' : 'text-text'
                                )}>
                                {t.label}
                            </span>
                            <span className='text-text-muted mt-0.5 block text-[11px] leading-tight'>{t.blurb}</span>
                        </button>
                    ))}
                </div>

                <Field label='Name' required>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={type === 'pocket' ? 'Emergency Fund' : 'Main Bank'}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submit();
                        }}
                    />
                </Field>

                <div className='grid gap-3 sm:grid-cols-2'>
                    <Field
                        label='Starting balance'
                        hint={editing ? 'Adjusting this shifts every derived balance.' : 'Balance before tracking began.'}>
                        <AmountInput
                            symbol={symbol}
                            value={startingBalance}
                            onChange={(e) => setStartingBalance(e.target.value)}
                            placeholder='0'
                        />
                    </Field>
                    {type === 'pocket' ? (
                        <Field label='Target amount' hint='Optional. Progress only — never affects net worth.'>
                            <AmountInput
                                symbol={symbol}
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                placeholder='0'
                            />
                        </Field>
                    ) : null}
                </div>

                <Field label='Description'>
                    <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder='Optional note about this account'
                    />
                </Field>

                <Field label='Icon'>
                    <IconPicker value={icon} onChange={setIcon} choices={ACCOUNT_ICON_CHOICES} />
                </Field>

                {error ? <Banner tone='negative'>{error}</Banner> : null}
            </div>
        </Modal>
    );
}

/* ── Category form ──────────────────────────────────────────────────────── */

export function CategoryForm({
    open,
    onClose,
    editing,
    initialKind = 'expense'
}: {
    open: boolean;
    onClose: () => void;
    editing?: Category | null;
    initialKind?: 'income' | 'expense';
}) {
    const { addCategory, updateCategory, db } = useFinance();

    const [name, setName] = useState('');
    const [kind, setKind] = useState<'income' | 'expense'>(initialKind);
    const [icon, setIcon] = useState('Shapes');
    const [error, setError] = useState<string | null>(null);

    const lockedKind = useMemo(
        () => Boolean(editing && db.transactions.some((t) => t.categoryId === editing.id)),
        [editing, db.transactions]
    );

    useEffect(() => {
        if (!open) return;
        setError(null);
        if (editing) {
            setName(editing.name);
            setKind(editing.kind);
            setIcon(editing.icon);

            return;
        }
        setName('');
        setKind(initialKind);
        setIcon('Shapes');
    }, [open, editing, initialKind]);

    const submit = () => {
        setError(null);
        const payload = { name, kind, icon, archived: editing?.archived ?? false };
        const result = editing ? updateCategory(editing.id, payload) : addCategory(payload);
        if (!result.ok) {
            setError(result.error ?? 'Could not save this category.');

            return;
        }
        onClose();
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={editing ? 'Edit category' : 'New category'}
            size='sm'
            footer={
                <>
                    <Button variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant='primary' onClick={submit}>
                        {editing ? 'Save' : 'Create'}
                    </Button>
                </>
            }>
            <div className='space-y-4'>
                <div className='grid grid-cols-2 gap-2'>
                    {(['expense', 'income'] as const).map((k) => (
                        <button
                            key={k}
                            type='button'
                            disabled={lockedKind}
                            onClick={() => setKind(k)}
                            className={cn(
                                'cursor-pointer rounded-[11px] border p-2.5 text-[13px] font-medium capitalize transition-all disabled:cursor-not-allowed disabled:opacity-50',
                                kind === k
                                    ? k === 'income'
                                        ? 'border-positive/40 bg-positive-soft text-positive'
                                        : 'border-negative/40 bg-negative-soft text-negative'
                                    : 'border-line bg-surface-2 text-text-muted hover:text-text'
                            )}>
                            {k}
                        </button>
                    ))}
                </div>
                {lockedKind ? (
                    <p className='text-text-faint text-[11.5px]'>
                        Type is locked because transactions already use this category.
                    </p>
                ) : null}

                <Field label='Name' required>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder='Groceries'
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submit();
                        }}
                    />
                </Field>

                <Field label='Icon'>
                    <IconPicker value={icon} onChange={setIcon} choices={CATEGORY_ICON_CHOICES} />
                </Field>

                {error ? <Banner tone='negative'>{error}</Banner> : null}
            </div>
        </Modal>
    );
}

/* ── Recurring form ─────────────────────────────────────────────────────── */

const FREQUENCIES: { value: Frequency; label: string }[] = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'everyXMonths', label: 'Every X months' },
    { value: 'yearly', label: 'Yearly' }
];

export function RecurringForm({
    open,
    onClose,
    editing
}: {
    open: boolean;
    onClose: () => void;
    editing?: RecurringRule | null;
}) {
    const { db, addRecurring, updateRecurring } = useFinance();
    const { symbol } = useMoneyFormat();
    const accounts = useMemo(() => db.accounts.filter((a) => !a.archived), [db.accounts]);

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [type, setType] = useState<TransactionType>('expense');
    const [accountId, setAccountId] = useState('');
    const [toAccountId, setToAccountId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [frequency, setFrequency] = useState<Frequency>('monthly');
    const [interval, setIntervalValue] = useState('1');
    const [startDate, setStartDate] = useState(todayISO());
    const [endDate, setEndDate] = useState('');
    const [active, setActive] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const categories = useMemo(
        () => db.categories.filter((c) => !c.archived && c.kind === (type === 'income' ? 'income' : 'expense')),
        [db.categories, type]
    );

    useEffect(() => {
        if (!open) return;
        setError(null);
        if (editing) {
            setDescription(editing.description);
            setAmount(String(editing.amount));
            setType(editing.type);
            setAccountId(editing.accountId ?? '');
            setToAccountId(editing.toAccountId ?? '');
            setCategoryId(editing.categoryId ?? '');
            setFrequency(editing.frequency);
            setIntervalValue(String(editing.interval));
            setStartDate(editing.startDate);
            setEndDate(editing.endDate ?? '');
            setActive(editing.active);

            return;
        }
        setDescription('');
        setAmount('');
        setType('expense');
        const fallback = db.settings.defaultAccountId ?? accounts[0]?.id ?? '';
        setAccountId(fallback);
        setToAccountId(accounts.find((a) => a.id !== fallback)?.id ?? '');
        setCategoryId('');
        setFrequency('monthly');
        setIntervalValue('1');
        setStartDate(todayISO());
        setEndDate('');
        setActive(true);
    }, [open, editing, accounts, db.settings.defaultAccountId]);

    useEffect(() => {
        if (type === 'transfer') return;
        if (categoryId && categories.some((c) => c.id === categoryId)) return;
        setCategoryId(categories[0]?.id ?? '');
    }, [type, categories, categoryId]);

    const submit = () => {
        setError(null);
        const value = parseAmountInput(amount);
        if (!Number.isFinite(value)) {
            setError('Enter an amount.');

            return;
        }
        const payload: NewRecurring = {
            description,
            amount: value,
            type,
            accountId: accountId || null,
            toAccountId: type === 'transfer' ? toAccountId || null : null,
            categoryId: type === 'transfer' ? null : categoryId || null,
            frequency,
            interval: Math.max(1, Number.parseInt(interval, 10) || 1),
            startDate,
            endDate: endDate.trim() === '' ? null : endDate,
            active
        };

        const result = editing ? updateRecurring(editing.id, payload) : addRecurring(payload);
        if (!result.ok) {
            setError(result.error ?? 'Could not save this rule.');

            return;
        }
        onClose();
    };

    if (!accounts.length) {
        return (
            <Modal open={open} onClose={onClose} title='No accounts yet' size='sm'>
                <Banner tone='accent'>Create an account before scheduling recurring money.</Banner>
            </Modal>
        );
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={editing ? 'Edit recurring' : 'New recurring transaction'}
            description='Future occurrences are generated automatically for your projections.'
            footer={
                <>
                    <Button variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant='primary' onClick={submit}>
                        {editing ? 'Save changes' : 'Create rule'}
                    </Button>
                </>
            }>
            <div className='space-y-4'>
                <div className='bg-surface-2 border-line grid grid-cols-3 gap-1 rounded-[12px] border p-1'>
                    {TYPE_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            type='button'
                            onClick={() => setType(tab.value)}
                            className={cn(
                                'flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-medium transition-all',
                                type === tab.value
                                    ? tab.value === 'income'
                                        ? 'bg-positive-soft text-positive'
                                        : tab.value === 'expense'
                                          ? 'bg-negative-soft text-negative'
                                          : 'bg-accent-soft text-accent'
                                    : 'text-text-muted hover:text-text'
                            )}>
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className='grid gap-3 sm:grid-cols-2'>
                    <Field label='Description' required>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder='Salary, Rent, Internet…'
                            autoFocus
                        />
                    </Field>
                    <Field label='Amount' required>
                        <AmountInput
                            symbol={symbol}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder='0'
                        />
                    </Field>
                </div>

                {type === 'transfer' ? (
                    <div className='grid gap-3 sm:grid-cols-2'>
                        <Field label='From' required>
                            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label='To' required>
                            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                                <option value=''>Select account…</option>
                                {accounts
                                    .filter((a) => a.id !== accountId)
                                    .map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}
                                        </option>
                                    ))}
                            </Select>
                        </Field>
                    </div>
                ) : (
                    <div className='grid gap-3 sm:grid-cols-2'>
                        <Field label='Category' required>
                            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label='Account' required>
                            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                )}

                <div className='grid gap-3 sm:grid-cols-2'>
                    <Field label='Frequency' required>
                        <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                            {FREQUENCIES.map((f) => (
                                <option key={f.value} value={f.value}>
                                    {f.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    {frequency === 'everyXMonths' || frequency === 'weekly' ? (
                        <Field
                            label={frequency === 'weekly' ? 'Every N weeks' : 'Every N months'}
                            required>
                            <Input
                                type='number'
                                min={1}
                                max={60}
                                value={interval}
                                onChange={(e) => setIntervalValue(e.target.value)}
                            />
                        </Field>
                    ) : null}
                </div>

                <div className='grid gap-3 sm:grid-cols-2'>
                    <Field label='Start date' required hint='Sets the day the schedule anchors to.'>
                        <Input type='date' value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </Field>
                    <Field label='End date' hint='Optional — leave blank to run indefinitely.'>
                        <Input type='date' value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </Field>
                </div>

                <div className='border-line bg-surface-2 flex items-center justify-between gap-4 rounded-[12px] border p-3'>
                    <div>
                        <p className='text-text text-[13px] font-medium'>Active</p>
                        <p className='text-text-muted mt-0.5 text-[11.5px]'>
                            Paused rules are excluded from upcoming and projections.
                        </p>
                    </div>
                    <Toggle checked={active} onChange={setActive} label='Rule active' />
                </div>

                {error ? <Banner tone='negative'>{error}</Banner> : null}
            </div>
        </Modal>
    );
}

/* ── Budget editor ──────────────────────────────────────────────────────── */

export function BudgetForm({
    open,
    onClose,
    monthKey,
    editingCategoryId
}: {
    open: boolean;
    onClose: () => void;
    monthKey: string;
    editingCategoryId?: string | null;
}) {
    const { db, setBudget } = useFinance();
    const { symbol } = useMoneyFormat();

    const existing = db.budgets[monthKey] ?? {};
    const expenseCategories = useMemo(
        () => db.categories.filter((c) => c.kind === 'expense' && !c.archived),
        [db.categories]
    );
    const available = useMemo(
        () => (editingCategoryId ? expenseCategories : expenseCategories.filter((c) => existing[c.id] === undefined)),
        [expenseCategories, existing, editingCategoryId]
    );

    const [categoryId, setCategoryId] = useState('');
    const [limit, setLimit] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(null);
        if (editingCategoryId) {
            setCategoryId(editingCategoryId);
            setLimit(String(existing[editingCategoryId] ?? ''));

            return;
        }
        setCategoryId(available[0]?.id ?? '');
        setLimit('');
        // `existing` is derived from db and stable enough for this reset.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editingCategoryId]);

    const submit = () => {
        setError(null);
        const value = parseAmountInput(limit);
        if (!Number.isFinite(value)) {
            setError('Enter a budget amount.');

            return;
        }
        if (!categoryId) {
            setError('Choose a category.');

            return;
        }
        const result = setBudget(monthKey, categoryId, value);
        if (!result.ok) {
            setError(result.error ?? 'Could not save this budget.');

            return;
        }
        onClose();
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={editingCategoryId ? 'Edit budget' : 'Set category budget'}
            size='sm'
            footer={
                <>
                    <Button variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant='primary' onClick={submit} disabled={!available.length}>
                        Save budget
                    </Button>
                </>
            }>
            <div className='space-y-4'>
                {available.length ? (
                    <>
                        <Field label='Category' required>
                            <Select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                disabled={Boolean(editingCategoryId)}>
                                {available.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label='Monthly budget' required>
                            <AmountInput
                                symbol={symbol}
                                value={limit}
                                onChange={(e) => setLimit(e.target.value)}
                                placeholder='0'
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') submit();
                                }}
                            />
                        </Field>
                    </>
                ) : (
                    <Banner tone='accent'>
                        Every expense category already has a budget this month. Edit one from the list instead.
                    </Banner>
                )}
                {error ? <Banner tone='negative'>{error}</Banner> : null}
            </div>
        </Modal>
    );
}

/* ── Delete-category flow (replacement picker) ──────────────────────────── */

export function DeleteCategoryDialog({
    open,
    onClose,
    category
}: {
    open: boolean;
    onClose: () => void;
    category: Category | null;
}) {
    const { db, deleteCategory, setCategoryArchived } = useFinance();
    const [replacementId, setReplacementId] = useState('');
    const [error, setError] = useState<string | null>(null);

    const usageCount = useMemo(
        () =>
            category
                ? db.transactions.filter((t) => t.categoryId === category.id).length +
                  db.recurring.filter((r) => r.categoryId === category.id).length
                : 0,
        [category, db.transactions, db.recurring]
    );

    const alternatives = useMemo(
        () => db.categories.filter((c) => c.id !== category?.id && c.kind === category?.kind && !c.archived),
        [db.categories, category]
    );

    useEffect(() => {
        if (!open) return;
        setError(null);
        setReplacementId(alternatives[0]?.id ?? '');
    }, [open, alternatives]);

    if (!category) return null;

    const confirmDelete = () => {
        const result = deleteCategory(category.id, usageCount > 0 ? replacementId || null : null);
        if (!result.ok) {
            setError(result.error ?? 'Could not delete this category.');

            return;
        }
        onClose();
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Delete "${category.name}"`}
            size='sm'
            footer={
                <>
                    <Button variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                    {usageCount > 0 ? (
                        <Button
                            variant='secondary'
                            onClick={() => {
                                setCategoryArchived(category.id, true);
                                onClose();
                            }}>
                            Archive instead
                        </Button>
                    ) : null}
                    <Button variant='danger' onClick={confirmDelete} disabled={usageCount > 0 && !replacementId}>
                        Delete
                    </Button>
                </>
            }>
            <div className='space-y-4'>
                {usageCount > 0 ? (
                    <>
                        <Banner tone='warning'>
                            {usageCount} record{usageCount === 1 ? '' : 's'} still use this category. Pick a replacement
                            so your history stays intact, or archive it to hide it from new entries.
                        </Banner>
                        {alternatives.length ? (
                            <Field label='Move records to' required>
                                <Select value={replacementId} onChange={(e) => setReplacementId(e.target.value)}>
                                    {alternatives.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        ) : (
                            <Banner tone='negative'>
                                No other {category.kind} category exists to move these records to. Create one first, or
                                archive this category.
                            </Banner>
                        )}
                    </>
                ) : (
                    <p className='text-text-muted text-[13.5px]'>
                        Nothing uses this category, so it can be removed safely.
                    </p>
                )}
                {error ? <Banner tone='negative'>{error}</Banner> : null}
            </div>
        </Modal>
    );
}

export { IconPicker };
