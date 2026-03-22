import { useState, useEffect, useRef } from 'react';
import { Settings2, Plus, Pencil, Trash2, Check, X, Building2, Globe, ChevronRight, Loader2, MapPin, Link, Phone, Mail, User, Save, ListTodo, Layers, Activity, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#94a3b8', '#f1f5f9',
];

interface OrgItem {
  id: number;
  name: string;
  description: string;
  color: string;
}

function ColorSwatch({ color, size = 'sm' }: { color: string; size?: 'sm' | 'lg' }) {
  const sz = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  return (
    <span
      className={cn("rounded-full flex-shrink-0 border border-black/10", sz)}
      style={{ backgroundColor: color || '#94a3b8' }}
    />
  );
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
  const [editColor, setEditColor] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
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
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), color: newColor }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems(prev => [...prev, item]);
        setAdding(false);
        setNewName('');
        setNewDesc('');
        setNewColor(PRESET_COLORS[0]);
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: OrgItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDesc(item.description);
    setEditColor(item.color || PRESET_COLORS[0]);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}${endpoint}/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim(), color: editColor }),
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
                  /* Inline edit form */
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <ColorSwatch color={editColor} size="lg" />
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
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Color:</span>
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className={cn(
                            "w-5 h-5 rounded-full border-2 transition-all",
                            editColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <div className="ml-auto flex items-center gap-2">
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
                    </div>
                  </div>
                ) : (
                  /* Display row */
                  <div className="flex items-center gap-3 group">
                    <ColorSwatch color={item.color} size="lg" />
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
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <ColorSwatch color={newColor} size="lg" />
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
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Color:</span>
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewColor(c)}
                        className={cn(
                          "w-5 h-5 rounded-full border-2 transition-all",
                          newColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <div className="ml-auto flex items-center gap-2">
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
  name: '', address: '', websiteUrl: '',
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

export function ConfigurationView() {
  const { fetchHeaders } = useAuth();

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
        </div>
      </div>
    </div>
  );
}
