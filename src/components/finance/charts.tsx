'use client';

import { useEffect, useMemo, useState } from 'react';

import {
    Area,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Line,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

import { monthLabel, monthLabelShort } from '@/lib/finance/dates';
import type { ProjectionMonth } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

import { useMoneyFormat } from './money';

/**
 * Recharts measures its container on mount; rendering during SSR yields a
 * width(-1) warning and an empty chart. Gate every chart behind a mount flag.
 */
function useMounted() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return mounted;
}

export function ChartFrame({ height, children }: { height: number; children: React.ReactElement }) {
    const mounted = useMounted();

    if (!mounted) return <div style={{ height }} className='bg-surface-2/40 animate-pulse rounded-[12px]' />;

    return (
        <div style={{ height }} className='w-full'>
            <ResponsiveContainer width='100%' height='100%'>
                {children}
            </ResponsiveContainer>
        </div>
    );
}

const AXIS = {
    stroke: 'var(--text-faint)',
    fontSize: 11,
    tickLine: false,
    axisLine: false
};

/**
 * Series longer than 12 months repeat short month names ("Mar" twice), and a
 * categorical axis collapses duplicate categories onto one slot — truncating
 * the line. Keying on the unique `monthKey` and formatting the tick keeps the
 * axis readable without losing points.
 */
const MONTH_AXIS = {
    ...AXIS,
    dataKey: 'monthKey',
    tickFormatter: (value: string) => monthLabelShort(value)
};

function TooltipShell({ children }: { children: React.ReactNode }) {
    return (
        <div className='bg-surface border-line min-w-[180px] rounded-[12px] border p-3 shadow-xl'>{children}</div>
    );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className='flex items-center justify-between gap-6 text-[11.5px]'>
            <span className='text-text-muted'>{label}</span>
            <span className={cn('tnum font-medium', tone ?? 'text-text')}>{value}</span>
        </div>
    );
}

/* ── Projection chart ───────────────────────────────────────────────────── */

