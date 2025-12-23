import { useState } from 'react';
import { useAuth } from '../context/auth';
import { useAlert } from '../context/AlertContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);

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
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        login(data);
      } else {
        showAlert(data.message);
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
              style={{ textAlign: 'center' }}
            />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Connecting...' : 'Start Chatting'}
          </button>
        </form>
        <p style={{ fontSize: '0.75rem', marginTop: '1.5rem', opacity: 0.7 }}>
          New users: Entering a username and password will automatically create your account.
        </p>
      </div>
    </div>
  );
}

