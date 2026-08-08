# CREAM money

A personal finance app that runs entirely in your browser. No backend, no account, no API — every balance is derived from your transactions, and all data lives in `localStorage` on your device.

Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts and Lucide.

## What it answers

- How much money do I have right now, and where is it stored?
- How much have I earned and spent this month?
- Am I staying within my monthly budgets?
- What's coming out of my account soon?
- Where will my net worth be in 3, 6 and 12 months?

## Features

**Accounts** — Bank, Savings and unlimited Pockets (Emergency Fund, Travel, Tax…). Balances are always computed from `starting balance ± actual transactions ± transfers`; you never maintain a running total by hand. Pockets support an optional savings target.

**Transactions** — Income, expense and transfer, each either *actual* (moves real balances) or *scheduled* (forecast only). Filter by date range, account, category, type and status, with full-text search. Table on desktop, cards on mobile.

**Budgets** — Per-category monthly limits, stored per month so editing August never touches July. Spending counts only actual expenses. Progress states (`On track` / `Approaching` / `Near limit` / `Over budget`) are shown with labels and icons, not colour alone. One-click copy of the previous month's limits.

**Recurring** — Weekly, monthly, every-N-months or yearly rules. Occurrences are generated on demand rather than written to storage, so a long-running rule never bloats the database. "Mark as paid" converts an occurrence into a real transaction.

**Projection** — A 12-month forecast in three modes (net worth, cash flow, single account) driven by one shared engine. The chart distinguishes recorded history from projection, with a per-month breakdown of starting balance, income, expenses, net flow and ending balance.

**Reports** — Income vs expenses, expense and income breakdowns, spending trend, net worth over time, account distribution and budget-vs-actual. Derived from actual transactions only; forecasts are kept separate.

**Backup** — Export the full database as JSON, re-import it, or reset. Imports are validated before anything is replaced: a malformed file is rejected rather than merged, and dangling references are repaired.

## Financial rules

These are enforced throughout and covered by the verification suite:

| Rule | Behaviour |
| --- | --- |
| Current balance | `starting + actual income − actual expenses ± transfers` |
| Projected transactions | Never affect current balances; only forecasts |
| Transfers | Move money between accounts; never count as income, expense or budget spending, and never change total net worth |
| Monthly spending | Actual expenses in the selected month only |
| Budgets | Expense categories only, keyed by category id so renames don't orphan history |
| Archived accounts | Kept in history, excluded from net worth |

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The app starts empty — add your first account to begin.

```bash
npm run build       # production build
npm run type-check  # tsc --noEmit
```

## Architecture

```
src/lib/finance/         types, dates, format, storage, recurring, calc, store
src/components/finance/  shell, dashboard, views, forms, charts, primitives
```

`calc.ts` is the single calculation engine — every KPI, chart, budget row and report reads from it, so no total is ever maintained in two places. `storage.ts` owns persistence, schema versioning and import validation.

## Data & privacy

Everything is stored under the `cream-money.db` key in `localStorage`. Nothing is transmitted anywhere. Clearing site data or switching browsers means starting fresh, so export a backup from **Settings → Backup & restore** if the data matters.

## Credits

Bootstrapped from [nextjs-16-starter-shadcn](https://github.com/siddharthamaity/nextjs-16-starter-shadcn) (MIT).