export function ProjectionChart({
    data,
    height = 260,
    mode = 'networth'
}: {
    data: ProjectionMonth[];
    height?: number;
    mode?: 'networth' | 'cashflow';
}) {
    const { formatAxis, formatRaw } = useMoneyFormat();

    /**
     * Split the series into `actual` and `projected` keys. The seam month gets
     * both values so the two lines join without a visual gap.
     */
    const chartData = useMemo(() => {
        const lastHistoricalIdx = data.reduce((acc, d, i) => (d.isHistorical ? i : acc), -1);

        return data.map((d, i) => ({
            ...d,
            actual: d.isHistorical ? d.endingBalance : i === lastHistoricalIdx + 1 && lastHistoricalIdx >= 0 ? null : null,
            projected: !d.isHistorical ? d.endingBalance : i === lastHistoricalIdx ? d.endingBalance : null
        }));
    }, [data]);

    if (mode === 'cashflow') {
        return (
            <ChartFrame height={height}>
                <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='var(--line)' vertical={false} />
                    <XAxis {...MONTH_AXIS} dy={6} />
                    <YAxis {...AXIS} tickFormatter={formatAxis} width={58} />
                    <Tooltip
                        cursor={{ fill: 'var(--surface-2)', opacity: 0.5 }}
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as ProjectionMonth;

                            return (
                                <TooltipShell>
                                    <p className='text-text mb-2 text-[12px] font-semibold'>
                                        {monthLabel(d.monthKey)}
                                        {d.isHistorical ? '' : ' · projected'}
                                    </p>
                                    <div className='space-y-1'>
                                        <Row label='Income' value={formatRaw(d.income)} tone='text-positive' />
                                        <Row label='Expenses' value={formatRaw(d.expenses)} tone='text-negative' />
                                        <div className='border-line my-1.5 border-t' />
                                        <Row
                                            label='Net cash flow'
                                            value={formatRaw(d.netCashFlow, { signed: true })}
                                            tone={d.netCashFlow >= 0 ? 'text-positive' : 'text-negative'}
                                        />
                                    </div>
                                </TooltipShell>
                            );
                        }}
                    />
                    <Bar dataKey='income' radius={[4, 4, 0, 0]} maxBarSize={26}>
                        {data.map((d, i) => (
                            <Cell key={i} fill='var(--positive)' fillOpacity={d.isHistorical ? 1 : 0.45} />
                        ))}
                    </Bar>
                    <Bar dataKey='expenses' radius={[4, 4, 0, 0]} maxBarSize={26}>
                        {data.map((d, i) => (
                            <Cell key={i} fill='var(--negative)' fillOpacity={d.isHistorical ? 1 : 0.45} />
                        ))}
                    </Bar>
                    <Line
                        type='monotone'
                        dataKey='netCashFlow'
                        stroke='var(--accent)'
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: 'var(--accent)' }}
                    />
                </ComposedChart>
            </ChartFrame>
        );
    }

    return (
        <ChartFrame height={height}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <defs>
                    <linearGradient id='netWorthFill' x1='0' y1='0' x2='0' y2='1'>
                        <stop offset='0%' stopColor='var(--accent)' stopOpacity={0.35} />
                        <stop offset='100%' stopColor='var(--accent)' stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' stroke='var(--line)' vertical={false} />
                <XAxis {...MONTH_AXIS} dy={6} interval='preserveStartEnd' />
                <YAxis {...AXIS} tickFormatter={formatAxis} width={58} />
                <Tooltip
                    cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
                    content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as ProjectionMonth;

                        return (
                            <TooltipShell>
                                <p className='text-text mb-2 flex items-center gap-1.5 text-[12px] font-semibold'>
                                    {monthLabel(d.monthKey)}
                                    {!d.isHistorical ? (
                                        <span className='bg-accent-soft text-accent rounded-full px-1.5 py-px text-[9.5px] font-medium'>
                                            projected
                                        </span>
                                    ) : null}
                                </p>
                                <div className='space-y-1'>
                                    <Row label='Starting' value={formatRaw(d.startingBalance)} />
                                    <Row label='Income' value={formatRaw(d.income)} tone='text-positive' />
                                    <Row label='Expenses' value={formatRaw(d.expenses)} tone='text-negative' />
                                    <Row
                                        label='Net flow'
                                        value={formatRaw(d.netCashFlow, { signed: true })}
                                        tone={d.netCashFlow >= 0 ? 'text-positive' : 'text-negative'}
                                    />
                                    <div className='border-line my-1.5 border-t' />
                                    <Row label='Ending' value={formatRaw(d.endingBalance)} />
                                </div>
                            </TooltipShell>
                        );
                    }}
                />
                <Area
                    type='monotone'
                    dataKey='projected'
                    stroke='var(--accent)'
                    strokeWidth={2}
                    strokeDasharray='5 4'
                    fill='url(#netWorthFill)'
                    connectNulls
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                />
                <Area
                    type='monotone'
                    dataKey='actual'
                    stroke='var(--accent)'
                    strokeWidth={2.5}
                    fill='url(#netWorthFill)'
                    connectNulls
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                />
            </ComposedChart>
        </ChartFrame>
    );
}

/* ── Income vs expenses ─────────────────────────────────────────────────── */

export function IncomeExpenseChart({
    data,
    height = 230
}: {
    data: { label: string; income: number; expenses: number; monthKey: string }[];
    height?: number;
}) {
    const { formatAxis, formatRaw } = useMoneyFormat();

    return (
        <ChartFrame height={height}>
            <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='var(--line)' vertical={false} />
                <XAxis {...MONTH_AXIS} dy={6} />
                <YAxis {...AXIS} tickFormatter={formatAxis} width={58} />
                <Tooltip
                    cursor={{ fill: 'var(--surface-2)', opacity: 0.5 }}
                    content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as { monthKey: string; income: number; expenses: number };
                        const net = d.income - d.expenses;

                        return (
                            <TooltipShell>
                                <p className='text-text mb-2 text-[12px] font-semibold'>{monthLabel(d.monthKey)}</p>
                                <div className='space-y-1'>
                                    <Row label='Income' value={formatRaw(d.income)} tone='text-positive' />
                                    <Row label='Expenses' value={formatRaw(d.expenses)} tone='text-negative' />
                                    <div className='border-line my-1.5 border-t' />
                                    <Row
                                        label='Net'
                                        value={formatRaw(net, { signed: true })}
                                        tone={net >= 0 ? 'text-positive' : 'text-negative'}
                                    />
                                </div>
                            </TooltipShell>
                        );
                    }}
                />
                <Bar dataKey='income' fill='var(--positive)' radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey='expenses' fill='var(--negative)' radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
        </ChartFrame>
    );
}

/* ── Distribution donut ─────────────────────────────────────────────────── */

