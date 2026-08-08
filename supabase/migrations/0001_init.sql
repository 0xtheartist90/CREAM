-- ============================================================================
-- CREAM money — initial schema + Row Level Security
--
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.
--
-- Design notes
--   * Primary keys are TEXT, not UUID. The app generates ids like `acc_ltx9f2a1`
--     via makeId(), and existing JSON exports contain them. Keeping TEXT means
--     backups exported before this migration still import cleanly.
--   * Money is NUMERIC(18,2) — never float. Amounts are stored positive; the
--     direction lives in transactions.type, matching the app's model.
--   * Every table carries user_id and is protected by RLS so a user can only
--     ever read or write their own rows.
-- ============================================================================

-- ── accounts ────────────────────────────────────────────────────────────────
create table if not exists public.accounts (
    id               text primary key,
    user_id          uuid not null references auth.users (id) on delete cascade,
    name             text not null check (length(trim(name)) > 0),
    type             text not null check (type in ('bank', 'savings', 'pocket')),
    starting_balance numeric(18, 2) not null default 0,
    icon             text not null default 'Landmark',
    description      text not null default '',
    target_amount    numeric(18, 2),
    archived         boolean not null default false,
    created_at       timestamptz not null default now()
);

-- ── categories ──────────────────────────────────────────────────────────────
create table if not exists public.categories (
    id         text primary key,
    user_id    uuid not null references auth.users (id) on delete cascade,
    name       text not null check (length(trim(name)) > 0),
    kind       text not null check (kind in ('income', 'expense')),
    icon       text not null default 'Shapes',
    archived   boolean not null default false,
    created_at timestamptz not null default now()
);

-- ── transactions ────────────────────────────────────────────────────────────
create table if not exists public.transactions (
    id              text primary key,
    user_id         uuid not null references auth.users (id) on delete cascade,
    date            date not null,
    description     text not null default '',
    type            text not null check (type in ('income', 'expense', 'transfer')),
    status          text not null check (status in ('actual', 'projected')),
    amount          numeric(18, 2) not null check (amount > 0),
    account_id      text references public.accounts (id) on delete cascade,
    to_account_id   text references public.accounts (id) on delete cascade,
    category_id     text references public.categories (id) on delete set null,
    notes           text not null default '',
    recurring_id    text,
    occurrence_date date,
    created_at      timestamptz not null default now(),
    -- A transfer must have a destination that differs from its source; a
    -- non-transfer must not have one at all. Mirrors the app's validation.
    constraint transfer_shape check (
        (type = 'transfer' and to_account_id is not null and to_account_id <> account_id)
        or (type <> 'transfer' and to_account_id is null)
    )
);

-- ── recurring rules ─────────────────────────────────────────────────────────
create table if not exists public.recurring_rules (
    id            text primary key,
    user_id       uuid not null references auth.users (id) on delete cascade,
    description   text not null default '',
    amount        numeric(18, 2) not null check (amount > 0),
    type          text not null check (type in ('income', 'expense', 'transfer')),
    account_id    text references public.accounts (id) on delete cascade,
    to_account_id text references public.accounts (id) on delete cascade,
    category_id   text references public.categories (id) on delete set null,
    frequency     text not null check (frequency in ('weekly', 'monthly', 'everyXMonths', 'yearly')),
    interval      integer not null default 1 check (interval >= 1),
    start_date    date not null,
    end_date      date,
    active        boolean not null default true,
    -- Occurrence dates the user dismissed. Stored as an array of ISO strings
    -- so the generator can skip them without extra rows.
    skipped       text[] not null default '{}',
    created_at    timestamptz not null default now()
);

-- ── budgets ─────────────────────────────────────────────────────────────────
-- One row per (user, month, category). Keyed by category id so renaming a
-- category never orphans historical budgets.
create table if not exists public.budgets (
    user_id      uuid not null references auth.users (id) on delete cascade,
    month_key    text not null check (month_key ~ '^\d{4}-\d{2}$'),
    category_id  text not null references public.categories (id) on delete cascade,
    limit_amount numeric(18, 2) not null check (limit_amount >= 0),
    primary key (user_id, month_key, category_id)
);

-- ── settings ────────────────────────────────────────────────────────────────
-- Exactly one row per user. Its existence also marks the account as
-- initialised, so default categories are seeded only once.
create table if not exists public.settings (
    user_id               uuid primary key references auth.users (id) on delete cascade,
    currency              text not null default 'THB',
    currency_symbol       text not null default '฿',
    locale                text not null default 'en-US',
    decimals              smallint not null default 0 check (decimals in (0, 2)),
    compact_large_numbers boolean not null default false,
    theme                 text not null default 'dark' check (theme in ('dark', 'light')),
    default_account_id    text references public.accounts (id) on delete set null,
    start_day_of_week     smallint not null default 1 check (start_day_of_week in (0, 1)),
    updated_at            timestamptz not null default now()
);

-- ── indexes ─────────────────────────────────────────────────────────────────
-- Every query the app issues is scoped by user_id, so lead with it.
create index if not exists accounts_user_idx        on public.accounts (user_id);
create index if not exists categories_user_idx      on public.categories (user_id);
create index if not exists transactions_user_idx    on public.transactions (user_id);
create index if not exists transactions_user_date   on public.transactions (user_id, date desc);
create index if not exists transactions_recurring   on public.transactions (user_id, recurring_id, occurrence_date);
create index if not exists recurring_user_idx       on public.recurring_rules (user_id);
create index if not exists budgets_user_month_idx   on public.budgets (user_id, month_key);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.accounts        enable row level security;
alter table public.categories      enable row level security;
alter table public.transactions    enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.budgets         enable row level security;
alter table public.settings        enable row level security;

-- One policy per table covering all four commands. `using` guards which rows
-- are visible to select/update/delete; `with check` guards what may be written,
-- which is what stops a client from inserting rows owned by someone else.
do $$
declare
    t text;
begin
    foreach t in array array[
        'accounts', 'categories', 'transactions', 'recurring_rules', 'budgets', 'settings'
    ]
    loop
        execute format('drop policy if exists %I on public.%I', t || '_owner_policy', t);
        execute format(
            'create policy %I on public.%I
                 for all
                 to authenticated
                 using (auth.uid() = user_id)
                 with check (auth.uid() = user_id)',
            t || '_owner_policy', t
        );
    end loop;
end
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- RLS decides *which rows* a role may touch; table GRANTs decide whether the
-- role may touch the table at all. Both are required. Supabase usually grants
-- these implicitly via ALTER DEFAULT PRIVILEGES, but relying on that makes the
-- migration silently dependent on project defaults — so state it explicitly.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
    public.accounts, public.categories, public.transactions,
    public.recurring_rules, public.budgets, public.settings
    to authenticated;

-- Anonymous visitors get nothing. RLS already denies them (auth.uid() is null),
-- but revoking is explicit and survives future policy edits.
revoke all on public.accounts, public.categories, public.transactions,
              public.recurring_rules, public.budgets, public.settings
    from anon;
