import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API = '/api';
const STORAGE_KEY = 'nonprofit-os-active-user-id';

export interface AppUser {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  designation: string;
  isActive: boolean;
}

interface UserContextValue {
  currentUser: AppUser | null;
  users: AppUser[];
  setCurrentUserId: (id: number) => void;
  isAdmin: boolean;
  fetchHeaders: () => Record<string, string>;
}

const UserContext = createContext<UserContextValue>({
  currentUser: null,
  users: [],
  setCurrentUserId: () => {},
  isAdmin: false,
  fetchHeaders: () => ({}),
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored) : null;
  });

  useEffect(() => {
    fetch(`${API}/users`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          setUsers(data);
          if (!currentUserId && data.length > 0) {
            const firstId = data[0].id;
            setCurrentUserIdState(firstId);
            localStorage.setItem(STORAGE_KEY, String(firstId));
          }
        }
      })
      .catch(() => {});
  }, []);

  const setCurrentUserId = useCallback((id: number) => {
    setCurrentUserIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const currentUser = users.find(u => u.id === currentUserId) ?? null;
  const isAdmin = currentUser?.role === 'admin';

  const fetchHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentUserId) h['X-User-Id'] = String(currentUserId);
    return h;
  }, [currentUserId]);

  return (
    <UserContext.Provider value={{ currentUser, users, setCurrentUserId, isAdmin, fetchHeaders }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
