import { useAuth } from '../context/auth';
import Login from '../components/Login';
import ChatInterface from '../components/ChatInterface';
import Maintenance from '../components/Maintenance';
import { useEffect, useState } from 'react';

export default function Home() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  // Check if maintenance mode is enabled
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true' || false;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (isMaintenanceMode) {
    return <Maintenance />;
  }

  if (!user) {
    return <Login />;
  }

  return <ChatInterface />;
}
