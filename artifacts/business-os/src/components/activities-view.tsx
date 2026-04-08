import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Phone, Mail, Share2, MessageSquare, MessageCircle,
  FileText, Database, Box, MoreHorizontal, Search, X, ChevronRight, Link2,
  Unlink, Activity, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

// Icon lookup: maps icon slug stored in DB → Lucide component
const ICON_MAP: Record<string, LucideIcon> = {
  'phone':          Phone,
  'mail':           Mail,
  'share2':         Share2,
  'message-square': MessageSquare,
  'message-circle': MessageCircle,
  'file-text':      FileText,
  'database':       Database,
  'box':            Box,
  'more-horizontal': MoreHorizontal,
  'activity':       Activity,
};

function getIcon(slug: string): LucideIcon {
  return ICON_MAP[slug] ?? Activity;
}

// Dynamic mode type (loaded from API)
interface ActivityModeConfig {
  id: number;
  name: string;
  description: string;
  color: string;
  icon: string;
}

interface ActivityRow {
  id: number;
  activityNumber: number;
  name: string;
  mode: string;
  description: string;
  tenantId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Process {
  id: number;
  number: number;
  processName: string;
  processDescription: string;
  category: string;
}

function parseModes(mode: string): string[] {
  return mode ? mode.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function hexToRgb(hex: string) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return '148,163,184';
  return m.map(x => parseInt(x, 16)).join(',');
}

function ModeBadge({ mode, modes }: { mode: string; modes: ActivityModeConfig[] }) {
  const modeNames = parseModes(mode);
  if (modeNames.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {modeNames.map(mv => {
        const cfg = modes.find(m => m.name.toLowerCase() === mv.toLowerCase()) ?? modes[modes.length - 1];
        const Icon = cfg ? getIcon(cfg.icon) : Activity;
        const color = cfg?.color ?? '#94a3b8';
        const rgb = hexToRgb(color);
        return (
          <span
            key={mv}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: `rgba(${rgb},0.15)`, color, border: `1px solid rgba(${rgb},0.3)` }}
          >
            <Icon className="w-3 h-3" />
            {cfg?.name ?? mv}
          </span>
        );
      })}
    </span>
  );
}

