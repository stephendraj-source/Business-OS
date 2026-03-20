import { useState, useEffect } from 'react';

const KEY = 'nonprofit-os-org-name';
const DEFAULT_NAME = 'NonprofitOS';

export function getOrgName(): string {
  return localStorage.getItem(KEY) ?? DEFAULT_NAME;
}

export function saveOrgName(name: string) {
  const trimmed = name.trim() || DEFAULT_NAME;
  localStorage.setItem(KEY, trimmed);
  window.dispatchEvent(new CustomEvent('orgNameChanged', { detail: trimmed }));
}

export function useOrgName(): string {
  const [orgName, setOrgName] = useState<string>(getOrgName);

  useEffect(() => {
    const handler = (e: Event) => {
      setOrgName((e as CustomEvent<string>).detail);
    };
    window.addEventListener('orgNameChanged', handler);
    return () => window.removeEventListener('orgNameChanged', handler);
  }, []);

  return orgName;
}
