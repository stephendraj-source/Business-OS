import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Inbox, AlertTriangle, Loader2, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = '/api';

interface Queue {
  id: number;
  name: string;
  color: string;
  description: string;
}

const PRESET_COLORS = [
  '#94a3b8', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f59e0b', '#6366f1',
];

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('nonprofit-os-auth-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Color Swatch ────────────────────────────────────────────────────────────

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

// ── Queue Form Dialog ──────────────────────────────────────────────────────

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
              className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
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

// ── Delete Confirmation Dialog ─────────────────────────────────────────────

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
              <strong>{taskCount} task{taskCount !== 1 ? 's' : ''}</strong> currently assigned to this queue will
              lose their queue assignment when it is deleted.
            </p>
          </div>
        ) : (
          <div className="bg-secondary rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-muted-foreground">No tasks are currently assigned to this queue.</p>
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

// ── Main View ──────────────────────────────────────────────────────────────

export function QueuesView() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setQueues(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueues(); }, [fetchQueues]);

  async function handleCreate(data: { name: string; color: string; description: string }) {
    setSaving(true);
    try {
      const r = await fetch(`${API}/org/task-queues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await fetchQueues();
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      if (r.ok) {
        const data = await r.json();
        setDeleteTaskCount(data.count);
      }
    } catch {
      setDeleteTaskCount(0);
    }
  }

  async function handleDelete() {
    if (!deleteQueue) return;
    setDeleting(true);
    try {
      const r = await fetch(`${API}/org/task-queues/${deleteQueue.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await fetchQueues();
      setDeleteQueue(null);
      setDeleteTaskCount(null);
    } catch (e: any) {
      alert(`Failed to delete queue: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Inbox className="w-5 h-5 text-indigo-500" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Task Queues</h1>
            <p className="text-xs text-muted-foreground">Manage queues that tasks can be assigned to</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Queue
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading queues…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-40 gap-3 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : queues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <Inbox className="w-10 h-10" />
            <p className="text-sm">No queues yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {queues.map(q => (
              <div
                key={q.id}
                className="group bg-card hover:bg-accent/30 border border-border hover:border-border/80 rounded-xl p-4 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-border"
                      style={{ backgroundColor: q.color }}
                    />
                    <span className="text-sm font-medium text-foreground truncate">{q.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => setEditQueue(q)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit queue"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openDelete(q)}
                      className="p-1.5 rounded-md hover:bg-red-500/20 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Delete queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {q.description && (
                  <p className="text-xs text-muted-foreground mt-2 pl-7 line-clamp-2">{q.description}</p>
                )}
              </div>
            ))}
          </div>
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
