import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, User, Calendar, Tag, Layers, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';

const API = '/api';

interface UserItem  { id: number; name: string; email: string; }
interface Agent     { id: number; name: string; }
interface Queue     { id: number; name: string; }

interface Props {
  nodeTopic: string;          // raw text of the right-clicked node
  onClose: () => void;
  onCreated: (task: { id: number; status: string }) => void;
}

// ── Smart pre-population ───────────────────────────────────────────────────────
// Derive sensible defaults from the node's text alone.

function detectPriority(text: string): 'high' | 'normal' | 'low' {
  const t = text.toLowerCase();
  if (/\b(urgent|asap|critical|immediately|emergency|blocker|p0|high.?priority)\b/.test(t)) return 'high';
  if (/\b(low.?priority|minor|eventually|nice.?to.?have|backlog|p3|later)\b/.test(t))       return 'low';
  return 'normal';
}

function splitNameDescription(topic: string): { name: string; description: string } {
  // If short, use the full text as name.
  if (topic.length <= 80) return { name: topic, description: '' };
  // Try splitting at the first sentence boundary.
  const m = topic.match(/^(.{20,80}[.!?])\s*([\s\S]*)$/);
  if (m) return { name: m[1].trim(), description: m[2].trim() };
  // Fall back: first 80 chars as name, rest as description.
  return { name: topic.slice(0, 80).trim(), description: topic.slice(80).trim() };
}

// ── TaskCreatePanel ────────────────────────────────────────────────────────────

export function TaskCreatePanel({ nodeTopic, onClose, onCreated }: Props) {
  const { fetchHeaders } = useAuth();

  // Pre-populate from node text
  const { name: initName, description: initDesc } = splitNameDescription(nodeTopic.trim());
  const initPriority = detectPriority(nodeTopic);

  const [name,        setName]        = useState(initName);
  const [description, setDescription] = useState(initDesc);
  const [priority,    setPriority]    = useState<string>(initPriority);
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [assignedTo,  setAssignedTo]  = useState<string>('');

  const [users,  setUsers]  = useState<UserItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);

  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const [error,  setError]  = useState('');

  // Load reference data
  useEffect(() => {
    const h = fetchHeaders();
    Promise.all([
      fetch(`${API}/users`,          { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/ai-agents`,      { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/org/task-queues`,{ headers: h }).then(r => r.json()).catch(() => []),
    ]).then(([u, a, q]) => {
      setUsers(Array.isArray(u)  ? u  : u?.users  ?? []);
      setAgents(Array.isArray(a) ? a  : a?.agents ?? []);
      setQueues(Array.isArray(q) ? q  : q?.queues ?? []);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      // Parse assignedTo: "user:123", "agent:456", or "queue:789"
      let assignedToId: number | null = null;
      let aiAgentId:    number | null = null;
      let queueId:      number | null = null;
      if (assignedTo.startsWith('user:'))  assignedToId = Number(assignedTo.split(':')[1]);
      if (assignedTo.startsWith('agent:')) aiAgentId    = Number(assignedTo.split(':')[1]);
      if (assignedTo.startsWith('queue:')) queueId      = Number(assignedTo.split(':')[1]);

      const body = {
        name:        name.trim(),
        description: description.trim(),
        priority,
        startDate:   startDate  || null,
        endDate:     endDate    || null,
        assignedTo:  assignedToId,
        aiAgentId,
        queueId,
        source:      'Mind Map',
      };

      const r = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('Server error');
      const task = await r.json();
      setDone(true);
      setTimeout(() => onCreated({ id: task.id, status: task.status ?? 'todo' }), 900);
    } catch {
      setError('Could not create task. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [name, description, priority, startDate, endDate, assignedTo, fetchHeaders, onCreated]);

  // Keyboard shortcut — Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const priorityColors: Record<string, string> = {
    high:   'text-red-500',
    normal: 'text-yellow-500',
    low:    'text-green-500',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create Task"
        className="absolute inset-y-0 right-0 z-50 w-full max-w-md flex flex-col bg-card border-l border-border shadow-2xl"
        style={{ animation: 'slideInRight 0.18s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Create Task</h2>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              From mind map node: <em>"{nodeTopic.slice(0, 60)}{nodeTopic.length > 60 ? '…' : ''}"</em>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success state */}
        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-green-500">
            <CheckCircle2 className="w-12 h-12" />
            <p className="text-sm font-medium">Task created!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Name */}
            <div className="space-y-1">
              <label htmlFor="tcp-name" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Tag className="w-3 h-3" /> Task Name <span className="text-destructive">*</span>
              </label>
              <input
                id="tcp-name"
                autoFocus
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Task name…"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label htmlFor="tcp-desc" className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                id="tcp-desc"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="What needs to be done…"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label htmlFor="tcp-priority" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Layers className="w-3 h-3" /> Priority
                {initPriority !== 'normal' && (
                  <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    auto-detected
                  </span>
                )}
              </label>
              <select
                id="tcp-priority"
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="high">🔴 High</option>
                <option value="normal">🟡 Normal</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="tcp-start" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Start Date
                </label>
                <input
                  id="tcp-start"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="tcp-end" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Due Date
                </label>
                <input
                  id="tcp-end"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Assigned To */}
            <div className="space-y-1">
              <label htmlFor="tcp-assign" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> Assigned To
              </label>
              <select
                id="tcp-assign"
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="">— Unassigned —</option>
                {users.length > 0 && (
                  <optgroup label="People">
                    {users.map(u => (
                      <option key={`user:${u.id}`} value={`user:${u.id}`}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </optgroup>
                )}
                {agents.length > 0 && (
                  <optgroup label="AI Agents">
                    {agents.map(a => (
                      <option key={`agent:${a.id}`} value={`agent:${a.id}`}>{a.name}</option>
                    ))}
                  </optgroup>
                )}
                {queues.length > 0 && (
                  <optgroup label="Queues">
                    {queues.map(q => (
                      <option key={`queue:${q.id}`} value={`queue:${q.id}`}>{q.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 pb-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create Task
              </button>
            </div>

          </form>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
