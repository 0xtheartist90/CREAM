'use client';

import {
    createContext,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
    type ButtonHTMLAttributes,
    type InputHTMLAttributes,
    type ReactNode,
    type SelectHTMLAttributes,
    type TextareaHTMLAttributes
} from 'react';

import { AlertTriangle, Check, ChevronDown, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ── Card ───────────────────────────────────────────────────────────────── */

export function Card({
    children,
    className,
    padded = true,
    ...rest
}: { children: ReactNode; className?: string; padded?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'bg-surface border-line rounded-[16px] border',
                padded && 'p-4 sm:p-5',
                className
            )}
            {...rest}>
            {children}
        </div>
    );
}

export function SectionHeader({
    title,
    action,
    subtitle,
    className
}: {
    title: string;
    subtitle?: string;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
            <div className='min-w-0'>
                <h2 className='text-text truncate text-[15px] font-semibold tracking-tight'>{title}</h2>
                {subtitle ? <p className='text-text-muted mt-0.5 truncate text-[12px]'>{subtitle}</p> : null}
            </div>
            {action ? <div className='shrink-0'>{action}</div> : null}
        </div>
    );
}

/* ── Button ─────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:scale-[0.985]',
    secondary: 'bg-surface-2 text-text hover:bg-surface-3 border border-line',
    outline: 'bg-transparent text-text border border-line-strong hover:bg-surface-2',
    ghost: 'bg-transparent text-text-muted hover:bg-surface-2 hover:text-text',
    danger: 'bg-negative-soft text-negative hover:bg-negative hover:text-white border border-transparent'
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-[12.5px] gap-1.5 rounded-[9px]',
    md: 'h-10 px-4 text-[13.5px] gap-2 rounded-[11px]',
    lg: 'h-11 px-5 text-[14px] gap-2 rounded-[12px]',
    icon: 'h-9 w-9 rounded-[10px] justify-center'
};

export function Button({
    children,
    variant = 'secondary',
    size = 'md',
    className,
    loading,
    ...rest
}: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            className={cn(
                'inline-flex cursor-pointer items-center justify-center font-medium whitespace-nowrap transition-all duration-150',
                'focus-visible:ring-accent/60 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none',
                'disabled:pointer-events-none disabled:opacity-45',
                BUTTON_VARIANTS[variant],
                BUTTON_SIZES[size],
                className
            )}
            disabled={loading || rest.disabled}
            {...rest}>
            {loading ? <Loader2 className='size-4 animate-spin' /> : children}
        </button>
    );
}

/* ── Pills & badges ─────────────────────────────────────────────────────── */

export type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
    neutral: 'bg-surface-3 text-text-muted',
    positive: 'bg-positive-soft text-positive',
    negative: 'bg-negative-soft text-negative',
    warning: 'bg-warning-soft text-warning',
    accent: 'bg-accent-soft text-accent'
};

export function Pill({
    children,
    tone = 'neutral',
    className,
    icon
}: {
    children: ReactNode;
    tone?: Tone;
    className?: string;
    icon?: ReactNode;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-medium whitespace-nowrap',
                TONE_CLASSES[tone],
                className
            )}>
            {icon}
            {children}
        </span>
    );
}

/* ── Progress ───────────────────────────────────────────────────────────── */

export function ProgressBar({
    value,
    tone = 'accent',
    className,
    trackClassName
}: {
    /** 0–100+; values above 100 render a full bar. */
    value: number;
    tone?: Tone;
    className?: string;
    trackClassName?: string;
}) {
    const width = Math.max(0, Math.min(100, value));
    const fill: Record<Tone, string> = {
        neutral: 'bg-text-faint',
        positive: 'bg-positive',
        negative: 'bg-negative',
        warning: 'bg-warning',
        accent: 'bg-accent'
    };

    return (
        <div className={cn('bg-surface-3 h-1.5 w-full overflow-hidden rounded-full', trackClassName)}>
            <div
                className={cn('h-full rounded-full transition-[width] duration-500 ease-out', fill[tone], className)}
                style={{ width: `${width}%` }}
            />
        </div>
    );
}

/* ── Form fields ────────────────────────────────────────────────────────── */

