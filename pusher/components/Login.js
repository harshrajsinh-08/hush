import { useState } from 'react';
import { useAuth } from '../context/auth';
import { useAlert } from '../context/AlertContext';

export default function Login({ initialInviteCode }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(initialInviteCode || '');
  const [showInviteInput, setShowInviteInput] = useState(!!initialInviteCode);
  const { login } = useAuth();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);

  // Login aur Sign Up ki main logic yahan hai
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, inviteCode }),
      });
      const data = await res.json();
      if (res.ok) {
        login(data);
      } else {
        if (res.status === 403) {
            setShowInviteInput(true);
            if (!inviteCode) {
                showAlert("Registration requires an invite code");
            } else {
                showAlert(data.message);
            }
        } else {
            showAlert(data.message);
        }
      }
    } catch (err) {
      console.error(err);
      showAlert('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
          <img src="/logo.svg" alt="Hush Logo" style={{ width: '64px', height: '64px', marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '2.5rem', fontWeight: '700', letterSpacing: '-0.02em', margin: 0 }}>Hush</h1>
        </div>
        <p style={{ color: 'var(--slate-500)', fontSize: '1.1rem', fontWeight: '500' }}>Private. Secure. Simple.</p>
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
              style={{ textAlign: 'center', marginBottom: showInviteInput ? '1rem' : '0' }}
            />
            {showInviteInput && (
                <input
                type="text"
                className="search-input"
                placeholder="Invite Code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                disabled={loading}
                style={{ textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase' }}
              />
            )}
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Connecting...' : (showInviteInput ? 'Sign Up with Invite' : 'Start Chatting')}
          </button>
        </form>
        <p style={{ fontSize: '0.75rem', marginTop: '1.5rem', opacity: 0.7 }}>
          New users: Registration requires an <b>Invite Code</b>.
        </p>
      </div>
    </div>
  );
}

