-- Finance "money cockpit" schema.
--
-- RLS is ENABLED on every table with NO policies, which denies all access to the
-- anon/authenticated (client) roles. The server uses the service_role key, which
-- has BYPASSRLS, so server-side code reads/writes freely. Access tokens never
-- leave the server.

create extension if not exists pgcrypto;

create table if not exists plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  item_id text not null,
  access_token text not null,
  institution_name text,
  status text default 'active',
  created_at timestamptz not null default now()
);

create table if not exists finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  plaid_item_id uuid references plaid_items(id) on delete cascade,
  plaid_account_id text,
  name text not null,
  type text,
  subtype text,
  mask text,
  current_balance numeric,
  available_balance numeric,
  credit_limit numeric,
  source text not null default 'plaid' check (source in ('plaid','manual')),
  updated_at timestamptz not null default now()
);

create table if not exists credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id uuid references finance_accounts(id) on delete set null,
  name text not null,
  issuer text,
  balance numeric,
  minimum_payment numeric,
  due_day integer,
  next_due_date date,
  credit_limit numeric,
  apr numeric,
  source text not null default 'manual' check (source in ('plaid','manual')),
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  plaid_account_id text,
  plaid_transaction_id text unique,
  date date,
  name text,
  merchant_name text,
  amount numeric,
  category text,
  pending boolean default false,
  updated_at timestamptz not null default now()
);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  category text not null,
  monthly_limit numeric not null
);

-- Indexes (some unique, to support idempotent upserts in the sync job).
create index if not exists finance_accounts_user_idx on finance_accounts(user_id);
-- Plain unique indexes (not partial) so PostgREST upsert ON CONFLICT works.
-- NULLs are distinct, so manual rows (null plaid_account_id / account_id) can
-- coexist while Plaid rows (non-null) upsert cleanly. Drop-first makes this
-- self-healing on a DB that ran an older revision with partial indexes.
drop index if exists finance_accounts_plaid_acct_uidx;
create unique index if not exists finance_accounts_plaid_acct_uidx
  on finance_accounts(user_id, plaid_account_id);
create index if not exists credit_cards_user_idx on credit_cards(user_id);
drop index if exists credit_cards_account_uidx;
create unique index if not exists credit_cards_account_uidx
  on credit_cards(account_id);
create index if not exists transactions_user_date_idx on transactions(user_id, date desc);
create unique index if not exists budgets_user_category_uidx on budgets(user_id, category);

-- RLS: deny-all to client roles; service_role bypasses.
alter table plaid_items enable row level security;
alter table finance_accounts enable row level security;
alter table credit_cards enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
