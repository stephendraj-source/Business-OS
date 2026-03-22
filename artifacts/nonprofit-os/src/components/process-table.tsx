import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EditableCell } from './editable-cell';
import { useProcessesData, useCategoriesData, useOptimisticUpdateProcess, useDeleteProcessRow, useCreateProcessMutation, useAiPopulateProcessMutation } from '@/hooks/use-app-data';
import { useQueryClient } from '@tanstack/react-query';
import { getListProcessesQueryKey } from '@workspace/api-client-react';
import { Search, Loader2, Trash2, GripVertical, Download, Upload, CheckCircle2, Plus, X, Cpu, Sparkles, ShieldCheck, Eye, ClipboardList, Bot, GitBranch, Link2, RotateCcw, UserCheck, Star, TrendingUp, TrendingDown, Minus, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, FolderOpen, FileSpreadsheet, FileText, Pencil } from 'lucide-react';
import { ChecklistPanel } from './checklist-panel';
import { cn, getCategoryColorClass } from '@/lib/utils';
import { dispatchCreditsRefresh } from '@/hooks/use-credits';
import { useAuth } from '@/contexts/AuthContext';
import { useFavourites } from '@/contexts/FavouritesContext';
import type { Process } from '@workspace/api-client-react';

const API = '/api';

interface LinkedAgent { id: number; agentNumber: number; name: string }
interface LinkedWorkflow { id: number; name: string }
interface AssignedUser { id: number; name: string; email: string; role: string }

type GovStandard = { id: number; complianceName: string };
type GovMap = Record<number, number[]>;

interface ColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  fixed?: boolean;
}

const FIXED_START: ColumnDef[] = [
  { key: 'include', label: 'Include', defaultWidth: 72, minWidth: 60, fixed: true },
  { key: '#',       label: 'Process ID', defaultWidth: 90, minWidth: 70, fixed: true },
];

const REORDERABLE: ColumnDef[] = [
  { key: 'category',             label: 'Category',             defaultWidth: 185, minWidth: 110 },
  { key: 'priority',             label: 'Priority',             defaultWidth: 90,  minWidth: 70  },
  { key: 'processName',          label: 'Process Name',          defaultWidth: 175, minWidth: 110 },
  { key: 'processDescription',   label: 'Process Description',   defaultWidth: 260, minWidth: 140 },
  { key: 'aiAgent',              label: 'AI Agent',              defaultWidth: 175, minWidth: 110 },
  { key: 'aiAgentActive',        label: 'AI Agent Active',       defaultWidth: 120, minWidth: 100 },
  { key: 'purpose',              label: 'Purpose',               defaultWidth: 215, minWidth: 130 },
  { key: 'inputs',               label: 'Inputs',                defaultWidth: 200, minWidth: 130 },
  { key: 'outputs',              label: 'Outputs',               defaultWidth: 200, minWidth: 130 },
  { key: 'humanInTheLoop',       label: 'Human-in-the-Loop',    defaultWidth: 175, minWidth: 110 },
  { key: 'kpi',                  label: 'KPI',                   defaultWidth: 175, minWidth: 110 },
  { key: 'target',               label: 'Target',                defaultWidth: 160, minWidth: 110 },
  { key: 'achievement',          label: 'Achievement',           defaultWidth: 160, minWidth: 110 },
  { key: 'trafficLight',         label: 'Status',                defaultWidth: 110, minWidth: 90 },
  { key: 'estimatedValueImpact', label: 'Value Impact',          defaultWidth: 190, minWidth: 120 },
  { key: 'industryBenchmark',    label: 'Industry Benchmark',    defaultWidth: 235, minWidth: 150 },
  { key: 'governance',           label: 'Governance',            defaultWidth: 190, minWidth: 130 },
];

const FIXED_END: ColumnDef[] = [
  { key: 'actions', label: '', defaultWidth: 84, minWidth: 72, fixed: true },
];

const ALL_COLS = [...FIXED_START, ...REORDERABLE, ...FIXED_END];

function initWidths() {
  return Object.fromEntries(ALL_COLS.map(c => [c.key, c.defaultWidth]));
}

interface TableProps {
  mode?: 'matrix' | 'portfolio';
}

function PanelTextField({ label, value, onSave, multiline }: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<any>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  function save() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
    if (e.key === 'Enter' && !e.shiftKey && !multiline) { e.preventDefault(); save(); }
  }

  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">{label}</div>
      {editing ? (
        multiline ? (
          <textarea
            ref={ref}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={handleKey}
            className="w-full px-3 py-2 text-sm border border-primary/40 bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y min-h-[72px] leading-relaxed"
          />
        ) : (
          <input
            ref={ref}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={handleKey}
            className="w-full px-3 py-2 text-sm border border-primary/40 bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )
      ) : (
        <div
          onClick={() => setEditing(true)}
          className={cn(
            "text-sm rounded-lg bg-secondary/30 px-3 py-2 border border-border/50 min-h-[38px] cursor-text hover:border-primary/30 hover:bg-secondary/50 transition-all whitespace-pre-wrap break-words leading-relaxed",
            !value && "italic text-muted-foreground/40"
          )}
        >
          {value || 'Click to edit…'}
        </div>
      )}
    </div>
  );
}

