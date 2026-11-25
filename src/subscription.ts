// Stage D1: the signed-in user's current plan and the live numeric/feature limits that plan
// carries (supabase/0010_create_subscription_plans.sql + 0011_create_subscriptions.sql) --
// fetched once per sign-in by App.tsx, so every later piece of tier enforcement (caps, workflow-
// type gates, the expired-subscription block) can just read the result rather than each querying
// Supabase itself.
//
// A null limit means unlimited; 0 means not allowed at all -- see 0010's own header comment.
import { supabase } from './supabaseClient';
import { MAX_LEVELS } from './types';

export type PlanKey = 'free' | 'basic' | 'advanced' | 'enterprise' | 'beta';

export interface PlanLimits {
  planKey: PlanKey;
  displayName: string;
  status: string;
  currentPeriodEnd: string | null;
  maxCodeColumns: number | null;
  maxRows: number | null;
  maxLibraryEntries: number | null;
  maxLockedTaxonomies: number | null;
  auditAllowed: boolean;
  chartOfAccountsWizardAllowed: boolean;
  functionMasterAllowed: boolean;
  locationMasterAllowed: boolean;
  divisionMasterAllowed: boolean;
  foldersLocalDriveAllowed: boolean;
  foldersOutlookAllowed: boolean;
  glAnalyserImportAllowed: boolean;
  glBuilderExportAllowed: boolean;
}

interface SubscriptionRow {
  plan_key: PlanKey;
  status: string;
  current_period_end: string | null;
}

interface PlanRow {
  plan_key: PlanKey;
  display_name: string;
  max_code_columns: number | null;
  max_rows: number | null;
  max_library_entries: number | null;
  max_locked_taxonomies: number | null;
  audit_allowed: boolean;
  chart_of_accounts_wizard_allowed: boolean;
  function_master_allowed: boolean;
  location_master_allowed: boolean;
  division_master_allowed: boolean;
  folders_local_drive_allowed: boolean;
  folders_outlook_allowed: boolean;
  gl_analyser_import_allowed: boolean;
  gl_builder_export_allowed: boolean;
}

/** Returns null if signed out, or if either row can't be read (logged, not thrown -- a plan-
 * limits fetch failing should never itself block someone from using the app; callers treat a
 * null result the same as "no limits known yet", i.e. don't gate anything until this resolves). */
export async function fetchPlanLimits(): Promise<PlanLimits | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('plan_key, status, current_period_end')
    .eq('user_id', user.id)
    .single();
  if (subError || !subscription) {
    console.error('fetchPlanLimits: failed to read subscriptions row', subError);
    return null;
  }
  const sub = subscription as SubscriptionRow;

  const { data: plan, error: planError } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('plan_key', sub.plan_key)
    .single();
  if (planError || !plan) {
    console.error('fetchPlanLimits: failed to read subscription_plans row', planError);
    return null;
  }
  const row = plan as PlanRow;

  return {
    planKey: sub.plan_key,
    displayName: row.display_name,
    status: sub.status,
    currentPeriodEnd: sub.current_period_end,
    maxCodeColumns: row.max_code_columns,
    maxRows: row.max_rows,
    maxLibraryEntries: row.max_library_entries,
    maxLockedTaxonomies: row.max_locked_taxonomies,
    auditAllowed: row.audit_allowed,
    chartOfAccountsWizardAllowed: row.chart_of_accounts_wizard_allowed,
    functionMasterAllowed: row.function_master_allowed,
    locationMasterAllowed: row.location_master_allowed,
    divisionMasterAllowed: row.division_master_allowed,
    foldersLocalDriveAllowed: row.folders_local_drive_allowed,
    foldersOutlookAllowed: row.folders_outlook_allowed,
    glAnalyserImportAllowed: row.gl_analyser_import_allowed,
    glBuilderExportAllowed: row.gl_builder_export_allowed,
  };
}

/** A paid plan (status 'active') whose current_period_end has passed with no renewal recorded
 * yet -- James's "no grace-period access" rule (MASTER_BRIEFING.md §4): this is checked against
 * wall-clock time directly, independent of whatever Stripe's own retry/dunning process is doing,
 * so the block takes effect the moment the period ends rather than waiting on a webhook that may
 * lag by hours or days. Free/beta accounts have no current_period_end and can never be expired. */
export function isExpired(limits: PlanLimits | null): boolean {
  if (!limits || !limits.currentPeriodEnd) return false;
  if (limits.planKey === 'free' || limits.planKey === 'beta') return false;
  return new Date(limits.currentPeriodEnd).getTime() <= Date.now();
}

/** Stage D3: the real column/level ceiling for the signed-in user right now -- the smaller of
 * the app's own absolute MAX_LEVELS and their plan's max_code_columns (null/not-yet-loaded both
 * mean "no plan limit known," so this falls back to the app's own ceiling exactly as it worked
 * before Stage D existed, never a stricter default no one asked for). */
export function effectiveMaxLevels(limits: PlanLimits | null): number {
  if (!limits || limits.maxCodeColumns == null) return MAX_LEVELS;
  return Math.min(MAX_LEVELS, limits.maxCodeColumns);
}

/** Stage D3: the real row ceiling for the signed-in user right now, or null for unlimited (no
 * app-wide absolute row cap exists, unlike MAX_LEVELS, so a missing/unloaded plan limit means
 * genuinely no cap -- matching how this app behaved before Stage D existed). */
export function effectiveMaxRows(limits: PlanLimits | null): number | null {
  if (!limits) return null;
  return limits.maxRows;
}
