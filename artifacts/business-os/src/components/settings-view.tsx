import { useState, useEffect } from 'react';
import { Settings, Palette, Check, Moon, Sun, Waves, Leaf, Flame, Tag, Building2, Loader2, Save, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  BUSINESS_OS_THEME_KEY,
  BUSINESS_OS_TOKEN_KEY,
  LEGACY_NONPROFIT_OS_THEME_KEY,
  LEGACY_NONPROFIT_OS_TOKEN_KEY,
  getStoredValue,
  setStoredValue,
} from '@/lib/storage';
import { fetchOrgDisplayName, saveOrgDisplayName } from '@/hooks/use-org-name';

export interface Theme {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  vars: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id: 'dark',
    name: 'Midnight',
    description: 'Deep navy default theme',
    icon: <Moon className="w-4 h-4" />,
    vars: {
      '--background': '224 71% 4%',
      '--foreground': '213 31% 91%',
      '--card': '224 71% 4%',
      '--card-foreground': '213 31% 91%',
      '--popover': '224 71% 4%',
      '--popover-foreground': '215 20.2% 65.1%',
      '--primary': '210 40% 98%',
      '--primary-foreground': '222.2 47.4% 1.2%',
      '--secondary': '222.2 47.4% 11.2%',
      '--secondary-foreground': '210 40% 98%',
      '--muted': '223 47% 11%',
      '--muted-foreground': '215.4 16.3% 56.9%',
      '--accent': '216 34% 17%',
      '--accent-foreground': '210 40% 98%',
      '--destructive': '0 63% 31%',
      '--destructive-foreground': '210 40% 98%',
      '--border': '216 34% 17%',
      '--input': '216 34% 17%',
      '--ring': '216 34% 17%',
      '--sidebar': '226 58% 6%',
      '--sidebar-foreground': '213 31% 91%',
      '--sidebar-border': '216 34% 17%',
      '--sidebar-accent': '222 47% 11%',
      '--sidebar-accent-foreground': '210 40% 98%',
    },
  },
  {
    id: 'purple',
    name: 'Violet',
    description: 'Rich purple accent',
    icon: <Flame className="w-4 h-4" />,
    vars: {
      '--background': '270 30% 5%',
      '--foreground': '270 20% 92%',
      '--card': '270 30% 6%',
      '--card-foreground': '270 20% 92%',
      '--popover': '270 30% 5%',
      '--popover-foreground': '270 15% 65%',
      '--primary': '270 75% 70%',
      '--primary-foreground': '270 30% 5%',
      '--secondary': '270 25% 13%',
      '--secondary-foreground': '270 20% 92%',
      '--muted': '270 25% 12%',
      '--muted-foreground': '270 15% 55%',
      '--accent': '270 30% 18%',
      '--accent-foreground': '270 20% 92%',
      '--destructive': '0 63% 31%',
      '--destructive-foreground': '210 40% 98%',
      '--border': '270 25% 16%',
      '--input': '270 25% 16%',
      '--ring': '270 75% 70%',
      '--sidebar': '270 35% 4%',
      '--sidebar-foreground': '270 20% 92%',
      '--sidebar-border': '270 25% 14%',
      '--sidebar-accent': '270 25% 12%',
      '--sidebar-accent-foreground': '270 20% 92%',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Deep green, growth-focused',
    icon: <Leaf className="w-4 h-4" />,
    vars: {
      '--background': '160 30% 4%',
      '--foreground': '150 20% 92%',
      '--card': '160 30% 5%',
      '--card-foreground': '150 20% 92%',
      '--popover': '160 30% 4%',
      '--popover-foreground': '150 15% 65%',
      '--primary': '160 65% 50%',
      '--primary-foreground': '160 30% 4%',
      '--secondary': '160 25% 11%',
      '--secondary-foreground': '150 20% 92%',
      '--muted': '160 25% 10%',
      '--muted-foreground': '150 15% 55%',
      '--accent': '160 30% 16%',
      '--accent-foreground': '150 20% 92%',
      '--destructive': '0 63% 31%',
      '--destructive-foreground': '210 40% 98%',
      '--border': '160 25% 15%',
      '--input': '160 25% 15%',
      '--ring': '160 65% 50%',
      '--sidebar': '160 35% 3%',
      '--sidebar-foreground': '150 20% 92%',
      '--sidebar-border': '160 25% 13%',
      '--sidebar-accent': '160 25% 10%',
      '--sidebar-accent-foreground': '150 20% 92%',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Bright blue energy',
    icon: <Waves className="w-4 h-4" />,
    vars: {
      '--background': '215 40% 5%',
      '--foreground': '210 30% 93%',
      '--card': '215 40% 6%',
      '--card-foreground': '210 30% 93%',
      '--popover': '215 40% 5%',
      '--popover-foreground': '210 20% 65%',
      '--primary': '210 90% 60%',
      '--primary-foreground': '215 40% 5%',
      '--secondary': '215 35% 12%',
      '--secondary-foreground': '210 30% 93%',
      '--muted': '215 35% 11%',
      '--muted-foreground': '210 20% 55%',
      '--accent': '215 40% 17%',
      '--accent-foreground': '210 30% 93%',
      '--destructive': '0 63% 31%',
      '--destructive-foreground': '210 40% 98%',
      '--border': '215 35% 16%',
      '--input': '215 35% 16%',
      '--ring': '210 90% 60%',
      '--sidebar': '215 45% 4%',
      '--sidebar-foreground': '210 30% 93%',
      '--sidebar-border': '215 35% 14%',
      '--sidebar-accent': '215 35% 11%',
      '--sidebar-accent-foreground': '210 30% 93%',
    },
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Clean light mode',
    icon: <Sun className="w-4 h-4" />,
    vars: {
      '--background': '0 0% 100%',
      '--foreground': '222 84% 5%',
      '--card': '0 0% 98%',
      '--card-foreground': '222 84% 5%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '215 16% 45%',
      '--primary': '222 84% 47%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '210 14% 93%',
      '--secondary-foreground': '222 84% 5%',
      '--muted': '210 14% 92%',
      '--muted-foreground': '215 16% 47%',
      '--accent': '210 14% 90%',
      '--accent-foreground': '222 84% 5%',
      '--destructive': '0 72% 51%',
      '--destructive-foreground': '0 0% 100%',
      '--border': '214 12% 87%',
      '--input': '214 12% 87%',
      '--ring': '222 84% 47%',
      '--sidebar': '210 14% 96%',
      '--sidebar-foreground': '222 84% 5%',
      '--sidebar-border': '214 12% 87%',
      '--sidebar-accent': '210 14% 90%',
      '--sidebar-accent-foreground': '222 84% 5%',
    },
  },
];

export const THEME_PREVIEW: Record<string, { bg: string; accent: string; text: string }> = {
  dark:    { bg: '#080f1f', accent: '#f8fafc', text: '#94a3b8' },
  purple:  { bg: '#110a1e', accent: '#b57bfa', text: '#c4b5d6' },
  emerald: { bg: '#050f0c', accent: '#34d399', text: '#86c7b0' },
  ocean:   { bg: '#050f1a', accent: '#3b9eff', text: '#7ab3d4' },
  light:   { bg: '#ffffff', accent: '#2563eb', text: '#64748b' },
};

export function applyTheme(themeId: string) {
  const theme = THEMES.find(t => t.id === themeId);
  if (!theme) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  setStoredValue(BUSINESS_OS_THEME_KEY, themeId, LEGACY_NONPROFIT_OS_THEME_KEY);
}

export function loadSavedTheme() {
  const saved = getStoredValue(BUSINESS_OS_THEME_KEY, LEGACY_NONPROFIT_OS_THEME_KEY) ?? 'dark';
  applyTheme(saved);
  return saved;
}

const INDUSTRY_BLUEPRINTS = [
  'Healthcare & Life Sciences',
  'Nonprofit & Social Services',
  'Technology & Software',
  'Education & Research',
  'Financial Services',
  'Manufacturing & Supply Chain',
  'Retail & E-Commerce',
  'Professional Services',
  'Government & Public Sector',
  'Real Estate & Construction',
  'Media & Entertainment',
  'Energy & Utilities',
  'Hospitality & Tourism',
  'Legal Services',
  'Agriculture & Food',
];

const API = '/api';

function authedFetch(url: string, opts: RequestInit = {}) {
  const token = getStoredValue(BUSINESS_OS_TOKEN_KEY, LEGACY_NONPROFIT_OS_TOKEN_KEY) ?? '';
  return fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) } });
}

