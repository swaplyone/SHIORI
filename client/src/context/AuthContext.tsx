import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserSettings, EInkTheme, UIMode, MatteLevel, FontOption, JAPANESE_MATTE_PRESETS } from '../types';
import { fetchJson } from '../utils/api';

interface AuthContextType {
  user: User | null;
  settings: UserSettings | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  uiMode: UIMode;
  matteLevel: MatteLevel;
  accentColor: string;
  fontFamily: FontOption;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  setTheme: (theme: EInkTheme) => void;
  setUIMode: (mode: UIMode) => void;
  setMatteLevel: (level: MatteLevel) => void;
  setAccentColor: (color: string) => void;
  setFontFamily: (font: FontOption) => void;
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

  const [uiMode, setUiModeState] = useState<UIMode>(() => {
    try {
      const cached = localStorage.getItem('shiori_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.ui_mode) return parsed.ui_mode;
      }
      return (localStorage.getItem('shiori_ui_mode') as UIMode) || 'eink_matte';
    } catch {
      return 'eink_matte';
    }
  });

  const [matteLevel, setMatteLevelState] = useState<MatteLevel>(() => {
    try {
      const cached = localStorage.getItem('shiori_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.matte_level) return parsed.matte_level;
      }
      return (localStorage.getItem('shiori_matte_level') as MatteLevel) || 'natural';
    } catch {
      return 'natural';
    }
  });

