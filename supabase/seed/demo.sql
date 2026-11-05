-- Demo seed — a fictional student so the dashboard has something to show.
-- Run after all migrations (node scripts/apply-migration.mjs supabase/seed/demo.sql).
-- Everything here is made up. user_id must match src/lib/userId.ts.

insert into profile (
  user_id, current_city, target_city, target_date, occupation, studies,
  languages, about, key_dates, facts
) values (
  'eduardo', 'Boulder, CO', 'Lisbon', '2027-09-01',
  'Student',
  'BA Economics (expected May 2027)',
  '["English","Spanish"]'::jsonb,
  'Demo profile. Economics student planning a master''s abroad.',
  '[{"label":"Graduation","date":"2027-05-15"},{"label":"Master''s intake","date":"2027-09-01"}]'::jsonb,
  '{}'::jsonb
)
on conflict (user_id) do nothing;

insert into resume (user_id, full_text) values (
  'eduardo',
  $resume$Demo Student
Education: BA Economics, expected May 2027.
Skills: Python, SQL, R, Excel.
Experience:
- Research assistant, campus lab.
- Data intern, university office.$resume$
)
on conflict (user_id) do nothing;

do $seed$
declare plan uuid;
begin
  if not exists (select 1 from paths where user_id = 'eduardo' and title = 'Master''s abroad') then
    insert into paths (user_id, title, description, milestones, progress, status, target_date, category)
    values (
      'eduardo', 'Master''s abroad', 'Apply to three programs for a Fall 2027 start.',
      '[{"label":"Shortlist programs","done":true},{"label":"Take the GRE","done":false,"date":"2026-12-12"},{"label":"Submit applications","done":false,"date":"2027-02-01"}]'::jsonb,
      33, 'active', '2027-09-01', 'academic'
    )
    returning id into plan;

    insert into paths (user_id, parent_id, title, milestones, progress, status, category) values
      ('eduardo', plan, 'Savings for the move',
       '[{"label":"Set a monthly savings target","done":true},{"label":"Open a travel account","done":false}]'::jsonb,
       50, 'active', 'finance');
  end if;
end
$seed$;

insert into applications
  (user_id, kind, org, title, field, location, language, status, deadline, fit_notes)
values
  ('eduardo', 'masters', 'Example University', 'MSc Data Science', 'Data Science', 'Lisbon', 'English', 'researching', '2027-01-31', 'Strong quant curriculum.'),
  ('eduardo', 'masters', 'Sample School of Economics', 'MSc Economics', 'Economics', 'Lisbon', 'English', 'applying', '2027-02-15', 'Good placement record.'),
  ('eduardo', 'job', 'Acme Analytics', 'Junior Data Analyst', 'Analytics', 'Remote', 'English', 'applied', null, 'Backup plan.')
on conflict (user_id, org, title) do nothing;

insert into tasks (user_id, title, urgency, domain, due_date) values
  ('eduardo', 'Finish problem set 6', 'today', 'school', current_date),
  ('eduardo', 'Draft statement of purpose', 'week', 'personal', current_date + 5),
  ('eduardo', 'Book GRE test date', 'inbox', 'personal', null),
  ('eduardo', 'Review monthly budget', 'week', 'finance', current_date + 3);

insert into journal_entries (user_id, entry_date, text, mood, source) values
  ('eduardo', current_date - 1, 'Good study session in the morning; gym after class.', 'good', 'web');
