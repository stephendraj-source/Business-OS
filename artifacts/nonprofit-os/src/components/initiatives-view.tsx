import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Check, Loader2, Trash2, ChevronRight, Link, FileText,
  CalendarDays, Target, Trophy, Users, GitBranch, Search, Pencil,
  ExternalLink, Flag, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InitiativeRow {
  id: number;
  initiative_id: string;
  initiativeId?: string;
  name: string;
  goals: string;
  achievement: string;
  start_date?: string | null;
  end_date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
  created_at?: string;
  goal_id: number | null;
  goal_title: string | null;
  goal_color: string | null;
  goal_number: number | null;
}

function ini_id(ini: InitiativeRow) { return ini.initiativeId ?? ini.initiative_id; }
function ini_start(ini: InitiativeRow) { return ini.startDate ?? ini.start_date ?? null; }
function ini_end(ini: InitiativeRow) { return ini.endDate ?? ini.end_date ?? null; }

interface InitiativeUrl { id?: number; label: string; url: string; }
interface InitiativeAssignee { id: number; name: string; email: string; designation: string; }
interface InitiativeProcess { id: number; processName: string; processDescription: string; category: string; number: number; }

interface StrategicGoalRef { id: number; goal_number: number; title: string; color: string; status: string; }

interface InitiativeDetail extends InitiativeRow {
  urls: InitiativeUrl[];
  assignees: InitiativeAssignee[];
  processes: InitiativeProcess[];
}