  const [accentColor, setAccentColorState] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('shiori_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.accent_color) return parsed.accent_color;
      }
      return localStorage.getItem('shiori_accent_color') || '#2E5A36';
    } catch {
      return '#2E5A36';
    }
  });

  const [fontFamily, setFontFamilyState] = useState<FontOption>(() => {
    try {
      const cached = localStorage.getItem('shiori_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.font_family) return parsed.font_family;
      }
      return (localStorage.getItem('shiori_font_family') as FontOption) || 'geist';
    } catch {
      return 'geist';
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

  // Apply appearance (UI Mode, Accent Color, Font, Matte Level) on DOM
  const applyAppearance = (mode: UIMode, accent: string, font: FontOption, matte: MatteLevel) => {
    const doc = document.documentElement;
    doc.setAttribute('data-ui-mode', mode);
    doc.setAttribute('data-font', font);
    doc.setAttribute('data-matte-level', matte);
    doc.style.setProperty('--eink-accent', accent);
    doc.style.setProperty('--eink-accent-soft', `${accent}22`);

    // Match Japanese preset for secondary accent & subtle wash
    const matchingPreset = JAPANESE_MATTE_PRESETS.find(
      (p) => p.primary.toLowerCase() === accent.toLowerCase()
    );
    if (matchingPreset) {
      doc.style.setProperty('--eink-secondary', matchingPreset.secondary);
      doc.style.setProperty('--eink-preset-paper', matchingPreset.paper);
      doc.style.setProperty('--eink-preset-ink', matchingPreset.ink);
      doc.style.setProperty('--eink-preset-muted', matchingPreset.muted);
    } else {
      doc.style.removeProperty('--eink-secondary');
      doc.style.removeProperty('--eink-preset-paper');
      doc.style.removeProperty('--eink-preset-ink');
      doc.style.removeProperty('--eink-preset-muted');
    }

    // Contrast calculation for primary button text
    let contrast = '#FFFFFF';
    if (accent && accent.startsWith('#') && accent.length === 7) {
      const r = parseInt(accent.slice(1, 3), 16);
      const g = parseInt(accent.slice(3, 5), 16);
      const b = parseInt(accent.slice(5, 7), 16);
      const yiq = (r * 299 + g * 587 + b * 114) / 1000;
      contrast = yiq >= 150 ? '#111111' : '#FFFFFF';
    }
    doc.style.setProperty('--eink-accent-contrast', contrast);

    // Dynamic Font Stack
    let fontStack = "'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    if (font === 'inter') {
      fontStack = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    } else if (font === 'plex_sans') {
      fontStack = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif";
    } else if (font === 'plex_mono') {
      fontStack = "'IBM Plex Mono', 'JetBrains Mono', Menlo, Consolas, monospace";
    } else if (font === 'serif') {
      fontStack = "'Instrument Serif', 'Newsreader', Georgia, serif";
    } else if (font === 'abask') {
      fontStack = "'Abask', 'Instrument Serif', Georgia, serif";
    } else if (font === 'qualli') {
      fontStack = "'Qualli', 'Instrument Serif', Georgia, serif";
    } else if (font === 'archela') {
      fontStack = "'Archela', 'Instrument Serif', Georgia, serif";
    }
    doc.style.setProperty('--font-app', fontStack);
  };

  // Initial startup: apply cached preferences immediately to prevent flash
  useEffect(() => {
    applyAppearance(uiMode, accentColor, fontFamily, matteLevel);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('shiori_token');
      if (storedToken) {
        try {
          const { ok, status, data } = await fetchJson('/api/auth/me', {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (ok && data?.user) {
            setUser(data.user);
            localStorage.setItem('shiori_user', JSON.stringify(data.user));
            if (data.user.theme) applyTheme(data.user.theme);
            if (data.settings) {
              setSettings(data.settings);
              localStorage.setItem('shiori_settings', JSON.stringify(data.settings));
              
              const sMode = data.settings.ui_mode || 'eink_matte';
              const sMatte = data.settings.matte_level || 'natural';
              const sAccent = data.settings.accent_color || '#2E5A36';
              const sFont = data.settings.font_family || 'geist';
              
              setUiModeState(sMode);
              setMatteLevelState(sMatte);
              setAccentColorState(sAccent);
              setFontFamilyState(sFont);
              applyAppearance(sMode, sAccent, sFont, sMatte);
            }
          } else if (status === 401) {
            localStorage.removeItem('shiori_token');
            localStorage.removeItem('shiori_user');
            localStorage.removeItem('shiori_settings');
            setToken(null);
            setUser(null);
            setSettings(null);
          }
        } catch {
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
    localStorage.removeItem('shiori_settings');
    setToken(null);
    setUser(null);
    setSettings(null);
    applyTheme('light');
    applyAppearance('eink_matte', '#2E5A36', 'geist', 'natural');
  };

  const demoLogin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/demo-login', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.token && data.user) {
          login(data.token, data.user);
          return;
        }
      }
    } catch (err) {
      console.error('Login session error:', err);
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

  const syncSettingsToBackend = async (patch: Partial<UserSettings>) => {
    const currentToken = token || localStorage.getItem('shiori_token');
    if (!currentToken) return;
    try {
      await fetch('/api/auth/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      console.error('Failed to sync settings to server:', err);
    }
  };

  const updateSettings = (updated: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = prev ? { ...prev, ...updated } : ({ ...updated } as UserSettings);
      localStorage.setItem('shiori_settings', JSON.stringify(next));
      return next;
    });
    syncSettingsToBackend(updated);
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

  const setUIMode = (mode: UIMode) => {
    setUiModeState(mode);
    localStorage.setItem('shiori_ui_mode', mode);
    applyAppearance(mode, accentColor, fontFamily, matteLevel);
    updateSettings({ ui_mode: mode });
  };

  const setMatteLevel = (level: MatteLevel) => {
    setMatteLevelState(level);
    localStorage.setItem('shiori_matte_level', level);
    applyAppearance(uiMode, accentColor, fontFamily, level);
    updateSettings({ matte_level: level });
  };

  const setAccentColor = (color: string) => {
    setAccentColorState(color);
    localStorage.setItem('shiori_accent_color', color);
    applyAppearance(uiMode, color, fontFamily, matteLevel);
    updateSettings({ accent_color: color });
  };

  const setFontFamily = (font: FontOption) => {
    setFontFamilyState(font);
    localStorage.setItem('shiori_font_family', font);
    applyAppearance(uiMode, accentColor, font, matteLevel);
    updateSettings({ font_family: font });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        token,
        isAuthenticated: !!user,
        isLoading,
        uiMode,
        matteLevel,
        accentColor,
        fontFamily,
        login,
        logout,
        updateUser,
        updateSettings,
        setTheme,
        setUIMode,
        setMatteLevel,
        setAccentColor,
        setFontFamily,
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
