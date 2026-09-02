import { useState } from 'react';
import type { FormEvent } from 'react';
import { verifyLogin, storeAuthEmail, PASSWORD_RESET_CONTACT } from './auth';
import Logo from './Logo';

interface LoginProps {
  onSuccess: (email: string) => void;
}

// The sign-on gate shown before anything else (App.tsx). See auth.ts for the important
// limitation this is built under: a speed bump against casual access, not real security,
// since this is a fully static app with no backend to actually guard anything server-side.
export default function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const ok = await verifyLogin(email, password);
    setChecking(false);
    if (!ok) {
      setError('Incorrect username or password.');
      return;
    }
    const normalized = email.trim();
    storeAuthEmail(normalized);
    onSuccess(normalized);
  }

  return (
    <div className="login-screen">
      <Logo className="login-logo" />
      <h1 className="login-heading">The ERP Doctor Taxonomy Builder</h1>
      <p className="login-tagline">
        Taxonomy Builder by the ERP Doctor
        <br />
        James A Robertson and Associates Limited
      </p>
      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          Email or Username
          <input
            className="login-email-input"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" disabled={checking}>
          {checking ? 'Checking…' : 'Log In'}
        </button>
        <p className="login-forgot">
          Forgot your password? Email <a href={`mailto:${PASSWORD_RESET_CONTACT}`}>{PASSWORD_RESET_CONTACT}</a> to
          have it reset.
        </p>
      </form>
    </div>
  );
}
