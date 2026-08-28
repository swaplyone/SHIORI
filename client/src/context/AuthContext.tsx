import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserSettings, EInkTheme } from '../types';

interface AuthContextType {
  user: User | null;
  settings: UserSettings | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  setTheme: (theme: EInkTheme) => void;
  demoLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('shiori_token');
  });

  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('shiori_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [settings, setSettings] = useState<UserSettings | null>(() => {
    try {
      const cached = localStorage.getItem('shiori_settings');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Apply theme on DOM
  const applyTheme = (theme: EInkTheme) => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('shiori_token');
      if (storedToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              setUser(data.user);
              localStorage.setItem('shiori_user', JSON.stringify(data.user));
              if (data.user.theme) applyTheme(data.user.theme);
            }
            if (data.settings) {
              setSettings(data.settings);
              localStorage.setItem('shiori_settings', JSON.stringify(data.settings));
            }
          } else if (res.status === 401) {
            // Only clear session if server explicitly returned 401 Unauthorized
            localStorage.removeItem('shiori_token');
            localStorage.removeItem('shiori_user');
            localStorage.removeItem('shiori_settings');
            setToken(null);
            setUser(null);
            setSettings(null);
          }
        } catch {
          // Network error/offline - keep existing local session intact!
          console.warn('[SHIORI Auth] Validating offline/cached session.');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('shiori_token', newToken);
    localStorage.setItem('shiori_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    if (newUser.theme) {
      applyTheme(newUser.theme);
    }
  };

  const logout = () => {
    localStorage.removeItem('shiori_token');
    localStorage.removeItem('shiori_user');
    setToken(null);
    setUser(null);
    setSettings(null);
    applyTheme('light');
  };

  const demoLogin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/demo-login', { method: 'POST' });
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (data.token && data.user) {
            login(data.token, data.user);
            return;
          }
        } catch {
          // Parse failed
        }
      }
      // Fallback demo user
      const fallbackUser: User = {
        id: 'user-lijith-001',
        shiori_id: 'SHI-3A91M',
        email: 'lijith@swaplyone.com',
        username: 'lijith',
        name: 'Lijith',
        bio: 'Systems engineer & SwaplyOne architect',
        theme: 'light',
        github_connected: 1,
        github_username: 'lijith-swaply'
      };
      login('demo-token-lijith', fallbackUser);
    } catch (err) {
      console.error('Demo login error, activating local demo profile:', err);
      const fallbackUser: User = {
        id: 'user-lijith-001',
        shiori_id: 'SHI-3A91M',
        email: 'lijith@swaplyone.com',
        username: 'lijith',
        name: 'Lijith',
        bio: 'Systems engineer & SwaplyOne architect',
        theme: 'light',
        github_connected: 1,
        github_username: 'lijith-swaply'
      };
      login('demo-token-lijith', fallbackUser);
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = (updated: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updated };
      localStorage.setItem('shiori_user', JSON.stringify(next));
      if (updated.theme) applyTheme(updated.theme);
      return next;
    });
  };

  const updateSettings = (updated: Partial<UserSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...updated } : null));
  };

  const setTheme = async (theme: EInkTheme) => {
    applyTheme(theme);
    updateUser({ theme });
    if (token) {
      try {
        await fetch('/api/auth/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ theme }),
        });
      } catch (err) {
        console.error('Failed to sync theme:', err);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        updateUser,
        updateSettings,
        setTheme,
        demoLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
