import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';
const POLL_INTERVAL_MS = 30_000;

export const CREDITS_REFRESH_EVENT = 'credits-refresh';

export function dispatchCreditsRefresh() {
  window.dispatchEvent(new Event(CREDITS_REFRESH_EVENT));
}

export function useCredits() {
  const { fetchHeaders, currentUser } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/credits`, { headers: fetchHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits ?? null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentUser, fetchHeaders]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(CREDITS_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(CREDITS_REFRESH_EVENT, refresh);
  }, [refresh]);

  return { credits, loading, refresh };
}
