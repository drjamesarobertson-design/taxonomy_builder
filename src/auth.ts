// Real authentication via Supabase (supabaseClient.ts) — replaces the previous fully-static,
// no-backend hardcoded login list (this file used to hold a manually-seeded salt+hash per
// person). Registration, login, password reset/set and session persistence are now all handled
// server-side by Supabase; this file stays as a thin wrapper so the rest of the app doesn't
// need to import '@supabase/supabase-js' directly, and so the login-related pieces (Login.tsx,
// App.tsx) have one stable place to call into.

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return { error: error?.message ?? null };
}

/** `needsEmailConfirmation` is true when the project requires clicking a confirmation link
 * before the new account can log in — a Supabase project setting, not something this app
 * controls — signalled by Supabase returning no session yet for a brand-new signup.
 * `emailRedirectTo` is explicit here for the same reason sendPasswordReset already sets its own
 * `redirectTo` below — without it, Supabase falls back to the project's own "Site URL" setting
 * (its own default is `http://localhost:3000`, unless someone's changed it), which is exactly
 * what sent James's first confirmation link to a dead localhost address instead of the actual
 * deployed site. Supabase will only actually honour this value if the exact URL is also listed
 * in the project's Authentication -> URL Configuration -> Redirect URLs allowlist; setting it
 * here alone isn't enough on its own. */
export async function signUp(email: string, password: string): Promise<{ error: string | null; needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) return { error: error.message, needsEmailConfirmation: false };
  return { error: null, needsEmailConfirmation: data.session === null };
}

/** Sends the "click here to reset your password" email. `redirectTo` points back at this same
 * app; Supabase appends its own recovery token to that URL, which App.tsx's onAuthStateChange
 * listener picks up as a PASSWORD_RECOVERY event. */
export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin + window.location.pathname,
  });
  return { error: error?.message ?? null };
}

/** Sets a new password for whoever the CURRENT session belongs to — used both for the
 * password-reset-email flow (a temporary recovery session) and for logging in this app's very
 * first users, who need to create their initial real password. */
export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function getSession(): Promise<Session | null> {
  return supabase.auth.getSession().then(({ data }) => data.session);
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}
