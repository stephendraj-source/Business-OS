export const BUSINESS_OS_TOKEN_KEY = 'business-os-auth-token';
export const LEGACY_NONPROFIT_OS_TOKEN_KEY = 'nonprofit-os-auth-token';
export const BUSINESS_OS_ORG_NAME_KEY = 'business-os-org-name';
export const LEGACY_NONPROFIT_OS_ORG_NAME_KEY = 'nonprofit-os-org-name';
export const BUSINESS_OS_THEME_KEY = 'business-os-theme';
export const LEGACY_NONPROFIT_OS_THEME_KEY = 'nonprofit-os-theme';
export const BUSINESS_OS_REPORT_FIELDS_KEY = 'business-os-report-fields-v1';
export const LEGACY_NONPROFIT_OS_REPORT_FIELDS_KEY = 'nonprofit-os-report-fields-v1';
export const BUSINESS_OS_DASHBOARD_WIDGETS_KEY = 'business-os-dashboard-widgets-v4';
export const LEGACY_NONPROFIT_OS_DASHBOARD_WIDGETS_KEY = 'nonprofit-os-dashboard-widgets-v4';

export function getStoredValue(primaryKey: string, legacyKey?: string): string | null {
  return localStorage.getItem(primaryKey) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
}

export function setStoredValue(primaryKey: string, value: string, legacyKey?: string) {
  localStorage.setItem(primaryKey, value);
  if (legacyKey) localStorage.removeItem(legacyKey);
}

export function removeStoredValue(primaryKey: string, legacyKey?: string) {
  localStorage.removeItem(primaryKey);
  if (legacyKey) localStorage.removeItem(legacyKey);
}