export const DONUT_COLORS = [
    'var(--accent)',
    '#fbbf24',
    '#38bdf8',
    '#a78bfa',
    '#34d399',
    '#f472b6',
    '#facc15',
    '#60a5fa'
];

export function DistributionDonut({
    data,
    height = 180,
    centerLabel,
    centerValue
}: {
    data: { name: string; value: number }[];
    height?: number;
    centerLabel?: string;
    centerValue?: string;
}) {
    const { formatRaw } = useMoneyFormat();
    const total = data.reduce((s, d) => s + d.value, 0);

    // Percentage radii resolve against an unexpectedly small base here and
    // collapse the ring, so derive explicit pixel radii from the frame height.
    const outerRadius = Math.max(24, height / 2 - 6);
    const innerRadius = outerRadius * 0.62;

    return (
        <div className='relative'>
            <ChartFrame height={height}>
                <PieChart>
                    <Pie
                        data={data}
                        dataKey='value'
                        nameKey='name'
                        innerRadius={innerRadius}
                        outerRadius={outerRadius}
                        paddingAngle={data.length > 1 ? 2 : 0}
                        strokeWidth={0}
                        isAnimationActive={false}>
                        {data.map((_, i) => (
                            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as { name: string; value: number };
                            const share = total > 0 ? (d.value / total) * 100 : 0;

                            return (
                                <TooltipShell>
                                    <p className='text-text mb-1 text-[12px] font-semibold'>{d.name}</p>
                                    <Row label='Amount' value={formatRaw(d.value)} />
                                    <Row label='Share' value={`${share.toFixed(1)}%`} />
                                </TooltipShell>
                            );
                        }}
                    />
                </PieChart>
            </ChartFrame>
            {centerValue ? (
                <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
                    {centerLabel ? (
                        <span className='text-text-muted text-[10.5px] font-medium'>{centerLabel}</span>
                    ) : null}
                    <span className='tnum text-text text-[15px] font-semibold'>{centerValue}</span>
                </div>
            ) : null}
        </div>
    );
}

/* ── Spending trend ─────────────────────────────────────────────────────── */

export function SpendingTrendChart({
    data,
    height = 200
}: {
    data: { label: string; monthKey: string; value: number }[];
    height?: number;
}) {
    const { formatAxis, formatRaw } = useMoneyFormat();

    return (
        <ChartFrame height={height}>
            <ComposedChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <defs>
                    <linearGradient id='trendFill' x1='0' y1='0' x2='0' y2='1'>
                        <stop offset='0%' stopColor='var(--accent)' stopOpacity={0.3} />
                        <stop offset='100%' stopColor='var(--accent)' stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' stroke='var(--line)' vertical={false} />
                <XAxis {...MONTH_AXIS} dy={6} />
                <YAxis {...AXIS} tickFormatter={formatAxis} width={58} />
                <Tooltip
                    cursor={{ stroke: 'var(--line-strong)' }}
                    content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as { monthKey: string; value: number };

                        return (
                            <TooltipShell>
                                <p className='text-text mb-1 text-[12px] font-semibold'>{monthLabel(d.monthKey)}</p>
                                <Row label='Spent' value={formatRaw(d.value)} />
                            </TooltipShell>
                        );
                    }}
                />
                <Area
                    type='monotone'
                    dataKey='value'
                    stroke='var(--accent)'
                    strokeWidth={2.5}
                    fill='url(#trendFill)'
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                />
            </ComposedChart>
        </ChartFrame>
    );
}

/* ── Horizontal category bars ───────────────────────────────────────────── */

export function CategoryBars({
    data,
    max
}: {
    data: { name: string; value: number; color?: string }[];
    max?: number;
}) {
    const { format } = useMoneyFormat();
    const peak = max ?? Math.max(...data.map((d) => d.value), 1);

    return (
        <div className='space-y-2.5'>
            {data.map((d, i) => (
                <div key={d.name} className='space-y-1.5'>
                    <div className='flex items-baseline justify-between gap-3'>
                        <span className='text-text truncate text-[12.5px]'>{d.name}</span>
                        <span className='tnum text-text-muted shrink-0 text-[12px]'>{format(d.value)}</span>
                    </div>
                    <div className='bg-surface-3 h-1.5 overflow-hidden rounded-full'>
                        <div
                            className='h-full rounded-full transition-[width] duration-500'
                            style={{
                                width: `${(d.value / peak) * 100}%`,
                                background: d.color ?? DONUT_COLORS[i % DONUT_COLORS.length]
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
