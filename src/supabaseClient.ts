// Supabase project connection — the real backend, replacing the previous static-site-only
// hardcoded login list (see auth.ts's history). Project: "the-erp-doctor" org, set up by James
// 2026-09.
//
// The values below are deliberately NOT secret. This is the "publishable" key (Supabase's
// current name for what used to be called the "anon" key) — it identifies which Supabase
// project to talk to, nothing more; every actual permission check happens server-side via
// Postgres Row Level Security policies, the same way this key is designed to be embedded
// directly in any client-side app's shipped JS bundle. The "secret" key (was "service_role")
// is the one that matters — it bypasses Row Level Security entirely and must NEVER appear here
// or anywhere else in this repository.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gkxphqpkywwsqnhwlntt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_OpbLTKYXWL8usiL3g-A2DQ_F_i1yvpo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
