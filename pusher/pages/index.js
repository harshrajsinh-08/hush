import { useAuth } from '../context/auth';
import Login from '../components/Login';
import ChatInterface from '../components/ChatInterface';
import { useEffect, useState } from 'react';

export default function Home() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [inviteCode, setInviteCode] = useState(null);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) setInviteCode(code);
  }, []);

  if (!mounted) return null;

  if (!user) {
    return <Login initialInviteCode={inviteCode} />;
  }

  return <ChatInterface />;
}
