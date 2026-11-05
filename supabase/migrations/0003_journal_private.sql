-- 0003: journal_entries.private flag. Private (but still public-feed) entries are
-- hidden from the Home Reflect preview while remaining on the Reflect tab.
alter table journal_entries add column if not exists private boolean not null default false;
