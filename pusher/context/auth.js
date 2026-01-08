import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { username: string, _id: string }
  const router = useRouter();

  useEffect(() => {
    async function loadUser() {
      try {
        const storedUser = localStorage.getItem('chat_user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);

          // Fetch latest profile data to sync cross-platform changes
          if (parsedUser.username) {
            const res = await fetch(`/api/profile/${parsedUser.username}`);
            if (res.ok) {
              const latestData = await res.json();
              const updatedUser = { ...parsedUser, ...latestData };
              localStorage.setItem('chat_user', JSON.stringify(updatedUser));
              setUser(updatedUser);
            }
          }
        }
      } catch (e) {
        console.error('Error synchronizing user session:', e);
      }
    }
    loadUser();
  }, []);

  const login = (userData) => {
    localStorage.setItem('chat_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout API failed', e);
    }
    localStorage.removeItem('chat_user');
    setUser(null);
  };

  const updateUserProfile = (profileData) => {
    setUser(prev => {
      const updated = { ...prev, ...profileData };
      localStorage.setItem('chat_user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
