/* ============================================================
   Theme context — dark (default) / light, persisted per device.
   The CSS does the rest: `body.theme-light` swaps the tokens.
   ============================================================ */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'cyethackHRM.theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
