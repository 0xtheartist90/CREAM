'use client';

import {
    Banknote,
    Baby,
    Bike,
    Book,
    Briefcase,
    Building2,
    Bus,
    Car,
    Clapperboard,
    Coffee,
    CreditCard,
    Dog,
    Dumbbell,
    Fuel,
    Gamepad2,
    Gift,
    GraduationCap,
    HandCoins,
    Heart,
    Home,
    Landmark,
    Laptop,
    Leaf,
    LifeBuoy,
    Lightbulb,
    Luggage,
    Music,
    PiggyBank,
    Plane,
    Receipt,
    Repeat,
    Scissors,
    Shapes,
    ShieldCheck,
    ShoppingBag,
    ShoppingCart,
    Smartphone,
    Sparkles,
    Stethoscope,
    Ticket,
    TrendingUp,
    Train,
    Umbrella,
    UtensilsCrossed,
    Wallet,
    Wifi,
    Wrench,
    type LucideIcon
} from 'lucide-react';

/** Named icon registry — ids are persisted, so entries must not be renamed. */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
    Wallet,
    Landmark,
    PiggyBank,
    CreditCard,
    Banknote,
    HandCoins,
    Building2,
    Briefcase,
    TrendingUp,
    ShieldCheck,
    Sparkles,
    UtensilsCrossed,
    Coffee,
    ShoppingCart,
    ShoppingBag,
    Home,
    Car,
    Bus,
    Train,
    Bike,
    Fuel,
    Plane,
    Luggage,
    Clapperboard,
    Music,
    Gamepad2,
    Ticket,
    Heart,
    Stethoscope,
    Dumbbell,
    GraduationCap,
    Book,
    Laptop,
    Smartphone,
    Wifi,
    Lightbulb,
    Receipt,
    Gift,
    Dog,
    Baby,
    Leaf,
    Scissors,
    Umbrella,
    Wrench,
    LifeBuoy,
    Repeat,
    Shapes
};

export const ACCOUNT_ICON_CHOICES = [
    'Landmark',
    'Wallet',
    'PiggyBank',
    'CreditCard',
    'Banknote',
    'Building2',
    'Briefcase',
    'TrendingUp',
    'ShieldCheck',
    'Plane',
    'Home',
    'Sparkles',
    'Gift',
    'Umbrella',
    'LifeBuoy',
    'GraduationCap'
];

export const CATEGORY_ICON_CHOICES = Object.keys(ICON_REGISTRY);

export function Icon({
    name,
    className,
    fallback = 'Shapes'
}: {
    name: string | undefined | null;
    className?: string;
    fallback?: string;
}) {
    const Cmp = ICON_REGISTRY[name ?? ''] ?? ICON_REGISTRY[fallback] ?? Shapes;

    return <Cmp className={className} />;
}

/** Consistent icon tile used for accounts, categories and ledger rows. */
export function IconTile({
    name,
    tone = 'muted',
    size = 'md',
    className
}: {
    name: string | undefined | null;
    tone?: 'muted' | 'accent' | 'positive' | 'negative';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}) {
    const tones = {
        muted: 'bg-surface-3 text-text-muted',
        accent: 'bg-accent-soft text-accent',
        positive: 'bg-positive-soft text-positive',
        negative: 'bg-negative-soft text-negative'
    };
    const sizes = {
        sm: 'size-8 rounded-[9px] [&>svg]:size-3.5',
        md: 'size-9 rounded-[10px] [&>svg]:size-4',
        lg: 'size-11 rounded-[13px] [&>svg]:size-5'
    };

    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center ${tones[tone]} ${sizes[size]} ${className ?? ''}`}>
            <Icon name={name} />
        </span>
    );
}
