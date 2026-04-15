import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Check, Loader2, Trash2, Search, Pencil,
  Target, Flag, CalendarDays, CheckCircle2, Circle, Lightbulb,
  ChevronDown, AlertCircle, TrendingUp, Users, GitBranch, Link as LinkIcon, ExternalLink,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { InitiativesView } from '@/features/initiatives/initiatives-view';
import { useAuth } from '@/app/providers/AuthContext';

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type GoalStatus = 'draft' | 'active' | 'achieved' | 'paused';

interface StrategicGoal {
  id: number;
  goal_number: number;
  title: string;
  description: string;
  target_date: string | null;
  status: GoalStatus;
  color: string;
  created_at: string;
}

interface LinkedInitiative {
  id: number;
  initiative_id: string;
  name: string;
}

interface InitiativeUrl {
  id?: number;
  label: string;
  url: string;
}

interface InitiativeAssignee {
  id: number;
  name: string;
  email: string;
  designation: string;
}

interface InitiativeProcess {
  id: number;
  processName: string;
  processDescription: string;
  category: string;
  number: number;
}

interface StrategicGoalRef {
  id: number;
  goal_number: number;
  title: string;
  color: string;
  status: string;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  designation: string;
}

interface ProcessMeta {
  id: number;
  processName: string;
  processDescription: string;
  category: string;
  number: number;
}

interface InitiativeDetailPanelData {
  id: number;
  initiative_id: string;
  name: string;
  goals: string;
  achievement: string;
  startDate?: string | null;
  start_date?: string | null;
  endDate?: string | null;
  end_date?: string | null;
  goalId?: number | null;
  goal_id?: number | null;
  urls?: InitiativeUrl[];
  assignees?: InitiativeAssignee[];
  processes?: InitiativeProcess[];
}

const PROCESS_CATEGORIES = [
  'Strategy & Governance', 'Technology & Data', 'Programs & Services', 'Finance & Compliance',
  'HR & Talent', 'Fundraising & Development', 'Marketing & Communications', 'Operations & Facilities',
];

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<GoalStatus, { label: string; icon: React.ElementType; cls: string }> = {
  draft:    { label: 'Draft',    icon: Circle,        cls: 'bg-muted/60 text-muted-foreground' },
  active:   { label: 'Active',   icon: TrendingUp,    cls: 'bg-blue-500/15 text-blue-400' },
  achieved: { label: 'Achieved', icon: CheckCircle2,  cls: 'bg-green-500/15 text-green-400' },
  paused:   { label: 'Paused',   icon: AlertCircle,   cls: 'bg-amber-500/15 text-amber-400' },
};

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4',
];

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Strategic Goals Tab ────────────────────────────────────────────────────────

