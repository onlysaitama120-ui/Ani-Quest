import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiVerify } from '../client';
import { useAuth } from '../context/AuthContext';

/**
 * Handles the verification link from the email:
 *   /#/verify?token=...
 * Confirms the account with the server; on success the server logs the user in.
 */
export default function Verify() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { refresh } = useAuth();
  const [state, setState] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    apiVerify(token)
      .then(async () => {
        await refresh(); // pick up the new session
        setState('success');
      })
      .catch((err) => {
        setMessage(err.message || 'Something went wrong.');
        setState('error');
      });
  }, [token, refresh]);

  return (
    <div className="auth-page fade-in">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">A</span>
          <span className="brand-name">Ani<span className="brand-accent">Quest</span></span>
        </div>

        {state === 'loading' && (
          <>
            <h1 className="auth-title">Verifying your email…</h1>
            <div className="spinner" style={{ margin: '24px auto' }} />
          </>
        )}

        {state === 'success' && (
          <>
            <h1 className="auth-title">Email confirmed 🎉</h1>
            <p className="muted auth-sub">Your account is verified and you're signed in.</p>
            <Link to="/" className="btn btn-primary auth-submit" style={{ marginTop: 24 }}>
              Start exploring
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="auth-title">Verification failed</h1>
            <p className="auth-error" role="alert" style={{ marginTop: 16 }}>{message}</p>
            <p className="muted auth-sub">
              The link may be expired or already used. You can try logging in, or go back
              to the signup page to resend a new link.
            </p>
            <Link to="/login" className="btn btn-primary auth-submit" style={{ marginTop: 24 }}>
              Go to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}