import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, X, Loader2, CheckCircle2, Check,
  Clock, AlertTriangle, ChevronRight, Bot, Sparkles,
  User, Flag, RotateCcw, ClipboardCheck, ThumbsUp, ThumbsDown,
  Layers, ListTodo, ShieldCheck, ShieldX, Timer, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface TaskRow {
  id: number;
  task_number: number;
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  revised_end_date: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_by: number | null;
  created_by_name: string | null;
  priority: 'high' | 'normal' | 'low';
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  ai_agent_id: number | null;
  ai_agent_name: string | null;
  ai_result: string;
  created_at: string;
  updated_at: string;
  source: string;
  queue_id: number | null;
  queue_name: string | null;
  approval_status: 'none' | 'pending' | 'approved' | 'rejected';
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  ai_instructions: string;
}

interface UserItem { id: number; name: string; email: string; role: string }
interface AiAgent { id: number; agent_number: number; name: string }
interface Queue { id: number; name: string; color: string }
interface TaskSource { id: number; name: string; color: string }

// ── Config ────────────────────────────────────────────────────────────────────
const PRIORITIES = [
  { value: 'high',   label: 'High',   color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',     icon: AlertTriangle },
  { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: Flag },
  { value: 'low',    label: 'Low',    color: 'bg-secondary text-secondary-foreground',                            icon: ChevronRight },
] as const;

const STATUSES = [
  { value: 'open',        label: 'Open',        color: 'bg-secondary text-secondary-foreground',                                  icon: Clock },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', icon: RotateCcw },
  { value: 'done',        label: 'Done',        color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',    icon: CheckCircle2 },
  { value: 'cancelled',   label: 'Cancelled',   color: 'bg-muted text-muted-foreground',                                          icon: X },
] as const;

const APPROVAL_CONFIG = {
  none:     { label: '',                icon: null,         color: '' },
  pending:  { label: 'Pending Approval', icon: Timer,       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  approved: { label: 'Approved',         icon: ShieldCheck, color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  rejected: { label: 'Rejected',         icon: ShieldX,     color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

function getPriority(v: string) { return PRIORITIES.find(p => p.value === v) ?? PRIORITIES[1]; }
function getStatus(v: string)   { return STATUSES.find(s => s.value === v) ?? STATUSES[0]; }

function PriorityBadge({ priority }: { priority: string }) {
  const p = getPriority(priority);
  const Icon = p.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', p.color)}>
      <Icon className="w-3 h-3" />{p.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = getStatus(status);
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', s.color)}>
      <Icon className="w-3 h-3" />{s.label}
    </span>
  );
}

function ApprovalBadge({ approvalStatus }: { approvalStatus: string }) {
  const cfg = APPROVAL_CONFIG[approvalStatus as keyof typeof APPROVAL_CONFIG] ?? APPROVAL_CONFIG.none;
  if (!cfg.label) return null;
  const Icon = cfg.icon!;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', cfg.color)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
      />
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function TasksView() {
  const { fetchHeaders, currentUser: user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterApproval, setFilterApproval] = useState<string>('all');
  const [filterQueue, setFilterQueue] = useState<string>('all');
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editRevisedEnd, setEditRevisedEnd] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState<number | ''>('');
  const [editPriority, setEditPriority] = useState<string>('normal');
  const [editStatus, setEditStatus] = useState<string>('open');
  const [editAgentId, setEditAgentId] = useState<number | ''>('');
  const [editAiResult, setEditAiResult] = useState('');
  const [editSource, setEditSource] = useState<string>('Employees');
  const [editQueueId, setEditQueueId] = useState<number | ''>('');
  const [editAiInstructions, setEditAiInstructions] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningAgent, setRunningAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalResult, setApprovalResult] = useState<string | null>(null);

  const [users, setUsers] = useState<UserItem[]>([]);
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [sources, setSources] = useState<TaskSource[]>([]);

  const isManagerOrAbove = user?.role === 'admin' || user?.role === 'superuser';

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/tasks`, { headers: fetchHeaders() });
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, [fetchHeaders]);

  const loadOptions = useCallback(async () => {
    const [ur, ar, qr, sr] = await Promise.all([
      fetch(`${API}/users`, { headers: fetchHeaders() }),
      fetch(`${API}/ai-agents`, { headers: fetchHeaders() }),
      fetch(`${API}/org/task-queues`, { headers: fetchHeaders() }),
      fetch(`${API}/org/task-sources`, { headers: fetchHeaders() }),
    ]);
    if (ur.ok) setUsers(await ur.json());
    if (ar.ok) setAgents(await ar.json());
    if (qr.ok) setQueues(await qr.json());
    if (sr.ok) setSources(await sr.json());
  }, [fetchHeaders]);

  useEffect(() => { loadTasks(); loadOptions(); }, [loadTasks, loadOptions]);

  function populateEdit(t: TaskRow) {
    setEditName(t.name);
    setEditDesc(t.description);
    setEditStartDate(t.start_date ? t.start_date.split('T')[0] : '');
    setEditEndDate(t.end_date ? t.end_date.split('T')[0] : '');
    setEditRevisedEnd(t.revised_end_date ? t.revised_end_date.split('T')[0] : '');
    setEditAssignedTo(t.assigned_to ?? '');
    setEditPriority(t.priority);
    setEditStatus(t.status);
    setEditAgentId(t.ai_agent_id ?? '');
    setEditAiResult(t.ai_result ?? '');
    setEditSource(t.source ?? 'Employees');
    setEditQueueId(t.queue_id ?? '');
    setEditAiInstructions(t.ai_instructions ?? '');
    setDirty(false);
    setAgentError(null);
    setApprovalResult(null);
  }

  function openTask(t: TaskRow) { setSelected(t); setCreating(false); populateEdit(t); }

  function startCreate() {
    setSelected(null); setCreating(true);
    setEditName(''); setEditDesc('');
    setEditStartDate(''); setEditEndDate(''); setEditRevisedEnd('');
    setEditAssignedTo(''); setEditPriority('normal'); setEditStatus('open');
    setEditAgentId(''); setEditAiResult('');
    setEditSource('Employees'); setEditQueueId(''); setEditAiInstructions('');
    setDirty(false); setAgentError(null); setApprovalResult(null);
  }

  function markDirty() { setDirty(true); }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        name: editName, description: editDesc,
        startDate: editStartDate || null, endDate: editEndDate || null,
        revisedEndDate: editRevisedEnd || null,
        assignedTo: editAssignedTo || null,
        priority: editPriority, status: editStatus,
        aiAgentId: editAgentId || null, aiResult: editAiResult,
        source: editSource, queueId: editQueueId || null,
        aiInstructions: editAiInstructions,
      };
      if (creating) {
        const r = await fetch(`${API}/tasks`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify(body),
        });
        const newTask = await r.json();
        await loadTasks(); setCreating(false); setSelected(newTask); populateEdit(newTask);
      } else if (selected) {
        const r = await fetch(`${API}/tasks/${selected.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify(body),
        });
        const updated = await r.json();
        await loadTasks(); setSelected(updated); populateEdit(updated);
      }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    await fetch(`${API}/tasks/${id}`, { method: 'DELETE', headers: fetchHeaders() });
    setTasks(prev => prev.filter(t => t.id !== id));
    if (selected?.id === id) { setSelected(null); setCreating(false); }
  }

  async function runAgent() {
    if (!selected) return;
    setRunningAgent(true); setAgentError(null);
    try {
      if (dirty) await handleSave();
      const r = await fetch(`${API}/tasks/${selected.id}/run-agent`, { method: 'POST', headers: fetchHeaders() });
      const data = await r.json();
      if (!r.ok) { setAgentError(data.error ?? 'Agent failed'); return; }
      setEditAiResult(data.aiResult);
      await loadTasks();
    } finally { setRunningAgent(false); }
  }

  async function handleApprove() {
    if (!selected) return;
    setApproving(true); setApprovalResult(null);
    try {
      const r = await fetch(`${API}/tasks/${selected.id}/approve`, { method: 'POST', headers: fetchHeaders() });
      const data = await r.json();
      if (!r.ok) { setApprovalResult(`Error: ${data.error}`); return; }
      await loadTasks();
      setSelected(data.task);
      populateEdit(data.task);
      setApprovalResult(data.aiResult ? `Execution complete:\n${data.aiResult}` : 'Task approved.');
    } finally { setApproving(false); }
  }

  async function handleReject() {
    if (!selected) return;
    setApproving(true);
    try {
      const r = await fetch(`${API}/tasks/${selected.id}/reject`, { method: 'POST', headers: fetchHeaders() });
      const updated = await r.json();
      await loadTasks(); setSelected(updated); populateEdit(updated);
    } finally { setApproving(false); }
  }

  const canEditTask = (t: TaskRow) => isManagerOrAbove || t.created_by === user?.id;
  const canApprove = (t: TaskRow) => isManagerOrAbove && t.approval_status === 'pending';

  const filtered = tasks.filter(t => {
    const s = search.toLowerCase();
    const matchSearch = !s || t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s) || (t.assigned_to_name ?? '').toLowerCase().includes(s);
    const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchApproval = filterApproval === 'all' || t.approval_status === filterApproval;
    const matchQueue = filterQueue === 'all' || String(t.queue_id) === filterQueue;
    return matchSearch && matchPriority && matchStatus && matchApproval && matchQueue;
  });

  const pendingCount = tasks.filter(t => t.approval_status === 'pending').length;
  const panelOpen = creating || selected !== null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: task list ── */}
      <div className={cn('flex flex-col flex-1 min-w-0 overflow-hidden transition-all', panelOpen && 'max-w-[60%]')}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border/50 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 flex-1">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Tasks</h1>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{filtered.length}</span>
            {pendingCount > 0 && (
              <button
                onClick={() => setFilterApproval(filterApproval === 'pending' ? 'all' : 'pending')}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium hover:opacity-80 transition-opacity"
              >
                <Timer className="w-3 h-3" />{pendingCount} pending approval
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="pl-8 pr-3 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 w-40"
            />
          </div>
          <select value={filterApproval} onChange={e => setFilterApproval(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs focus:outline-none">
            <option value="all">All approvals</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="none">No approval</option>
          </select>
          <select value={filterQueue} onChange={e => setFilterQueue(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs focus:outline-none">
            <option value="all">All queues</option>
            {queues.map(q => <option key={q.id} value={String(q.id)}>{q.name}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs focus:outline-none">
            <option value="all">All priorities</option>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs focus:outline-none">
            <option value="all">All statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Button size="sm" onClick={startCreate} className="gap-1.5 text-xs h-8">
            <Plus className="w-3.5 h-3.5" />New Task
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <ClipboardCheck className="w-10 h-10 opacity-30" />
              <p className="text-sm">{search ? 'No tasks match your search' : 'No tasks yet'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs w-14">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Task</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Source</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Priority</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Approval</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Queue</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Assigned To</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => openTask(t)}
                    className={cn(
                      'cursor-pointer hover:bg-secondary/40 transition-colors group',
                      selected?.id === t.id && 'bg-primary/5 hover:bg-primary/8',
                      t.approval_status === 'pending' && 'border-l-2 border-l-amber-400',
                    )}
                  >
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{String(t.task_number).padStart(3, '0')}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-sm truncate max-w-[200px]">{t.name || <span className="text-muted-foreground italic">Untitled</span>}</div>
                      {t.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{t.description}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {t.source === 'AI Agents' ? <Bot className="w-3 h-3 text-violet-400" /> : <User className="w-3 h-3" />}
                        {t.source}
                      </span>
                    </td>
                    <td className="px-4 py-2.5"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-2.5">
                      {t.approval_status !== 'none' ? <ApprovalBadge approvalStatus={t.approval_status} /> : <span className="text-xs text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.queue_name
                        ? <span className="inline-flex items-center gap-1 text-xs"><Layers className="w-3 h-3 text-muted-foreground" />{t.queue_name}</span>
                        : <span className="text-xs text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.assigned_to_name
                        ? <span className="inline-flex items-center gap-1 text-xs"><User className="w-3 h-3 text-muted-foreground" />{t.assigned_to_name}</span>
                        : <span className="text-xs text-muted-foreground/40">Unassigned</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      {canEditTask(t) && (
                        <button onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Right: detail / create panel ── */}
      {panelOpen && (
        <div className="w-[40%] min-w-[380px] border-l border-border/50 flex flex-col overflow-hidden bg-sidebar/30">
          {/* Panel header */}
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50 shrink-0">
            <div className="flex-1 min-w-0">
              {creating
                ? <h2 className="text-sm font-semibold">New Task</h2>
                : <h2 className="text-sm font-semibold truncate">{selected?.name || 'Untitled Task'}</h2>}
              {!creating && selected && (
                <p className="text-[11px] text-muted-foreground">Task #{String(selected.task_number).padStart(3, '0')}</p>
              )}
            </div>
            {!creating && selected && selected.approval_status !== 'none' && (
              <ApprovalBadge approvalStatus={selected.approval_status} />
            )}
            <button onClick={() => { setSelected(null); setCreating(false); }}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* ── Approval section (AI agent tasks only) ── */}
            {!creating && selected && selected.approval_status === 'pending' && (
              <div className="p-4 rounded-xl border-2 border-amber-400/50 bg-amber-50/30 dark:bg-amber-900/10 space-y-3">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Pending Human Approval</p>
                </div>
                <p className="text-xs text-muted-foreground">This task was created by an AI agent. Review the instructions below, then approve or reject.</p>
                {selected.ai_instructions && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proposed Actions</p>
                    <div className="text-xs bg-background/60 border border-border/50 rounded-lg px-3 py-2.5 whitespace-pre-wrap font-mono leading-relaxed">
                      {selected.ai_instructions}
                    </div>
                  </div>
                )}
                {isManagerOrAbove && canApprove(selected) && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-medium border border-green-500/30 disabled:opacity-50 transition-colors"
                    >
                      {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                      Approve & Execute
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={approving}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium border border-red-500/30 disabled:opacity-50 transition-colors"
                    >
                      {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                      Reject
                    </button>
                  </div>
                )}
                {approvalResult && (
                  <div className="text-xs bg-background/60 border border-border/50 rounded-lg px-3 py-2.5 whitespace-pre-wrap">
                    {approvalResult}
                  </div>
                )}
              </div>
            )}

            {/* Approved / rejected summary */}
            {!creating && selected && (selected.approval_status === 'approved' || selected.approval_status === 'rejected') && (
              <div className={cn(
                'px-4 py-3 rounded-xl border text-xs space-y-1',
                selected.approval_status === 'approved' ? 'border-green-400/40 bg-green-50/20 dark:bg-green-900/10' : 'border-red-400/40 bg-red-50/20 dark:bg-red-900/10'
              )}>
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  {selected.approval_status === 'approved'
                    ? <><ShieldCheck className="w-3.5 h-3.5 text-green-500" />Approved by {selected.approved_by_name ?? 'Unknown'}</>
                    : <><ShieldX className="w-3.5 h-3.5 text-red-500" />Rejected by {selected.approved_by_name ?? 'Unknown'}</>}
                </p>
                {selected.approved_at && (
                  <p className="text-muted-foreground">
                    {new Date(selected.approved_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Task Name</label>
              <Input value={editName} onChange={e => { setEditName(e.target.value); markDirty(); }} placeholder="Enter task name…" className="h-8 text-sm" />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea value={editDesc} onChange={e => { setEditDesc(e.target.value); markDirty(); }} placeholder="Describe the task…" rows={3} className="text-sm resize-none" />
            </div>

            {/* Source + Queue */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><ListTodo className="w-3 h-3" />Source</label>
                <select
                  value={editSource}
                  onChange={e => { setEditSource(e.target.value); markDirty(); }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  {sources.length > 0
                    ? sources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)
                    : <option value="Employees">Employees</option>}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" />Queue</label>
                <select
                  value={editQueueId}
                  onChange={e => { setEditQueueId(e.target.value ? Number(e.target.value) : ''); markDirty(); }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="">— No queue —</option>
                  {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
            </div>

            {/* Priority + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Priority</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITIES.map(p => (
                    <button key={p.value} onClick={() => { setEditPriority(p.value); markDirty(); }}
                      className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        editPriority === p.value ? p.color + ' border-transparent' : 'border-border text-muted-foreground hover:border-primary/30')}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map(s => (
                    <button key={s.value} onClick={() => { setEditStatus(s.value); markDirty(); }}
                      className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        editStatus === s.value ? s.color + ' border-transparent' : 'border-border text-muted-foreground hover:border-primary/30')}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-3 gap-3">
              <DateInput label="Start Date" value={editStartDate} onChange={v => { setEditStartDate(v); markDirty(); }} />
              <DateInput label="End Date" value={editEndDate} onChange={v => { setEditEndDate(v); markDirty(); }} />
              <DateInput label="Revised End" value={editRevisedEnd} onChange={v => { setEditRevisedEnd(v); markDirty(); }} />
            </div>

            {/* Assigned To */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />Assigned To</label>
              <select value={editAssignedTo}
                onChange={e => { setEditAssignedTo(e.target.value ? Number(e.target.value) : ''); markDirty(); }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40">
                <option value="">— Unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
            </div>

            {/* AI Agent */}
            <div className="space-y-2 border-t border-border/40 pt-4">
              <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" />AI Agent
              </label>
              <select value={editAgentId}
                onChange={e => { setEditAgentId(e.target.value ? Number(e.target.value) : ''); markDirty(); }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40">
                <option value="">— No agent —</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>

              {!creating && selected && editAgentId && (
                <button onClick={runAgent} disabled={runningAgent}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium border border-primary/20 disabled:opacity-50 transition-colors">
                  {runningAgent ? <><Loader2 className="w-4 h-4 animate-spin" />Running agent…</> : <><Sparkles className="w-4 h-4" />Send to AI Agent</>}
                </button>
              )}
              {agentError && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{agentError}</p>}

              {/* AI Instructions (read-only for AI-created tasks, editable for new tasks) */}
              {(editSource === 'AI Agents' || editAiInstructions) && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">AI Instructions (executed on approval)</label>
                  <Textarea
                    value={editAiInstructions}
                    onChange={e => { setEditAiInstructions(e.target.value); markDirty(); }}
                    placeholder="Instructions for the AI to execute when this task is approved…"
                    rows={4}
                    className="text-sm resize-none font-mono text-xs"
                  />
                </div>
              )}

              {/* AI Result */}
              {editAiResult && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">AI Result</label>
                  <Textarea value={editAiResult} onChange={e => { setEditAiResult(e.target.value); markDirty(); }}
                    rows={5} className="text-sm resize-none font-mono text-xs" />
                </div>
              )}
            </div>
          </div>

          {/* Save bar */}
          <div className="px-5 py-3 border-t border-border/50 shrink-0 flex items-center justify-end gap-2">
            {dirty && !saving && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            <button onClick={() => { setSelected(null); setCreating(false); }}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
            <Button size="sm" onClick={handleSave} disabled={saving || !editName.trim()} className="gap-1.5 text-xs h-7">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {creating ? 'Create Task' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