function StrategicGoalsTab() {
  const { fetchHeaders } = useAuth();
  const [goals, setGoals] = useState<StrategicGoal[]>([]);
  const [goalInitiatives, setGoalInitiatives] = useState<Record<number, LinkedInitiative[]>>({});
  const [expandedGoals, setExpandedGoals] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateInitiative, setShowCreateInitiative] = useState(false);
  const [createInitiativeGoalId, setCreateInitiativeGoalId] = useState<number | null>(null);
  const [editing, setEditing] = useState<StrategicGoal | null>(null);
  const [selectedInitiative, setSelectedInitiative] = useState<InitiativeDetailPanelData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/strategic-goals`, { headers: fetchHeaders() });
      if (r.ok) setGoals(await r.json());
    } finally { setLoading(false); }
  }, [fetchHeaders]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  useEffect(() => {
    let cancelled = false;

    async function fetchLinkedInitiatives() {
      if (goals.length === 0) {
        if (!cancelled) setGoalInitiatives({});
        return;
      }

      const headers = fetchHeaders();
      const entries = await Promise.all(
        goals.map(async (goal) => {
          try {
            const res = await fetch(`${API}/strategic-goals/${goal.id}/initiatives`, { headers });
            if (!res.ok) return [goal.id, []] as const;
            const data = await res.json();
            return [goal.id, Array.isArray(data) ? data : []] as const;
          } catch {
            return [goal.id, []] as const;
          }
        }),
      );

      if (!cancelled) {
        setGoalInitiatives(Object.fromEntries(entries));
        setExpandedGoals((current) => {
          const next = new Set(current);
          for (const [goalId, initiatives] of entries) {
            if (initiatives.length > 0 && !current.has(goalId)) next.add(goalId);
          }
          return next;
        });
      }
    }

    fetchLinkedInitiatives();
    return () => { cancelled = true; };
  }, [goals, fetchHeaders]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await fetch(`${API}/strategic-goals/${id}`, { method: 'DELETE', headers: fetchHeaders() });
    setConfirmDelete(null);
    if (editing?.id === id) setEditing(null);
    await fetchGoals();
  };

  const filtered = goals.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    g.description.toLowerCase().includes(search.toLowerCase())
  );

  const openInitiative = async (initiativeId: number) => {
    try {
      const r = await fetch(`${API}/initiatives/${initiativeId}`, { headers: fetchHeaders() });
      if (!r.ok) return;
      setSelectedInitiative(await r.json());
      setEditing(null);
    } catch {}
  };

  const refreshGoalsAndInitiatives = useCallback(async () => {
    await fetchGoals();
  }, [fetchGoals]);

  const toggleExpanded = (goalId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGoals((current) => {
      const next = new Set(current);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  };

  return (
    <div className="flex h-full">
      {/* Left — list */}
      <div className={cn('flex flex-col h-full transition-all duration-300', (editing || selectedInitiative) ? 'w-[420px] flex-shrink-0' : 'flex-1')}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold">Strategic Goals</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {goals.length} goal{goals.length !== 1 ? 's' : ''} defined
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCreateInitiativeGoalId(editing?.id ?? null);
                setShowCreateInitiative(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Initiative
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Add Goal
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex-none px-6 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search goals…"
              className="w-full pl-9 pr-3 py-2 bg-secondary/60 rounded-lg text-sm border border-transparent focus:outline-none focus:border-primary focus:bg-background transition"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Target className="w-10 h-10 mb-3 opacity-25" />
              <p className="text-sm">
                {search ? 'No goals match your search' : 'No strategic goals yet — click Add Goal'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(goal => {
                const cfg = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.draft;
                const Icon = cfg.icon;
                const childInitiatives = goalInitiatives[goal.id] ?? [];
                const isExpanded = expandedGoals.has(goal.id);
                return (
                  <div
                    key={goal.id}
                    role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') { setEditing(goal); setSelectedInitiative(null); } }}
                    onClick={() => {
                      setEditing(g => g?.id === goal.id ? null : goal);
                      setSelectedInitiative(null);
                    }}
                    className={cn(
                      'group flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-secondary/40 transition-colors',
                      editing?.id === goal.id && 'bg-primary/5'
                    )}
                  >
                    {/* Color dot */}
                    <div className="mt-1 w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: goal.color }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {childInitiatives.length > 0 && (
                          <button
                            onClick={(e) => toggleExpanded(goal.id, e)}
                            className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            aria-label={isExpanded ? 'Collapse initiatives' : 'Expand initiatives'}
                          >
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isExpanded ? 'rotate-0' : '-rotate-90')} />
                          </button>
                        )}
                        <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                          GOAL-{String(goal.goal_number).padStart(3, '0')}
                        </span>
                        <span className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold', cfg.cls)}>
                          <Icon className="w-2.5 h-2.5" />
                          {cfg.label}
                        </span>
                        {childInitiatives.length > 0 && (
                          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {childInitiatives.length}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate">{goal.title}</div>
                      {goal.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{goal.description}</div>
                      )}
                      {goal.target_date && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <CalendarDays className="w-3 h-3" />
                          Target: {fmtDate(goal.target_date)}
                        </div>
                      )}
                      <div className="mt-3 pl-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            <Lightbulb className="w-3 h-3" />
                            Initiative Tree
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreateInitiativeGoalId(goal.id);
                              setShowCreateInitiative(true);
                            }}
                            className="flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                          >
                            <Plus className="w-3 h-3" />
                            Add Initiative
                          </button>
                        </div>
                      {childInitiatives.length > 0 && isExpanded && (
                          <div className="relative ml-2 border-l border-border/70 pl-4">
                            {childInitiatives.map((initiative) => (
                              <div key={initiative.id} className="relative pb-2 last:pb-0">
                                <div className="absolute -left-4 top-4 h-px w-3 border-t border-border/70" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInitiative(initiative.id);
                                  }}
                                  className={cn(
                                    'flex w-full items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-2.5 py-2 text-left text-xs shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5',
                                    selectedInitiative?.id === initiative.id && 'border-primary/40 bg-primary/10',
                                  )}
                                >
                                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: goal.color }} />
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    {initiative.initiative_id}
                                  </span>
                                  <span className="truncate text-foreground">{initiative.name}</span>
                                </button>
                              </div>
                            ))}
                          </div>
                      )}
                      {childInitiatives.length === 0 && (
                          <div className="rounded-lg border border-dashed border-border/70 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
                            No initiatives linked yet.
                          </div>
                      )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {confirmDelete === goal.id ? (
                        <>
                          <button
                            onClick={e => handleDelete(goal.id, e)}
                            className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                            className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground font-semibold"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={e => handleDelete(goal.id, e)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right — edit panel */}
      {selectedInitiative && (
        <InitiativeEditPanel
          initiative={selectedInitiative}
          onClose={() => setSelectedInitiative(null)}
          onSaved={async (initiativeId) => {
            await refreshGoalsAndInitiatives();
            const r = await fetch(`${API}/initiatives/${initiativeId}`, { headers: fetchHeaders() });
            if (r.ok) setSelectedInitiative(await r.json());
          }}
        />
      )}
      {!selectedInitiative && editing && (
        <GoalEditPanel
          key={editing.id}
          goal={editing}
          onClose={() => setEditing(null)}
          onSaved={async updated => {
            await fetchGoals();
            setEditing(updated);
          }}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateGoalModal
          onClose={() => setShowCreate(false)}
          onCreate={async () => {
            await fetchGoals();
            setShowCreate(false);
          }}
          fetchHeaders={fetchHeaders}
        />
      )}

      {showCreateInitiative && (
        <CreateInitiativeModal
          defaultGoalId={createInitiativeGoalId}
          onClose={() => {
            setShowCreateInitiative(false);
            setCreateInitiativeGoalId(null);
          }}
          onCreate={async (ini) => {
            await refreshGoalsAndInitiatives();
            setShowCreateInitiative(false);
            setCreateInitiativeGoalId(null);
            await openInitiative(ini.id);
          }}
        />
      )}
    </div>
  );
}

function initiativeStartDate(initiative: InitiativeDetailPanelData) {
  return initiative.startDate ?? initiative.start_date ?? null;
}

function initiativeEndDate(initiative: InitiativeDetailPanelData) {
  return initiative.endDate ?? initiative.end_date ?? null;
}

function InitiativeEditPanel({
  initiative,
  onClose,
  onSaved,
}: {
  initiative: InitiativeDetailPanelData;
  onClose: () => void;
  onSaved: (initiativeId: number) => Promise<void>;
}) {
  const { fetchHeaders } = useAuth();
  const formInit = useCallback(() => ({
    name: initiative.name ?? '',
    startDate: initiativeStartDate(initiative) ?? '',
    endDate: initiativeEndDate(initiative) ?? '',
    goals: initiative.goals ?? '',
    achievement: initiative.achievement ?? '',
    goalId: String(initiative.goalId ?? initiative.goal_id ?? ''),
  }), [initiative]);
  const [form, setForm] = useState(formInit);
  const [urls, setUrls] = useState<InitiativeUrl[]>(initiative.urls ?? []);
  const [allGoals, setAllGoals] = useState<StrategicGoalRef[]>([]);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [allProcesses, setAllProcesses] = useState<ProcessMeta[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set((initiative.assignees ?? []).map((a) => a.id)));
  const [selectedProcessIds, setSelectedProcessIds] = useState<Set<number>>(new Set((initiative.processes ?? []).map((p) => p.id)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [processSearch, setProcessSearch] = useState('');
  const [processCategory, setProcessCategory] = useState('');

  useEffect(() => {
    setForm(formInit());
    setUrls(initiative.urls ?? []);
    setSelectedUserIds(new Set((initiative.assignees ?? []).map((a) => a.id)));
    setSelectedProcessIds(new Set((initiative.processes ?? []).map((p) => p.id)));
  }, [initiative, formInit]);

  useEffect(() => {
    const headers = fetchHeaders();
    fetch(`${API}/strategic-goals`, { headers }).then(r => r.json()).then(d => { if (Array.isArray(d)) setAllGoals(d); }).catch(() => {});
    fetch(`${API}/users`, { headers }).then(r => r.json()).then(d => { if (Array.isArray(d)) setAllUsers(d); }).catch(() => {});
    fetch(`${API}/processes`, { headers }).then(r => r.json()).then(d => { if (Array.isArray(d)) setAllProcesses(d); }).catch(() => {});
  }, [fetchHeaders]);

  const updateUrl = (index: number, key: 'label' | 'url', value: string) => {
    setUrls((current) => current.map((url, i) => i === index ? { ...url, [key]: value } : url));
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/initiatives/${initiative.id}`, {
        method: 'PATCH',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          goals: form.goals,
          achievement: form.achievement,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          goalId: form.goalId ? Number(form.goalId) : null,
        }),
      });

      await fetch(`${API}/initiatives/${initiative.id}/urls`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urls.filter((url) => url.url.trim()) }),
      });

      await fetch(`${API}/initiatives/${initiative.id}/assignees`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selectedUserIds) }),
      });

      await fetch(`${API}/initiatives/${initiative.id}/processes`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ processIds: Array.from(selectedProcessIds) }),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await onSaved(initiative.id);
    } finally {
      setSaving(false);
    }
  };

  const visibleUsers = allUsers.filter((user) =>
    !userSearch ||
    user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const visibleProcesses = allProcesses.filter((process) => {
    const matchesSearch = !processSearch ||
      process.processName?.toLowerCase().includes(processSearch.toLowerCase()) ||
      process.processDescription?.toLowerCase().includes(processSearch.toLowerCase());
    const matchesCategory = !processCategory || process.category === processCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex-1 min-w-0 flex flex-col border-l border-border bg-card/40 h-full">
      <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{initiative.initiative_id}</span>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Initiative
            </span>
          </div>
          <div className="mt-1 truncate text-base font-semibold">{initiative.name}</div>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400 font-medium">Saved ✓</span>}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Initiative Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((current) => ({ ...current, startDate: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">End Date</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((current) => ({ ...current, endDate: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Strategic Goal</label>
          <select
            value={form.goalId}
            onChange={(e) => setForm((current) => ({ ...current, goalId: e.target.value }))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— No goal —</option>
            {allGoals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                GOAL-{String(goal.goal_number).padStart(3, '0')} · {goal.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goals / Notes</label>
          <textarea
            rows={4}
            value={form.goals}
            onChange={(e) => setForm((current) => ({ ...current, goals: e.target.value }))}
            className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Achievement</label>
          <textarea
            rows={4}
            value={form.achievement}
            onChange={(e) => setForm((current) => ({ ...current, achievement: e.target.value }))}
            className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5" />
              Links
            </label>
            <button
              onClick={() => setUrls((current) => [...current, { label: '', url: '' }])}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Link
            </button>
          </div>
          <div className="space-y-2">
            {urls.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                No links yet.
              </div>
            )}
            {urls.map((url, index) => (
              <div key={`${url.id ?? 'new'}-${index}`} className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-3">
                <div className="flex-1 space-y-2">
                  <input
                    value={url.label}
                    onChange={(e) => updateUrl(index, 'label', e.target.value)}
                    placeholder="Label"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      value={url.url}
                      onChange={(e) => updateUrl(index, 'url', e.target.value)}
                      placeholder="https://…"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {url.url && (
                      <a
                        href={url.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setUrls((current) => current.filter((_, i) => i !== index))}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            People
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search people…"
              className="w-full rounded-lg border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-background">
            {visibleUsers.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-secondary/30">
                <input
                  type="checkbox"
                  checked={selectedUserIds.has(user.id)}
                  onChange={() => setSelectedUserIds((current) => {
                    const next = new Set(current);
                    if (next.has(user.id)) next.delete(user.id);
                    else next.add(user.id);
                    return next;
                  })}
                  className="mt-1 accent-primary"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{user.name}</div>
                  {user.designation && <div className="text-xs text-muted-foreground">{user.designation}</div>}
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5" />
            Processes
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                placeholder="Search processes…"
                className="w-full rounded-lg border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <select
              value={processCategory}
              onChange={(e) => setProcessCategory(e.target.value)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All categories</option>
              {PROCESS_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-background">
            {visibleProcesses.map((process) => (
              <label key={process.id} className="flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-secondary/30">
                <input
                  type="checkbox"
                  checked={selectedProcessIds.has(process.id)}
                  onChange={() => setSelectedProcessIds((current) => {
                    const next = new Set(current);
                    if (next.has(process.id)) next.delete(process.id);
                    else next.add(process.id);
                    return next;
                  })}
                  className="mt-1 accent-primary"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{process.processName || process.processDescription}</div>
                  {process.processName && <div className="text-xs text-muted-foreground">{process.processDescription}</div>}
                  <div className="text-[10px] text-muted-foreground">{process.category}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-background px-3 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Links</div>
            <div className="mt-1 text-lg font-semibold">{urls.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">People</div>
            <div className="mt-1 text-lg font-semibold">{selectedUserIds.size}</div>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Processes</div>
            <div className="mt-1 text-lg font-semibold">{selectedProcessIds.size}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => {
              setForm(formInit());
              setUrls(initiative.urls ?? []);
              setSelectedUserIds(new Set((initiative.assignees ?? []).map((a) => a.id)));
              setSelectedProcessIds(new Set((initiative.processes ?? []).map((p) => p.id)));
            }}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" /> Revert
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateInitiativeModal({
  defaultGoalId,
  onClose,
  onCreate,
}: {
  defaultGoalId?: number | null;
  onClose: () => void;
  onCreate: (ini: LinkedInitiative) => Promise<void>;
}) {
  const { fetchHeaders } = useAuth();
  const [form, setForm] = useState({
    name: '',
    goals: '',
    achievement: '',
    startDate: '',
    endDate: '',
    goalId: defaultGoalId ? String(defaultGoalId) : '',
  });
  const [urls, setUrls] = useState<InitiativeUrl[]>([]);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [allProcesses, setAllProcesses] = useState<ProcessMeta[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState<Set<number>>(new Set());
  const [userSearch, setUserSearch] = useState('');
  const [processSearch, setProcessSearch] = useState('');
  const [processCategory, setProcessCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allGoals, setAllGoals] = useState<StrategicGoalRef[]>([]);

  useEffect(() => {
    const headers = fetchHeaders();
    fetch(`${API}/strategic-goals`, { headers }).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setAllGoals(d);
    }).catch(() => {});
    fetch(`${API}/users`, { headers }).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setAllUsers(d);
    }).catch(() => {});
    fetch(`${API}/processes`, { headers }).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setAllProcesses(d);
    }).catch(() => {});
  }, [fetchHeaders]);

  useEffect(() => {
    setForm((current) => ({ ...current, goalId: defaultGoalId ? String(defaultGoalId) : '' }));
  }, [defaultGoalId]);

  const visibleUsers = allUsers.filter((user) =>
    !userSearch ||
    user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const visibleProcesses = allProcesses.filter((process) => {
    const matchesSearch = !processSearch ||
      process.processName?.toLowerCase().includes(processSearch.toLowerCase()) ||
      process.processDescription?.toLowerCase().includes(processSearch.toLowerCase());
    const matchesCategory = !processCategory || process.category === processCategory;
    return matchesSearch && matchesCategory;
  });

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Initiative name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`${API}/initiatives`, {
        method: 'POST',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          goals: form.goals,
          achievement: form.achievement,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          goalId: form.goalId ? Number(form.goalId) : null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setError(d?.error || 'Failed to create initiative');
        return;
      }
      const created = await r.json();
      await fetch(`${API}/initiatives/${created.id}/urls`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urls.filter((url) => url.url.trim()) }),
      });
      await fetch(`${API}/initiatives/${created.id}/assignees`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selectedUserIds) }),
      });
      await fetch(`${API}/initiatives/${created.id}/processes`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ processIds: Array.from(selectedProcessIds) }),
      });
      await onCreate(created);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-[760px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold">New Initiative</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Create an initiative directly from Strategic Planning.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Initiative Name</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Strategic Goal</label>
            <select
              value={form.goalId}
              onChange={(e) => setForm((current) => ({ ...current, goalId: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— No goal —</option>
              {allGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  GOAL-{String(goal.goal_number).padStart(3, '0')} · {goal.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((current) => ({ ...current, startDate: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((current) => ({ ...current, endDate: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goals / Notes</label>
            <textarea
              rows={4}
              value={form.goals}
              onChange={(e) => setForm((current) => ({ ...current, goals: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Achievement</label>
            <textarea
              rows={4}
              value={form.achievement}
              onChange={(e) => setForm((current) => ({ ...current, achievement: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5" />
                Links
              </label>
              <button
                onClick={() => setUrls((current) => [...current, { label: '', url: '' }])}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Link
              </button>
            </div>
            <div className="space-y-2">
              {urls.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                  No links yet.
                </div>
              )}
              {urls.map((url, index) => (
                <div key={`new-link-${index}`} className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-3">
                  <div className="flex-1 space-y-2">
                    <input
                      value={url.label}
                      onChange={(e) => setUrls((current) => current.map((item, i) => i === index ? { ...item, label: e.target.value } : item))}
                      placeholder="Label"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <input
                      value={url.url}
                      onChange={(e) => setUrls((current) => current.map((item, i) => i === index ? { ...item, url: e.target.value } : item))}
                      placeholder="https://…"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <button
                    onClick={() => setUrls((current) => current.filter((_, i) => i !== index))}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              People
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search people…"
                className="w-full rounded-lg border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-background">
              {visibleUsers.map((user) => (
                <label key={user.id} className="flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-secondary/30">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(user.id)}
                    onChange={() => setSelectedUserIds((current) => {
                      const next = new Set(current);
                      if (next.has(user.id)) next.delete(user.id);
                      else next.add(user.id);
                      return next;
                    })}
                    className="mt-1 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{user.name}</div>
                    {user.designation && <div className="text-xs text-muted-foreground">{user.designation}</div>}
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              Processes
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={processSearch}
                  onChange={(e) => setProcessSearch(e.target.value)}
                  placeholder="Search processes…"
                  className="w-full rounded-lg border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <select
                value={processCategory}
                onChange={(e) => setProcessCategory(e.target.value)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All categories</option>
                {PROCESS_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-border bg-background">
              {visibleProcesses.map((process) => (
                <label key={process.id} className="flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-secondary/30">
                  <input
                    type="checkbox"
                    checked={selectedProcessIds.has(process.id)}
                    onChange={() => setSelectedProcessIds((current) => {
                      const next = new Set(current);
                      if (next.has(process.id)) next.delete(process.id);
                      else next.add(process.id);
                      return next;
                    })}
                    className="mt-1 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{process.processName || process.processDescription}</div>
                    {process.processName && <div className="text-xs text-muted-foreground">{process.processDescription}</div>}
                    <div className="text-[10px] text-muted-foreground">{process.category}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-background px-3 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Links</div>
              <div className="mt-1 text-lg font-semibold">{urls.length}</div>
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">People</div>
              <div className="mt-1 text-lg font-semibold">{selectedUserIds.size}</div>
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Processes</div>
              <div className="mt-1 text-lg font-semibold">{selectedProcessIds.size}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !form.name.trim()}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Initiative
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Goal Edit Panel ────────────────────────────────────────────────────────────

function GoalEditPanel({
  goal,
  onClose,
  onSaved,
}: {
  goal: StrategicGoal;
  onClose: () => void;
  onSaved: (updated: StrategicGoal) => Promise<void>;
}) {
  const { fetchHeaders } = useAuth();
  const [form, setForm] = useState({
    title: goal.title,
    description: goal.description,
    target_date: goal.target_date ?? '',
    status: goal.status as GoalStatus,
    color: goal.color,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Linked initiatives ────────────────────────────────────────────────────────
  const [allInitiatives, setAllInitiatives] = useState<{ id: number; initiative_id: string; name: string }[]>([]);
  const [linkedIds, setLinkedIds] = useState<number[]>([]);
  const [linkSaving, setLinkSaving] = useState(false);

  useEffect(() => {
    const h = { ...fetchHeaders(), 'Content-Type': 'application/json' };
    Promise.all([
      fetch(`${API}/initiatives`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/strategic-goals/${goal.id}/initiatives`, { headers: h }).then(r => r.json()).catch(() => []),
    ]).then(([all, linked]) => {
      setAllInitiatives(Array.isArray(all) ? all : []);
      setLinkedIds(Array.isArray(linked) ? linked.map((i: any) => i.id) : []);
    });
  }, [goal.id]);

  const toggleInitiative = async (initiativeId: number) => {
    const next = linkedIds.includes(initiativeId)
      ? linkedIds.filter(id => id !== initiativeId)
      : [...linkedIds, initiativeId];
    setLinkedIds(next);
    setLinkSaving(true);
    try {
      await fetch(`${API}/strategic-goals/${goal.id}/initiatives`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ initiative_ids: next }),
      });
    } finally { setLinkSaving(false); }
  };

  const isDirty =
    form.title !== goal.title ||
    form.description !== goal.description ||
    form.target_date !== (goal.target_date ?? '') ||
    form.status !== goal.status ||
    form.color !== goal.color;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/strategic-goals/${goal.id}`, {
        method: 'PATCH',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target_date: form.target_date || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        await onSaved(updated);
      }
    } finally { setSaving(false); }
  };

  const cfg = STATUS_CONFIG[form.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;

  return (
    <div className="flex-1 min-w-0 flex flex-col border-l border-border bg-card/40 h-full">
      {/* Panel header */}
      <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: form.color }} />
            <span className="text-xs font-mono text-muted-foreground">
              GOAL-{String(goal.goal_number).padStart(3, '0')}
            </span>
          </div>
          <div className="font-semibold text-base truncate mt-0.5">{goal.title}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saved && <span className="text-xs text-green-400 font-medium">Saved ✓</span>}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goal Title</label>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={4}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        {/* Status + Target date */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
            <div className="relative">
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as GoalStatus }))}
                className="w-full appearance-none bg-background border border-border rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {(Object.keys(STATUS_CONFIG) as GoalStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
              <StatusIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Date</label>
            <input
              type="date"
              value={form.target_date}
              onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Color */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Colour</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setForm(f => ({ ...f, color: c }))}
                className={cn(
                  'w-7 h-7 rounded-full transition-transform hover:scale-110',
                  form.color === c && 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Linked Initiatives */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5" />
              Linked Initiatives
              {linkedIds.length > 0 && (
                <span className="bg-primary/15 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-semibold">{linkedIds.length}</span>
              )}
            </label>
            {linkSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
          {allInitiatives.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No initiatives available.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {allInitiatives.map(ini => {
                const checked = linkedIds.includes(ini.id);
                return (
                  <button
                    key={ini.id}
                    onClick={() => toggleInitiative(ini.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-sm transition-colors',
                      checked
                        ? 'bg-primary/10 border-primary/30 text-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'
                    )}
                  >
                    <div className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors', checked ? 'bg-primary border-primary' : 'border-muted-foreground/40')}>
                      {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{ini.initiative_id}</span>
                    <span className="truncate">{ini.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => setForm({
              title: goal.title, description: goal.description,
              target_date: goal.target_date ?? '', status: goal.status, color: goal.color,
            })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" /> Revert
          </button>
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors',
              isDirty && !saving
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Goal Modal ──────────────────────────────────────────────────────────

function CreateGoalModal({
  onClose,
  onCreate,
  fetchHeaders,
}: {
  onClose: () => void;
  onCreate: () => Promise<void>;
  fetchHeaders: () => Record<string, string>;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    target_date: '',
    status: 'active' as GoalStatus,
    color: '#6366f1',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/strategic-goals`, {
        method: 'POST',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target_date: form.target_date || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to create strategic goal');
        return;
      }
      await onCreate();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm">New Strategic Goal</div>
              <div className="text-xs text-muted-foreground">Define a high-level strategic objective</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title *</label>
            <input
              autoFocus
              value={form.title}
              onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setError(''); }}
              placeholder="e.g. Expand community reach by 40%"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does achieving this goal look like?"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as GoalStatus }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {(Object.keys(STATUS_CONFIG) as GoalStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Date</label>
              <input
                type="date"
                value={form.target_date}
                onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Colour</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={cn(
                    'w-7 h-7 rounded-full transition-transform hover:scale-110',
                    form.color === c && 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-secondary/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !form.title.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Create Goal
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Strategic Planning View ───────────────────────────────────────────────

type PlanningTab = 'goals' | 'initiatives';

export function StrategicPlanningView() {
  const [tab, setTab] = useState<PlanningTab>('goals');

  const tabs: { key: PlanningTab; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'goals',       label: 'Strategic Goals', icon: Target,  desc: 'High-level objectives guiding your strategy' },
    { key: 'initiatives', label: 'Initiatives',      icon: Lightbulb, desc: 'Initiatives linked to processes and teams' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex-none px-8 py-5 border-b border-border bg-background/80 backdrop-blur">
        <h1 className="text-xl font-semibold tracking-tight">Strategic Planning</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Define goals and manage initiatives that drive your organisation forward
        </p>

        {/* Tab bar */}
        <div className="flex gap-1 mt-4">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  tab === t.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'goals' && <StrategicGoalsTab />}
        {tab === 'initiatives' && <InitiativesView />}
      </div>
    </div>
  );
}
