-- One-time cleanup: removes duplicate Library entries that already exist from before the seeding
-- race was fixed (see 0007_prevent_duplicate_starter_sample_copies.sql, and the matching code fix
-- in Login.tsx/library.ts). Confirmed affecting at least three accounts as of 2026-10-14.
--
-- Within each account, keeps the OLDEST row for any (category, title) combination that appears
-- more than once, and deletes the rest. Scoped per account (partitioned by user_id) so this can
-- never touch a different account's data, even though it runs across the whole table in one pass.
--
-- Run the SELECT first and review what it finds -- then run the DELETE below it. Safe to re-run
-- (a second run finds nothing left to delete).

-- Step 1: preview -- shows every row that would be deleted, across every account.
with ranked as (
  select
    le.id,
    u.email,
    le.category,
    le.project ->> 'title' as title,
    le.updated_at,
    row_number() over (
      partition by le.user_id, le.category, le.project ->> 'title'
      order by le.updated_at asc, le.id asc
    ) as rn
  from public.library_entries le
  join auth.users u on u.id = le.user_id
)
select email, category, title, updated_at
from ranked
where rn > 1
order by email, category, title;

-- Step 2: once the preview above looks right, run this to actually delete those rows.
-- with ranked as (
--   select
--     le.id,
--     row_number() over (
--       partition by le.user_id, le.category, le.project ->> 'title'
--       order by le.updated_at asc, le.id asc
--     ) as rn
--   from public.library_entries le
-- )
-- delete from public.library_entries
-- where id in (select id from ranked where rn > 1);
