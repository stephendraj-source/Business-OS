import { useState, useEffect } from 'react';

const KEY = 'nonprofit-os-org-name';
const TOKEN_KEY = 'nonprofit-os-auth-token';
const DEFAULT_NAME = 'BusinessOS';
const API = '/api';

export function getOrgName(): string {
  return localStorage.getItem(KEY) ?? DEFAULT_NAME;
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export async function fetchOrgDisplayName(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const r = await fetch(`${API}/org/profile`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const name = (data.displayName as string)?.trim() || (data.name as string)?.trim() || DEFAULT_NAME;
    return name;
  } catch {
    return null;
  }
}

export async function saveOrgDisplayName(displayName: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  const trimmed = displayName.trim() || DEFAULT_NAME;
  await fetch(`${API}/org/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName: trimmed }),
  });
  localStorage.setItem(KEY, trimmed);
  window.dispatchEvent(new CustomEvent('orgNameChanged', { detail: trimmed }));
}

export function saveOrgName(name: string) {
  const trimmed = name.trim() || DEFAULT_NAME;
  localStorage.setItem(KEY, trimmed);
  window.dispatchEvent(new CustomEvent('orgNameChanged', { detail: trimmed }));
}

export function useOrgName(): string {
  const [orgName, setOrgName] = useState<string>(getOrgName);

  useEffect(() => {
    fetchOrgDisplayName().then(name => {
      if (name) {
        localStorage.setItem(KEY, name);
        setOrgName(name);
      }
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setOrgName((e as CustomEvent<string>).detail);
    };
    window.addEventListener('orgNameChanged', handler);
    return () => window.removeEventListener('orgNameChanged', handler);
  }, []);

  return orgName;
}
