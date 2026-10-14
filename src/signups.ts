// James's ask (2026-10-14): see new sign-ups directly in the app the moment he next logs in,
// rather than relying on the outbound Resend email (0008) -- which proved hard to confirm/debug
// -- or going to look in Supabase's own dashboard. Reads straight from public.profiles, the same
// table 0001's on_auth_user_created trigger already populates reliably on every sign-up (the
// email notification's own problem was never this data; it was getting a message to him about
// it). Supervisor-only — see supabase/0009_allow_supervisor_read_profiles.sql for the matching
// RLS policy that makes this table readable to his account at all.

import { supabase } from './supabaseClient';
import { saveExportFile } from './exportFolder';

export interface SignupRecord {
  id: string;
  email: string | null;
  fullName: string | null;
  companyName: string | null;
  mobileNumber: string | null;
  createdAt: string;
}

export async function listRecentSignups(limit = 50): Promise<SignupRecord[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, company_name, mobile_number, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string | null,
    fullName: row.full_name as string | null,
    companyName: row.company_name as string | null,
    mobileNumber: row.mobile_number as string | null,
    createdAt: row.created_at as string,
  }));
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** James's ask (2026-10-14): download the sign-ups list shown in NewSignupsBanner as a CSV, so
 * he can use it to send welcome emails -- same "Save As" download behaviour (remembered export
 * folder, etc.) as every other CSV/XLSX export in the app, via the same shared saveExportFile. */
export async function exportSignupsToCsv(signups: SignupRecord[]): Promise<void> {
  const header = ['Name', 'Email', 'Company', 'Mobile', 'Signed up at'];
  const rows = signups.map((s) => [
    s.fullName ?? '',
    s.email ?? '',
    s.companyName ?? '',
    s.mobileNumber ?? '',
    new Date(s.createdAt).toLocaleString(),
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => csvEscape(v)).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  await saveExportFile(blob, `taxonomy-builder-new-signups-${new Date().toISOString().slice(0, 10)}.csv`);
}