export function Field({
    label,
    children,
    hint,
    error,
    required,
    className
}: {
    label: string;
    children: ReactNode;
    hint?: string;
    error?: string;
    required?: boolean;
    className?: string;
}) {
    return (
        <label className={cn('block', className)}>
            <span className='text-text-muted mb-1.5 flex items-center gap-1 text-[12px] font-medium'>
                {label}
                {required ? <span className='text-accent'>*</span> : null}
            </span>
            {children}
            {error ? (
                <span className='text-negative mt-1 flex items-center gap-1 text-[11.5px]'>
                    <AlertTriangle className='size-3 shrink-0' />
                    {error}
                </span>
            ) : hint ? (
                <span className='text-text-faint mt-1 block text-[11.5px]'>{hint}</span>
            ) : null}
        </label>
    );
}

const INPUT_BASE =
    'w-full bg-surface-2 border border-line rounded-[11px] px-3 h-10 text-[13.5px] text-text placeholder:text-text-faint ' +
    'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={cn(INPUT_BASE, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={cn(INPUT_BASE, 'h-auto min-h-[72px] resize-y py-2.5', className)} {...rest} />;
}

export function Select({
    className,
    children,
    ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
    return (
        <div className='relative'>
            <select className={cn(INPUT_BASE, 'cursor-pointer appearance-none pr-9', className)} {...rest}>
                {children}
            </select>
            <ChevronDown className='text-text-faint pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2' />
        </div>
    );
}

/** Amount input with the currency symbol inlined, matching the ledger style. */
export function AmountInput({
    symbol,
    className,
    ...rest
}: { symbol: string } & InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className='relative'>
            <span className='text-text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] font-medium'>
                {symbol}
            </span>
            <input
                className={cn(INPUT_BASE, 'tnum h-12 pl-8 text-[18px] font-semibold', className)}
                inputMode='decimal'
                {...rest}
            />
        </div>
    );
}

/* ── Segmented control ──────────────────────────────────────────────────── */

export function Segmented<T extends string>({
    options,
    value,
    onChange,
    className,
    size = 'md'
}: {
    options: { value: T; label: string; icon?: ReactNode }[];
    value: T;
    onChange: (v: T) => void;
    className?: string;
    size?: 'sm' | 'md';
}) {
    return (
        <div
            role='tablist'
            className={cn(
                'bg-surface-2 border-line inline-flex items-center gap-0.5 rounded-[11px] border p-0.5',
                className
            )}>
            {options.map((opt) => {
                const active = opt.value === value;

                return (
                    <button
                        key={opt.value}
                        role='tab'
                        aria-selected={active}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            'inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] font-medium transition-all duration-150',
                            size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]',
                            active
                                ? 'bg-surface text-text shadow-sm'
                                : 'text-text-muted hover:text-text'
                        )}>
                        {opt.icon}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

/* ── Modal ──────────────────────────────────────────────────────────────── */

const ModalCtx = createContext<{ close: () => void } | null>(null);

export function Modal({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md'
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'sm' | 'md' | 'lg';
}) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // Focus the first control so keyboard users land inside the dialog.
        const t = window.setTimeout(() => {
            const target = panelRef.current?.querySelector<HTMLElement>(
                'input:not([type=hidden]), select, textarea, button'
            );
            target?.focus();
        }, 40);

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            window.clearTimeout(t);
        };
    }, [open, onClose]);

    if (!open) return null;

    const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl';

    return (
        <ModalCtx.Provider value={{ close: onClose }}>
            <div className='fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4'>
                <div
                    className='animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-[2px]'
                    onClick={onClose}
                    aria-hidden
                />
                <div
                    ref={panelRef}
                    role='dialog'
                    aria-modal='true'
                    aria-labelledby={titleId}
                    className={cn(
                        'bg-surface border-line relative flex max-h-[92vh] w-full flex-col border shadow-2xl',
                        'animate-slide-up rounded-t-[22px] sm:animate-pop-in sm:rounded-[18px]',
                        width
                    )}>
                    <div className='border-line flex items-start justify-between gap-4 border-b px-5 py-4'>
                        <div className='min-w-0'>
                            <h2 id={titleId} className='text-text text-[15.5px] font-semibold tracking-tight'>
                                {title}
                            </h2>
                            {description ? (
                                <p className='text-text-muted mt-0.5 text-[12.5px]'>{description}</p>
                            ) : null}
                        </div>
                        <button
                            onClick={onClose}
                            aria-label='Close'
                            className='text-text-muted hover:bg-surface-2 hover:text-text -mr-1 -mt-1 cursor-pointer rounded-lg p-1.5 transition-colors'>
                            <X className='size-4' />
                        </button>
                    </div>

                    <div className='hide-scrollbar flex-1 overflow-y-auto px-5 py-4'>{children}</div>

                    {footer ? (
                        <div className='border-line safe-bottom flex items-center justify-end gap-2 border-t px-5 py-3.5'>
                            {footer}
                        </div>
                    ) : null}
                </div>
            </div>
        </ModalCtx.Provider>
    );
}

