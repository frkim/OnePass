import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';
import { api, getToken, setToken } from './api';

interface AuthState {
  userId: string | null;
  username: string | null;
  role: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (emailOrUsername: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    userId: null, username: null, role: null, loading: true,
  });

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setState({ userId: null, username: null, role: null, loading: false });
      return;
    }
    try {
      const me = await api.me();
      setState({ userId: me.id, username: me.username, role: me.role, loading: false });
    } catch {
      setToken(null);
      setState({ userId: null, username: null, role: null, loading: false });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (emailOrUsername: string, password: string, remember = true) => {
    const r = await api.login(emailOrUsername, password);
    setToken(r.token, remember);
    setState({ userId: r.userId, username: r.username, role: r.role, loading: false });
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setState({ userId: null, username: null, role: null, loading: false });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
