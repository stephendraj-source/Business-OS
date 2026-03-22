import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Inbox, AlertTriangle, Loader2, X, Check,
  User, Calendar, Flag, Circle, CheckCircle2, Pause, Ban, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API = '/api';

interface Queue {
  id: number;
  name: string;
  color: string;
  description: string;
}

interface Task {
  id: number;
  task_number: number;
  name: string;
  description: string;
  status: string;
  priority: string;
  queue_id: number | null;
  queue_name: string | null;
  assigned_to_name: string | null;
  end_date: string | null;
  created_at: string;
}

const PRESET_COLORS = [
  '#94a3b8', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f59e0b', '#6366f1',
];

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  pending:     { label: 'Pending',     icon: <Circle className="w-3.5 h-3.5" />,      className: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', icon: <RefreshCw className="w-3.5 h-3.5" />,   className: 'text-blue-400' },
  on_hold:     { label: 'On Hold',     icon: <Pause className="w-3.5 h-3.5" />,       className: 'text-amber-400' },
  completed:   { label: 'Completed',   icon: <CheckCircle2 className="w-3.5 h-3.5" />, className: 'text-emerald-400' },
  cancelled:   { label: 'Cancelled',   icon: <Ban className="w-3.5 h-3.5" />,         className: 'text-red-400' },
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  low:      { label: 'Low',      className: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
  normal:   { label: 'Normal',   className: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  medium:   { label: 'Medium',   className: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  high:     { label: 'High',     className: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  critical: { label: 'Critical', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('nonprofit-os-auth-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders() };
}

function formatDate(d: string | null) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return null; }
}

// ── Color Picker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'w-7 h-7 rounded-full border-2 transition-transform hover:scale-110',
            value === c ? 'border-foreground scale-110' : 'border-transparent',
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

// ── Queue Form Dialog ─────────────────────────────────────────────────────────

interface QueueFormProps {
  initial?: Queue;
  onSave: (data: { name: string; color: string; description: string }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

function QueueFormDialog({ initial, onSave, onClose, saving }: QueueFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? '#94a3b8');
  const [description, setDescription] = useState(initial?.description ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSave({ name: name.trim(), color, description: description.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">
            {initial ? 'Edit Queue' : 'New Queue'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Name <span className="text-red-500">*</span></label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Support Escalations"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Color</label>
            <ColorPicker value={color} onChange={setColor} />
            <div className="mt-2 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-muted-foreground">{color}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {initial ? 'Save Changes' : 'Create Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation ───────────────────────────────────────────────────────

interface DeleteConfirmProps {
  queue: Queue;
  taskCount: number | null;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  deleting: boolean;
}

function DeleteConfirmDialog({ queue, taskCount, onConfirm, onClose, deleting }: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-red-500/30 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Delete Queue?</h2>
            <p className="text-sm text-muted-foreground mt-0.5">This action cannot be undone.</p>
          </div>
        </div>

        <div className="bg-secondary rounded-lg p-4 mb-5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: queue.color }} />
            <span className="text-sm font-medium text-foreground">{queue.name}</span>
          </div>
          {queue.description && (
            <p className="text-xs text-muted-foreground pl-5">{queue.description}</p>
          )}
        </div>

        {taskCount === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-5">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking affected tasks…
          </div>
        ) : taskCount > 0 ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-600 dark:text-amber-300">
              <strong>{taskCount} task{taskCount !== 1 ? 's' : ''}</strong> will lose their queue assignment.
            </p>
          </div>
        ) : (
          <div className="bg-secondary rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-muted-foreground">No tasks are assigned to this queue.</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting || taskCount === null}
            className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete Queue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, onStatusChange }: { task: Task; onStatusChange: (id: number, status: string) => void }) {
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
  const priorityCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.normal;
  const due = formatDate(task.end_date);
  const isOverdue = task.end_date && task.status !== 'completed' && task.status !== 'cancelled'
    && new Date(task.end_date) < new Date();

  const NEXT_STATUS: Record<string, string> = {
    pending: 'in_progress',
    in_progress: 'completed',
    on_hold: 'in_progress',
    completed: 'pending',
    cancelled: 'pending',
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/40 transition-colors group">
      {/* Status toggle */}
      <button
        onClick={() => onStatusChange(task.id, NEXT_STATUS[task.status] ?? 'in_progress')}
        className={cn('mt-0.5 flex-shrink-0 transition-colors hover:opacity-70', statusCfg.className)}
        title={`Status: ${statusCfg.label} — click to advance`}
      >
        {statusCfg.icon}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className={cn(
            'text-sm font-medium',
            task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground',
          )}>
            {task.name}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono mt-0.5">#{task.task_number}</span>
        </div>

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {/* Priority */}
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', priorityCfg.className)}>
            {priorityCfg.label}
          </span>

          {/* Status */}
          <span className={cn('text-[10px] flex items-center gap-1', statusCfg.className)}>
            {statusCfg.label}
          </span>

          {/* Assignee */}
          {task.assigned_to_name && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />
              {task.assigned_to_name}
            </span>
          )}

          {/* Due date */}
          {due && (
            <span className={cn('text-[11px] flex items-center gap-1', isOverdue ? 'text-red-400' : 'text-muted-foreground')}>
              <Calendar className="w-3 h-3" />
              {due}
              {isOverdue && ' (overdue)'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function QueuesView() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQueueId, setSelectedQueueId] = useState<number | 'unqueued' | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [deleteQueue, setDeleteQueue] = useState<Queue | null>(null);
  const [deleteTaskCount, setDeleteTaskCount] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/org/task-queues`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const qs: Queue[] = await r.json();
      setQueues(qs);
      // Auto-select first queue
      if (qs.length > 0 && selectedQueueId === null) {
        setSelectedQueueId(qs[0].id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const r = await fetch(`${API}/tasks`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTasks(await r.json());
    } catch {
      // silently ignore — queues still usable
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueues();
    fetchTasks();
  }, [fetchQueues, fetchTasks]);

  // Auto-select first queue when queues load
  useEffect(() => {
    if (queues.length > 0 && selectedQueueId === null) {
      setSelectedQueueId(queues[0].id);
    }
  }, [queues, selectedQueueId]);

  // ── Task status update ────────────────────────────────────────────────────

  async function handleStatusChange(taskId: number, newStatus: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      await fetch(`${API}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      await fetchTasks();
    }
  }

  // ── Queue CRUD ────────────────────────────────────────────────────────────

  async function handleCreate(data: { name: string; color: string; description: string }) {
    setSaving(true);
    try {
      const r = await fetch(`${API}/org/task-queues`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const newQueue: Queue = await r.json();
      setQueues(prev => [...prev, newQueue]);
      setSelectedQueueId(newQueue.id);
      setShowCreate(false);
    } catch (e: any) {
      alert(`Failed to create queue: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(data: { name: string; color: string; description: string }) {
    if (!editQueue) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/org/task-queues/${editQueue.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await fetchQueues();
      setEditQueue(null);
    } catch (e: any) {
      alert(`Failed to update queue: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function openDelete(q: Queue) {
    setDeleteQueue(q);
    setDeleteTaskCount(null);
    try {
      const r = await fetch(`${API}/org/task-queues/${q.id}/task-count`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setDeleteTaskCount(d.count); }
    } catch { setDeleteTaskCount(0); }
  }

  async function handleDelete() {
    if (!deleteQueue) return;
    setDeleting(true);
    try {
      const r = await fetch(`${API}/org/task-queues/${deleteQueue.id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setQueues(prev => prev.filter(q => q.id !== deleteQueue.id));
      if (selectedQueueId === deleteQueue.id) {
        setSelectedQueueId(queues.find(q => q.id !== deleteQueue.id)?.id ?? null);
      }
      setDeleteQueue(null);
      setDeleteTaskCount(null);
      await fetchTasks();
    } catch (e: any) {
      alert(`Failed to delete queue: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  function tasksForQueue(queueId: number | 'unqueued') {
    if (queueId === 'unqueued') return tasks.filter(t => t.queue_id === null);
    return tasks.filter(t => t.queue_id === queueId);
  }

  const selectedQueue = selectedQueueId !== null && selectedQueueId !== 'unqueued'
    ? queues.find(q => q.id === selectedQueueId) ?? null
    : null;

  const selectedTasks = selectedQueueId !== null ? tasksForQueue(selectedQueueId) : [];
  const unqueuedCount = tasks.filter(t => t.queue_id === null).length;

  // Active (non-completed/cancelled) vs done
  const activeTasks = selectedTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const doneTasks = selectedTasks.filter(t => t.status === 'completed' || t.status === 'cancelled');

  return (
    <div className="flex h-full bg-background overflow-hidden">

      {/* ── Queue sidebar ── */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-foreground">Task Queues</span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="New queue"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-red-500">{error}</div>
          ) : (
            <>
              {queues.map(q => {
                const count = tasksForQueue(q.id).length;
                const active = tasksForQueue(q.id).filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
                const isSelected = selectedQueueId === q.id;
                return (
                  <div key={q.id} className={cn(
                    'group flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors',
                    isSelected ? 'bg-secondary' : 'hover:bg-secondary/60',
                  )} onClick={() => setSelectedQueueId(q.id)}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: q.color }} />
                    <span className={cn('text-sm flex-1 truncate', isSelected ? 'text-foreground font-medium' : 'text-foreground/80')}>
                      {q.name}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {active > 0 && (
                        <span className="text-[10px] font-medium bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded-full tabular-nums">
                          {active}
                        </span>
                      )}
                      {count > 0 && active === 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); setEditQueue(q); }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openDelete(q); }}
                        className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Unqueued */}
              {unqueuedCount > 0 && (
                <div
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors mt-1 border-t border-border pt-3',
                    selectedQueueId === 'unqueued' ? 'bg-secondary' : 'hover:bg-secondary/60',
                  )}
                  onClick={() => setSelectedQueueId('unqueued')}
                >
                  <div className="w-3 h-3 rounded-full bg-muted flex-shrink-0 border border-border" />
                  <span className={cn('text-sm flex-1', selectedQueueId === 'unqueued' ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                    Unqueued
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{unqueuedCount}</span>
                </div>
              )}

              {queues.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-muted-foreground">No queues yet.</p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Create one →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Task panel ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {selectedQueueId === null ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Inbox className="w-12 h-12 opacity-20" />
            <p className="text-sm">Select a queue to view its tasks</p>
          </div>
        ) : (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {selectedQueue ? (
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: selectedQueue.color }} />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-muted border border-border flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <h1 className="text-base font-semibold text-foreground truncate">
                    {selectedQueueId === 'unqueued' ? 'Unqueued Tasks' : (selectedQueue?.name ?? '…')}
                  </h1>
                  {selectedQueue?.description && (
                    <p className="text-xs text-muted-foreground truncate">{selectedQueue.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-muted-foreground">
                  {activeTasks.length} active · {doneTasks.length} done
                </span>
              </div>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto">
              {tasksLoading ? (
                <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading tasks…</span>
                </div>
              ) : selectedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
                  <Flag className="w-10 h-10 opacity-20" />
                  <p className="text-sm">No tasks in this queue</p>
                </div>
              ) : (
                <div>
                  {/* Active tasks */}
                  {activeTasks.length > 0 && (
                    <div>
                      {activeTasks.map(t => (
                        <TaskRow key={t.id} task={t} onStatusChange={handleStatusChange} />
                      ))}
                    </div>
                  )}

                  {/* Done tasks */}
                  {doneTasks.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest bg-secondary/30 border-y border-border">
                        Completed & Cancelled ({doneTasks.length})
                      </div>
                      {doneTasks.map(t => (
                        <TaskRow key={t.id} task={t} onStatusChange={handleStatusChange} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Dialogs */}
      {showCreate && (
        <QueueFormDialog
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
          saving={saving}
        />
      )}
      {editQueue && (
        <QueueFormDialog
          initial={editQueue}
          onSave={handleEdit}
          onClose={() => setEditQueue(null)}
          saving={saving}
        />
      )}
      {deleteQueue && (
        <DeleteConfirmDialog
          queue={deleteQueue}
          taskCount={deleteTaskCount}
          onConfirm={handleDelete}
          onClose={() => { setDeleteQueue(null); setDeleteTaskCount(null); }}
          deleting={deleting}
        />
      )}
    </div>
  );
}
