import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API = '/api';
const TOKEN_KEY = 'nonprofit-os-auth-token';

export interface AppUser {
  id: number;
  tenantId: number | null;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  designation: string;
  isActive: boolean;
}

interface AuthContextValue {
  token: string | null;
  currentUser: AppUser | null;
  isAdmin: boolean;
  isSuperUser: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
  fetchHeaders: () => Record<string, string>;
  users: AppUser[];
  setCurrentUserId: (id: number) => void;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  currentUser: null,
  isAdmin: false,
  isSuperUser: false,
  isLoading: true,
  login: async () => ({}),
  logout: () => {},
  fetchHeaders: () => ({}),
  users: [],
  setCurrentUserId: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getHeaders = useCallback((t?: string | null): Record<string, string> => {
    const tok = t ?? token;
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tok) h['Authorization'] = `Bearer ${tok}`;
    return h;
  }, [token]);

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      setIsLoading(false);
      return;
    }
    fetch(`${API}/auth/me`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (user) {
          setCurrentUser(user);
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setCurrentUser(null);
        }
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  useEffect(() => {
    if (!currentUser || currentUser.role === 'superuser') return;
    fetch(`${API}/users`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setUsers(data); })
      .catch(() => {});
  }, [currentUser]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) return { error: data.error || 'Login failed' };
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      return {};
    } catch {
      return { error: 'Network error' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCurrentUser(null);
    setUsers([]);
  }, []);

  const fetchHeaders = useCallback((): Record<string, string> => {
    return getHeaders();
  }, [getHeaders]);

  const setCurrentUserId = useCallback((_id: number) => {}, []);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superuser';
  const isSuperUser = currentUser?.role === 'superuser';

  return (
    <AuthContext.Provider value={{
      token,
      currentUser,
      isAdmin,
      isSuperUser,
      isLoading,
      login,
      logout,
      fetchHeaders,
      users,
      setCurrentUserId,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useUser() {
  return useContext(AuthContext);
}
