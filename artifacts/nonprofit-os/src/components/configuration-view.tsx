import { useState, useEffect, useRef } from 'react';
import { Settings2, Plus, Pencil, Trash2, Check, X, Building2, Globe, ChevronRight, Loader2, MapPin, Link, Phone, Mail, User, Save, ListTodo, Layers, Activity, Bot, Palette, Download, Upload, FileArchive, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { THEMES, THEME_PREVIEW, applyTheme } from './settings-view';

const API = '/api';

interface OrgItem {
  id: number;
  name: string;
  description: string;
  color: string;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  endpoint: string;
  fetchHeaders: () => Record<string, string>;
}

function ConfigSection({ title, icon, description, endpoint, fetchHeaders }: SectionProps) {
  const [items, setItems] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API}${endpoint}`, { headers: fetchHeaders() });
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (adding) setTimeout(() => addInputRef.current?.focus(), 50);
  }, [adding]);

  async function saveNew() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems(prev => [...prev, item]);
        setAdding(false);
        setNewName('');
        setNewDesc('');
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: OrgItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDesc(item.description);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}${endpoint}/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems(prev => prev.map(i => i.id === editingId ? updated : i));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: number) {
    setDeletingId(id);
    try {
      await fetch(`${API}${endpoint}/${id}`, { method: 'DELETE', headers: fetchHeaders() });
      setItems(prev => prev.filter(i => i.id !== id));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-3">
          <span className="text-primary">{icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Items list */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
          </div>
        ) : items.length === 0 && !adding ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No {title.toLowerCase()} yet. Click Add to create one.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {items.map(item => (
              <div key={item.id} className="px-5 py-3.5">
                {editingId === item.id ? (
                  <div className="flex items-center gap-3">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                      placeholder="Name"
                      className="flex-1 text-sm bg-secondary/40 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50"
                    />
                    <input
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="Description (optional)"
                      className="flex-1 text-sm bg-secondary/40 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving || !editName.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 group">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Delete?</span>
                          <button
                            onClick={() => deleteItem(item.id)}
                            disabled={deletingId === item.id}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                          >
                            {deletingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add new form */}
            {adding && (
              <div className="px-5 py-3.5 bg-secondary/10">
                <div className="flex items-center gap-3">
                  <input
                    ref={addInputRef}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') { setAdding(false); setNewName(''); setNewDesc(''); } }}
                    placeholder={`${title.slice(0, -1)} name…`}
                    className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50"
                  />
                  <input
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={() => { setAdding(false); setNewName(''); setNewDesc(''); }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button
                    onClick={saveNew}
                    disabled={saving || !newName.trim()}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer count */}
      {!loading && (
        <div className="px-5 py-2 border-t border-border/50 bg-secondary/10">
          <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? title.slice(0, -1).toLowerCase() : title.toLowerCase()}</span>
        </div>
      )}
    </div>
  );
}

interface OrgProfile {
  id?: number;
  displayName: string;
  name: string;
  address: string;
  websiteUrl: string;
  contact1Name: string;
  contact1Phone: string;
  contact1Email: string;
  contact2Name: string;
  contact2Phone: string;
  contact2Email: string;
}

const EMPTY_PROFILE: OrgProfile = {
  displayName: '', name: '', address: '', websiteUrl: '',
  contact1Name: '', contact1Phone: '', contact1Email: '',
  contact2Name: '', contact2Phone: '', contact2Email: '',
};

function OrgProfileSection({ fetchHeaders }: { fetchHeaders: () => Record<string, string> }) {
  const [profile, setProfile] = useState<OrgProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/org/profile`, { headers: fetchHeaders() });
        if (r.ok) {
          const data = await r.json();
          setProfile({ ...EMPTY_PROFILE, ...data });
        }
      } finally { setLoading(false); }
    })();
  }, []);

  const handleChange = (field: keyof OrgProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setProfile(prev => ({ ...prev, [field]: e.target.value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/org/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify(profile),
      });
      if (r.ok) {
        const data = await r.json();
        setProfile({ ...EMPTY_PROFILE, ...data });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        // Sync sidebar company name from displayName, fall back to name
        const sidebarName = (data.displayName as string)?.trim() || (data.name as string)?.trim() || 'BusinessOS';
        localStorage.setItem('nonprofit-os-org-name', sidebarName);
        window.dispatchEvent(new CustomEvent('orgNameChanged', { detail: sidebarName }));
      }
    } finally { setSaving(false); }
  };

  const field = (label: string, icon: React.ReactNode, key: keyof OrgProfile, type: 'text' | 'email' | 'url' | 'tel' = 'text') => (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}{label}
      </label>
      <input
        type={type}
        value={(profile[key] as string) ?? ''}
        onChange={handleChange(key)}
        placeholder={label}
        className="w-full text-sm bg-secondary/40 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50 transition-colors"
      />
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-3">
          <span className="text-primary"><Building2 className="w-4 h-4" /></span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Organisation Profile</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Name, address, website and key contacts for your organisation</p>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
            saved
              ? "bg-green-500/10 text-green-600 border-green-500/20"
              : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
          )}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Organisation basics */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Building2 className="w-3 h-3" />Organisation Display Name
            </label>
            <input
              type="text"
              value={profile.displayName ?? ''}
              onChange={e => { setProfile(prev => ({ ...prev, displayName: e.target.value })); setSaved(false); }}
              placeholder="Name shown in the top-left of the app"
              className="w-full text-sm bg-secondary/40 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50 transition-colors"
            />
            <p className="text-[11px] text-muted-foreground">This is the name shown in the top-left corner of the application.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('Organisation Name', <Building2 className="w-3 h-3" />, 'name')}
            {field('Website URL', <Link className="w-3 h-3" />, 'websiteUrl', 'url')}
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="w-3 h-3" />Address
            </label>
            <textarea
              value={profile.address ?? ''}
              onChange={e => { setProfile(prev => ({ ...prev, address: e.target.value })); setSaved(false); }}
              placeholder="Street address, city, postcode, country"
              rows={2}
              className="w-full text-sm bg-secondary/40 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50 transition-colors resize-none"
            />
          </div>

          {/* Contacts */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Contact 1 */}
            <div className="space-y-3 p-4 bg-secondary/20 rounded-lg border border-border/50">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><User className="w-3 h-3 text-primary" />Contact 1</p>
              {field('Name', <User className="w-3 h-3" />, 'contact1Name')}
              {field('Phone', <Phone className="w-3 h-3" />, 'contact1Phone', 'tel')}
              {field('Email', <Mail className="w-3 h-3" />, 'contact1Email', 'email')}
            </div>
            {/* Contact 2 */}
            <div className="space-y-3 p-4 bg-secondary/20 rounded-lg border border-border/50">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><User className="w-3 h-3 text-primary" />Contact 2</p>
              {field('Name', <User className="w-3 h-3" />, 'contact2Name')}
              {field('Phone', <Phone className="w-3 h-3" />, 'contact2Phone', 'tel')}
              {field('Email', <Mail className="w-3 h-3" />, 'contact2Email', 'email')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemPromptSection({ fetchHeaders }: { fetchHeaders: () => Record<string, string> }) {
  const [prompt, setPrompt] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    fetch(`${API}/org/system-prompt`, { headers: fetchHeaders() })
      .then(r => r.json())
      .then(d => { setPrompt(d.systemPrompt ?? ''); setSaved(d.systemPrompt ?? ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveOk(false);
    try {
      const r = await fetch(`${API}/org/system-prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ systemPrompt: prompt }),
      });
      const d = await r.json();
      if (r.ok) { setSaved(d.systemPrompt ?? ''); setSaveOk(true); setTimeout(() => setSaveOk(false), 2500); }
    } catch {}
    setSaving(false);
  };

  const dirty = prompt !== saved;

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          <Bot className="w-4 h-4 text-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-sm">AI System Prompt</h3>
          <p className="text-xs text-muted-foreground">Custom instructions prepended to every AI conversation for this organisation</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={6}
              placeholder="Enter custom instructions for the AI assistant — e.g. tone, domain context, rules, or constraints specific to your organisation."
              className="w-full rounded-lg border border-border bg-background text-foreground text-sm px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default AI behaviour.
              </p>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all',
                  saveOk
                    ? 'bg-green-500/10 text-green-600'
                    : dirty
                    ? 'bg-primary text-primary-foreground hover:opacity-90'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed'
                )}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saveOk ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                {saving ? 'Saving…' : saveOk ? 'Saved' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ThemeCard({ themeId, active, onClick }: { themeId: string; active: boolean; onClick: () => void }) {
  const theme = THEMES.find(t => t.id === themeId);
  const preview = THEME_PREVIEW[themeId];
  if (!theme || !preview) return null;
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-start gap-2 p-3 rounded-xl border-2 transition-all text-left w-full',
        active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'
      )}
    >
      <div className="w-full h-10 rounded-lg flex items-center gap-1.5 px-2.5" style={{ backgroundColor: preview.bg }}>
        <div className="w-5 h-5 rounded" style={{ backgroundColor: preview.accent }} />
        <div className="flex flex-col gap-1 flex-1">
          <div className="h-1.5 rounded-full w-3/4" style={{ backgroundColor: preview.text }} />
          <div className="h-1.5 rounded-full w-1/2" style={{ backgroundColor: preview.text, opacity: 0.5 }} />
        </div>
      </div>
      <div className="flex items-center justify-between w-full">
        <div>
          <p className="text-xs font-semibold text-foreground">{theme.name}</p>
          <p className="text-[10px] text-muted-foreground">{theme.description}</p>
        </div>
        {active && <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center"><Check className="w-2.5 h-2.5 text-primary-foreground" /></div>}
      </div>
    </button>
  );
}

function ColourSchemeSection({ fetchHeaders }: { fetchHeaders: () => Record<string, string> }) {
  const { isAdmin } = useAuth();
  const [personalTheme, setPersonalTheme] = useState<string | null>(null);
  const [orgTheme, setOrgTheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [personalOk, setPersonalOk] = useState(false);
  const [orgOk, setOrgOk] = useState(false);

  useEffect(() => {
    fetch(`${API}/auth/color-scheme`, { headers: fetchHeaders() })
      .then(r => r.json())
      .then(d => { setPersonalTheme(d.personal ?? null); setOrgTheme(d.org ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const effectivePersonal = personalTheme ?? orgTheme ?? 'dark';

  const savePersonal = async (themeId: string) => {
    setPersonalTheme(themeId);
    applyTheme(themeId);
    setSavingPersonal(true);
    try {
      await fetch(`${API}/auth/color-scheme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ colorScheme: themeId }),
      });
      setPersonalOk(true);
      setTimeout(() => setPersonalOk(false), 2000);
    } catch {}
    setSavingPersonal(false);
  };

  const saveOrg = async (themeId: string) => {
    setOrgTheme(themeId);
    setSavingOrg(true);
    try {
      await fetch(`${API}/org/color-scheme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ colorScheme: themeId }),
      });
      setOrgOk(true);
      setTimeout(() => setOrgOk(false), 2000);
    } catch {}
    setSavingOrg(false);
  };

  if (loading) return (
    <div className="border border-border rounded-xl bg-card p-6 flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading colour scheme…
    </div>
  );

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          <Palette className="w-4 h-4 text-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground text-sm">Colour Scheme</h3>
          <p className="text-xs text-muted-foreground">Personalise how the application looks</p>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Personal theme */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-foreground">Your personal theme</p>
              <p className="text-xs text-muted-foreground">Only visible to you — overrides the organisation default</p>
            </div>
            {savingPersonal ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : personalOk ? (
              <span className="text-xs text-green-500 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
            ) : null}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {THEMES.map(t => (
              <ThemeCard
                key={t.id}
                themeId={t.id}
                active={effectivePersonal === t.id}
                onClick={() => savePersonal(t.id)}
              />
            ))}
          </div>
          {personalTheme && (
            <button
              onClick={async () => {
                setPersonalTheme(null);
                applyTheme(orgTheme ?? 'dark');
                await fetch(`${API}/auth/color-scheme`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
                  body: JSON.stringify({ colorScheme: null }),
                });
              }}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Reset to organisation default
            </button>
          )}
        </div>

        {/* Organisation theme — admin only */}
        {isAdmin && (
          <div className="border-t border-border pt-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-foreground">Organisation default theme</p>
                <p className="text-xs text-muted-foreground">Applies to all users who haven't set a personal theme</p>
              </div>
              {savingOrg ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : orgOk ? (
                <span className="text-xs text-green-500 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
              ) : null}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {THEMES.map(t => (
                <ThemeCard
                  key={t.id}
                  themeId={t.id}
                  active={(orgTheme ?? 'dark') === t.id}
                  onClick={() => saveOrg(t.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlueprintSection({ fetchHeaders }: { fetchHeaders: () => Record<string, string> }) {
  const API = '/api';
  const [exportName, setExportName] = useState('blueprint');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const parts = [
        `${s.processes} processes`,
        `${s.aiAgents} AI agents`,
        `${s.workflows} workflows`,
        `${s.groups} groups`,
        `${s.roles} roles`,
        `${s.businessUnits} business units`,
        `${s.regions} regions`,
        `${s.checklists} checklists`,
        `${s.initiatives} initiatives`,
        `${s.forms} documents`,
        `${s.strategicGoals} strategic goals`,
      ];
      setImportSuccess(`Blueprint imported successfully. Restored: ${parts.join(', ')}.`);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setImportError(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileArchive className="w-5 h-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Blueprint</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Export your entire workspace configuration and data as a blueprint file, or restore from a previously saved blueprint.
      </p>

      {/* Export */}
      <div className="bg-secondary/30 rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          <h4 className="font-medium text-sm">Export Blueprint</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Downloads all your workspace configuration — processes, workflows, AI agents, documents, strategic goals, groups, roles, governance records, checklists, dashboards, and initiatives — as a single JSON file.
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
    </div>
  );
}

export function ConfigurationView() {
  const { fetchHeaders, isAdmin } = useAuth();

  const sections = [
    {
      title: 'Business Units',
      icon: <Building2 className="w-4 h-4" />,
      description: 'Define the business units available across your organisation',
      endpoint: '/org/business-units',
    },
    {
      title: 'Regions',
      icon: <Globe className="w-4 h-4" />,
      description: 'Define the geographic regions used for categorising users and processes',
      endpoint: '/org/regions',
    },
    {
      title: 'User Categories',
      icon: <User className="w-4 h-4" />,
      description: 'Configure the category types available when creating or editing users (e.g. Employee, Director, Customer)',
      endpoint: '/org/user-categories',
    },
    {
      title: 'Task Sources',
      icon: <ListTodo className="w-4 h-4" />,
      description: 'Define the sources that tasks can originate from (e.g. Employees, AI Agents)',
      endpoint: '/org/task-sources',
    },
    {
      title: 'Queues',
      icon: <Layers className="w-4 h-4" />,
      description: 'Define task queues for organising and routing tasks (e.g. General, Board Meetings)',
      endpoint: '/org/task-queues',
    },
    {
      title: 'Activity Modes',
      icon: <Activity className="w-4 h-4" />,
      description: 'Define the communication modes available when logging activities (e.g. Phone, Email, WhatsApp)',
      endpoint: '/org/activity-modes',
    },
  ];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Page header */}
      <div className="flex-none px-6 py-5 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground">Configuration</h1>
            <p className="text-sm text-muted-foreground">Manage lookup values used across the system</p>
          </div>
        </div>
      </div>

      {/* Breadcrumb hint */}
      <div className="flex-none px-6 py-2 border-b border-border/50 bg-secondary/10">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Admin</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">Configuration</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <OrgProfileSection fetchHeaders={fetchHeaders} />
          <ColourSchemeSection fetchHeaders={fetchHeaders} />
          <SystemPromptSection fetchHeaders={fetchHeaders} />
          {sections.map(s => (
            <ConfigSection
              key={s.endpoint}
              title={s.title}
              icon={s.icon}
              description={s.description}
              endpoint={s.endpoint}
              fetchHeaders={fetchHeaders}
            />
          ))}
          {isAdmin && <BlueprintSection fetchHeaders={fetchHeaders} />}
        </div>
      </div>
    </div>
  );
}
