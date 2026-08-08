import { useState } from 'react';
import { useAuth } from '../context/auth';
import { useAlert } from '../context/AlertContext';

export default function Login() {
  // mode: 'login' | 'signup'
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedUsername = username.trim();

    if (!trimmedUsername && !password) {
      showAlert('Please enter both a username and password.', 'Credentials Required');
      return;
    }
    if (!trimmedUsername) {
      showAlert('Please enter your username.', 'Username Required');
      return;
    }
    if (!password) {
      showAlert('Please enter your password.', 'Password Required');
      return;
    }

    if (mode === 'signup') {
      if (trimmedUsername.length < 3) {
        showAlert('Username must be at least 3 characters long.', 'Registration Details Required');
        return;
      }
      if (/\s/.test(trimmedUsername)) {
        showAlert('Username cannot contain spaces.', 'Registration Details Required');
        return;
      }
      if (password.length < 4) {
        showAlert('Password must be at least 4 characters long.', 'Registration Details Required');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUsername,
          password,
          isSignUp: mode === 'signup'
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        const title = mode === 'signup' ? 'Registration Error' : 'Login Error';
        showAlert(
          `The server returned an invalid response (${res.status} ${res.statusText || ''}). Please try again later.`,
          title
        );
        return;
      }

      if (res.ok) {
        login(data);
      } else {
        const alertTitle = mode === 'signup' ? 'Registration Failed' : 'Login Failed';
        const problemMessage = data.message || data.error || (
          res.status === 409
            ? 'That username is already taken. Please choose a different username or log in.'
            : res.status === 404
            ? 'Account not found. Please verify your username or create a new account.'
            : res.status === 401
            ? 'Incorrect password. Please verify your password and try again.'
            : res.status === 400
            ? 'Invalid username or password format. Please check your input.'
            : `Request failed with status code ${res.status}.`
        );
        showAlert(problemMessage, alertTitle);
      }
    } catch (err) {
      console.error('Submit error:', err);
      const alertTitle = mode === 'signup' ? 'Registration Connection Error' : 'Login Connection Error';
      showAlert(
        `Unable to reach the server (${err.message || 'Network error'}). Please check your connection and try again.`,
        alertTitle
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        <div className="login-hero-side">
          <div className="login-hero-image-wrapper">
            <img 
              src="/login-hero-3d.png" 
              alt="Hush Encrypted Messaging Security" 
              className="login-hero-img" 
            />
          </div>
          <div className="login-hero-text">
            <div className="security-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>End-to-End Encrypted</span>
            </div>
            <h2>Zero Logs. Complete Privacy.</h2>
            <p>Your messages stay strictly between you and your recipient. Built with client-side encryption for total peace of mind.</p>
          </div>
        </div>

        {/* Right Side: Auth Card */}
        <div className="login-card">
          <div className="login-card-header">
            <div className="login-logo-wrapper">
              <img src="/logo.svg" alt="Hush Logo" className="login-logo" />
            </div>
            <h1 className="login-title">Hush</h1>
            <p className="login-subtitle">
              {mode === 'signup' ? 'Create a secure account to get started' : 'Private. Secure. Simple.'}
            </p>
          </div>

          {/* Segmented Tab Controls */}
          <div className="auth-tabs" role="tablist" aria-label="Authentication Options">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => setMode('login')}
            >
              Log In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => setMode('signup')}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              {/* Username Input with Field Icon */}
              <div className="input-field-wrapper">
                <span className="input-field-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input
                  type="text"
                  className="login-input"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  required
                />
              </div>

              {/* Password Input with Lock Icon and Eye Toggle */}
              <div className="input-field-wrapper">
                <span className="input-field-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-input password-input"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex="-1"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <span className="btn-loading-state">
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeLinecap="round"/>
                  </svg>
                  Processing...
                </span>
              ) : (
                mode === 'signup' ? 'Create Account' : 'Log In'
              )}
            </button>
          </form>

          {/* Footer Mode Switcher & Security Note */}
          <div className="login-card-footer">
            <p className="auth-switch-text">
              {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                className="auth-switch-btn"
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              >
                {mode === 'signup' ? 'Log In' : 'Create Account'}
              </button>
            </p>

            <div className="login-trust-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>Client-Side Encrypted • Zero Server Logs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

