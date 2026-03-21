import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

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

  return { credits, loading, refresh };
}
