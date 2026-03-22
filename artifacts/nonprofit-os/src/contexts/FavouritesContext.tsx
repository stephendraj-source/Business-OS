import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const API = '/api';

export const OPEN_FAVOURITE_EVENT = 'bos-open-favourite';

export interface FavouriteItem {
  id: number;
  user_id: number;
  tenant_id: number | null;
  item_type: 'process' | 'form' | 'agent' | 'workflow' | 'task';
  item_id: number;
  item_name: string;
  created_at: string;
}

interface FavouritesContextValue {
  favourites: FavouriteItem[];
  loading: boolean;
  isFavourite: (type: string, itemId: number) => boolean;
  addFavourite: (type: string, itemId: number, name: string) => Promise<void>;
  removeFavourite: (type: string, itemId: number) => Promise<void>;
  toggleFavourite: (type: string, itemId: number, name: string) => Promise<void>;
}

const FavouritesContext = createContext<FavouritesContextValue>({
  favourites: [],
  loading: false,
  isFavourite: () => false,
  addFavourite: async () => {},
  removeFavourite: async () => {},
  toggleFavourite: async () => {},
});

export function FavouritesProvider({ children }: { children: React.ReactNode }) {
  const { fetchHeaders, currentUser } = useAuth();
  const [favourites, setFavourites] = useState<FavouriteItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFavourites = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/favourites`, { headers: fetchHeaders() });
      if (r.ok) setFavourites(await r.json());
    } catch {}
    finally { setLoading(false); }
  }, [fetchHeaders, currentUser]);

  useEffect(() => { fetchFavourites(); }, [fetchFavourites]);

  const isFavourite = useCallback((type: string, itemId: number) => {
    return favourites.some(f => f.item_type === type && f.item_id === itemId);
  }, [favourites]);

  const addFavourite = useCallback(async (type: string, itemId: number, name: string) => {
    const r = await fetch(`${API}/favourites`, {
      method: 'POST',
      headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_type: type, item_id: itemId, item_name: name }),
    });
    if (r.ok) {
      const newFav = await r.json();
      setFavourites(prev => [...prev.filter(f => !(f.item_type === type && f.item_id === itemId)), newFav]);
    }
  }, [fetchHeaders]);

  const removeFavourite = useCallback(async (type: string, itemId: number) => {
    const fav = favourites.find(f => f.item_type === type && f.item_id === itemId);
    if (!fav) return;
    await fetch(`${API}/favourites/${fav.id}`, { method: 'DELETE', headers: fetchHeaders() });
    setFavourites(prev => prev.filter(f => f.id !== fav.id));
  }, [favourites, fetchHeaders]);

  const toggleFavourite = useCallback(async (type: string, itemId: number, name: string) => {
    if (isFavourite(type, itemId)) {
      await removeFavourite(type, itemId);
    } else {
      await addFavourite(type, itemId, name);
    }
  }, [isFavourite, addFavourite, removeFavourite]);

  return (
    <FavouritesContext.Provider value={{ favourites, loading, isFavourite, addFavourite, removeFavourite, toggleFavourite }}>
      {children}
    </FavouritesContext.Provider>
  );
}

export function useFavourites() {
  return useContext(FavouritesContext);
}
