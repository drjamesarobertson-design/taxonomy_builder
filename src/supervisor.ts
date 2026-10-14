// James's ask: a small set of admin-only capabilities — starring Library entries as starter
// samples (currently any signed-in subscriber can do this to their own entries, which then get
// copied into every new subscriber's Library — not meant to be open to everyone), and editing
// Help content in-app — restricted to his own account specifically, not any signed-in
// subscriber. Hardcoded to his actual Taxonomy Builder login email (confirmed directly by him —
// distinct from the email tied to this project's GitHub/Claude access, which he does not use to
// sign into the app itself) rather than a role column in Supabase: there's exactly one
// supervisor account today, and a hardcoded check is the simplest thing that still genuinely
// enforces anything. A client-side check alone is only ever a UI convenience, never real
// security — the starter-sample case is also enforced at the database level, a trigger that
// rejects the change regardless of what the client sends (see
// supabase/0005_restrict_starter_sample_to_supervisor.sql).
export const SUPERVISOR_EMAIL = 'jamesar@jar-and-a.com';

export function isSupervisor(email: string | null | undefined): boolean {
  return email === SUPERVISOR_EMAIL;
}
