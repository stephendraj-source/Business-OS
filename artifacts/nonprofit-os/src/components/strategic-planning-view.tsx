import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Check, Loader2, Trash2, Search, Pencil,
  Target, Flag, CalendarDays, CheckCircle2, Circle, Lightbulb,
  ChevronDown, AlertCircle, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InitiativesView } from './initiatives-view';
import { useAuth } from '@/contexts/AuthContext';

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<StrategicGoal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/strategic-goals`, { headers: fetchHeaders() });
      if (r.ok) setGoals(await r.json());
    } finally { setLoading(false); }
  }, [fetchHeaders]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

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

  return (
    <div className="flex h-full">
      {/* Left — list */}
      <div className={cn('flex flex-col h-full transition-all duration-300', editing ? 'w-[420px] flex-shrink-0' : 'flex-1')}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold">Strategic Goals</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {goals.length} goal{goals.length !== 1 ? 's' : ''} defined
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
          >
            <Plus className="w-4 h-4" /> Add Goal
          </button>
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
                return (
                  <div
                    key={goal.id}
                    role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') setEditing(goal); }}
                    onClick={() => setEditing(g => g?.id === goal.id ? null : goal)}
                    className={cn(
                      'group flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-secondary/40 transition-colors',
                      editing?.id === goal.id && 'bg-primary/5'
                    )}
                  >
                    {/* Color dot */}
                    <div className="mt-1 w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: goal.color }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                          GOAL-{String(goal.goal_number).padStart(3, '0')}
                        </span>
                        <span className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold', cfg.cls)}>
                          <Icon className="w-2.5 h-2.5" />
                          {cfg.label}
                        </span>
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
      {editing && (
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
      if (res.ok) await onCreate();
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
