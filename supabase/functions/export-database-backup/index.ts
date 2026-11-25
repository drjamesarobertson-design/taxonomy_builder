// Supabase Edge Function: export-database-backup
//
// James's ask (2026-11-25, after reading an article on disaster recovery): the live database
// (this Supabase project, currently on the Free plan) has no automated backups -- that plan tier
// doesn't include them. Rather than upgrade the plan or build a scheduled job, he asked for a
// "periodic manual export" instead -- one click, whenever he thinks to do it, covering every
// table in one file, rather than clicking through each table individually in Supabase's own
// Table Editor (the previous way the "profiles" table alone got exported, per MASTER_BRIEFING.md
// Sec2). Downloaded to his own machine, which is then his own copy to keep wherever he chooses.
//
// Supervisor-only, enforced here on the server -- not just a hidden button -- the same principle
// already used throughout this project (e.g. supabase/0005_restrict_starter_sample_to_supervisor.
// sql): a client-side check alone is never real security.
//
// Runs as the service role specifically so it can read every row of every table regardless of
// existing RLS policies -- some tables (library_entries) have no supervisor-read-all policy at
// all today, deliberately, since nothing in the ordinary app needed one before this. A backup
// needs everything, so this bypasses RLS entirely for exactly this one purpose, rather than
// weakening any table's existing policies to make a supervisor-wide read path for everyday use.
//
// Needs no new secret -- SUPABASE_URL, SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) and
// SUPABASE_SERVICE_ROLE_KEY are all already available, the same as create-checkout-session.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPERVISOR_EMAIL = 'jamesar@jar-and-a.com';

// Every table that currently exists in this project (supabase/0001 through 0012). Add a new
// entry here whenever a future migration creates a new table meant to be covered by this backup.
const TABLES = ['profiles', 'library_entries', 'subscription_plans', 'subscription_settings', 'subscriptions'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Not signed in.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Not signed in.' }, 401);
    if (user.email !== SUPERVISOR_EMAIL) {
      return jsonResponse({ error: 'Only the supervisor account can export a full backup.' }, 403);
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const tables: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const { data, error } = await adminClient.from(table).select('*');
      if (error) return jsonResponse({ error: `Failed reading "${table}": ${error.message}` }, 500);
      tables[table] = data ?? [];
    }

    return jsonResponse({ exported_at: new Date().toISOString(), tables });
  } catch (err) {
    console.error('export-database-backup error:', err);
    return jsonResponse({ error: 'Something went wrong producing the backup. Please try again.' }, 500);
  }
});
