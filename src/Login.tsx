import { useState } from 'react';
import type { FormEvent } from 'react';
import { signIn, signUp, sendPasswordReset } from './auth';
import Logo from './Logo';

interface LoginProps {
  onSuccess: (email: string) => void;
}

type Mode = 'login' | 'register' | 'forgot';

// The sign-on gate shown before anything else (App.tsx). Backed by Supabase (auth.ts) — real
// accounts, real password hashing/reset, not the static hardcoded list this used to be.
export default function Login({ onSuccess }: LoginProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirmPassword('');
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const { error: err } = await signIn(email, password);
    setChecking(false);
    if (err) {
      setError(err);
      return;
    }
    onSuccess(email.trim());
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setChecking(true);
    setError(null);
    const { error: err, needsEmailConfirmation } = await signUp(email, password);
    setChecking(false);
    if (err) {
      setError(err);
      return;
    }
    if (needsEmailConfirmation) {
      setInfo('Account created — check your email for a confirmation link before logging in.');
      switchMode('login');
      return;
    }
    onSuccess(email.trim());
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const { error: err } = await sendPasswordReset(email);
    setChecking(false);
    if (err) {
      setError(err);
      return;
    }
    setInfo('Check your email for a link to set a new password.');
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

      {mode === 'login' && (
        <form className="login-form" onSubmit={handleLogin}>
          <label>
            Email
            <input
              className="login-email-input"
              type="email"
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
          {info && <p className="login-info">{info}</p>}
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={checking}>
            {checking ? 'Checking…' : 'Log In'}
          </button>
          <p className="login-switch-mode">
            <a href="#" onClick={(e) => { e.preventDefault(); switchMode('forgot'); }}>
              Forgot your password?
            </a>
          </p>
          <p className="login-switch-mode">
            New here?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); switchMode('register'); }}>
              Create an account
            </a>
          </p>
        </form>
      )}

      {mode === 'register' && (
        <form className="login-form" onSubmit={handleRegister}>
          <label>
            Email
            <input
              type="email"
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
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm Password
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
            {checking ? 'Creating…' : 'Create Account'}
          </button>
          <p className="login-switch-mode">
            Already have an account?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); switchMode('login'); }}>
              Log in
            </a>
          </p>
        </form>
      )}

      {mode === 'forgot' && (
        <form className="login-form" onSubmit={handleForgot}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
            />
          </label>
          {info && <p className="login-info">{info}</p>}
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={checking}>
            {checking ? 'Sending…' : 'Send Reset Link'}
          </button>
          <p className="login-switch-mode">
            <a href="#" onClick={(e) => { e.preventDefault(); switchMode('login'); }}>
              Back to log in
            </a>
          </p>
        </form>
      )}
    </div>
  );
}