interface UserRow { id: number; name: string; email: string; designation: string; }
interface ProcessMeta { id: number; processName: string; processDescription: string; category: string; number: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusColor(ini: InitiativeRow) {
  const s = ini_start(ini); const e = ini_end(ini);
  if (!s || !e) return 'bg-muted text-muted-foreground';
  const now = new Date();
  if (now > new Date(e)) return 'bg-muted/60 text-muted-foreground';
  if (now < new Date(s)) return 'bg-blue-500/15 text-blue-400';
  return 'bg-green-500/15 text-green-400';
}

function statusLabel(ini: InitiativeRow) {
  const s = ini_start(ini); const e = ini_end(ini);
  if (!s || !e) return 'No Dates';
  const now = new Date();
  if (now > new Date(e)) return 'Completed';
  if (now < new Date(s)) return 'Upcoming';
  return 'Active';
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function InitiativesView() {
  const { fetchHeaders } = useAuth();
  const [initiatives, setInitiatives] = useState<InitiativeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<InitiativeDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/initiatives`, { headers: fetchHeaders() });
      if (r.ok) setInitiatives(await r.json());
    } finally { setLoading(false); }
  }, [fetchHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openDetail = async (ini: InitiativeRow) => {
    const r = await fetch(`${API}/initiatives/${ini.id}`, { headers: fetchHeaders() });
    if (r.ok) setSelected(await r.json());
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await fetch(`${API}/initiatives/${id}`, { method: 'DELETE', headers: fetchHeaders() });
    setConfirmDelete(null);
    if (selected?.id === id) setSelected(null);
    await fetchAll();
  };

  const filtered = initiatives.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    ini_id(i).toLowerCase().includes(search.toLowerCase())
  );

  // Group by goal
  const groupedByGoal: { goalId: number | null; goalTitle: string | null; goalColor: string | null; goalNumber: number | null; items: InitiativeRow[] }[] = [];
  const seen = new Map<number | null, number>();
  for (const ini of filtered) {
    const key = ini.goal_id;
    if (!seen.has(key)) {
      seen.set(key, groupedByGoal.length);
      groupedByGoal.push({ goalId: key, goalTitle: ini.goal_title, goalColor: ini.goal_color, goalNumber: ini.goal_number, items: [] });
    }
    groupedByGoal[seen.get(key)!].items.push(ini);
  }

  return (
    <div className="flex h-full">
      {/* Left — list */}
      <div className={cn('flex flex-col h-full transition-all duration-300', selected ? 'w-[400px] flex-shrink-0' : 'flex-1')}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h1 className="text-2xl font-display font-bold">Initiatives</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Strategic initiatives linked to goals</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
            <Plus className="w-4 h-4" /> Add Initiative
          </button>
        </div>

        {/* Search */}
        <div className="flex-none px-6 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search initiatives…"
              className="w-full pl-9 pr-3 py-2 bg-secondary/60 rounded-lg text-sm border border-transparent focus:outline-none focus:border-primary focus:bg-background transition" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Flag className="w-10 h-10 mb-3 opacity-25" />
              <p className="text-sm">{search ? 'No initiatives match your search' : 'No initiatives yet — click Add Initiative'}</p>
            </div>
          ) : (
            <div>
              {groupedByGoal.map(group => (
                <div key={group.goalId ?? 'ungrouped'}>
                  {/* Goal group header */}
                  <div className="flex items-center gap-2 px-6 py-2 bg-secondary/30 border-b border-border sticky top-0 z-10">
                    {group.goalId ? (
                      <>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.goalColor ?? '#6366f1' }} />
                        <span className="text-[10px] font-mono text-muted-foreground">GOAL-{String(group.goalNumber).padStart(3, '0')}</span>
                        <span className="text-xs font-semibold text-foreground truncate">{group.goalTitle}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{group.items.length} initiative{group.items.length !== 1 ? 's' : ''}</span>
                      </>
                    ) : (
                      <>
                        <Flag className="w-3 h-3 text-muted-foreground/50" />
                        <span className="text-xs font-semibold text-muted-foreground/60">No Goal Assigned</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{group.items.length}</span>
                      </>
                    )}
                  </div>
                  {/* Initiatives in this goal */}
                  <div className="divide-y divide-border">
                    {group.items.map(ini => (
                      <div
                        key={ini.id}
                        role="button" tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter') openDetail(ini); }}
                        onClick={() => openDetail(ini)}
                        className={cn('group flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-secondary/40 transition-colors', selected?.id === ini.id && 'bg-primary/5')}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-mono font-semibold text-muted-foreground">{ini_id(ini)}</span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', statusColor(ini))}>{statusLabel(ini)}</span>
                          </div>
                          <div className="text-sm font-medium truncate">{ini.name}</div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{fmtDate(ini_start(ini))}</span>
                            <ChevronRight className="w-3 h-3" />
                            <span>{fmtDate(ini_end(ini))}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {confirmDelete === ini.id ? (
                            <>
                              <button onClick={e => handleDelete(ini.id, e)}
                                className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold">Confirm</button>
                              <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                                className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground font-semibold">Cancel</button>
                            </>
                          ) : (
                            <button onClick={e => handleDelete(ini.id, e)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right — detail panel */}
      {selected && (
        <InitiativeDetail
          initiative={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            await fetchAll();
            const r = await fetch(`${API}/initiatives/${selected.id}`, { headers: fetchHeaders() });
            if (r.ok) setSelected(await r.json());
          }}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateInitiativeModal
          onClose={() => setShowCreate(false)}
          onCreate={async (ini) => { await fetchAll(); setShowCreate(false); openDetail(ini); }}
        />
      )}
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

type DetailTab = 'overview' | 'urls' | 'assignees' | 'processes' | 'goals';

function InitiativeDetail({ initiative, onClose, onSaved }: {
  initiative: InitiativeDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [saveMsg, setSaveMsg] = useState('');

  const showSave = () => { setSaveMsg('Saved ✓'); setTimeout(() => setSaveMsg(''), 2000); };

  return (
    <div className="flex-1 min-w-0 flex flex-col border-l border-border bg-card/40 h-full">
      {/* Header */}
      <div className="flex-none flex items-start justify-between px-6 py-4 border-b border-border gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-mono font-semibold text-muted-foreground">{ini_id(initiative)}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', statusColor(initiative))}>{statusLabel(initiative)}</span>
            {initiative.goal_id && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-secondary text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: initiative.goal_color ?? '#6366f1' }} />
                {initiative.goal_title}
              </span>
            )}
          </div>
          <div className="font-semibold text-base leading-tight truncate">{initiative.name}</div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <CalendarDays className="w-3 h-3" />
            <span>{fmtDate(ini_start(initiative))}</span>
            <span>—</span>
            <span>{fmtDate(ini_end(initiative))}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saveMsg && <span className="text-xs text-green-400 font-medium">{saveMsg}</span>}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-none flex border-b border-border px-6 gap-0">
        {([
          { key: 'overview', label: 'Overview', icon: Target },
          { key: 'urls', label: `Links (${initiative.urls.length})`, icon: Link },
          { key: 'assignees', label: `People (${initiative.assignees.length})`, icon: Users },
          { key: 'processes', label: `Processes (${initiative.processes.length})`, icon: GitBranch },
          { key: 'goals', label: 'Strategic Goals', icon: Flag },
        ] as { key: DetailTab; label: string; icon: React.ElementType }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && <OverviewTab initiative={initiative} onSaved={async () => { await onSaved(); showSave(); }} />}
        {tab === 'urls' && <UrlsTab initiative={initiative} onSaved={async () => { await onSaved(); showSave(); }} />}
        {tab === 'assignees' && <AssigneesTab initiative={initiative} onSaved={async () => { await onSaved(); showSave(); }} />}
        {tab === 'processes' && <ProcessesTab initiative={initiative} onSaved={async () => { await onSaved(); showSave(); }} />}
        {tab === 'goals' && <GoalsTab initiative={initiative} />}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ initiative, onSaved }: { initiative: InitiativeDetail; onSaved: () => Promise<void> }) {
  const { fetchHeaders } = useAuth();
  const init = () => ({
    name: initiative.name,
    goals: initiative.goals,
    achievement: initiative.achievement,
    startDate: ini_start(initiative) ?? '',
    endDate: ini_end(initiative) ?? '',
    goalId: initiative.goal_id ?? '',
  });
  const [form, setForm] = useState(init);
  const [saving, setSaving] = useState(false);
  const [allGoals, setAllGoals] = useState<StrategicGoalRef[]>([]);

  useEffect(() => { setForm(init()); }, [initiative.id]);
  useEffect(() => {
    fetch(`${API}/strategic-goals`, { headers: fetchHeaders() }).then(r => r.json()).then(d => { if (Array.isArray(d)) setAllGoals(d); }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/initiatives/${initiative.id}`, {
        method: 'PATCH', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, goals: form.goals, achievement: form.achievement, startDate: form.startDate || null, endDate: form.endDate || null, goalId: form.goalId || null }),
      });
      await onSaved();
    } finally { setSaving(false); }
  };

  const field = (label: string, key: keyof typeof form, type = 'text', multiline = false) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      {multiline ? (
        <textarea value={form[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} rows={4}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
      ) : (
        <input type={type} value={form[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-5 max-w-xl">
      {field('Initiative Name', 'name')}
      {/* Strategic Goal selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Flag className="w-3 h-3" /> Strategic Goal
        </label>
        <select
          value={form.goalId ?? ''}
          onChange={e => setForm(f => ({ ...f, goalId: e.target.value ? Number(e.target.value) : '' }))}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">— No goal —</option>
          {allGoals.map(g => (
            <option key={g.id} value={g.id}>
              GOAL-{String(g.goal_number).padStart(3, '0')} · {g.title}
            </option>
          ))}
        </select>
        {allGoals.length === 0 && <p className="text-xs text-muted-foreground italic">No strategic goals defined yet. Create goals in Strategic Planning.</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {field('Start Date', 'startDate', 'date')}
        {field('End Date', 'endDate', 'date')}
      </div>
      {field('Goals / Notes', 'goals', 'text', true)}
      {field('Achievement', 'achievement', 'text', true)}
      <div className="flex items-center gap-3">
        <button onClick={() => setForm(init())} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
          <X className="w-4 h-4" /> Cancel
        </button>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  );
}

// ── URLs Tab ──────────────────────────────────────────────────────────────────

function UrlsTab({ initiative, onSaved }: { initiative: InitiativeDetail; onSaved: () => Promise<void> }) {
  const { fetchHeaders } = useAuth();
  const [urls, setUrls] = useState<InitiativeUrl[]>(initiative.urls.length > 0 ? initiative.urls : []);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setUrls(initiative.urls); }, [initiative.id]);

  const add = () => setUrls(u => [...u, { label: '', url: '' }]);
  const remove = (i: number) => setUrls(u => u.filter((_, idx) => idx !== i));
  const update = (i: number, key: 'label' | 'url', val: string) =>
    setUrls(u => u.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/initiatives/${initiative.id}/urls`, {
        method: 'PUT', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urls.filter(u => u.url) }),
      });
      await onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-4 max-w-xl">
      <p className="text-xs text-muted-foreground">Attach links to documents, reports, external resources, or anything relevant to this initiative.</p>

      <div className="space-y-3">
        {urls.length === 0 && (
          <div className="flex flex-col items-center py-8 text-muted-foreground/50">
            <Link className="w-8 h-8 mb-2" />
            <p className="text-xs">No links yet — click Add Link</p>
          </div>
        )}
        {urls.map((u, i) => (
          <div key={i} className="flex items-start gap-2 p-3 rounded-xl border border-border bg-secondary/20">
            <div className="flex-1 space-y-2 min-w-0">
              <input value={u.label} onChange={e => update(i, 'label', e.target.value)} placeholder="Label (e.g. Project Brief)"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              <div className="flex items-center gap-2">
                <input value={u.url} onChange={e => update(i, 'url', e.target.value)} placeholder="https://…"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                {u.url && (
                  <a href={u.url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
            <button onClick={() => remove(i)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors mt-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={add}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
          <Plus className="w-4 h-4" /> Add Link
        </button>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Links
        </button>
      </div>
    </div>
  );
}

// ── Assignees Tab ─────────────────────────────────────────────────────────────

function AssigneesTab({ initiative, onSaved }: { initiative: InitiativeDetail; onSaved: () => Promise<void> }) {
  const { fetchHeaders } = useAuth();
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set(initiative.assignees.map(a => a.id)));
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API}/users`, { headers: fetchHeaders() }).then(r => r.json()).then(setAllUsers);
  }, []);

  useEffect(() => {
    setSel(new Set(initiative.assignees.map(a => a.id)));
  }, [initiative.id]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/initiatives/${initiative.id}/assignees`, {
        method: 'PUT', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(sel) }),
      });
      await onSaved();
    } finally { setSaving(false); }
  };

  const filtered = allUsers.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-muted-foreground">{sel.size} user{sel.size !== 1 ? 's' : ''} assigned to this initiative.</p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
          className="w-full pl-9 pr-3 py-2 bg-secondary/60 rounded-lg text-xs border border-transparent focus:outline-none focus:border-primary" />
      </div>

      <div className="border border-border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
        {allUsers.length === 0 ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">No users match</div>
        ) : filtered.map(u => (
          <label key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
            <input type="checkbox" checked={sel.has(u.id)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} className="accent-primary" />
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold flex-shrink-0">
              {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium">{u.name}</div>
              {u.designation && <div className="text-xs text-muted-foreground italic">{u.designation}</div>}
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>
          </label>
        ))}
      </div>

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save Assignees
      </button>
    </div>
  );
}

// ── Processes Tab ─────────────────────────────────────────────────────────────

const CATS = [
  'Strategy & Governance', 'Technology & Data', 'Programs & Services', 'Finance & Compliance',
  'HR & Talent', 'Fundraising & Development', 'Marketing & Communications', 'Operations & Facilities',
];

function ProcessesTab({ initiative, onSaved }: { initiative: InitiativeDetail; onSaved: () => Promise<void> }) {
  const { fetchHeaders } = useAuth();
  const [allProcesses, setAllProcesses] = useState<ProcessMeta[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set(initiative.processes.map(p => p.id)));
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${API}/processes`, { headers: fetchHeaders() }).then(r => r.json()).then(setAllProcesses);
  }, []);

  useEffect(() => {
    setSel(new Set(initiative.processes.map(p => p.id)));
  }, [initiative.id]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/initiatives/${initiative.id}/processes`, {
        method: 'PUT', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ processIds: Array.from(sel) }),
      });
      await onSaved();
    } finally { setSaving(false); }
  };

  const filtered = allProcesses.filter(p => {
    const matchSearch = !search || p.processName?.toLowerCase().includes(search.toLowerCase()) || p.processDescription?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const byCat = CATS.reduce<Record<string, ProcessMeta[]>>((acc, cat) => {
    const inCat = filtered.filter(p => p.category === cat);
    if (inCat.length > 0) acc[cat] = inCat;
    return acc;
  }, {});

  const toggleCat = (cat: string) => setExpanded(s => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-muted-foreground">{sel.size} process{sel.size !== 1 ? 'es' : ''} linked to this initiative.</p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search processes…"
            className="w-full pl-9 pr-3 py-2 bg-secondary/60 rounded-lg text-xs border border-transparent focus:outline-none focus:border-primary" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="bg-secondary/60 rounded-lg px-2 py-2 text-xs border border-transparent focus:outline-none focus:border-primary">
          <option value="">All Categories</option>
          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {allProcesses.length === 0 ? (
        <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
          {Object.entries(byCat).map(([cat, procs]) => (
            <div key={cat}>
              <button onClick={() => toggleCat(cat)}
                className="w-full flex items-center justify-between px-3 py-2 bg-secondary/60 text-xs font-semibold text-muted-foreground hover:bg-secondary/80 transition-colors sticky top-0 z-10">
                <span>{cat} ({procs.filter(p => sel.has(p.id)).length}/{procs.length})</span>
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded.has(cat) ? 'rotate-180' : '')} />
              </button>
              {!expanded.has(cat) && procs.map(p => (
                <label key={p.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-secondary/30 cursor-pointer transition-colors border-t border-border/50">
                  <input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="accent-primary mt-0.5" />
                  <div>
                    <div className="text-xs font-medium">{p.processName || p.processDescription}</div>
                    {p.processName && <div className="text-[10px] text-muted-foreground">{p.processDescription}</div>}
                  </div>
                </label>
              ))}
            </div>
          ))}
          {Object.keys(byCat).length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">No processes match</div>
          )}
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save Linked Processes
      </button>
    </div>
  );
}

// ── Goals Tab ──────────────────────────────────────────────────────────────────

function GoalsTab({ initiative }: { initiative: InitiativeDetail }) {
  const { fetchHeaders } = useAuth();
  const [allGoals, setAllGoals] = useState<{ id: number; goal_number: number; title: string; status: string; color: string }[]>([]);
  const [linkedIds, setLinkedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/strategic-goals`, { headers: fetchHeaders() }).then(r => r.json()).catch(() => []),
      fetch(`${API}/initiatives/${initiative.id}/strategic-goals`, { headers: fetchHeaders() }).then(r => r.json()).catch(() => []),
    ]).then(([all, linked]) => {
      setAllGoals(Array.isArray(all) ? all : []);
      setLinkedIds(Array.isArray(linked) ? linked.map((g: any) => g.id) : []);
    });
  }, [initiative.id]);

  const toggle = async (goalId: number) => {
    const next = linkedIds.includes(goalId)
      ? linkedIds.filter(id => id !== goalId)
      : [...linkedIds, goalId];
    setLinkedIds(next);
    setSaving(true);
    try {
      await fetch(`${API}/initiatives/${initiative.id}/strategic-goals`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_ids: next }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Linked Strategic Goals</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Link this initiative to one or more strategic goals.</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {saved && <span className="text-xs text-green-400 font-medium">Saved ✓</span>}
        </div>
      </div>

      {allGoals.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No strategic goals defined yet. Create goals in Strategic Planning.</p>
      ) : (
        <div className="space-y-1.5">
          {allGoals.map(goal => {
            const checked = linkedIds.includes(goal.id);
            return (
              <button
                key={goal.id}
                onClick={() => toggle(goal.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                  checked
                    ? 'bg-primary/10 border-primary/30 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'
                )}
              >
                <div className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', checked ? 'bg-primary border-primary' : 'border-muted-foreground/40')}>
                  {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: goal.color }} />
                <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
                  GOAL-{String(goal.goal_number).padStart(3, '0')}
                </span>
                <span className="text-sm truncate flex-1">{goal.title}</span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0',
                  goal.status === 'active' ? 'bg-green-500/15 text-green-400' :
                  goal.status === 'achieved' ? 'bg-blue-500/15 text-blue-400' :
                  goal.status === 'paused' ? 'bg-yellow-500/15 text-yellow-400' :
                  'bg-muted text-muted-foreground'
                )}>
                  {goal.status}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {linkedIds.length > 0 && (
        <p className="text-xs text-muted-foreground pt-1">
          {linkedIds.length} goal{linkedIds.length !== 1 ? 's' : ''} linked · changes save automatically
        </p>
      )}
    </div>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────

function CreateInitiativeModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (ini: InitiativeRow) => void;
}) {
  const { fetchHeaders } = useAuth();
  const [form, setForm] = useState({ name: '', goals: '', startDate: '', endDate: '', goalId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allGoals, setAllGoals] = useState<StrategicGoalRef[]>([]);

  useEffect(() => {
    fetch(`${API}/strategic-goals`, { headers: fetchHeaders() }).then(r => r.json()).then(d => { if (Array.isArray(d)) setAllGoals(d); }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!form.name) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`${API}/initiatives`, {
        method: 'POST', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, goals: form.goals, startDate: form.startDate || null, endDate: form.endDate || null, goalId: form.goalId ? Number(form.goalId) : null }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.error || 'Failed'); return; }
      const d = await r.json();
      onCreate(d);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[480px] bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">New Initiative</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">{error}</div>}

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Initiative Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Digital Transformation 2026"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          {/* Strategic Goal */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Flag className="w-3 h-3" /> Strategic Goal <span className="normal-case font-normal text-muted-foreground/50">(optional)</span>
            </label>
            <select value={form.goalId} onChange={e => setForm(f => ({ ...f, goalId: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">— No goal —</option>
              {allGoals.map(g => (
                <option key={g.id} value={g.id}>
                  GOAL-{String(g.goal_number).padStart(3, '0')} · {g.title}
                </option>
              ))}
            </select>
            {allGoals.length === 0 && <p className="text-xs text-muted-foreground/60 italic">No strategic goals yet — you can assign one later.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">End Date</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes <span className="normal-case font-normal text-muted-foreground/50">(optional)</span></label>
            <textarea value={form.goals} onChange={e => setForm(f => ({ ...f, goals: e.target.value }))} rows={3}
              placeholder="What does this initiative aim to achieve?"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !form.name}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Initiative
          </button>
        </div>
      </div>
    </div>
  );
}
