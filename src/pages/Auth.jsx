import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Auth({ mode }) {
  const isSignup = mode === 'signup';
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isSignup && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (isSignup) {
        await signup(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const other = isSignup ? 'login' : 'signup';

  return (
    <div className="auth-page fade-in">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">A</span>
          <span className="brand-name">Ani<span className="brand-accent">Quest</span></span>
        </div>
        <h1 className="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted auth-sub">
          {isSignup
            ? 'Sign up to sync your watchlist across every device.'
            : 'Sign in to sync your watchlist across every device.'}
        </p>

        <form onSubmit={onSubmit} className="auth-form">
          <label className="filter-field">
            <span className="filter-label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>

          <label className="filter-field">
            <span className="filter-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={8}
              maxLength={128}
              placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
            />
          </label>

          {isSignup && (
            <label className="filter-field">
              <span className="filter-label">Confirm password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                placeholder="Repeat your password"
              />
            </label>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
          </button>
        </form>

        <p className="muted auth-switch">
          {isSignup ? 'Already have an account?' : 'New to AniQuest?'}{' '}
          <Link to={`/${other}`}>{isSignup ? 'Log in' : 'Sign up'}</Link>
        </p>
      </div>
    </div>
  );
}