-- 0014: Wish list — things he wants to buy, gated by a monthly spending cap.
-- Items sit here ("wanting") until they fit under the month's cap; buying one
-- records what it actually cost and when, which is what the cap counts.
-- `choice_group` ties either/or options (AirPods vs Beats): buying one drops
-- the rest of its group.
create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  for_whom text,
  price numeric(10, 2),
  target_price numeric(10, 2),
  link text,
  notes text,
  choice_group text,
  priority integer not null default 2 check (priority between 1 and 3),
  status text not null default 'wanting' check (status in ('wanting', 'bought', 'dropped')),
  bought_price numeric(10, 2),
  bought_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wishlist_items_user_idx on wishlist_items(user_id, status, priority);

-- One row per user: the monthly cap for wish-list purchases.
create table if not exists wishlist_settings (
  user_id text primary key,
  monthly_cap numeric(10, 2) not null default 75,
  updated_at timestamptz not null default now()
);

alter table wishlist_items enable row level security;
alter table wishlist_settings enable row level security;
