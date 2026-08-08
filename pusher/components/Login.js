import { useState } from 'react';
import { useAuth } from '../context/auth';
import { useAlert } from '../context/AlertContext';

export default function Login() {
  // mode: 'login' | 'signup'
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      showAlert('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          isSignUp: mode === 'signup'
        }),
      });
      const data = await res.json();
      if (res.ok) {
        login(data);
      } else {
        showAlert(data.message || (mode === 'signup' ? 'Registration failed' : 'Login failed'));
      }
    } catch (err) {
      console.error(err);
      showAlert(mode === 'signup' ? 'Registration failed' : 'Login failed');
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>End-to-End Encrypted</span>
            </div>
            <h2>Zero Logs. Complete Privacy.</h2>
            <p>Your messages stay strictly between you and your recipient. Built with client-side encryption for total peace of mind.</p>
          </div>
        </div>

        {/* Right Side: Auth Card */}
        <div className="login-card">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
            <img src="/logo.svg" alt="Hush Logo" style={{ width: '64px', height: '64px', marginBottom: '0.75rem' }} />
            <h1 style={{ fontSize: '2.5rem', fontWeight: '700', letterSpacing: '-0.02em', margin: 0 }}>Hush</h1>
          </div>

          <p style={{ color: 'var(--slate-500)', fontSize: '1.05rem', fontWeight: '500', marginBottom: '2rem' }}>
            {mode === 'signup' ? 'Create a new account to get started' : 'Private. Secure. Simple.'}
          </p>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <input
                type="text"
                className="search-input"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                style={{ textAlign: 'center', marginBottom: '1rem' }}
              />
              <input
                type="password"
                className="search-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{ textAlign: 'center', marginBottom: '1.25rem' }}
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Processing...' : (mode === 'signup' ? 'Create Account' : 'Log In')}
            </button>
          </form>

          <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginTop: '1.75rem', marginBottom: 0 }}>
            {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: '700',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                marginLeft: '4px'
              }}
            >
              {mode === 'signup' ? 'Log In' : 'Create Account'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