export function useModal() {
    return useContext(ModalCtx);
}

/* ── Confirm dialog ─────────────────────────────────────────────────────── */

export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    tone = 'danger',
    /** Require typing an exact phrase — used for irreversible resets. */
    requirePhrase
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    tone?: 'danger' | 'primary';
    requirePhrase?: string;
}) {
    const [typed, setTyped] = useState('');

    useEffect(() => {
        if (open) setTyped('');
    }, [open]);

    const blocked = Boolean(requirePhrase) && typed.trim() !== requirePhrase;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            size='sm'
            footer={
                <>
                    <Button variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant={tone === 'danger' ? 'danger' : 'primary'}
                        disabled={blocked}
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}>
                        {confirmLabel}
                    </Button>
                </>
            }>
            <div className='text-text-muted space-y-3 text-[13.5px] leading-relaxed'>
                <div>{message}</div>
                {requirePhrase ? (
                    <Field label={`Type "${requirePhrase}" to confirm`}>
                        <Input
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder={requirePhrase}
                            autoComplete='off'
                        />
                    </Field>
                ) : null}
            </div>
        </Modal>
    );
}

/* ── Empty state ────────────────────────────────────────────────────────── */

export function EmptyState({
    icon,
    title,
    message,
    action,
    className,
    compact
}: {
    icon?: ReactNode;
    title: string;
    message?: string;
    action?: ReactNode;
    className?: string;
    compact?: boolean;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center text-center',
                compact ? 'px-4 py-8' : 'px-6 py-14',
                className
            )}>
            {icon ? (
                <div className='bg-surface-2 text-text-faint mb-3 flex size-11 items-center justify-center rounded-[13px]'>
                    {icon}
                </div>
            ) : null}
            <p className='text-text text-[14px] font-medium'>{title}</p>
            {message ? <p className='text-text-muted mt-1 max-w-sm text-[12.5px] leading-relaxed'>{message}</p> : null}
            {action ? <div className='mt-4'>{action}</div> : null}
        </div>
    );
}

/* ── Inline banner ──────────────────────────────────────────────────────── */

export function Banner({
    tone = 'warning',
    children,
    icon,
    className
}: {
    tone?: Tone;
    children: ReactNode;
    icon?: ReactNode;
    className?: string;
}) {
    const border: Record<Tone, string> = {
        neutral: 'border-line',
        positive: 'border-positive/30',
        negative: 'border-negative/30',
        warning: 'border-warning/30',
        accent: 'border-accent/30'
    };

    return (
        <div
            className={cn(
                'flex items-start gap-2.5 rounded-[12px] border px-3.5 py-2.5 text-[12.5px] leading-relaxed',
                TONE_CLASSES[tone],
                border[tone],
                className
            )}>
            {icon ? <span className='mt-[1px] shrink-0'>{icon}</span> : null}
            <div className='min-w-0'>{children}</div>
        </div>
    );
}

/* ── Toggle ─────────────────────────────────────────────────────────────── */

export function Toggle({
    checked,
    onChange,
    label,
    id
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label?: string;
    id?: string;
}) {
    const autoId = useId();
    const inputId = id ?? autoId;

    return (
        <button
            id={inputId}
            role='switch'
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200',
                checked ? 'bg-accent' : 'bg-surface-3'
            )}>
            <span
                className={cn(
                    'inline-block size-4.5 rounded-full bg-white shadow transition-transform duration-200',
                    checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
                )}
            />
        </button>
    );
}

/* ── Checkbox row ───────────────────────────────────────────────────────── */

export function CheckRow({
    checked,
    onChange,
    children
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    children: ReactNode;
}) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className='hover:bg-surface-2 flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors'>
            <span
                className={cn(
                    'flex size-4.5 shrink-0 items-center justify-center rounded-[6px] border transition-colors',
                    checked ? 'bg-accent border-accent text-white' : 'border-line-strong'
                )}>
                {checked ? <Check className='size-3' strokeWidth={3} /> : null}
            </span>
            <span className='text-text min-w-0 flex-1 text-[13px]'>{children}</span>
        </button>
    );
}
