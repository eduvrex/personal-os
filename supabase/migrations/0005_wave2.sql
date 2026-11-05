-- Wave 2: spending categorization overrides + Canvas (read-only) mirror.
--
-- Same posture as every other table: RLS enabled with NO policies (deny-all to
-- client roles); the server's service_role key bypasses. Idempotent.

-- W3 · Remembered re-categorizations. match_key is a normalized merchant/name
-- key so one override re-categorizes every past + future transaction from the
-- same merchant.
create table if not exists category_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  match_key text not null,
  category text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists category_overrides_user_key_uidx
  on category_overrides(user_id, match_key);

-- W4 · Canvas courses (read-only mirror; grades included).
create table if not exists canvas_courses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  canvas_id bigint not null,
  name text not null,
  course_code text,
  term text,
  current_score numeric,
  current_grade text,
  updated_at timestamptz not null default now()
);
create unique index if not exists canvas_courses_user_canvas_uidx
  on canvas_courses(user_id, canvas_id);

-- W4 · Canvas assignments (due dates, submission state, scores).
create table if not exists canvas_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  canvas_id bigint not null,
  course_canvas_id bigint not null,
  name text not null,
  due_at timestamptz,
  points_possible numeric,
  -- Detected flavor: assignment | quiz | exam | project (drives calendar category).
  kind text not null default 'assignment',
  submitted boolean not null default false,
  graded boolean not null default false,
  score numeric,
  html_url text,
  updated_at timestamptz not null default now()
);
create unique index if not exists canvas_assignments_user_canvas_uidx
  on canvas_assignments(user_id, canvas_id);
create index if not exists canvas_assignments_due_idx
  on canvas_assignments(user_id, due_at);

-- RLS: deny-all to client roles; service_role bypasses.
alter table category_overrides enable row level security;
alter table canvas_courses enable row level security;
alter table canvas_assignments enable row level security;