function ModeSelector({ value, onChange, modes }: { value: string[]; onChange: (v: string[]) => void; modes: ActivityModeConfig[] }) {
  function toggle(name: string) {
    if (value.includes(name)) {
      onChange(value.filter(v => v !== name));
    } else {
      onChange([...value, name]);
    }
  }
  if (modes.length === 0) {
    return <div className="flex items-center justify-center py-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading modes…</div>;
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {modes.map(m => {
        const Icon = getIcon(m.icon);
        const selected = value.includes(m.name);
        const rgb = hexToRgb(m.color);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.name)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all',
              selected
                ? 'font-medium'
                : 'border-border hover:border-primary/40 hover:bg-secondary/50 text-muted-foreground',
            )}
            style={selected ? {
              borderColor: `rgba(${rgb},0.6)`,
              backgroundColor: `rgba(${rgb},0.1)`,
              color: m.color,
            } : {}}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{m.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ActivitiesView() {
  const { fetchHeaders } = useAuth();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [activityModes, setActivityModes] = useState<ActivityModeConfig[]>([]);

  const [editName, setEditName] = useState('');
  const [editMode, setEditMode] = useState<string[]>([]);
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [linkedProcesses, setLinkedProcesses] = useState<Process[]>([]);
  const [allProcesses, setAllProcesses] = useState<Process[]>([]);
  const [linkingOpen, setLinkingOpen] = useState(false);
  const [processSearch, setProcessSearch] = useState('');
  const [loadingProcesses, setLoadingProcesses] = useState(false);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/activities`, { headers: fetchHeaders() });
      const data = await r.json();
      setActivities(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [fetchHeaders]);

  const loadModes = useCallback(async () => {
    try {
      const r = await fetch(`${API}/org/activity-modes`, { headers: fetchHeaders() });
      if (r.ok) setActivityModes(await r.json());
    } catch {}
  }, [fetchHeaders]);

  useEffect(() => { loadActivities(); loadModes(); }, [loadActivities, loadModes]);

  function openActivity(a: ActivityRow) {
    setSelected(a);
    setCreating(false);
    setEditName(a.name);
    setEditMode(parseModes(a.mode));
    setEditDesc(a.description);
    setDirty(false);
    setLinkingOpen(false);
    loadLinkedProcesses(a.id);
  }

  function startCreate() {
    setSelected(null);
    setCreating(true);
    setEditName('');
    setEditMode([]);
    setEditDesc('');
    setDirty(false);
    setLinkingOpen(false);
    setLinkedProcesses([]);
  }

  async function loadLinkedProcesses(activityId: number) {
    setLoadingProcesses(true);
    try {
      const r = await fetch(`${API}/activities/${activityId}/processes`, { headers: fetchHeaders() });
      const data = await r.json();
      setLinkedProcesses(Array.isArray(data) ? data : []);
    } finally {
      setLoadingProcesses(false);
    }
  }

  async function loadAllProcesses() {
    const r = await fetch(`${API}/processes`, { headers: fetchHeaders() });
    const data = await r.json();
    setAllProcesses(Array.isArray(data) ? data : []);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (creating) {
        const r = await fetch(`${API}/activities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify({ name: editName, mode: editMode.join(','), description: editDesc }),
        });
        const newA = await r.json();
        await loadActivities();
        setCreating(false);
        openActivity(newA);
      } else if (selected) {
        await fetch(`${API}/activities/${selected.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify({ name: editName, mode: editMode.join(','), description: editDesc }),
        });
        await loadActivities();
        setSelected(prev => prev ? { ...prev, name: editName, mode: editMode.join(','), description: editDesc } : null);
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this activity?')) return;
    await fetch(`${API}/activities/${id}`, { method: 'DELETE', headers: fetchHeaders() });
    if (selected?.id === id) { setSelected(null); setCreating(false); }
    loadActivities();
  }

  async function linkProcess(processId: number) {
    if (!selected) return;
    await fetch(`${API}/processes/${processId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
      body: JSON.stringify({ activityId: selected.id }),
    });
    loadLinkedProcesses(selected.id);
  }

  async function unlinkProcess(processId: number) {
    if (!selected) return;
    await fetch(`${API}/processes/${processId}/activities/${selected.id}`, {
      method: 'DELETE',
      headers: fetchHeaders(),
    });
    loadLinkedProcesses(selected.id);
  }

  const filtered = activities.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.mode.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredAllProcesses = allProcesses.filter(p =>
    (p.processName || p.processDescription || '').toLowerCase().includes(processSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(processSearch.toLowerCase()),
  );

  const linkedIds = new Set(linkedProcesses.map(p => p.id));

  const panelOpen = creating || selected !== null;

  return (
    <div className="flex h-full bg-background">
      {/* ── Left: List ─────────────────────────────────────────────────────── */}
      <div className={cn('flex flex-col border-r border-border bg-card transition-all', panelOpen ? 'w-96' : 'flex-1')}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-base flex-1">Activities</h2>
          <Button size="sm" onClick={startCreate} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search activities…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
              <Activity className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No activities match your search.' : 'No activities yet. Create one to get started.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-12">#</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Mode</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr
                    key={a.id}
                    onClick={() => openActivity(a)}
                    className={cn(
                      'border-b border-border/50 cursor-pointer transition-colors hover:bg-secondary/30',
                      selected?.id === a.id ? 'bg-primary/5 border-l-2 border-l-primary' : '',
                    )}
                  >
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{a.activityNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium truncate max-w-[180px]" title={a.name}>{a.name}</div>
                      {a.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{a.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ModeBadge mode={a.mode} modes={activityModes} />
                    </td>
                    <td className="px-2 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(a.id); }}
                        className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Right: Detail / Create Panel ───────────────────────────────────── */}
      {panelOpen && (
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* Panel Header */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card">
            {creating ? (
              <span className="text-sm font-medium text-muted-foreground">New Activity</span>
            ) : (
              <>
                <span className="text-xs text-muted-foreground font-mono">#{selected?.activityNumber}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm font-medium truncate flex-1">{selected?.name}</span>
                <ModeBadge mode={selected?.mode ?? ''} modes={activityModes} />
              </>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {dirty && !creating && (
                <>
                  <Button size="sm" variant="outline" onClick={() => selected && openActivity(selected)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </>
              )}
              <button
                onClick={() => { setSelected(null); setCreating(false); }}
                className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Activity Name</label>
              <Input
                value={editName}
                onChange={e => { setEditName(e.target.value); setDirty(true); }}
                placeholder="Enter activity name…"
                className="text-base"
              />
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Activity Mode</label>
              <ModeSelector value={editMode} onChange={v => { setEditMode(v); setDirty(true); }} modes={activityModes} />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                value={editDesc}
                onChange={e => { setEditDesc(e.target.value); setDirty(true); }}
                placeholder="Describe what this activity involves…"
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Save / Create button */}
            <div className="flex gap-2">
              {creating ? (
                <>
                  <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saving || !editName.trim()} className="gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> {saving ? 'Creating…' : 'Create Activity'}
                  </Button>
                </>
              ) : dirty ? (
                <>
                  <Button variant="outline" onClick={() => selected && openActivity(selected)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </>
              ) : null}
            </div>

            {/* ── Linked Processes ────────────────────────────────────────── */}
            {!creating && selected && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground" />
                    Linked Processes
                    {linkedProcesses.length > 0 && (
                      <span className="text-xs bg-secondary px-1.5 py-0.5 rounded-full">{linkedProcesses.length}</span>
                    )}
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => {
                      setLinkingOpen(!linkingOpen);
                      if (!linkingOpen) { setProcessSearch(''); loadAllProcesses(); }
                    }}
                  >
                    <Plus className="w-3 h-3" /> Link Process
                  </Button>
                </div>

                {/* Process linker */}
                {linkingOpen && (
                  <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={processSearch}
                        onChange={e => setProcessSearch(e.target.value)}
                        placeholder="Search processes…"
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredAllProcesses.slice(0, 50).map(p => {
                        const linked = linkedIds.has(p.id);
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-mono text-muted-foreground mr-2">#{p.number}</span>
                              <span className="text-sm truncate">{p.processName || p.processDescription}</span>
                            </div>
                            <button
                              onClick={() => linked ? unlinkProcess(p.id) : linkProcess(p.id)}
                              className={cn(
                                'ml-2 shrink-0 p-1.5 rounded transition-colors',
                                linked
                                  ? 'text-destructive hover:bg-destructive/10'
                                  : 'text-primary hover:bg-primary/10',
                              )}
                              title={linked ? 'Unlink' : 'Link'}
                            >
                              {linked ? <Unlink className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        );
                      })}
                      {filteredAllProcesses.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No processes found.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Linked list */}
                {loadingProcesses ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : linkedProcesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No processes linked yet.</p>
                ) : (
                  <div className="space-y-1">
                    {linkedProcesses.map(p => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-mono text-muted-foreground mr-2">#{p.number}</span>
                          <span className="text-sm font-medium">{p.processName || p.processDescription}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{p.category}</span>
                        </div>
                        <button
                          onClick={() => unlinkProcess(p.id)}
                          className="ml-2 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Unlink"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
