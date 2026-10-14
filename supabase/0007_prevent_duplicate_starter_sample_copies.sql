-- One-time setup: prevents an account from ever holding two copies of the same starter sample,
-- even if the seeding step that copies samples into a brand-new account's Library
-- (seedStarterSamplesForNewAccount, library.ts) is triggered more than once in quick succession
-- for one sign-in -- the confirmed cause of the duplicate Library entries James reported
-- (2026-10-14): the sign-in effect that kicks off seeding fired twice for one login (see the
-- matching fix in Login.tsx), each pass starting before the other's inserts had landed, so each
-- one's own "is my Library still empty?" check came back true.
--
-- A plain (non-partial) UNIQUE constraint on (user_id, source_sample_id) is exactly right here --
-- Postgres never treats two NULLs as equal, so ordinary entries (source_sample_id is always null
-- for anything that isn't a copy of a starter sample) are completely unaffected; only two rows
-- that are BOTH actual copies of the same sample for the same account collide, which is exactly
-- the case this is meant to prevent. library.ts's addLibraryEntry now upserts on this same
-- (user_id, source_sample_id) pair when copying a sample, rather than always inserting a fresh row.
--
-- IMPORTANT: run 0006_dedupe_existing_library_entries.sql FIRST -- this constraint will fail to
-- add itself if any duplicate (user_id, source_sample_id) pairs still exist in the table.
--
-- Run this once, in Supabase's SQL Editor. Safe to re-run.

alter table public.library_entries drop constraint if exists library_entries_user_source_sample_key;
alter table public.library_entries
  add constraint library_entries_user_source_sample_key unique (user_id, source_sample_id);
