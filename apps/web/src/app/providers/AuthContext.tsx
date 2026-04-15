import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { applyTheme } from '@/features/settings/settings-view';
import {
  BUSINESS_OS_TOKEN_KEY,
  LEGACY_NONPROFIT_OS_TOKEN_KEY,
  getStoredValue,
  removeStoredValue,
  setStoredValue,
} from '@/shared/lib/storage';

const API = '/api';

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
  orgRoles: string[];
}

interface AuthContextValue {
  token: string | null;
  currentUser: AppUser | null;
  isAdmin: boolean;
  isSuperUser: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string; mustChangePassword?: boolean; changeToken?: string }>;
  completeSetPassword: (changeToken: string, newPassword: string) => Promise<{ error?: string }>;
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
  completeSetPassword: async () => ({}),
  logout: () => {},
  fetchHeaders: () => ({}),
  users: [],
  setCurrentUserId: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    // Support ?token=xxx for screenshot automation (pre-issued JWT)
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (urlToken) { setStoredValue(BUSINESS_OS_TOKEN_KEY, urlToken, LEGACY_NONPROFIT_OS_TOKEN_KEY); return urlToken; }
    return getStoredValue(BUSINESS_OS_TOKEN_KEY, LEGACY_NONPROFIT_OS_TOKEN_KEY);
  });
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
          removeStoredValue(BUSINESS_OS_TOKEN_KEY, LEGACY_NONPROFIT_OS_TOKEN_KEY);
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

  // Apply effective colour scheme after login
  useEffect(() => {
    if (!currentUser || !token) return;
    fetch(`${API}/auth/color-scheme`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const effective = d.personal ?? d.org ?? null;
        if (effective) applyTheme(effective);
      })
      .catch(() => {});
  }, [currentUser?.id]);

  // Auto-login for screenshot automation (?autoScreenshot=admin|super)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('autoScreenshot');
    if (!mode || token) return;
    const email = mode === 'super' ? 'stephen.raj@insead.edu' : 'stephen.raj@coryphaeus.ai';
    const password = mode === 'super' ? 'stryker' : 'admin123';
    fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.token) {
          setStoredValue(BUSINESS_OS_TOKEN_KEY, data.token, LEGACY_NONPROFIT_OS_TOKEN_KEY);
          setToken(data.token);
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await r.json();
      if (!r.ok) return { error: data.error || 'Login failed' };
      // Intercept force-password-change flow
      if (data.mustChangePassword) {
        return { mustChangePassword: true, changeToken: data.changeToken };
      }
      setStoredValue(BUSINESS_OS_TOKEN_KEY, data.token, LEGACY_NONPROFIT_OS_TOKEN_KEY);
      setToken(data.token);
      setCurrentUser(data.user);
      return {};
    } catch {
      return { error: 'Network error' };
    }
  }, []);

  const completeSetPassword = useCallback(async (changeToken: string, newPassword: string) => {
    try {
      const r = await fetch(`${API}/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeToken, newPassword }),
      });
      const data = await r.json();
      if (!r.ok) return { error: data.error || 'Failed to set password' };
      setStoredValue(BUSINESS_OS_TOKEN_KEY, data.token, LEGACY_NONPROFIT_OS_TOKEN_KEY);
      setToken(data.token);
      setCurrentUser(data.user);
      return {};
    } catch {
      return { error: 'Network error' };
    }
  }, []);

  const logout = useCallback(() => {
    removeStoredValue(BUSINESS_OS_TOKEN_KEY, LEGACY_NONPROFIT_OS_TOKEN_KEY);
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
      completeSetPassword,
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