export function SettingsView() {
  const { currentUser } = useAuth();
  const [activeTheme, setActiveTheme] = useState(() => getStoredValue(BUSINESS_OS_THEME_KEY, LEGACY_NONPROFIT_OS_THEME_KEY) ?? 'dark');
  const [displayName, setDisplayName] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [officialNationalId, setOfficialNationalId] = useState('');
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameSaved, setDisplayNameSaved] = useState(false);
  const [officialNameSaving, setOfficialNameSaving] = useState(false);
  const [officialNameSaved, setOfficialNameSaved] = useState(false);
  const [officialNationalIdSaving, setOfficialNationalIdSaving] = useState(false);
  const [officialNationalIdSaved, setOfficialNationalIdSaved] = useState(false);

  useEffect(() => {
    loadSavedTheme();
  }, []);

  useEffect(() => {
    authedFetch(`${API}/org/profile`).then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return;
      const dn = (data.displayName as string)?.trim();
      if (dn && dn !== 'BusinessOS') setDisplayName(dn);
      setOfficialName(data.officialName ?? '');
      setOfficialNationalId(data.officialNationalId ?? '');
    }).catch(() => {});
  }, []);

  const handleThemeSelect = (themeId: string) => {
    setActiveTheme(themeId);
    applyTheme(themeId);
  };

  const handleSaveDisplayName = async () => {
    setDisplayNameSaving(true);
    try {
      await saveOrgDisplayName(displayName);
      setDisplayNameSaved(true);
      setTimeout(() => setDisplayNameSaved(false), 2500);
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const handleSaveOfficialName = async () => {
    setOfficialNameSaving(true);
    try {
      await authedFetch(`${API}/org/profile`, { method: 'PUT', body: JSON.stringify({ officialName }) });
      setOfficialNameSaved(true);
      setTimeout(() => setOfficialNameSaved(false), 2500);
    } finally {
      setOfficialNameSaving(false);
    }
  };

  const handleSaveOfficialNationalId = async () => {
    setOfficialNationalIdSaving(true);
    try {
      await authedFetch(`${API}/org/profile`, { method: 'PUT', body: JSON.stringify({ officialNationalId }) });
      setOfficialNationalIdSaved(true);
      setTimeout(() => setOfficialNationalIdSaved(false), 2500);
    } finally {
      setOfficialNationalIdSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none p-5 border-b border-border bg-card">
        <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your workspace preferences.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-3xl">

        {/* Colour Theme */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Colour Theme</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Choose an accent colour theme for your workspace. Changes apply instantly.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {THEMES.map(theme => {
              const preview = THEME_PREVIEW[theme.id];
              const isActive = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id)}
                  className={cn(
                    "relative group rounded-xl border-2 p-3 text-left transition-all duration-200 hover:scale-105",
                    isActive
                      ? "border-primary shadow-lg shadow-primary/20"
                      : "border-border hover:border-border/80"
                  )}
                  style={{ background: preview.bg }}
                >
                  {/* Swatch preview */}
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <div className="w-4 h-4 rounded-full" style={{ background: preview.accent }} />
                    <div className="w-4 h-4 rounded-full opacity-50" style={{ background: preview.text }} />
                    <div className="w-4 h-4 rounded-full opacity-20" style={{ background: preview.text }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold" style={{ color: preview.accent }}>
                        {theme.name}
                      </div>
                      <div className="text-[9px] mt-0.5" style={{ color: preview.text }}>
                        {theme.description}
                      </div>
                    </div>
                    {isActive && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: preview.accent }}>
                        <Check className="w-2.5 h-2.5" style={{ color: preview.bg }} />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Your theme preference is saved automatically to this browser.
          </p>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Organisation Display Name */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Organisation Display Name</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            This name appears in the top-left of the application. Leave blank to use the default.
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setDisplayNameSaved(false); }}
              placeholder="e.g. Acme Corp"
              className="flex-1 text-sm bg-secondary/40 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') handleSaveDisplayName(); }}
            />
            <button
              onClick={handleSaveDisplayName}
              disabled={displayNameSaving}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors border flex-none',
                displayNameSaved
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'
              )}
            >
              {displayNameSaving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : displayNameSaved
                ? <Check className="w-3.5 h-3.5" />
                : <Save className="w-3.5 h-3.5" />}
              {displayNameSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Organisation Official Name */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Organisation Official Name</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            The full legal name of your organisation as registered with authorities.
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={officialName}
              onChange={e => { setOfficialName(e.target.value); setOfficialNameSaved(false); }}
              placeholder="e.g. Acme Corporation Pty Ltd"
              className="flex-1 text-sm bg-secondary/40 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') handleSaveOfficialName(); }}
            />
            <button
              onClick={handleSaveOfficialName}
              disabled={officialNameSaving}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors border flex-none',
                officialNameSaved
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'
              )}
            >
              {officialNameSaving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : officialNameSaved
                ? <Check className="w-3.5 h-3.5" />
                : <Save className="w-3.5 h-3.5" />}
              {officialNameSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Organisation Official National ID */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Organisation Official National ID</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Your organisation's official government-issued registration or identification number.
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={officialNationalId}
              onChange={e => { setOfficialNationalId(e.target.value); setOfficialNationalIdSaved(false); }}
              placeholder="e.g. ABN 12 345 678 901 or Company No. 123456"
              className="flex-1 text-sm bg-secondary/40 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') handleSaveOfficialNationalId(); }}
            />
            <button
              onClick={handleSaveOfficialNationalId}
              disabled={officialNationalIdSaving}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors border flex-none',
                officialNationalIdSaved
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'
              )}
            >
              {officialNationalIdSaving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : officialNationalIdSaved
                ? <Check className="w-3.5 h-3.5" />
                : <Save className="w-3.5 h-3.5" />}
              {officialNationalIdSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Specification Document */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Technical Specification</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Download a comprehensive Word document containing the full technical specification, database schema,
            API endpoints, all 15 epics with detailed user stories, and step-by-step instructions for
            recreating this application from scratch.
          </p>
          <a
            href="/api/spec-doc/download"
            download
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Specification (.docx)
          </a>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Profile */}
        <section>
          <h3 className="text-base font-semibold text-foreground mb-4">Profile</h3>
          <div className="bg-secondary/30 rounded-xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary border-2 border-primary/30 flex-shrink-0">
                {currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'U'}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-foreground truncate">{currentUser?.name ?? 'User'}</div>
                <div className="text-sm text-muted-foreground truncate">{currentUser?.email ?? ''}</div>
                {currentUser?.designation && (
                  <div className="text-xs text-muted-foreground/70 italic truncate">{currentUser.designation}</div>
                )}
              </div>
            </div>
            {((currentUser?.orgRoles?.length ?? 0) > 0) && (
              <div className="border-t border-border/50 pt-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <Tag className="w-3 h-3" />
                  <span>Roles</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentUser!.orgRoles.map(r => (
                    <span
                      key={r}
                      className={cn(
                        'text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide',
                        r.toLowerCase().includes('administrators')
                          ? 'bg-primary/15 text-primary border border-primary/20'
                          : 'bg-secondary text-muted-foreground border border-border'
                      )}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {((currentUser?.orgRoles?.length ?? 0) === 0) && (
              <div className="border-t border-border/50 pt-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <Tag className="w-3 h-3" />
                  <span>Roles</span>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide bg-secondary text-muted-foreground border border-border">
                  All Users
                </span>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
