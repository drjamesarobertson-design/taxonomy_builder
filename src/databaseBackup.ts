// Calls the export-database-backup Edge Function (supervisor-only, enforced server-side) and
// saves the result as a single downloadable JSON file -- James's "periodic manual export" ask
// (2026-11-25), a disaster-recovery stopgap since the Supabase project's Free plan has no
// automated backups.
import { supabase } from './supabaseClient';
import { saveExportFile } from './exportFolder';

interface BackupResponse {
  exported_at?: string;
  tables?: Record<string, unknown[]>;
  error?: string;
}

export async function downloadDatabaseBackup(): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke<BackupResponse>('export-database-backup');
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  if (!data?.tables) return { error: 'No backup data was returned.' };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const dateStamp = (data.exported_at ?? new Date().toISOString()).slice(0, 10);
  await saveExportFile(blob, `taxonomy-builder-database-backup-${dateStamp}.json`);
  return { error: null };
}
