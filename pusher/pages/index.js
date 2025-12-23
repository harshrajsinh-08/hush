import { useAuth } from '../context/auth';
import Login from '../components/Login';
import ChatInterface from '../components/ChatInterface';
import { useEffect, useState } from 'react';

export default function Home() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!user) {
    return <Login />;
  }

  return <ChatInterface />;
}
