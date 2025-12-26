import { useAuth } from '../context/auth';
import Login from '../components/Login';
import ChatInterface from '../components/ChatInterface';
import Maintenance from '../components/Maintenance';
import { useEffect, useState } from 'react';

export default function Home() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [inviteCode, setInviteCode] = useState(null);

  // Check karo agar maintenance mode on hai toh maintenance page dikhao
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true' || false;

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) setInviteCode(code);
  }, []);

  if (!mounted) return null;

  // Agar maintenance mode true hai toh yahi se rukh jao
  if (isMaintenanceMode) {
    return <Maintenance />;
  }

  // Agar user logged in nahi hai toh Login page dikhao
  if (!user) {
    return <Login initialInviteCode={inviteCode} />;
  }

  return <ChatInterface />;
}
