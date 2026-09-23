import { useState } from 'react';
import type { FormEvent } from 'react';
import { updatePassword } from './auth';
import Logo from './Logo';

interface ResetPasswordProps {
  onDone: () => void;
}

// Shown instead of the ordinary Login screen when App.tsx's Supabase auth listener sees a
// PASSWORD_RECOVERY event — the user just clicked the "reset your password" link from their
// email, which leaves them in a real (if temporary) Supabase session scoped to exactly this one
// action. onDone hands back to App.tsx once a new password is set, landing on the ordinary
// signed-in app from there (the recovery session IS a real session).
export default function ResetPassword({ onDone }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setChecking(true);
    setError(null);
    const { error: err } = await updatePassword(password);
    setChecking(false);
    if (err) {
      setError(err);
      return;
    }
    onDone();
  }

  return (
    <div className="login-screen">
      <Logo className="login-logo" />
      <h1 className="login-heading">Set a New Password</h1>
      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          New Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm New Password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" disabled={checking}>
          {checking ? 'Saving…' : 'Set Password'}
        </button>
      </form>
    </div>
  );
}
