import { useState, useEffect, useRef } from 'react';
import { Settings, Palette, Check, Moon, Sun, Waves, Leaf, Flame, Building2, Download, Upload, FileArchive, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOrgName, saveOrgName } from '@/hooks/use-org-name';
import { useAuth } from '@/contexts/AuthContext';

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
  localStorage.setItem('nonprofit-os-theme', themeId);
}

export function loadSavedTheme() {
  const saved = localStorage.getItem('nonprofit-os-theme') ?? 'dark';
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

export function SettingsView() {
  const { fetchHeaders, user } = useAuth();
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('nonprofit-os-theme') ?? 'dark');
  const [orgNameInput, setOrgNameInput] = useState(getOrgName);
  const [orgNameSaved, setOrgNameSaved] = useState(false);

  // Blueprint state
  const [exportName, setExportName] = useState('blueprint');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API = '/api';
  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

  useEffect(() => {
    loadSavedTheme();
  }, []);

  const handleThemeSelect = (themeId: string) => {
    setActiveTheme(themeId);
    applyTheme(themeId);
  };

  const handleOrgNameSave = () => {
    saveOrgName(orgNameInput);
    setOrgNameSaved(true);
    setTimeout(() => setOrgNameSaved(false), 2000);
  };

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      const r = await fetch(`${API}/blueprint/export`, { headers: fetchHeaders() });
      if (!r.ok) {
        const d = await r.json();
        setExportError(d.error || 'Export failed');
        return;
      }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (exportName.trim() || 'blueprint').replace(/[^a-z0-9_-]/gi, '_');
      a.download = `${safeName}.blueprint.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportError('');
    setImportSuccess('');
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError('');
    setImportSuccess('');
    setShowImportConfirm(false);
    try {
      const text = await importFile.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        setImportError('Invalid JSON file. Please upload a valid blueprint file.');
        return;
      }
      const r = await fetch(`${API}/blueprint/import`, {
        method: 'POST',
        headers: fetchHeaders(),
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) {
        setImportError(result.error || 'Import failed');
        return;
      }
      const s = result.summary;
      setImportSuccess(
        `Blueprint imported successfully. Restored: ${s.processes} processes, ${s.aiAgents} AI agents, ${s.groups} groups, ${s.roles} roles, ${s.businessUnits} business units, ${s.regions} regions, ${s.checklists} checklists, ${s.initiatives} initiatives.`
      );
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setImportError(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

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

        {/* Organisation Name */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Organisation Name</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            This name appears in the sidebar header across your workspace.
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={orgNameInput}
              onChange={e => setOrgNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleOrgNameSave()}
              placeholder="e.g. Acme Foundation"
              className="flex-1 max-w-xs px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={handleOrgNameSave}
              className={cn(
                "px-4 py-2 text-sm rounded-lg font-medium transition-all duration-200",
                orgNameSaved
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
              )}
            >
              {orgNameSaved ? <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span> : 'Save'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Saved to this browser automatically.</p>
        </section>

        {/* Divider */}
        <div className="border-t border-border" />

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

        {/* Profile (placeholder) */}
        <section>
          <h3 className="text-base font-semibold text-foreground mb-4">Profile</h3>
          <div className="flex items-center gap-4 p-5 bg-secondary/30 rounded-xl border border-border">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary border-2 border-primary/30">
              {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <div>
              <div className="font-semibold text-foreground">{user?.name ?? 'User'}</div>
              <div className="text-sm text-muted-foreground capitalize">{user?.role ?? 'Member'}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Profile editing coming soon.</p>
        </section>

        {/* Blueprint section — admin only */}
        {isAdmin && (
          <>
            <div className="border-t border-border" />
            <section>
              <div className="flex items-center gap-2 mb-4">
                <FileArchive className="w-5 h-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">Blueprint</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Export your entire workspace configuration and data as a blueprint file, or restore from a previously saved blueprint.
              </p>

              {/* Export */}
              <div className="bg-secondary/30 rounded-xl border border-border p-5 space-y-4 mb-4">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-sm">Export Blueprint</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  Downloads all your workspace data — processes, workflows, AI agents, groups, roles, governance records, checklists, dashboards, and initiatives — as a single JSON file.
                </p>
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={exportName}
                    onChange={e => setExportName(e.target.value)}
                    placeholder="blueprint"
                    className="flex-1 max-w-xs px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                  />
                  <span className="text-xs text-muted-foreground">.blueprint.json</span>
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 font-medium transition-all disabled:opacity-60"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exporting ? 'Exporting…' : 'Export'}
                  </button>
                </div>
                {exportError && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {exportError}
                  </p>
                )}
              </div>

              {/* Import */}
              <div className="bg-secondary/30 rounded-xl border border-border p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-amber-500" />
                  <h4 className="font-medium text-sm">Import Blueprint</h4>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium">Destructive</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Replaces <strong>all existing workspace data</strong> with the contents of a blueprint file. Users and audit logs are preserved. This action cannot be undone.
                </p>

                <div className="flex gap-3 items-center flex-wrap">
                  <label className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {importFile ? importFile.name : 'Choose file…'}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {importFile && !showImportConfirm && (
                    <button
                      onClick={() => setShowImportConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/30 font-medium transition-all"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Import
                    </button>
                  )}

                  {importFile && (
                    <button
                      onClick={() => {
                        setImportFile(null);
                        setShowImportConfirm(false);
                        setImportError('');
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {showImportConfirm && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-4 h-4" />
                      <p className="text-sm font-semibold">Confirm overwrite</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This will permanently delete all current processes, workflows, agents, groups, roles, checklists, and initiatives, then replace them with the data from <strong>{importFile?.name}</strong>. Are you sure?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowImportConfirm(false)}
                        className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:bg-secondary border border-border transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={importing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 font-medium disabled:opacity-60 transition-all"
                      >
                        <Upload className="w-3 h-3" />
                        {importing ? 'Importing…' : 'Yes, replace all data'}
                      </button>
                    </div>
                  </div>
                )}

                {importError && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {importError}
                  </p>
                )}
                {importSuccess && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                    <p className="text-xs text-green-600 flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      {importSuccess}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

      </div>
    </div>
  );
}
