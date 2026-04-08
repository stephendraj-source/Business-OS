import { useState, useEffect } from 'react';
import {
  BUSINESS_OS_ORG_NAME_KEY,
  BUSINESS_OS_TOKEN_KEY,
  LEGACY_NONPROFIT_OS_ORG_NAME_KEY,
  LEGACY_NONPROFIT_OS_TOKEN_KEY,
  getStoredValue,
  setStoredValue,
} from '../lib/storage';

const DEFAULT_NAME = 'BusinessOS';
const API = '/api';

export function getOrgName(): string {
  return getStoredValue(BUSINESS_OS_ORG_NAME_KEY, LEGACY_NONPROFIT_OS_ORG_NAME_KEY) ?? DEFAULT_NAME;
}

function getToken(): string | null {
  return getStoredValue(BUSINESS_OS_TOKEN_KEY, LEGACY_NONPROFIT_OS_TOKEN_KEY);
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
  setStoredValue(BUSINESS_OS_ORG_NAME_KEY, trimmed, LEGACY_NONPROFIT_OS_ORG_NAME_KEY);
  window.dispatchEvent(new CustomEvent('orgNameChanged', { detail: trimmed }));
}

export function saveOrgName(name: string) {
  const trimmed = name.trim() || DEFAULT_NAME;
  setStoredValue(BUSINESS_OS_ORG_NAME_KEY, trimmed, LEGACY_NONPROFIT_OS_ORG_NAME_KEY);
  window.dispatchEvent(new CustomEvent('orgNameChanged', { detail: trimmed }));
}

export function useOrgName(): string {
  const [orgName, setOrgName] = useState<string>(getOrgName);

  useEffect(() => {
    fetchOrgDisplayName().then(name => {
      if (name) {
        setStoredValue(BUSINESS_OS_ORG_NAME_KEY, name, LEGACY_NONPROFIT_OS_ORG_NAME_KEY);
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