function ProcessDetailPanel({ process: initialProcess, onClose }: { process: Process; onClose: () => void }) {
  const { fetchHeaders } = useAuth();
  const { isFavourite, toggleFavourite } = useFavourites();
  const { data: processes } = useProcessesData();
  const process = (processes?.find(p => p.id === initialProcess.id) ?? initialProcess) as Process;
  const { mutate: updateProcess } = useOptimisticUpdateProcess();
  const { data: categories = [] } = useCategoriesData();
  const queryClient = useQueryClient();

  const [linkedAgents, setLinkedAgents] = useState<LinkedAgent[]>([]);
  const [linkedWorkflows, setLinkedWorkflows] = useState<LinkedWorkflow[]>([]);
  const [allAgents, setAllAgents] = useState<LinkedAgent[]>([]);
  const [allWorkflows, setAllWorkflows] = useState<LinkedWorkflow[]>([]);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);
  const [linksSaving, setLinksSaving] = useState(false);

  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([]);
  const [allUsers, setAllUsers] = useState<AssignedUser[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [assigneesSaving, setAssigneesSaving] = useState(false);

  const [editingId, setEditingId] = useState(false);
  const [editingIdValue, setEditingIdValue] = useState('');
  const [editingIdError, setEditingIdError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState(false);

  async function commitIdEdit() {
    const raw = editingIdValue.trim().replace(/^pro-?/i, '');
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 1) { setEditingIdError('Enter a valid number (e.g. 5 or PRO-005)'); return; }
    setSavingId(true);
    setEditingIdError(null);
    try {
      const r = await fetch(`/api/processes/${process.id}`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: num }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); setEditingIdError(e.error || 'Save failed'); return; }
      updateProcess({ id: process.id, data: { number: num } as any });
      setEditingId(false);
    } finally { setSavingId(false); }
  }

  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // ── Attachments ─────────────────────────────────────────────────────────
  interface Attachment { id: number; type: 'url' | 'file'; title: string; url?: string; file_name?: string; file_size?: number; mime_type?: string; created_at: string }
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    try {
      const r = await fetch(`${API}/processes/${initialProcess.id}/attachments`, { headers: fetchHeaders() });
      if (r.ok) setAttachments(await r.json());
    } finally { setAttachmentsLoading(false); }
  }, [initialProcess.id]);

  const addUrlAttachment = async () => {
    if (!urlInput.trim()) return;
    setAddingUrl(true);
    try {
      const r = await fetch(`${API}/processes/${initialProcess.id}/attachments/url`, {
        method: 'POST',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim(), title: urlTitle.trim() }),
      });
      if (r.ok) { setUrlInput(''); setUrlTitle(''); await fetchAttachments(); }
    } finally { setAddingUrl(false); }
  };

  const uploadFileAttachment = async (file: File) => {
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name);
      const { 'Content-Type': _ct, ...uploadHeaders } = fetchHeaders();
      const r = await fetch(`${API}/processes/${initialProcess.id}/attachments/upload`, {
        method: 'POST',
        headers: uploadHeaders,
        body: formData,
      });
      if (r.ok) await fetchAttachments();
    } finally { setUploadingFile(false); }
  };

  const deleteAttachment = async (id: number) => {
    await fetch(`${API}/processes/${initialProcess.id}/attachments/${id}`, { method: 'DELETE', headers: fetchHeaders() });
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const fetchLinks = useCallback(async () => {
    const r = await fetch(`${API}/processes/${initialProcess.id}/links`, { headers: fetchHeaders() });
    if (r.ok) {
      const data = await r.json();
      setLinkedAgents(data.agents || []);
      setLinkedWorkflows(data.workflows || []);
    }
  }, [initialProcess.id]);

  const fetchAssignees = useCallback(async () => {
    const r = await fetch(`${API}/processes/${initialProcess.id}/assignees`, { headers: fetchHeaders() });
    if (r.ok) setAssignedUsers(await r.json());
  }, [initialProcess.id]);

  const fetchAllOptions = useCallback(async () => {
    const [ar, wr, ur] = await Promise.all([
      fetch(`${API}/ai-agents`, { headers: fetchHeaders() }),
      fetch(`${API}/workflows`, { headers: fetchHeaders() }),
      fetch(`${API}/users`, { headers: fetchHeaders() }),
    ]);
    if (ar.ok) setAllAgents(await ar.json());
    if (wr.ok) setAllWorkflows(await wr.json());
    if (ur.ok) setAllUsers(await ur.json());
  }, []);

  useEffect(() => { fetchLinks(); fetchAssignees(); fetchAllOptions(); fetchAttachments(); }, [fetchLinks, fetchAssignees, fetchAllOptions, fetchAttachments]);

  const saveLinks = useCallback(async (agents: LinkedAgent[], workflows: LinkedWorkflow[]) => {
    setLinksSaving(true);
    await fetch(`${API}/processes/${initialProcess.id}/links`, {
      method: 'PUT',
      headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentIds: agents.map(a => a.id), workflowIds: workflows.map(w => w.id) }),
    });
    setLinksSaving(false);
  }, [initialProcess.id]);

  const addAgent = async (agent: LinkedAgent) => {
    if (linkedAgents.find(a => a.id === agent.id)) return;
    const updated = [...linkedAgents, agent];
    setLinkedAgents(updated);
    setShowAgentPicker(false);
    await saveLinks(updated, linkedWorkflows);
  };

  const removeAgent = async (id: number) => {
    const updated = linkedAgents.filter(a => a.id !== id);
    setLinkedAgents(updated);
    await saveLinks(updated, linkedWorkflows);
  };

  const addWorkflow = async (wf: LinkedWorkflow) => {
    if (linkedWorkflows.find(w => w.id === wf.id)) return;
    const updated = [...linkedWorkflows, wf];
    setLinkedWorkflows(updated);
    setShowWorkflowPicker(false);
    await saveLinks(linkedAgents, updated);
  };

  const removeWorkflow = async (id: number) => {
    const updated = linkedWorkflows.filter(w => w.id !== id);
    setLinkedWorkflows(updated);
    await saveLinks(linkedAgents, updated);
  };

  const saveAssignees = useCallback(async (next: AssignedUser[]) => {
    setAssigneesSaving(true);
    await fetch(`${API}/processes/${initialProcess.id}/assignees`, {
      method: 'PUT',
      headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: next.map(u => u.id) }),
    });
    setAssigneesSaving(false);
  }, [initialProcess.id]);

  const addAssignee = async (user: AssignedUser) => {
    if (assignedUsers.find(u => u.id === user.id)) return;
    const updated = [...assignedUsers, user];
    setAssignedUsers(updated);
    setShowUserPicker(false);
    await saveAssignees(updated);
  };

  const removeAssignee = async (id: number) => {
    const updated = assignedUsers.filter(u => u.id !== id);
    setAssignedUsers(updated);
    await saveAssignees(updated);
  };

  const pid = `PRO-${String(process.number).padStart(3, '0')}`;
  const CYCLE = ['', 'green', 'orange', 'red'] as const;
  const tlColorMap: Record<string, { bg: string; glow: string; label: string }> = {
    green:  { bg: 'bg-green-500', glow: '0 0 8px rgba(34,197,94,0.7)',  label: 'On Track' },
    orange: { bg: 'bg-amber-400', glow: '0 0 8px rgba(251,191,36,0.7)', label: 'At Risk' },
    red:    { bg: 'bg-red-500',   glow: '0 0 8px rgba(239,68,68,0.7)',  label: 'Off Track' },
  };
  const tl = (process as any).trafficLight as string ?? '';
  const nextTl = CYCLE[(CYCLE.indexOf(tl as any) + 1) % CYCLE.length];
  const tlMeta = tl ? tlColorMap[tl] : null;

  function save(field: string, value: string | boolean | number) {
    updateProcess({ id: process.id, data: { [field]: value } as any });
  }

  async function handleEvaluate() {
    setEvaluating(true);
    setEvalError(null);
    try {
      const r = await fetch(`${API}/processes/${process.id}/evaluate`, { method: 'POST', headers: fetchHeaders() });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Evaluation failed');
      }
      const updated = await r.json();
      queryClient.setQueryData(getListProcessesQueryKey(), (old: any[]) =>
        old?.map(p => p.id === updated.id ? { ...p, evaluation: updated.evaluation } : p)
      );
    } catch (err: any) {
      setEvalError(err.message || 'Something went wrong');
    } finally {
      setEvaluating(false);
      dispatchCreditsRefresh();
    }
  }

  async function handleAICompliance() {
    setScoring(true);
    setScoreError(null);
    try {
      const r = await fetch(`${API}/processes/${process.id}/ai-compliance`, { method: 'POST', headers: fetchHeaders() });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Scoring failed');
      }
      const updated = await r.json();
      queryClient.setQueryData(getListProcessesQueryKey(), (old: any[]) =>
        old?.map(p => p.id === updated.id ? { ...p, aiScore: updated.aiScore, aiReasoning: updated.aiReasoning } : p)
      );
    } catch (err: any) {
      setScoreError(err.message || 'Something went wrong');
    } finally {
      setScoring(false);
      dispatchCreditsRefresh();
    }
  }

  const parsedEval = (() => {
    const raw = (process as any).evaluation;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  })();

  const ratingMeta: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    'Exceeds Target':    { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: <TrendingUp className="w-3 h-3" /> },
    'On Target':         { color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/30',     icon: <CheckCircle2 className="w-3 h-3" /> },
    'Near Target':       { color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',     icon: <Minus className="w-3 h-3" /> },
    'Below Target':      { color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/30',   icon: <TrendingDown className="w-3 h-3" /> },
    'Well Below Target': { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',         icon: <TrendingDown className="w-3 h-3" /> },
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full z-50 w-[440px] max-w-full bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-none">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-mono text-primary mb-0.5">{pid}</div>
            <h3 className="font-semibold text-foreground text-base leading-tight truncate">{process.processName || 'Unnamed Process'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{process.category}</p>
          </div>
          <div className="ml-3 flex items-center gap-1 shrink-0">
            <button
              onClick={() => toggleFavourite('process', process.id, process.processName || 'Unnamed Process')}
              className={cn("p-1.5 rounded-lg hover:bg-amber-500/10 text-muted-foreground hover:text-amber-400 transition-colors", isFavourite('process', process.id) && "text-amber-400")}
              title={isFavourite('process', process.id) ? "Remove from favourites" : "Add to favourites"}
            >
              <Star className={cn("w-4 h-4", isFavourite('process', process.id) && "fill-amber-400")} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Process ID – editable */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">Process ID</div>
            {editingId ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-mono font-bold shrink-0">PRO-</span>
                  <input
                    autoFocus
                    type="text"
                    value={editingIdValue}
                    onChange={e => { setEditingIdValue(e.target.value); setEditingIdError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') commitIdEdit(); if (e.key === 'Escape') setEditingId(false); }}
                    onBlur={() => { if (!savingId) commitIdEdit(); }}
                    className={cn(
                      "flex-1 px-2 py-1 text-sm font-mono rounded border bg-background text-primary focus:outline-none focus:ring-1 focus:ring-primary/50",
                      editingIdError ? "border-red-500" : "border-primary/40"
                    )}
                    placeholder="001"
                  />
                </div>
                {editingIdError && <p className="text-xs text-red-400">{editingIdError}</p>}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2 border border-border/50 group">
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{pid}</span>
                <button
                  onClick={() => { setEditingIdValue(String(process.number)); setEditingIdError(null); setEditingId(true); }}
                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="Edit Process ID"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Category – dropdown */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">Category</div>
            <select
              value={process.category}
              onChange={e => save('category', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border/50 bg-secondary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 cursor-pointer hover:border-primary/30 hover:bg-secondary/50 transition-all"
            >
              {(categories as string[]).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Priority – dropdown 1-5 */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">Priority <span className="text-muted-foreground/50 normal-case font-normal">(1 = highest)</span></div>
            <select
              value={(process as any).priority ?? 5}
              onChange={e => save('priority', Number(e.target.value))}
              className="w-full text-sm bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 cursor-pointer"
            >
              <option value={1}>1 — Critical</option>
              <option value={2}>2 — High</option>
              <option value={3}>3 — Medium</option>
              <option value={4}>4 — Low</option>
              <option value={5}>5 — Lowest</option>
            </select>
          </div>

          {/* Status – cycling traffic light */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">Status</div>
            <div
              className="flex items-center gap-3 rounded-lg bg-secondary/30 px-3 py-2.5 border border-border/50 hover:border-primary/30 hover:bg-secondary/50 transition-all cursor-pointer"
              onClick={() => save('trafficLight', nextTl)}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex-shrink-0 transition-all duration-200",
                  tlMeta ? `${tlMeta.bg} border-2 border-transparent` : "border-2 border-dashed border-muted-foreground/30"
                )}
                style={tlMeta ? { boxShadow: tlMeta.glow } : undefined}
              />
              <span className="text-sm">{tlMeta ? tlMeta.label : <em className="text-muted-foreground/40 not-italic">None — click to set</em>}</span>
            </div>
          </div>

          {/* In Portfolio – toggle */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">In Portfolio</div>
            <button
              onClick={() => save('included', !process.included)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border w-full text-left",
                process.included
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-secondary/30 border-border/50 text-muted-foreground hover:border-primary/30 hover:bg-secondary/50"
              )}
            >
              <span className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                process.included ? "bg-green-500 border-green-500" : "border-muted-foreground/40"
              )}>
                {process.included && (
                  <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-none stroke-white stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                    <polyline points="1,4 3.5,6.5 9,1" />
                  </svg>
                )}
              </span>
              {process.included ? 'Yes – included in portfolio' : 'No – excluded from portfolio'}
            </button>
          </div>

          <div className="border-t border-border/50 pt-4 space-y-4">
            <PanelTextField label="Process Name"       value={process.processName ?? ''}          onSave={v => save('processName', v)} />
            <PanelTextField label="Description"        value={process.processDescription ?? ''}   onSave={v => save('processDescription', v)} multiline />
            <PanelTextField label="AI Agent"           value={process.aiAgent ?? ''}              onSave={v => save('aiAgent', v)} />
            <PanelTextField label="Purpose"            value={process.purpose ?? ''}              onSave={v => save('purpose', v)} multiline />
            <PanelTextField label="Inputs"             value={process.inputs ?? ''}               onSave={v => save('inputs', v)} multiline />
            <PanelTextField label="Outputs"            value={process.outputs ?? ''}              onSave={v => save('outputs', v)} multiline />
            <PanelTextField label="Human in the Loop"  value={process.humanInTheLoop ?? ''}       onSave={v => save('humanInTheLoop', v)} multiline />
            <PanelTextField label="KPI"                value={process.kpi ?? ''}                  onSave={v => save('kpi', v)} />
            <PanelTextField label="Target"             value={process.target ?? ''}               onSave={v => save('target', v)} />
            <PanelTextField label="Achievement"        value={process.achievement ?? ''}          onSave={v => save('achievement', v)} />

            {/* ── AI Evaluation ─────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                  <Star className="w-3 h-3 text-amber-400" />Evaluation
                </div>
                <button
                  onClick={handleEvaluate}
                  disabled={evaluating}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all",
                    evaluating
                      ? "border-border text-muted-foreground cursor-not-allowed"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                  )}
                >
                  {evaluating
                    ? <><Loader2 className="w-3 h-3 animate-spin" />Evaluating…</>
                    : parsedEval
                      ? <><RefreshCw className="w-3 h-3" />Re-evaluate</>
                      : <><Sparkles className="w-3 h-3" />Evaluate with AI</>
                  }
                </button>
              </div>

              {evalError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {evalError}
                </div>
              )}

              {!parsedEval && !evaluating && !evalError && (
                <div className="text-xs text-muted-foreground/40 italic text-center py-3 border border-dashed border-border/40 rounded-lg">
                  No evaluation yet — click "Evaluate with AI" to rate achievement vs. target
                </div>
              )}

              {parsedEval && (() => {
                const score: number = parsedEval.score ?? 0;
                const rating: string = parsedEval.rating ?? '';
                const meta = ratingMeta[rating];
                const scorePct = (score / 10) * 100;
                const scoreColor =
                  score >= 8 ? 'bg-emerald-500' :
                  score >= 6 ? 'bg-green-500' :
                  score >= 4 ? 'bg-amber-400' :
                  score >= 2 ? 'bg-orange-500' : 'bg-red-500';

                return (
                  <div className="rounded-xl border border-border/60 bg-secondary/20 overflow-hidden">
                    {/* Score strip */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
                      <div className="flex-shrink-0 text-center">
                        <div className="text-2xl font-bold text-foreground leading-none">{score}</div>
                        <div className="text-[10px] text-muted-foreground font-medium">/10</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        {meta ? (
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border mb-1.5",
                            meta.bg, meta.color
                          )}>
                            {meta.icon}{rating}
                          </div>
                        ) : (
                          <div className="text-xs font-medium text-foreground mb-1.5">{rating}</div>
                        )}
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", scoreColor)}
                            style={{ width: `${scorePct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Detail rows */}
                    <div className="divide-y divide-border/30">
                      {parsedEval.summary && (
                        <div className="px-4 py-2.5">
                          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">Analysis</div>
                          <p className="text-xs text-foreground/80 leading-relaxed">{parsedEval.summary}</p>
                        </div>
                      )}
                      {parsedEval.gaps && (
                        <div className="px-4 py-2.5">
                          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1 text-orange-400/80">Gaps</div>
                          <p className="text-xs text-foreground/80 leading-relaxed">{parsedEval.gaps}</p>
                        </div>
                      )}
                      {parsedEval.recommendation && (
                        <div className="px-4 py-2.5">
                          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1 text-primary/80">Recommendation</div>
                          <p className="text-xs text-foreground/80 leading-relaxed">{parsedEval.recommendation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── AI Compliance Score ────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-primary" />AI Compliance Score
                </div>
                <button
                  onClick={handleAICompliance}
                  disabled={scoring}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all",
                    scoring
                      ? "border-border text-muted-foreground cursor-not-allowed"
                      : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  )}
                >
                  {scoring
                    ? <><Loader2 className="w-3 h-3 animate-spin" />Scoring…</>
                    : (process as any).aiScore != null
                      ? <><RefreshCw className="w-3 h-3" />Re-score</>
                      : <><Sparkles className="w-3 h-3" />Score with AI</>
                  }
                </button>
              </div>

              {scoreError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {scoreError}
                </div>
              )}

              {(process as any).aiScore == null && !scoring && !scoreError && (
                <div className="text-xs text-muted-foreground/40 italic text-center py-3 border border-dashed border-border/40 rounded-lg">
                  No compliance score yet — click "Score with AI" to assess compliance
                </div>
              )}

              {(process as any).aiScore != null && (() => {
                const score: number = (process as any).aiScore;
                const reasoning: string = (process as any).aiReasoning || '';
                const scoreColor =
                  score >= 90 ? 'bg-emerald-500' :
                  score >= 70 ? 'bg-green-500' :
                  score >= 50 ? 'bg-amber-400' :
                  score >= 30 ? 'bg-orange-500' : 'bg-red-500';
                const scoreLabel =
                  score >= 90 ? { text: 'Fully Compliant',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' } :
                  score >= 70 ? { text: 'Largely Compliant',  color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/30' } :
                  score >= 50 ? { text: 'Partially Compliant',color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30' } :
                  score >= 30 ? { text: 'Low Compliance',     color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/30' } :
                               { text: 'Non-Compliant',       color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30' };

                return (
                  <div className="rounded-xl border border-border/60 bg-secondary/20 overflow-hidden">
                    {/* Score strip */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
                      <div className="flex-shrink-0 text-center">
                        <div className="text-2xl font-bold text-foreground leading-none">{score}</div>
                        <div className="text-[10px] text-muted-foreground font-medium">%</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border mb-1.5",
                          scoreLabel.bg, scoreLabel.color
                        )}>
                          <ShieldCheck className="w-3 h-3" />{scoreLabel.text}
                        </div>
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", scoreColor)}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {reasoning && (
                      <div className="px-4 py-2.5">
                        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">AI Reasoning</div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{reasoning}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <PanelTextField label="Est. Value Impact"  value={process.estimatedValueImpact ?? ''} onSave={v => save('estimatedValueImpact', v)} />
            <PanelTextField label="Industry Benchmark" value={process.industryBenchmark ?? ''}    onSave={v => save('industryBenchmark', v)} />
          </div>

          {/* Linked Agents & Workflows */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              <Link2 className="w-3.5 h-3.5" />
              Linked Agents & Workflows
              {linksSaving && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
            </div>

            {/* Linked Agents */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-3 h-3" />AI Agents
              </div>
              {linkedAgents.length === 0 && !showAgentPicker && (
                <p className="text-xs text-muted-foreground/50 italic">No agents linked yet.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {linkedAgents.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                    <Bot className="w-3 h-3 shrink-0" />
                    {a.name || `Agent #${a.agentNumber}`}
                    <button onClick={() => removeAgent(a.id)} className="ml-0.5 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              {showAgentPicker ? (
                <div className="rounded-lg border border-border bg-background shadow-md overflow-hidden">
                  {allAgents.filter(a => !linkedAgents.find(la => la.id === a.id)).length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">All agents already linked.</div>
                  ) : allAgents.filter(a => !linkedAgents.find(la => la.id === a.id)).map(a => (
                    <button
                      key={a.id}
                      onClick={() => addAgent(a)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-left"
                    >
                      <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
                      {a.name || `Agent #${a.agentNumber}`}
                    </button>
                  ))}
                  <button onClick={() => setShowAgentPicker(false)} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/40 border-t border-border transition-colors">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAgentPicker(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                >
                  <Plus className="w-3 h-3" />Link an agent
                </button>
              )}
            </div>

            {/* Linked Workflows */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" />Workflows
              </div>
              {linkedWorkflows.length === 0 && !showWorkflowPicker && (
                <p className="text-xs text-muted-foreground/50 italic">No workflows linked yet.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {linkedWorkflows.map(w => (
                  <span key={w.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 text-xs font-medium border border-violet-500/20">
                    <GitBranch className="w-3 h-3 shrink-0" />
                    {w.name}
                    <button onClick={() => removeWorkflow(w.id)} className="ml-0.5 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              {showWorkflowPicker ? (
                <div className="rounded-lg border border-border bg-background shadow-md overflow-hidden">
                  {allWorkflows.filter(w => !linkedWorkflows.find(lw => lw.id === w.id)).length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">All workflows already linked.</div>
                  ) : allWorkflows.filter(w => !linkedWorkflows.find(lw => lw.id === w.id)).map(w => (
                    <button
                      key={w.id}
                      onClick={() => addWorkflow(w)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-left"
                    >
                      <GitBranch className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      {w.name}
                    </button>
                  ))}
                  <button onClick={() => setShowWorkflowPicker(false)} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/40 border-t border-border transition-colors">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowWorkflowPicker(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                >
                  <Plus className="w-3 h-3" />Link a workflow
                </button>
              )}
            </div>
          </div>

          {/* Assigned Users */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              <UserCheck className="w-3.5 h-3.5" />
              Assigned Users
              {assigneesSaving && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
            </div>
            {assignedUsers.length === 0 && !showUserPicker && (
              <p className="text-xs text-muted-foreground/50 italic">No users assigned yet.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {assignedUsers.map(u => (
                <span key={u.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                  <UserCheck className="w-3 h-3 shrink-0" />
                  {u.name}
                  <button onClick={() => removeAssignee(u.id)} className="ml-0.5 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            {showUserPicker ? (
              <div className="rounded-lg border border-border bg-background shadow-md overflow-hidden">
                {allUsers.filter(u => !assignedUsers.find(au => au.id === u.id)).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">All users already assigned.</div>
                ) : allUsers.filter(u => !assignedUsers.find(au => au.id === u.id)).map(u => (
                  <button
                    key={u.id}
                    onClick={() => addAssignee(u)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-left"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-foreground">{u.name}</span>
                      <span className="text-muted-foreground/60 ml-1.5">{u.email}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 capitalize shrink-0">{u.role}</span>
                  </button>
                ))}
                <button onClick={() => setShowUserPicker(false)} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/40 border-t border-border transition-colors">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setShowUserPicker(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <Plus className="w-3 h-3" />Assign a user
              </button>
            )}
          </div>
        </div>

        {/* Attachments */}
        <div className="border-t border-border/50 pt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
            <FolderOpen className="w-3.5 h-3.5" />
            Attachments
            {attachmentsLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
          </div>

          {/* Existing attachments list */}
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-secondary/40 border border-border/30 group">
                  {att.type === 'url'
                    ? <Link2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    : <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{att.title}</div>
                    {att.type === 'file' && att.file_size != null && (
                      <div className="text-[10px] text-muted-foreground/60">{formatFileSize(att.file_size)}</div>
                    )}
                    {att.type === 'url' && att.url && (
                      <div className="text-[10px] text-muted-foreground/60 truncate">{att.url}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {att.type === 'url' && att.url && (
                      <a href={att.url} target="_blank" rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Download className="w-3 h-3" />
                      </a>
                    )}
                    {att.type === 'file' && (
                      <a href={`${API}/processes/${initialProcess.id}/attachments/${att.id}/download`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Download className="w-3 h-3" />
                      </a>
                    )}
                    <button onClick={() => deleteAttachment(att.id)}
                      className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {attachments.length === 0 && !attachmentsLoading && (
            <p className="text-xs text-muted-foreground/50 italic">No attachments yet.</p>
          )}

          {/* Add URL */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1">
              <Link2 className="w-3 h-3" />Add URL
            </div>
            <input
              type="text"
              placeholder="Label (optional)"
              value={urlTitle}
              onChange={e => setUrlTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <div className="flex gap-1.5">
              <input
                type="url"
                placeholder="https://..."
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addUrlAttachment()}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                onClick={addUrlAttachment}
                disabled={!urlInput.trim() || addingUrl}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium border border-primary/20 disabled:opacity-40 transition-colors"
              >
                {addingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Add
              </button>
            </div>
          </div>

          {/* Upload file */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1">
              <Upload className="w-3 h-3" />Upload File
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { uploadFileAttachment(f); e.target.value = ''; } }} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {uploadingFile
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading…</>
                : <><Upload className="w-3.5 h-3.5" />Click to upload a file</>
              }
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function ProcessTable({ mode = 'matrix' }: TableProps) {
  const { fetchHeaders } = useAuth();
  const { data: processes, isLoading, error } = useProcessesData();
  const { data: categories } = useCategoriesData();
  const { mutate: updateProcess } = useOptimisticUpdateProcess();
  const { mutate: deleteProcess } = useDeleteProcessRow();
  const { mutate: createProcess, isPending: isCreating } = useCreateProcessMutation();
  const { mutate: aiPopulate, isPending: isAiPopulating } = useAiPopulateProcessMutation();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailProcess, setDetailProcess] = useState<Process | null>(null);
  const [checklistProcess, setChecklistProcess] = useState<Process | null>(null);
  const [checklistCounts, setChecklistCounts] = useState<Record<number, number>>({});
  const [undoEntry, setUndoEntry] = useState<{ label: string; restore: () => void } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/checklists/counts', { headers: fetchHeaders() }).then(r => r.ok ? r.json() : {}).then(setChecklistCounts).catch(() => {});
  }, []);

  const pushUndo = useCallback((label: string, restore: () => void) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoEntry({ label, restore });
    undoTimerRef.current = setTimeout(() => setUndoEntry(null), 6000);
  }, []);

  const dismissUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoEntry(null);
  }, []);

  const { mutate: updateProcessForUndo } = useOptimisticUpdateProcess();
  const cellSaved = useCallback((p: Process, field: string) => (oldValue: string, _newValue: string) => {
    pushUndo(`Reverted "${p.processName}"`, () => {
      updateProcessForUndo({ id: p.id, data: { [field]: oldValue } as any });
    });
  }, [pushUndo, updateProcessForUndo]);

  const [widths, setWidths] = useState<Record<string, number>>(initWidths);
  const [colOrder, setColOrder] = useState<string[]>(REORDERABLE.map(c => c.key));

  const [govStandards, setGovStandards] = useState<GovStandard[]>([]);
  const [govMap, setGovMap] = useState<GovMap>({});
  const [govPopoverFor, setGovPopoverFor] = useState<number | null>(null);
  const [govPopoverPos, setGovPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });


  useEffect(() => {
    fetch('/api/governance', { headers: fetchHeaders() }).then(r => r.json()).then((data: { id: number; complianceName: string }[]) => {
      setGovStandards(data.map(d => ({ id: d.id, complianceName: d.complianceName })));
    }).catch(() => {});
    fetch('/api/processes/governance-map', { headers: fetchHeaders() }).then(r => r.json()).then((data: GovMap) => {
      setGovMap(data);
    }).catch(() => {});
  }, []);

  const toggleGovAssignment = async (processId: number, govId: number) => {
    const current = govMap[processId] ?? [];
    const next = current.includes(govId)
      ? current.filter(id => id !== govId)
      : [...current, govId];
    setGovMap(prev => ({ ...prev, [processId]: next }));
    await fetch(`/api/processes/${processId}/governance`, {
      method: 'PUT',
      headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ governanceIds: next }),
    });
  };

  const resizing = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const dragKey = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragOverSide, setDragOverSide] = useState<'before' | 'after'>('before');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [exporting, setExporting] = useState(false);

  const handleExport = () => setShowExportModal(true);

  const doExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true);
    try {
      const url = format === 'csv' ? '/api/processes/export?format=csv' : '/api/processes/export';
      const ext = format === 'csv' ? 'csv' : 'xlsx';
      const mime = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const filename = `nonprofit-processes.${ext}`;

      // Try native file-save dialog (Chrome/Edge)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: format === 'csv' ? 'CSV File' : 'Excel File', accept: { [mime]: [`.${ext}`] } }],
          });
          const res = await fetch(url, { headers: fetchHeaders() });
          const blob = await res.blob();
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          setShowExportModal(false);
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') { setExporting(false); return; }
          // fall through to standard download
        }
      }

      // Fallback: standard browser download
      const res = await fetch(url, { headers: fetchHeaders() });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      setShowExportModal(false);
    } catch (err) {
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { 'Content-Type': _ct, ...importHeaders } = fetchHeaders();
      const res = await fetch('/api/processes/import', { method: 'POST', headers: importHeaders, body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import failed');
      setImportResult(result);
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const orderedReorderable = useMemo(() =>
    colOrder.map(k => REORDERABLE.find(c => c.key === k)!).filter(Boolean),
    [colOrder]
  );
  const allVisibleCols = [...FIXED_START, ...orderedReorderable, ...FIXED_END];
  const totalWidth = allVisibleCols.reduce((s, c) => s + (widths[c.key] ?? c.defaultWidth), 0);

  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = widths[key];
    resizing.current = { key, startX: e.clientX, startWidth };

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const { key, startX, startWidth } = resizing.current;
      const colDef = ALL_COLS.find(c => c.key === key)!;
      const newW = Math.max(colDef.minWidth, startWidth + (ev.clientX - startX));
      setWidths(prev => ({ ...prev, [key]: newW }));
    };
    const onUp = () => {
      resizing.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [widths]);

  const onDragStart = (key: string) => { dragKey.current = key; };
  const onDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    if (!dragKey.current || dragKey.current === key) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side: 'before' | 'after' = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    setDragOverKey(key);
    setDragOverSide(side);
  };
  const onDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const fromKey = dragKey.current;
    const side = dragOverSide;
    if (!fromKey || fromKey === targetKey) { dragKey.current = null; setDragOverKey(null); return; }
    setColOrder(prev => {
      const next = prev.filter(k => k !== fromKey);
      const toIdx = next.indexOf(targetKey);
      // Insert before or after the target based on which half mouse was in
      const insertAt = side === 'after' ? toIdx + 1 : toIdx;
      next.splice(insertAt, 0, fromKey);
      return next;
    });
    dragKey.current = null;
    setDragOverKey(null);
  };
  const onDragEnd = () => { dragKey.current = null; setDragOverKey(null); };

  const filteredProcesses = useMemo(() => {
    if (!processes) return [];
    const TL_ORD: Record<string, number> = { green: 3, orange: 2, red: 1 };
    const filtered = processes.filter(p => {
      if (mode === 'portfolio' && !p.included) return false;
      const matchesSearch = !search ||
        (p.processName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        p.processDescription.toLowerCase().includes(search.toLowerCase()) ||
        p.purpose.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
    if (!sortKey) return filtered.sort((a, b) => {
      const catCmp = (a.category ?? '').localeCompare(b.category ?? '');
      if (catCmp !== 0) return catCmp;
      return a.number - b.number;
    });
    const m = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      switch (sortKey) {
        case '#':                    av = a.number;                          bv = b.number; break;
        case 'category':             av = a.category ?? '';                  bv = b.category ?? ''; break;
        case 'processName':          av = a.processName ?? '';               bv = b.processName ?? ''; break;
        case 'processDescription':   av = a.processDescription ?? '';        bv = b.processDescription ?? ''; break;
        case 'aiAgent':              av = a.aiAgent ?? '';                   bv = b.aiAgent ?? ''; break;
        case 'aiAgentActive':        av = (a as any).aiAgentActive ? 1 : 0; bv = (b as any).aiAgentActive ? 1 : 0; break;
        case 'purpose':              av = a.purpose ?? '';                   bv = b.purpose ?? ''; break;
        case 'inputs':               av = a.inputs ?? '';                    bv = b.inputs ?? ''; break;
        case 'outputs':              av = a.outputs ?? '';                   bv = b.outputs ?? ''; break;
        case 'humanInTheLoop':       av = a.humanInTheLoop ?? '';            bv = b.humanInTheLoop ?? ''; break;
        case 'kpi':                  av = a.kpi ?? '';                       bv = b.kpi ?? ''; break;
        case 'target':               av = a.target ?? '';                    bv = b.target ?? ''; break;
        case 'achievement':          av = a.achievement ?? '';               bv = b.achievement ?? ''; break;
        case 'priority':             av = (a as any).priority ?? 999;           bv = (b as any).priority ?? 999; break;
        case 'trafficLight':         av = TL_ORD[(a as any).trafficLight] ?? 0; bv = TL_ORD[(b as any).trafficLight] ?? 0; break;
        case 'estimatedValueImpact': av = a.estimatedValueImpact ?? '';      bv = b.estimatedValueImpact ?? ''; break;
        case 'industryBenchmark':    av = a.industryBenchmark ?? '';         bv = b.industryBenchmark ?? ''; break;
        case 'include':              av = a.included ? 0 : 1;               bv = b.included ? 0 : 1; break;
        case 'governance':           av = (govMap[a.id]?.length ?? 0);      bv = (govMap[b.id]?.length ?? 0); break;
        default: return a.number - b.number;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * m;
      return String(av).localeCompare(String(bv)) * m;
    });
  }, [processes, search, selectedCategory, mode, sortKey, sortDir, govMap]);

  const handleIncludeToggle = (process: Process) => {
    updateProcess({ id: process.id, data: { included: !process.included } });
  };

  const includedCount = useMemo(() => filteredProcesses.filter(p => p.included).length, [filteredProcesses]);
  const allIncluded = filteredProcesses.length > 0 && includedCount === filteredProcesses.length;
  const someIncluded = includedCount > 0 && includedCount < filteredProcesses.length;

  const handleSelectAll = () => {
    const newValue = !allIncluded;
    filteredProcesses.forEach(p => {
      if (p.included !== newValue) {
        updateProcess({ id: p.id, data: { included: newValue } });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirmDelete === id) {
      deleteProcess({ id });
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 2500);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center flex-col gap-2">
        <div className="text-destructive font-semibold">Error loading processes</div>
        <div className="text-muted-foreground text-sm">Please try refreshing the page.</div>
      </div>
    );
  }

  const title = mode === 'portfolio' ? 'Process Catalogue' : 'Master Catalogue';
  const subtitle = mode === 'portfolio'
    ? 'Showing only included processes. Drag column headers to reorder.'
    : 'Inline editing enabled — click any cell to update. Drag column headers to reorder, borders to resize.';

  function renderCell(process: Process, colKey: string) {
    switch (colKey) {
      case 'include':
        return (
          <td key="include" className="align-middle p-0 text-center" style={{ width: widths['include'] }}>
            <label className="flex items-center justify-center h-full w-full cursor-pointer py-3">
              <span
                onClick={() => handleIncludeToggle(process)}
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded border-2 transition-all duration-150 shrink-0",
                  process.included
                    ? "bg-emerald-500 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    : "bg-transparent border-border hover:border-emerald-500/60"
                )}
              >
                {process.included && (
                  <svg viewBox="0 0 10 8" className="w-3 h-3 text-white fill-none stroke-white stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                    <polyline points="1,4 3.5,6.5 9,1" />
                  </svg>
                )}
              </span>
            </label>
          </td>
        );
      case '#':
        return (
          <td key="#" className="align-middle p-0 text-center overflow-visible" style={{ width: widths['#'] }}>
            <div className="flex items-center justify-center py-3 px-2">
              <button
                onClick={() => setDetailProcess(process)}
                title="Click to view process details"
                className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold tracking-wide text-[10px] font-mono hover:bg-primary/20 hover:ring-1 hover:ring-primary/40 transition-all cursor-pointer"
              >
                PRO-{process.number.toString().padStart(3, '0')}
              </button>
            </div>
          </td>
        );
      case 'category':
        return (
          <td key="category" className="align-middle p-3 overflow-hidden" style={{ width: widths['category'] }}>
            <span className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-semibold border inline-block whitespace-nowrap max-w-full overflow-hidden text-ellipsis",
              getCategoryColorClass(process.category)
            )}>
              {process.category}
            </span>
          </td>
        );
      case 'processName':
        return (
          <td key="processName" className="overflow-hidden p-0" style={{ width: widths['processName'] }}>
            <button
              className="w-full text-left px-3 py-3 text-sm font-medium text-foreground hover:text-primary truncate block transition-colors group"
              onClick={() => setDetailProcess(process)}
              title="Click to view process details"
            >
              <span className="group-hover:underline underline-offset-2">
                {process.processName || <em className="text-muted-foreground/50 not-italic font-normal">Unnamed</em>}
              </span>
            </button>
          </td>
        );
      case 'processDescription':
        return (
          <td key="processDescription" className="overflow-hidden p-0" style={{ width: widths['processDescription'] }}>
            <EditableCell processId={process.id} field="processDescription" initialValue={process.processDescription} multiline onSaved={cellSaved(process, 'processDescription')} />
          </td>
        );
      case 'aiAgent':
        return (
          <td key="aiAgent" className="overflow-hidden p-0" style={{ width: widths['aiAgent'] }}>
            <EditableCell processId={process.id} field="aiAgent" initialValue={process.aiAgent} onSaved={cellSaved(process, 'aiAgent')} />
          </td>
        );
      case 'aiAgentActive':
        return (
          <td key="aiAgentActive" className="align-middle p-0 text-center" style={{ width: widths['aiAgentActive'] }}>
            <label className="flex items-center justify-center h-full w-full cursor-pointer py-3 gap-1.5">
              <span
                onClick={() => updateProcess({ id: process.id, data: { aiAgentActive: !process.aiAgentActive } })}
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded border-2 transition-all duration-150 shrink-0",
                  process.aiAgentActive
                    ? "bg-primary border-primary shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                    : "bg-transparent border-border hover:border-primary/60"
                )}
              >
                {process.aiAgentActive && (
                  <svg viewBox="0 0 10 8" className="w-3 h-3 text-white fill-none stroke-white stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                    <polyline points="1,4 3.5,6.5 9,1" />
                  </svg>
                )}
              </span>
            </label>
          </td>
        );
      case 'purpose':
        return (
          <td key="purpose" className="overflow-hidden p-0" style={{ width: widths['purpose'] }}>
            <EditableCell processId={process.id} field="purpose" initialValue={process.purpose} multiline onSaved={cellSaved(process, 'purpose')} />
          </td>
        );
      case 'inputs':
        return (
          <td key="inputs" className="overflow-hidden p-0" style={{ width: widths['inputs'] }}>
            <EditableCell processId={process.id} field="inputs" initialValue={process.inputs} multiline onSaved={cellSaved(process, 'inputs')} />
          </td>
        );
      case 'outputs':
        return (
          <td key="outputs" className="overflow-hidden p-0" style={{ width: widths['outputs'] }}>
            <EditableCell processId={process.id} field="outputs" initialValue={process.outputs} multiline onSaved={cellSaved(process, 'outputs')} />
          </td>
        );
      case 'humanInTheLoop':
        return (
          <td key="humanInTheLoop" className="overflow-hidden p-0" style={{ width: widths['humanInTheLoop'] }}>
            <EditableCell processId={process.id} field="humanInTheLoop" initialValue={process.humanInTheLoop} multiline onSaved={cellSaved(process, 'humanInTheLoop')} />
          </td>
        );
      case 'kpi':
        return (
          <td key="kpi" className="overflow-hidden p-0" style={{ width: widths['kpi'] }}>
            <EditableCell processId={process.id} field="kpi" initialValue={process.kpi} multiline onSaved={cellSaved(process, 'kpi')} />
          </td>
        );
      case 'target':
        return (
          <td key="target" className="overflow-hidden p-0" style={{ width: widths['target'] }}>
            <EditableCell processId={process.id} field="target" initialValue={process.target} multiline onSaved={cellSaved(process, 'target')} />
          </td>
        );
      case 'achievement':
        return (
          <td key="achievement" className="overflow-hidden p-0" style={{ width: widths['achievement'] }}>
            <EditableCell processId={process.id} field="achievement" initialValue={process.achievement} multiline onSaved={cellSaved(process, 'achievement')} />
          </td>
        );
      case 'priority': {
        const pv = (process as any).priority as number | null ?? 5;
        return (
          <td key="priority" className="align-middle p-0" style={{ width: widths['priority'] }}>
            <div className="flex items-center justify-center py-1.5 px-1">
              <select
                value={pv ?? 5}
                onChange={e => updateProcess({ id: process.id, data: { priority: e.target.value } })}
                className="w-full text-xs bg-transparent border border-border/50 rounded px-1 py-0.5 text-center focus:outline-none focus:border-primary/50 cursor-pointer"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>
          </td>
        );
      }
      case 'trafficLight': {
        const tl = (process as any).trafficLight as string ?? '';
        const CYCLE = ['', 'green', 'orange', 'red'] as const;
        const colorMap: Record<string, { bg: string; glow: string; label: string }> = {
          green:  { bg: 'bg-green-500', glow: '0 0 8px rgba(34,197,94,0.7)',  label: 'On Track' },
          orange: { bg: 'bg-amber-400', glow: '0 0 8px rgba(251,191,36,0.7)', label: 'At Risk' },
          red:    { bg: 'bg-red-500',   glow: '0 0 8px rgba(239,68,68,0.7)',  label: 'Off Track' },
        };
        const next = CYCLE[(CYCLE.indexOf(tl as any) + 1) % CYCLE.length];
        const meta = tl ? colorMap[tl] : null;
        return (
          <td key="trafficLight" className="align-middle p-0" style={{ width: widths['trafficLight'] }}>
            <div className="flex items-center justify-center py-2 px-2">
              <button
                title={meta ? `${meta.label} — click to change` : 'Click to set status'}
                onClick={() => updateProcess({ id: process.id, data: { trafficLight: next } })}
                className={cn(
                  "w-5 h-5 rounded-full transition-all duration-200 flex-shrink-0",
                  meta
                    ? `${meta.bg} border-2 border-transparent hover:scale-110`
                    : "border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 hover:scale-105",
                )}
                style={meta ? { boxShadow: meta.glow } : undefined}
              />
            </div>
          </td>
        );
      }
      case 'estimatedValueImpact':
        return (
          <td key="estimatedValueImpact" className="overflow-hidden p-0" style={{ width: widths['estimatedValueImpact'] }}>
            <EditableCell processId={process.id} field="estimatedValueImpact" initialValue={process.estimatedValueImpact} multiline onSaved={cellSaved(process, 'estimatedValueImpact')} />
          </td>
        );
      case 'industryBenchmark':
        return (
          <td key="industryBenchmark" className="overflow-hidden p-0" style={{ width: widths['industryBenchmark'] }}>
            <EditableCell processId={process.id} field="industryBenchmark" initialValue={process.industryBenchmark} multiline onSaved={cellSaved(process, 'industryBenchmark')} />
          </td>
        );
      case 'governance': {
        const assigned = govMap[process.id] ?? [];
        const assignedStandards = govStandards.filter(g => assigned.includes(g.id));
        const isOpen = govPopoverFor === process.id;
        return (
          <td key="governance" className="align-middle p-2 overflow-hidden" style={{ width: widths['governance'] }}>
            <div className="flex flex-wrap gap-1 items-center">
              {assignedStandards.map(g => (
                <span key={g.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  {g.complianceName}
                </span>
              ))}
              <button
                onClick={(e) => {
                  if (isOpen) {
                    setGovPopoverFor(null);
                  } else {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setGovPopoverPos({ top: rect.bottom + 4, left: rect.left });
                    setGovPopoverFor(process.id);
                  }
                }}
                title="Assign governance standards"
                className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {isOpen && createPortal(
              <>
                {/* Backdrop to close on outside click */}
                <div
                  className="fixed inset-0 z-[90]"
                  onClick={() => setGovPopoverFor(null)}
                />
                <div
                  className="fixed z-[91] w-56 rounded-xl border border-border bg-card shadow-xl shadow-black/30 py-2"
                  style={{ top: govPopoverPos.top, left: govPopoverPos.left }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Assign Standards
                  </div>
                  {govStandards.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No standards available</div>
                  ) : (
                    govStandards.map(g => {
                      const checked = assigned.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary/50 cursor-pointer transition-colors"
                          onClick={() => toggleGovAssignment(process.id, g.id)}
                        >
                          <span className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                            checked ? "bg-primary border-primary" : "border-border"
                          )}>
                            {checked && <CheckCircle2 className="w-2.5 h-2.5 text-primary-foreground" />}
                          </span>
                          <span className="text-xs text-foreground flex-1">{g.complianceName}</span>
                        </label>
                      );
                    })
                  )}
                  <div className="border-t border-border mt-1 pt-1 px-3">
                    <button onClick={() => setGovPopoverFor(null)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                      Close
                    </button>
                  </div>
                </div>
              </>,
              document.body
            )}
          </td>
        );
      }
      case 'actions':
        return (
          <td key="actions" className="align-middle p-2 text-center" style={{ width: widths['actions'] }}>
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={() => setChecklistProcess(process)}
                title={`Checklists${(checklistCounts[process.id] ?? 0) > 0 ? ` (${checklistCounts[process.id]} items)` : ''}`}
                className={cn(
                  "p-1.5 rounded-lg transition-all hover:bg-primary/10",
                  (checklistCounts[process.id] ?? 0) > 0
                    ? "text-primary hover:text-primary"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                <ClipboardList className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDetailProcess(process)}
                title="View details"
                className="p-1.5 rounded-lg transition-all text-muted-foreground hover:text-primary hover:bg-primary/10"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(process.id)}
                title={confirmDelete === process.id ? 'Click again to confirm' : 'Delete row'}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  confirmDelete === process.id
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        );
      default:
        return null;
    }
  }

  if (checklistProcess) {
    return (
      <ChecklistPanel
        process={{ id: checklistProcess.id, processName: checklistProcess.processName, category: checklistProcess.category ?? undefined }}
        onClose={() => setChecklistProcess(null)}
        fullPage
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-background relative overflow-hidden">

      {/* Toolbar */}
      <div className="flex-none p-4 md:p-5 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card z-20">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search processes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
          >
            <option value="All">All Categories</option>
            {categories?.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            {mode === 'matrix' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Process
              </button>
            )}
            <button
              onClick={handleExport}
              title="Export to Excel"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 rounded-lg text-xs font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title="Import from Excel"
              className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
            {importResult && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {importResult.updated} updated, {importResult.inserted} new
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table - horizontally scrollable */}
      <div className="flex-1 overflow-auto bg-card">
        <table
          className="spreadsheet-table border-collapse"
          style={{ width: totalWidth, tableLayout: 'fixed', minWidth: '100%' }}
        >
          <colgroup>
            {allVisibleCols.map(c => (
              <col key={c.key} style={{ width: widths[c.key] ?? c.defaultWidth }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              {allVisibleCols.map((col) => {
                const isReorderable = !col.fixed;
                const isDragOver = dragOverKey === col.key;
                const isSortable = col.key !== 'actions' && col.key !== 'include';
                const isActiveSort = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    title={col.label || undefined}
                    className={cn(
                      "relative group select-none overflow-hidden text-ellipsis whitespace-nowrap transition-colors",
                      isReorderable && "cursor-grab active:cursor-grabbing",
                      isSortable && "hover:bg-secondary/60 cursor-pointer",
                      isActiveSort ? "text-primary bg-primary/5 border-b-2 border-primary" : "border-b border-border",
                      col.key === 'include' && "text-center"
                    )}
                    style={{ width: widths[col.key] ?? col.defaultWidth }}
                    draggable={isReorderable}
                    onClick={isSortable ? () => toggleSort(col.key) : undefined}
                    onDragStart={isReorderable ? () => onDragStart(col.key) : undefined}
                    onDragOver={isReorderable ? (e) => onDragOver(e, col.key) : undefined}
                    onDrop={isReorderable ? (e) => onDrop(e, col.key) : undefined}
                    onDragEnd={isReorderable ? onDragEnd : undefined}
                    onDragLeave={isReorderable ? (e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null);
                    } : undefined}
                  >
                    {/* Drop insertion line indicator */}
                    {isDragOver && (
                      <div
                        className="absolute inset-y-0 w-0.5 bg-primary z-20 pointer-events-none shadow-[0_0_6px_2px_hsl(var(--primary)/0.5)]"
                        style={{ [dragOverSide === 'before' ? 'left' : 'right']: 0 }}
                      />
                    )}
                    {col.key === 'include' ? (
                      <div className="flex flex-col items-center justify-center gap-1 py-0.5">
                        <span
                          onClick={handleSelectAll}
                          title={allIncluded ? 'Deselect all' : 'Select all'}
                          className={cn(
                            "flex items-center justify-center w-4 h-4 rounded border-2 cursor-pointer transition-all duration-150 shrink-0",
                            allIncluded
                              ? "bg-emerald-500 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                              : someIncluded
                                ? "bg-emerald-500/30 border-emerald-500"
                                : "bg-transparent border-border hover:border-emerald-500/60"
                          )}
                        >
                          {allIncluded && (
                            <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-none stroke-white stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                              <polyline points="1,4 3.5,6.5 9,1" />
                            </svg>
                          )}
                          {someIncluded && !allIncluded && (
                            <svg viewBox="0 0 10 2" className="w-2.5 h-2.5 fill-none stroke-emerald-300 stroke-[2] stroke-linecap-round">
                              <line x1="1" y1="1" x2="9" y2="1" />
                            </svg>
                          )}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold leading-none">
                          {includedCount}/{filteredProcesses.length}
                        </span>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5 pr-3 pointer-events-none">
                        {isReorderable && (
                          <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className="truncate">{col.label}</span>
                        {isSortable && col.label && (
                          isActiveSort
                            ? (sortDir === 'asc'
                                ? <ArrowUp   className="w-3 h-3 shrink-0 text-primary" />
                                : <ArrowDown className="w-3 h-3 shrink-0 text-primary" />)
                            : <ArrowUpDown className="w-3 h-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                        )}
                      </span>
                    )}

                    {/* Resize handle */}
                    {col.key !== 'actions' && (
                      <div
                        onMouseDown={(e) => startResize(col.key, e)}
                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-10 group flex items-center justify-center"
                      >
                        <div className="w-px h-4/5 bg-border group-hover:bg-primary/60 transition-colors" />
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {filteredProcesses.length === 0 ? (
              <tr>
                <td colSpan={allVisibleCols.length} className="p-8 text-center text-muted-foreground bg-background">
                  {mode === 'portfolio'
                    ? 'No included processes. Check the "Include" checkbox in the Process Matrix to add processes here.'
                    : 'No processes found matching your criteria.'}
                </td>
              </tr>
            ) : (
              (() => {
                const rows: React.ReactNode[] = [];
                let lastCat = '';
                filteredProcesses.forEach(process => {
                  if (!sortKey && process.category !== lastCat) {
                    lastCat = process.category;
                    rows.push(
                      <tr key={`cat-header-${process.category}`} className="select-none">
                        <td colSpan={allVisibleCols.length} className="px-4 py-2 bg-secondary/40 border-y border-border/60">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase",
                            getCategoryColorClass(process.category)
                          )}>
                            {process.category}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  rows.push(
                    <tr key={process.id} className={cn(process.included && mode === 'matrix' && "bg-primary/[0.03]")}>
                      {allVisibleCols.map(col => renderCell(process, col.key))}
                    </tr>
                  );
                });
                return rows;
              })()
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex-none px-4 py-2 border-t border-border bg-sidebar flex justify-between items-center text-xs text-muted-foreground">
        <span>
          Showing {filteredProcesses.length} of {mode === 'portfolio' ? (processes?.filter(p => p.included).length || 0) : (processes?.length || 0)} processes
          {mode === 'portfolio' && ` · ${processes?.filter(p => p.included).length || 0} included total`}
        </span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          System Online
        </span>
      </div>

      {/* Undo Toast */}
      {undoEntry && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 bg-card border border-border shadow-2xl rounded-xl px-4 py-3 text-sm">
          <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-foreground">{undoEntry.label}</span>
          <button
            onClick={() => { undoEntry.restore(); dismissUndo(); }}
            className="px-3 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            Undo
          </button>
          <button onClick={dismissUndo} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {detailProcess && (
        <ProcessDetailPanel process={detailProcess} onClose={() => setDetailProcess(null)} />
      )}

      {/* Add Process Modal */}
      {showAddModal && (
        <AddProcessModal
          categories={categories ?? []}
          onClose={() => setShowAddModal(false)}
          onCreateAndPopulate={(body, useAi) => {
            createProcess({ data: body as any }, {
              onSuccess: (created) => {
                if (useAi) {
                  aiPopulate({ id: created.id }, { onSettled: () => setShowAddModal(false) });
                } else {
                  setShowAddModal(false);
                }
              },
            });
          }}
          isCreating={isCreating}
          isPopulating={isAiPopulating}
        />
      )}

      {/* ── Export modal ──────────────────────────────────────────── */}
      {showExportModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowExportModal(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">Export Processes</h3>
              </div>
              <button onClick={() => setShowExportModal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground -mt-2">Choose your export format. You can select a save location on the next step.</p>

            <div className="grid grid-cols-2 gap-3">
              {([
                { fmt: 'xlsx' as const, icon: FileSpreadsheet, label: 'Excel', sub: '.xlsx', color: 'text-emerald-400', border: 'border-emerald-500/40 bg-emerald-500/10' },
                { fmt: 'csv'  as const, icon: FileText,        label: 'CSV',   sub: '.csv',  color: 'text-blue-400',   border: 'border-blue-500/40 bg-blue-500/10'   },
              ] as const).map(({ fmt, icon: Icon, label, sub, color, border }) => (
                <button
                  key={fmt}
                  onClick={() => setExportFormat(fmt)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all",
                    exportFormat === fmt ? `${border} border-opacity-100` : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <Icon className={cn("w-7 h-7", exportFormat === fmt ? color : "text-muted-foreground")} />
                  <div className="text-center">
                    <div className="text-sm font-medium text-foreground">{label}</div>
                    <div className="text-[10px] text-muted-foreground">{sub}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/40 border border-border text-xs text-muted-foreground">
              <FolderOpen className="w-3.5 h-3.5 flex-none text-muted-foreground/60" />
              <span>A <strong>Save As</strong> dialog will let you choose where to save the file (in supported browsers). Otherwise it saves to your Downloads folder.</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doExport(exportFormat)}
                disabled={exporting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exporting ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Add Process Modal ─────────────────────────────────────────────────────────

const TL_OPTIONS = [
  { value: '',       label: 'None',      dot: null },
  { value: 'green',  label: 'On Track',  dot: 'bg-green-500' },
  { value: 'orange', label: 'At Risk',   dot: 'bg-amber-400' },
  { value: 'red',    label: 'Off Track', dot: 'bg-red-500' },
] as const;

function ModalField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-primary ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="text-[10px] font-bold text-primary uppercase tracking-widest">{children}</div>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function AddProcessModal({
  categories,
  onClose,
  onCreateAndPopulate,
  isCreating,
  isPopulating,
}: {
  categories: string[];
  onClose: () => void;
  onCreateAndPopulate: (body: Record<string, string | boolean>, useAi: boolean) => void;
  isCreating: boolean;
  isPopulating: boolean;
}) {
  const [category, setCategory]                     = useState(categories[0] ?? '');
  const [processName, setProcessName]               = useState('');
  const [processDescription, setProcessDescription] = useState('');
  const [aiAgent, setAiAgent]                       = useState('');
  const [purpose, setPurpose]                       = useState('');
  const [inputs, setInputs]                         = useState('');
  const [outputs, setOutputs]                       = useState('');
  const [humanInTheLoop, setHumanInTheLoop]         = useState('');
  const [kpi, setKpi]                               = useState('');
  const [target, setTarget]                         = useState('');
  const [achievement, setAchievement]               = useState('');
  const [estimatedValueImpact, setEstimatedValueImpact] = useState('');
  const [industryBenchmark, setIndustryBenchmark]   = useState('');
  const [trafficLight, setTrafficLight]             = useState('');
  const [included, setIncluded]                     = useState(false);
  const [useAi, setUseAi]                           = useState(true);

  const isBusy = isCreating || isPopulating;

  const inputCls = "w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/40";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !processDescription.trim()) return;
    onCreateAndPopulate({
      category, processName, processDescription,
      aiAgent, purpose, inputs, outputs, humanInTheLoop,
      kpi, target, achievement, estimatedValueImpact, industryBenchmark,
      trafficLight, included,
    }, useAi);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-none">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Plus className="w-4 h-4 text-primary" />
            Add New Process
          </div>
          <button onClick={onClose} disabled={isBusy} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            <SectionHeading>Core Info</SectionHeading>

            <ModalField label="Category" required>
              <select value={category} onChange={e => setCategory(e.target.value)} required className={inputCls}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </ModalField>

            <ModalField label="Process Name">
              <input type="text" value={processName} onChange={e => setProcessName(e.target.value)}
                placeholder="e.g. Donor Retention" className={inputCls} />
            </ModalField>

            <ModalField label="Process Description" required>
              <textarea value={processDescription} onChange={e => setProcessDescription(e.target.value)}
                required rows={3} placeholder="Describe what this process does…"
                className={cn(inputCls, "resize-y min-h-[76px]")} />
            </ModalField>

            <SectionHeading>Operations</SectionHeading>

            <ModalField label="AI Agent">
              <input type="text" value={aiAgent} onChange={e => setAiAgent(e.target.value)}
                placeholder="e.g. Donor Insights Agent" className={inputCls} />
            </ModalField>

            <ModalField label="Purpose">
              <textarea value={purpose} onChange={e => setPurpose(e.target.value)}
                rows={2} placeholder="What is the goal of this process?" className={cn(inputCls, "resize-y")} />
            </ModalField>

            <div className="grid grid-cols-2 gap-4">
              <ModalField label="Inputs">
                <textarea value={inputs} onChange={e => setInputs(e.target.value)}
                  rows={2} placeholder="What goes in?" className={cn(inputCls, "resize-y")} />
              </ModalField>
              <ModalField label="Outputs">
                <textarea value={outputs} onChange={e => setOutputs(e.target.value)}
                  rows={2} placeholder="What comes out?" className={cn(inputCls, "resize-y")} />
              </ModalField>
            </div>

            <ModalField label="Human in the Loop">
              <textarea value={humanInTheLoop} onChange={e => setHumanInTheLoop(e.target.value)}
                rows={2} placeholder="Who reviews or approves?" className={cn(inputCls, "resize-y")} />
            </ModalField>

            <SectionHeading>Performance</SectionHeading>

            <div className="grid grid-cols-2 gap-4">
              <ModalField label="KPI">
                <input type="text" value={kpi} onChange={e => setKpi(e.target.value)}
                  placeholder="e.g. Donor retention rate" className={inputCls} />
              </ModalField>
              <ModalField label="Target">
                <input type="text" value={target} onChange={e => setTarget(e.target.value)}
                  placeholder="e.g. 80%" className={inputCls} />
              </ModalField>
              <ModalField label="Achievement">
                <input type="text" value={achievement} onChange={e => setAchievement(e.target.value)}
                  placeholder="e.g. 74%" className={inputCls} />
              </ModalField>
              <ModalField label="Est. Value Impact">
                <input type="text" value={estimatedValueImpact} onChange={e => setEstimatedValueImpact(e.target.value)}
                  placeholder="e.g. $50k/yr" className={inputCls} />
              </ModalField>
            </div>

            <ModalField label="Industry Benchmark">
              <input type="text" value={industryBenchmark} onChange={e => setIndustryBenchmark(e.target.value)}
                placeholder="e.g. Sector avg 75%" className={inputCls} />
            </ModalField>

            <SectionHeading>Status</SectionHeading>

            <ModalField label="Traffic Light">
              <div className="flex gap-2">
                {TL_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTrafficLight(opt.value)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all",
                      trafficLight === opt.value
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    {opt.dot
                      ? <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", opt.dot)} />
                      : <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-muted-foreground/40 shrink-0" />
                    }
                    {opt.label}
                  </button>
                ))}
              </div>
            </ModalField>

            <ModalField label="In Portfolio">
              <button
                type="button"
                onClick={() => setIncluded(v => !v)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border w-full text-left",
                  included
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-secondary/30 border-border/50 text-muted-foreground hover:border-primary/30"
                )}
              >
                <span className={cn(
                  "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                  included ? "bg-green-500 border-green-500" : "border-muted-foreground/40"
                )}>
                  {included && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-none stroke-white stroke-[1.5] stroke-linecap-round stroke-linejoin-round">
                      <polyline points="1,4 3.5,6.5 9,1" />
                    </svg>
                  )}
                </span>
                {included ? 'Yes – include in portfolio' : 'No – exclude from portfolio'}
              </button>
            </ModalField>

            {/* AI Auto-Fill Toggle */}
            <button
              type="button"
              onClick={() => setUseAi(v => !v)}
              className={cn(
                "w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all",
                useAi ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/30 opacity-70"
              )}
            >
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", useAi ? "bg-primary/20" : "bg-secondary")}>
                <Sparkles className={cn("w-4 h-4", useAi ? "text-primary" : "text-muted-foreground")} />
              </div>
              <div>
                <div className={cn("text-sm font-semibold", useAi ? "text-foreground" : "text-muted-foreground")}>AI Auto-Fill</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {useAi ? "Claude will auto-populate all blank fields after creation" : "Create with manual data only"}
                </div>
              </div>
              <div className={cn("ml-auto w-4 h-4 rounded-full border-2 shrink-0 transition-colors", useAi ? "bg-primary border-primary" : "border-muted-foreground/40")} />
            </button>

          </div>

          {/* Sticky footer */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-border flex-none bg-card">
            <button type="button" onClick={onClose} disabled={isBusy}
              className="flex-1 px-4 py-2.5 border border-border bg-secondary/50 hover:bg-secondary text-foreground rounded-xl text-sm font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isBusy || !processDescription.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              {isBusy ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{isCreating ? 'Creating…' : 'AI Filling…'}</>
              ) : (
                <>{useAi ? <Cpu className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{useAi ? 'Create & AI Fill' : 'Create Process'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
