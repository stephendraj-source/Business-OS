import { useState, useEffect, useRef, useCallback } from "react";
import {
  GitBranch, Plus, Trash2, Save, Edit2, Loader2, Hash,
  Play, X, Check,
  Code2, ClipboardList, Bot, ArrowDownToLine, Layers, Split, Pencil, Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const API = '/api';

// ── Data Types ────────────────────────────────────────────────────────────────

export interface WCondition {
  field: string;
  operator: string;
  value: string;
}

export interface ParallelBranch {
  id: string;
  label: string;
  steps: WStep[];
}

export interface WStep {
  id: string;
  type: 'action' | 'condition' | 'decision' | 'form' | 'workflow-call' | 'agent-call' | 'parallel';
  label: string;
  description: string;
  instruction?: string;
  condition?: WCondition;
  thenSteps?: WStep[];
  elseSteps?: WStep[];
  branches?: ParallelBranch[];
  formId?: number | null;
  formName?: string;
  dataSourceType?: 'agent' | 'form' | null;
  dataSourceId?: number | null;
  dataSourceName?: string;
  callWorkflowId?: number | null;
  callWorkflowName?: string;
  callAgentId?: number | null;
  callAgentName?: string;
}

interface FormOption { id: number; name: string; formNumber: number; }
interface AgentOption { id: number; name: string; agentNumber: number; }

interface WorkflowSummary {
  id: number;
  workflowNumber: number;
  name: string;
  description: string;
  stepCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowFull extends WorkflowSummary {
  steps: string;
}

interface ProcessField { key: string; label: string; }

const OPERATORS = [
  { value: 'equals',       label: 'equals' },
  { value: 'not_equals',   label: 'does not equal' },
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: "doesn't contain" },
  { value: 'starts_with',  label: 'starts with' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than',    label: 'is less than' },
  { value: 'is_empty',     label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

function uid() { return crypto.randomUUID().slice(0, 8); }

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

function updateStepInTree(steps: WStep[], id: string, fn: (s: WStep) => WStep): WStep[] {
  return steps.map(s => {
    if (s.id === id) return fn(s);
    if (s.type === 'condition') {
      return {
        ...s,
        thenSteps: updateStepInTree(s.thenSteps ?? [], id, fn),
        elseSteps: updateStepInTree(s.elseSteps ?? [], id, fn),
      };
    }
    if ((s.type === 'parallel' || s.type === 'decision') && s.branches) {
      return {
        ...s,
        branches: s.branches.map(b => ({
          ...b,
          steps: updateStepInTree(b.steps, id, fn),
        })),
      };
    }
    return s;
  });
}

function deleteStepFromTree(steps: WStep[], id: string): WStep[] {
  return steps
    .filter(s => s.id !== id)
    .map(s => {
      if (s.type === 'condition') {
        return {
          ...s,
          thenSteps: deleteStepFromTree(s.thenSteps ?? [], id),
          elseSteps: deleteStepFromTree(s.elseSteps ?? [], id),
        };
      }
      if ((s.type === 'parallel' || s.type === 'decision') && s.branches) {
        return {
          ...s,
          branches: s.branches.map(b => ({
            ...b,
            steps: deleteStepFromTree(b.steps, id),
          })),
        };
      }
      return s;
    });
}

// Branch key: "root" | "{stepId}:then" | "{stepId}:else" | "{stepId}:branch:{idx}"
function addStepToBranch(
  steps: WStep[],
  branchKey: string,
  afterStepId: string | null,
  newStep: WStep
): WStep[] {
  if (branchKey === 'root') {
    if (afterStepId === null) return [newStep, ...steps];
    const idx = steps.findIndex(s => s.id === afterStepId);
    if (idx !== -1) {
      const copy = [...steps];
      copy.splice(idx + 1, 0, newStep);
      return copy;
    }
  }
  return steps.map(s => {
    if (s.type === 'condition') {
      if (`${s.id}:then` === branchKey) {
        const branch = s.thenSteps ?? [];
        if (afterStepId === null) return { ...s, thenSteps: [newStep, ...branch] };
        const idx = branch.findIndex(x => x.id === afterStepId);
        if (idx !== -1) {
          const copy = [...branch];
          copy.splice(idx + 1, 0, newStep);
          return { ...s, thenSteps: copy };
        }
      }
      if (`${s.id}:else` === branchKey) {
        const branch = s.elseSteps ?? [];
        if (afterStepId === null) return { ...s, elseSteps: [newStep, ...branch] };
        const idx = branch.findIndex(x => x.id === afterStepId);
        if (idx !== -1) {
          const copy = [...branch];
          copy.splice(idx + 1, 0, newStep);
          return { ...s, elseSteps: copy };
        }
      }
      return {
        ...s,
        thenSteps: addStepToBranch(s.thenSteps ?? [], branchKey, afterStepId, newStep),
        elseSteps: addStepToBranch(s.elseSteps ?? [], branchKey, afterStepId, newStep),
      };
    }
    if ((s.type === 'parallel' || s.type === 'decision') && s.branches) {
      // Check if branchKey matches one of our branch keys: "{stepId}:branch:{idx}"
      const branchMatch = branchKey.match(new RegExp(`^${s.id}:branch:(\\d+)$`));
      if (branchMatch) {
        const branchIdx = Number(branchMatch[1]);
        return {
          ...s,
          branches: s.branches.map((b, i) => {
            if (i !== branchIdx) return b;
            const branchSteps = b.steps;
            if (afterStepId === null) return { ...b, steps: [newStep, ...branchSteps] };
            const idx = branchSteps.findIndex(x => x.id === afterStepId);
            if (idx !== -1) {
              const copy = [...branchSteps];
              copy.splice(idx + 1, 0, newStep);
              return { ...b, steps: copy };
            }
            return b;
          }),
        };
      }
      return {
        ...s,
        branches: s.branches.map(b => ({
          ...b,
          steps: addStepToBranch(b.steps, branchKey, afterStepId, newStep),
        })),
      };
    }
    return s;
  });
}

// ── FieldPickerTextarea ───────────────────────────────────────────────────────

function FieldPickerTextarea({
  value, onChange, processFields, rows = 3, placeholder = "", className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  processFields: ProcessField[];
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [pickerFilter, setPickerFilter] = useState("");
  const slashIdx = useRef(-1);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPicker) { if (e.key === "Escape") { setShowPicker(false); e.preventDefault(); } return; }
    if (e.key === "/" && taRef.current) {
      slashIdx.current = taRef.current.selectionStart;
      const rect = taRef.current.getBoundingClientRect();
      setPickerPos({ top: rect.bottom + 4, left: rect.left });
      setPickerFilter("");
      setShowPicker(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    if (showPicker) {
      const after = e.target.value.slice(slashIdx.current + 1, e.target.selectionStart);
      if (after.includes(" ") || after.includes("\n")) setShowPicker(false);
      else setPickerFilter(after.toLowerCase());
    }
  };

  const insertField = (f: ProcessField) => {
    const ta = taRef.current; if (!ta) return;
    const before = value.slice(0, slashIdx.current);
    const after = value.slice(ta.selectionStart);
    onChange(`${before}{{${f.key}}}${after}`);
    setShowPicker(false);
    setTimeout(() => { ta.focus(); }, 0);
  };

  const filtered = processFields.filter(f =>
    f.key.toLowerCase().includes(pickerFilter) || f.label.toLowerCase().includes(pickerFilter)
  );

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder}
        className={cn("w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none", className)}
      />
      {showPicker && (
        <div className="fixed z-[99] w-64 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden" style={{ top: pickerPos.top, left: pickerPos.left }}>
          <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">Insert field</div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0
              ? <div className="px-3 py-2 text-xs text-muted-foreground text-center">No match</div>
              : filtered.map(f => (
                <button key={f.key} onMouseDown={e => { e.preventDefault(); insertField(f); }}
                  className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-accent text-sm transition-colors">
                  <Hash className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
                  <div>
                    <div className="font-medium text-xs">{f.label}</div>
                    <div className="text-xs text-muted-foreground font-mono">{`{{${f.key}}}`}</div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Step Button ───────────────────────────────────────────────────────────

type StepType = 'action' | 'decision' | 'form' | 'workflow-call' | 'agent-call' | 'parallel';

function AddStepButton({ onAdd }: { onAdd: (type: StepType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex flex-col items-center py-0.5">
      <div className="w-px h-3 bg-border" />
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-6 h-6 rounded-full border-2 border-border bg-background flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors text-xs font-bold shadow-sm"
        >
          <Plus className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute z-50 top-8 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-xl shadow-xl overflow-hidden w-48">
            <button onClick={() => { setOpen(false); onAdd('action'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left">
              <Play className="w-3.5 h-3.5 text-blue-400" />Action Step
            </button>
            <button onClick={() => { setOpen(false); onAdd('decision'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left border-t border-border">
              <Brain className="w-3.5 h-3.5 text-orange-400" />Decision (AI-Routed)
            </button>
            <button onClick={() => { setOpen(false); onAdd('form'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left border-t border-border">
              <ClipboardList className="w-3.5 h-3.5 text-violet-400" />Collect Form Data
            </button>
            <button onClick={() => { setOpen(false); onAdd('workflow-call'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left border-t border-border">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />Call Another Workflow
            </button>
            <button onClick={() => { setOpen(false); onAdd('agent-call'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left border-t border-border">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />Run an AI Agent
            </button>
            <button onClick={() => { setOpen(false); onAdd('parallel'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left border-t border-border">
              <Split className="w-3.5 h-3.5 text-fuchsia-400" />Parallel Branches
            </button>
          </div>
        )}
      </div>
      <div className="w-px h-3 bg-border" />
    </div>
  );
}

// ── Inline Editable Action Step Card ─────────────────────────────────────────

function ActionStepCard({ step, onUpdate, onDelete, processFields, forms, agents }: {
  step: WStep;
  onUpdate: (updates: Partial<WStep>) => void;
  onDelete: () => void;
  processFields: ProcessField[];
  forms: FormOption[];
  agents: AgentOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(step.label);
  const [draftDesc, setDraftDesc] = useState(step.description);
  const [draftSourceType, setDraftSourceType] = useState<'agent' | 'form' | null>(step.dataSourceType ?? null);
  const [draftSourceId, setDraftSourceId] = useState<number | null>(step.dataSourceId ?? null);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraftLabel(step.label);
      setDraftDesc(step.description);
      setDraftSourceType(step.dataSourceType ?? null);
      setDraftSourceId(step.dataSourceId ?? null);
    }
  }, [step.label, step.description, step.dataSourceType, step.dataSourceId, editing]);

  const startEdit = () => {
    setDraftLabel(step.label);
    setDraftDesc(step.description);
    setDraftSourceType(step.dataSourceType ?? null);
    setDraftSourceId(step.dataSourceId ?? null);
    setEditing(true);
    setTimeout(() => labelRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    let sourceName: string | undefined;
    if (draftSourceType === 'agent') {
      sourceName = agents.find(a => a.id === draftSourceId)?.name ?? '';
    } else if (draftSourceType === 'form') {
      sourceName = forms.find(f => f.id === draftSourceId)?.name ?? '';
    }
    onUpdate({
      label: draftLabel,
      description: draftDesc,
      dataSourceType: draftSourceType,
      dataSourceId: draftSourceType ? draftSourceId : null,
      dataSourceName: draftSourceType ? sourceName : undefined,
    });
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftLabel(step.label);
    setDraftDesc(step.description);
    setDraftSourceType(step.dataSourceType ?? null);
    setDraftSourceId(step.dataSourceId ?? null);
    setEditing(false);
  };

  const dataSourceIcon = step.dataSourceType === 'agent'
    ? <Bot className="w-3 h-3 text-emerald-400" />
    : step.dataSourceType === 'form'
      ? <ClipboardList className="w-3 h-3 text-violet-400" />
      : null;

  return (
    <div className={cn(
      "relative mx-auto w-full max-w-xs rounded-xl border-2 transition-all shadow-sm",
      editing ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card hover:border-primary/50"
    )}>
      {editing ? (
        /* ── Edit mode ── */
        <div className="px-4 pt-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-md bg-blue-500/15 flex items-center justify-center flex-shrink-0">
              <Play className="w-2.5 h-2.5 text-blue-400" />
            </div>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Action</span>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Label</label>
            <input
              ref={labelRef}
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              placeholder="Step label…"
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
              Description <span className="normal-case font-normal">(/ for fields)</span>
            </label>
            <FieldPickerTextarea
              value={draftDesc}
              onChange={setDraftDesc}
              processFields={processFields}
              rows={2}
              placeholder="Describe this step…"
            />
          </div>

          {/* Data Source */}
          <div className="border-t border-border pt-2 space-y-2">
            <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <ArrowDownToLine className="w-3 h-3" />Receives Data From
            </label>
            <div className="flex gap-2">
              {(['none', 'agent', 'form'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setDraftSourceType(t === 'none' ? null : t);
                    setDraftSourceId(null);
                  }}
                  className={cn(
                    "flex-1 px-2 py-1 rounded-lg text-xs border transition-colors capitalize",
                    (t === 'none' ? !draftSourceType : draftSourceType === t)
                      ? t === 'agent' ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                        : t === 'form' ? "border-violet-500/60 bg-violet-500/10 text-violet-400"
                        : "border-primary/60 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-border/80"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {draftSourceType === 'agent' && (
              <select
                value={draftSourceId ?? ''}
                onChange={e => setDraftSourceId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">— Select an agent —</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>#{a.agentNumber} {a.name}</option>
                ))}
              </select>
            )}

            {draftSourceType === 'form' && (
              <select
                value={draftSourceId ?? ''}
                onChange={e => setDraftSourceId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">— Select a form —</option>
                {forms.map(f => (
                  <option key={f.id} value={f.id}>#{f.formNumber} {f.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={cancelEdit}
              className="px-3 py-1 rounded-lg text-xs border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={commitEdit}
              className="px-3 py-1 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1"
            >
              <Check className="w-3 h-3" />Apply
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <div className="flex items-start gap-2 px-4 py-3 group">
          <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Play className="w-3 h-3 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-0.5">Action</div>
            <div className="text-sm font-medium truncate">
              {step.label || <span className="text-muted-foreground italic">Untitled action</span>}
            </div>
            {step.description && (
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{step.description}</div>
            )}
            {step.dataSourceType && step.dataSourceName && (
              <div className={cn(
                "inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium",
                step.dataSourceType === 'agent' ? "bg-emerald-500/10 text-emerald-400" : "bg-violet-500/10 text-violet-400"
              )}>
                {dataSourceIcon}
                <ArrowDownToLine className="w-2.5 h-2.5" />
                {step.dataSourceType === 'agent' ? 'Agent' : 'Form'}: {step.dataSourceName}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            <button
              onClick={startEdit}
              className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Edit step"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete step"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline Editable Condition Step Card ───────────────────────────────────────

function ConditionStepCard({ step, onUpdate, onDelete, processFields }: {
  step: WStep;
  onUpdate: (updates: Partial<WStep>) => void;
  onDelete: () => void;
  processFields: ProcessField[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(step.label);
  const [draftCond, setDraftCond] = useState<WCondition>(
    step.condition ?? { field: '', operator: 'equals', value: '' }
  );

  useEffect(() => {
    if (!editing) {
      setDraftLabel(step.label);
      setDraftCond(step.condition ?? { field: '', operator: 'equals', value: '' });
    }
  }, [step.label, step.condition, editing]);

  const commitEdit = () => {
    onUpdate({ label: draftLabel, condition: draftCond });
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftLabel(step.label);
    setDraftCond(step.condition ?? { field: '', operator: 'equals', value: '' });
    setEditing(false);
  };

  const op = OPERATORS.find(o => o.value === step.condition?.operator)?.label ?? step.condition?.operator ?? '?';
  const noOpValue = ['is_empty', 'is_not_empty'].includes(step.condition?.operator ?? '');
  const draftNoOpValue = ['is_empty', 'is_not_empty'].includes(draftCond.operator);

  return (
    <div className={cn(
      "relative mx-auto w-full max-w-xs rounded-xl border-2 transition-all shadow-sm",
      editing ? "border-orange-400 bg-orange-400/5 shadow-md" : "border-border bg-card hover:border-orange-400/50"
    )}>
      {editing ? (
        /* ── Edit mode ── */
        <div className="px-4 pt-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-md bg-orange-500/15 flex items-center justify-center flex-shrink-0 rotate-45">
              <GitBranch className="-rotate-45 w-2.5 h-2.5 text-orange-400" />
            </div>
            <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">If Condition</span>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Label (optional)</label>
            <input
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              placeholder="Condition label…"
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
              If field <span className="normal-case font-normal">(/ for picker)</span>
            </label>
            <FieldPickerTextarea
              value={draftCond.field}
              onChange={v => setDraftCond(c => ({ ...c, field: v }))}
              processFields={processFields}
              rows={1}
              placeholder="{{fieldName}} or field…"
              className="font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Operator</label>
            <select
              value={draftCond.operator}
              onChange={e => setDraftCond(c => ({ ...c, operator: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {!draftNoOpValue && (
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                Value <span className="normal-case font-normal">(/ for fields)</span>
              </label>
              <FieldPickerTextarea
                value={draftCond.value}
                onChange={v => setDraftCond(c => ({ ...c, value: v }))}
                processFields={processFields}
                rows={1}
                placeholder="Value or {{fieldName}}…"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={cancelEdit}
              className="px-3 py-1 rounded-lg text-xs border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={commitEdit}
              className="px-3 py-1 rounded-lg text-xs bg-orange-500 text-white hover:bg-orange-600 transition-colors flex items-center gap-1"
            >
              <Check className="w-3 h-3" />Apply
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <div className="flex items-start gap-2 px-4 py-3 group">
          <div className="w-6 h-6 rounded-md bg-orange-500/15 flex items-center justify-center flex-shrink-0 mt-0.5 rotate-45">
            <GitBranch className="-rotate-45 w-3 h-3 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-0.5">If Condition</div>
            {step.condition?.field ? (
              <div className="text-xs font-mono text-foreground">
                <span className="text-primary">{step.condition.field}</span>
                {' '}<span className="text-muted-foreground">{op}</span>
                {!noOpValue && step.condition.value && (
                  <> <span className="text-green-400">"{step.condition.value}"</span></>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No condition set — click Edit</div>
            )}
            {step.label && <div className="text-sm font-medium mt-1 truncate">{step.label}</div>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
              title="Edit condition"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete step"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Form Step Card ────────────────────────────────────────────────────────────

function FormStepCard({ step, onUpdate, onDelete, forms }: {
  step: WStep;
  onUpdate: (updates: Partial<WStep>) => void;
  onDelete: () => void;
  forms: FormOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(step.label);
  const [draftFormId, setDraftFormId] = useState<number | null>(step.formId ?? null);

  useEffect(() => {
    if (!editing) {
      setDraftLabel(step.label);
      setDraftFormId(step.formId ?? null);
    }
  }, [step.label, step.formId, editing]);

  const commitEdit = () => {
    const selectedForm = forms.find(f => f.id === draftFormId);
    onUpdate({
      label: draftLabel,
      formId: draftFormId,
      formName: selectedForm?.name ?? '',
    });
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftLabel(step.label);
    setDraftFormId(step.formId ?? null);
    setEditing(false);
  };

  const linkedForm = forms.find(f => f.id === step.formId);

  return (
    <div className={cn(
      "relative mx-auto w-full max-w-xs rounded-xl border-2 transition-all shadow-sm",
      editing ? "border-violet-400 bg-violet-400/5 shadow-md" : "border-border bg-card hover:border-violet-400/50"
    )}>
      {editing ? (
        <div className="px-4 pt-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-md bg-violet-500/15 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-2.5 h-2.5 text-violet-400" />
            </div>
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Collect Form Data</span>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Step Label (optional)</label>
            <input
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              placeholder="Step label…"
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Select Form</label>
            <select
              value={draftFormId ?? ''}
              onChange={e => setDraftFormId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Choose a form —</option>
              {forms.map(f => (
                <option key={f.id} value={f.id}>#{f.formNumber} {f.name}</option>
              ))}
            </select>
            {forms.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No forms available. Create one in the Forms section.</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={cancelEdit} className="px-3 py-1 rounded-lg text-xs border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancel</button>
            <button onClick={commitEdit} className="px-3 py-1 rounded-lg text-xs bg-violet-500 text-white hover:bg-violet-600 transition-colors flex items-center gap-1">
              <Check className="w-3 h-3" />Apply
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 px-4 py-3 group">
          <div className="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ClipboardList className="w-3 h-3 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-0.5">Collect Form Data</div>
            {linkedForm ? (
              <div className="text-sm font-medium truncate">{linkedForm.name}</div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No form linked — click Edit</div>
            )}
            {step.label && <div className="text-xs text-muted-foreground mt-0.5 truncate">{step.label}</div>}
            {linkedForm && (
              <div className="text-xs text-muted-foreground mt-0.5">Sends JSON data to next step</div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
              title="Edit form step"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete step"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Call Another Workflow Step Card ──────────────────────────────────────────

function WorkflowCallStepCard({ step, onUpdate, onDelete, workflows }: {
  step: WStep;
  onUpdate: (updates: Partial<WStep>) => void;
  onDelete: () => void;
  workflows: WorkflowSummary[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(step.label);
  const [draftWorkflowId, setDraftWorkflowId] = useState<number | null>(step.callWorkflowId ?? null);

  useEffect(() => {
    if (!editing) {
      setDraftLabel(step.label);
      setDraftWorkflowId(step.callWorkflowId ?? null);
    }
  }, [step.label, step.callWorkflowId, editing]);

  const commitEdit = () => {
    const selected = workflows.find(w => w.id === draftWorkflowId);
    onUpdate({ label: draftLabel, callWorkflowId: draftWorkflowId, callWorkflowName: selected?.name ?? '' });
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftLabel(step.label);
    setDraftWorkflowId(step.callWorkflowId ?? null);
    setEditing(false);
  };

  const linked = workflows.find(w => w.id === step.callWorkflowId);

  return (
    <div className={cn(
      "relative mx-auto w-full max-w-xs rounded-xl border-2 transition-all shadow-sm",
      editing ? "border-cyan-400 bg-cyan-400/5 shadow-md" : "border-border bg-card hover:border-cyan-400/50"
    )}>
      {editing ? (
        <div className="px-4 pt-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-md bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
              <Layers className="w-2.5 h-2.5 text-cyan-400" />
            </div>
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Call Another Workflow</span>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Step Label (optional)</label>
            <input
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              placeholder="Step label…"
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Select Workflow</label>
            <select
              value={draftWorkflowId ?? ''}
              onChange={e => setDraftWorkflowId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">— Choose a workflow —</option>
              {workflows.map(w => (
                <option key={w.id} value={w.id}>#{w.workflowNumber} {w.name}</option>
              ))}
            </select>
            {workflows.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No other workflows available.</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={cancelEdit} className="px-3 py-1 rounded-lg text-xs border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancel</button>
            <button onClick={commitEdit} className="px-3 py-1 rounded-lg text-xs bg-cyan-500 text-white hover:bg-cyan-600 transition-colors flex items-center gap-1">
              <Check className="w-3 h-3" />Apply
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 px-4 py-3 group">
          <div className="w-6 h-6 rounded-md bg-cyan-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Layers className="w-3 h-3 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-0.5">Call Workflow</div>
            {linked ? (
              <div className="text-sm font-medium truncate">#{linked.workflowNumber} {linked.name}</div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No workflow selected — click Edit</div>
            )}
            {step.label && <div className="text-xs text-muted-foreground mt-0.5 truncate">{step.label}</div>}
            {linked && <div className="text-xs text-muted-foreground mt-0.5">Passes output to next step</div>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors" title="Edit step">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete}
              className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete step">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Run AI Agent Step Card ────────────────────────────────────────────────────

function AgentCallStepCard({ step, onUpdate, onDelete, agents }: {
  step: WStep;
  onUpdate: (updates: Partial<WStep>) => void;
  onDelete: () => void;
  agents: AgentOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(step.label);
  const [draftDesc, setDraftDesc] = useState(step.description);
  const [draftAgentId, setDraftAgentId] = useState<number | null>(step.callAgentId ?? null);

  useEffect(() => {
    if (!editing) {
      setDraftLabel(step.label);
      setDraftDesc(step.description);
      setDraftAgentId(step.callAgentId ?? null);
    }
  }, [step.label, step.description, step.callAgentId, editing]);

  const commitEdit = () => {
    const selected = agents.find(a => a.id === draftAgentId);
    onUpdate({ label: draftLabel, description: draftDesc, callAgentId: draftAgentId, callAgentName: selected?.name ?? '' });
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftLabel(step.label);
    setDraftDesc(step.description);
    setDraftAgentId(step.callAgentId ?? null);
    setEditing(false);
  };

  const linked = agents.find(a => a.id === step.callAgentId);

  return (
    <div className={cn(
      "relative mx-auto w-full max-w-xs rounded-xl border-2 transition-all shadow-sm",
      editing ? "border-emerald-400 bg-emerald-400/5 shadow-md" : "border-border bg-card hover:border-emerald-400/50"
    )}>
      {editing ? (
        <div className="px-4 pt-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <Bot className="w-2.5 h-2.5 text-emerald-400" />
            </div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Run AI Agent</span>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Step Label (optional)</label>
            <input
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              placeholder="Step label…"
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Select Agent</label>
            <select
              value={draftAgentId ?? ''}
              onChange={e => setDraftAgentId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">— Choose an agent —</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>#{a.agentNumber} {a.name}</option>
              ))}
            </select>
            {agents.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No agents available. Create one in the AI Agents section.</p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Instructions / Context (optional)</label>
            <textarea
              value={draftDesc}
              onChange={e => setDraftDesc(e.target.value)}
              rows={2}
              placeholder="Any extra context to pass to the agent…"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={cancelEdit} className="px-3 py-1 rounded-lg text-xs border border-border hover:bg-secondary transition-colors text-muted-foreground">Cancel</button>
            <button onClick={commitEdit} className="px-3 py-1 rounded-lg text-xs bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1">
              <Check className="w-3 h-3" />Apply
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 px-4 py-3 group">
          <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-0.5">Run AI Agent</div>
            {linked ? (
              <div className="text-sm font-medium truncate">#{linked.agentNumber} {linked.name}</div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No agent selected — click Edit</div>
            )}
            {step.label && <div className="text-xs text-muted-foreground mt-0.5 truncate">{step.label}</div>}
            {step.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 italic">"{step.description}"</div>}
            {linked && <div className="text-xs text-muted-foreground mt-0.5">Returns response to next step</div>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors" title="Edit step">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete}
              className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete step">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Decision Step Card (AI-Routed) ────────────────────────────────────────────

const DECISION_BRANCH_COLORS = [
  'border-orange-500/50',
  'border-sky-500/50',
  'border-violet-500/50',
  'border-green-500/50',
  'border-pink-500/50',
  'border-yellow-500/50',
];
const DECISION_BRANCH_TEXT = [
  'text-orange-400',
  'text-sky-400',
  'text-violet-400',
  'text-green-400',
  'text-pink-400',
  'text-yellow-400',
];
const DECISION_BRANCH_BG = [
  'bg-orange-500/10',
  'bg-sky-500/10',
  'bg-violet-500/10',
  'bg-green-500/10',
  'bg-pink-500/10',
  'bg-yellow-500/10',
];

function DecisionStepCard({ step, onUpdate, onDelete, processFields }: {
  step: WStep;
  onUpdate: (updates: Partial<WStep>) => void;
  onDelete: () => void;
  processFields: ProcessField[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(step.label);
  const [draftInstruction, setDraftInstruction] = useState(step.instruction ?? '');
  const [editingBranchIdx, setEditingBranchIdx] = useState<number | null>(null);
  const [draftBranchLabel, setDraftBranchLabel] = useState('');

  useEffect(() => {
    if (!editing) {
      setDraftLabel(step.label);
      setDraftInstruction(step.instruction ?? '');
    }
  }, [step.label, step.instruction, editing]);

  const commitEdit = () => {
    onUpdate({ label: draftLabel, instruction: draftInstruction });
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftLabel(step.label);
    setDraftInstruction(step.instruction ?? '');
    setEditing(false);
  };

  const addBranch = () => {
    const existing = step.branches ?? [];
    onUpdate({
      branches: [
        ...existing,
        { id: uid(), label: `Outcome ${existing.length + 1}`, steps: [] },
      ],
    });
  };

  const removeBranch = (branchId: string) => {
    const existing = step.branches ?? [];
    if (existing.length <= 2) return;
    onUpdate({ branches: existing.filter(b => b.id !== branchId) });
  };

  const startRenameBranch = (idx: number) => {
    setDraftBranchLabel((step.branches ?? [])[idx]?.label ?? '');
    setEditingBranchIdx(idx);
  };

  const commitRenameBranch = () => {
    if (editingBranchIdx === null) return;
    onUpdate({
      branches: (step.branches ?? []).map((b, i) =>
        i === editingBranchIdx ? { ...b, label: draftBranchLabel } : b
      ),
    });
    setEditingBranchIdx(null);
  };

  const branches = step.branches ?? [];

  return (
    <div className={cn(
      "relative mx-auto w-full max-w-sm rounded-xl border-2 transition-all shadow-sm",
      editing ? "border-orange-400 bg-orange-500/5 shadow-md" : "border-orange-500/40 bg-orange-500/5 hover:border-orange-400/70"
    )}>
      <div className="px-4 pt-3 pb-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              <Brain className="w-2.5 h-2.5 text-orange-400" />
            </div>
            <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">Decision</span>
          </div>
          {!editing && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setDraftLabel(step.label); setDraftInstruction(step.instruction ?? ''); setEditing(true); }}
                className="p-1 rounded-md text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 transition-colors opacity-50 hover:opacity-100"
                title="Edit decision"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-50 hover:opacity-100"
                title="Delete step"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Label (optional)</label>
              <input
                value={draftLabel}
                onChange={e => setDraftLabel(e.target.value)}
                placeholder="Label for this decision…"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1">
                <Brain className="w-3 h-3 text-orange-400" />
                AI Routing Instruction
                <span className="normal-case font-normal ml-1">(type / to insert a variable)</span>
              </label>
              <FieldPickerTextarea
                value={draftInstruction}
                onChange={setDraftInstruction}
                processFields={processFields}
                rows={4}
                placeholder={`Describe how the AI should decide which branch to follow.\n\nExample: If {{applicant_status}} is "approved" and {{risk_score}} < 30, route to Fast Track. If {{risk_score}} >= 30, route to Review. Otherwise, route to Rejected.`}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                The AI reads this instruction at runtime and routes execution to exactly one of the outcome branches below.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={cancelEdit}
                className="px-3 py-1 rounded-lg text-xs border border-border hover:bg-secondary transition-colors text-muted-foreground"
              >
                Cancel
              </button>
              <button
                onClick={commitEdit}
                className="px-3 py-1 rounded-lg text-xs bg-orange-500 text-white hover:bg-orange-600 transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" />Apply
              </button>
            </div>
          </>
        ) : (
          <>
            {step.label && (
              <div className="text-sm font-medium truncate">{step.label}</div>
            )}
            {step.instruction ? (
              <div className="bg-background/60 border border-orange-500/20 rounded-lg px-3 py-2">
                <div className="text-[10px] font-semibold text-orange-400/80 uppercase tracking-wider mb-1">AI Instruction</div>
                <div className="text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap">{step.instruction}</div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No instruction set — click Edit to add AI routing logic</div>
            )}
          </>
        )}

        {/* Branch tags */}
        {!editing && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {branches.map((b, idx) => (
              <div key={b.id} className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                DECISION_BRANCH_COLORS[idx % DECISION_BRANCH_COLORS.length],
                DECISION_BRANCH_TEXT[idx % DECISION_BRANCH_TEXT.length],
                DECISION_BRANCH_BG[idx % DECISION_BRANCH_BG.length],
              )}>
                {editingBranchIdx === idx ? (
                  <input
                    value={draftBranchLabel}
                    onChange={e => setDraftBranchLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRenameBranch(); if (e.key === 'Escape') setEditingBranchIdx(null); }}
                    onBlur={commitRenameBranch}
                    autoFocus
                    className="bg-transparent border-none outline-none w-24 text-[10px]"
                  />
                ) : (
                  <>
                    <span>{b.label || `Outcome ${idx + 1}`}</span>
                    <button
                      onClick={() => startRenameBranch(idx)}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      title="Rename outcome"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                    {branches.length > 2 && (
                      <button
                        onClick={() => removeBranch(b.id)}
                        className="opacity-60 hover:opacity-100 text-red-400 transition-opacity"
                        title="Remove this outcome"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
            <button
              onClick={addBranch}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-dashed border-border text-muted-foreground hover:border-orange-400 hover:text-orange-400 transition-colors"
            >
              <Plus className="w-2.5 h-2.5" />Add Outcome
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Parallel Step Card ────────────────────────────────────────────────────────

const PARALLEL_BRANCH_COLORS = [
  'border-fuchsia-500/50',
  'border-blue-500/50',
  'border-amber-500/50',
  'border-teal-500/50',
  'border-rose-500/50',
  'border-lime-500/50',
];
const PARALLEL_BRANCH_TEXT = [
  'text-fuchsia-400',
  'text-blue-400',
  'text-amber-400',
  'text-teal-400',
  'text-rose-400',
  'text-lime-400',
];
const PARALLEL_BRANCH_BG = [
  'bg-fuchsia-500/10',
  'bg-blue-500/10',
  'bg-amber-500/10',
  'bg-teal-500/10',
  'bg-rose-500/10',
  'bg-lime-500/10',
];

function ParallelStepCard({ step, onUpdate, onDelete }: {
  step: WStep;
  onUpdate: (updates: Partial<WStep>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(step.label);
  const [editingBranchIdx, setEditingBranchIdx] = useState<number | null>(null);
  const [draftBranchLabel, setDraftBranchLabel] = useState('');

  useEffect(() => {
    if (!editing) setDraftLabel(step.label);
  }, [step.label, editing]);

  const commitLabel = () => {
    onUpdate({ label: draftLabel });
    setEditing(false);
  };

  const addBranch = () => {
    const existing = step.branches ?? [];
    onUpdate({
      branches: [
        ...existing,
        { id: uid(), label: `Branch ${existing.length + 1}`, steps: [] },
      ],
    });
  };

  const removeBranch = (branchId: string) => {
    const existing = step.branches ?? [];
    if (existing.length <= 2) return;
    onUpdate({ branches: existing.filter(b => b.id !== branchId) });
  };

  const startRenameBranch = (idx: number) => {
    setDraftBranchLabel((step.branches ?? [])[idx]?.label ?? '');
    setEditingBranchIdx(idx);
  };

  const commitRenameBranch = () => {
    if (editingBranchIdx === null) return;
    onUpdate({
      branches: (step.branches ?? []).map((b, i) =>
        i === editingBranchIdx ? { ...b, label: draftBranchLabel } : b
      ),
    });
    setEditingBranchIdx(null);
  };

  const branches = step.branches ?? [];

  return (
    <div className="relative mx-auto w-full max-w-sm rounded-xl border-2 border-fuchsia-500/50 bg-fuchsia-500/5 shadow-sm">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-fuchsia-500/15 flex items-center justify-center flex-shrink-0">
              <Split className="w-2.5 h-2.5 text-fuchsia-400" />
            </div>
            <span className="text-xs font-semibold text-fuchsia-400 uppercase tracking-wider">Parallel Split</span>
          </div>
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <button
                  onClick={commitLabel}
                  className="px-2 py-0.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />Apply
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-2 py-0.5 rounded-md text-xs border border-border text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setDraftLabel(step.label); setEditing(true); }}
                  className="p-1 rounded-md text-muted-foreground hover:text-fuchsia-400 hover:bg-fuchsia-500/10 transition-colors opacity-50 hover:opacity-100"
                  title="Rename step"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onDelete}
                  className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-50 hover:opacity-100"
                  title="Delete step"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <input
            value={draftLabel}
            onChange={e => setDraftLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="Label for this parallel split (optional)…"
            autoFocus
            className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-fuchsia-500 mb-2"
          />
        ) : step.label ? (
          <div className="text-sm font-medium mb-2 truncate">{step.label}</div>
        ) : null}

        {/* Branch labels row */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {branches.map((b, idx) => (
            <div key={b.id} className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
              PARALLEL_BRANCH_COLORS[idx % PARALLEL_BRANCH_COLORS.length],
              PARALLEL_BRANCH_TEXT[idx % PARALLEL_BRANCH_TEXT.length],
              PARALLEL_BRANCH_BG[idx % PARALLEL_BRANCH_BG.length],
            )}>
              {editingBranchIdx === idx ? (
                <input
                  value={draftBranchLabel}
                  onChange={e => setDraftBranchLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRenameBranch(); if (e.key === 'Escape') setEditingBranchIdx(null); }}
                  onBlur={commitRenameBranch}
                  autoFocus
                  className="bg-transparent border-none outline-none w-20 text-[10px]"
                />
              ) : (
                <>
                  <span>{b.label || `Branch ${idx + 1}`}</span>
                  <button
                    onClick={() => startRenameBranch(idx)}
                    className="opacity-60 hover:opacity-100 transition-opacity"
                    title="Rename branch"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                  {branches.length > 2 && (
                    <button
                      onClick={() => removeBranch(b.id)}
                      className="opacity-60 hover:opacity-100 text-red-400 transition-opacity"
                      title="Remove this branch"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            onClick={addBranch}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-dashed border-border text-muted-foreground hover:border-fuchsia-400 hover:text-fuchsia-400 transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />Add Branch
          </button>
        </div>

        <div className="text-[10px] text-muted-foreground">
          All branches run simultaneously — steps within each branch run in sequence.
        </div>
      </div>
    </div>
  );
}

// ── Recursive Step Branch Renderer ────────────────────────────────────────────

function StepBranch({
  steps, branchKey, onUpdate, onDelete, onAdd, processFields, forms, agents, workflows,
}: {
  steps: WStep[];
  branchKey: string;
  onUpdate: (id: string, updates: Partial<WStep>) => void;
  onDelete: (id: string) => void;
  onAdd: (branchKey: string, afterId: string | null, type: StepType) => void;
  processFields: ProcessField[];
  forms: FormOption[];
  agents: AgentOption[];
  workflows: WorkflowSummary[];
}) {
  return (
    <div className="flex flex-col items-center">
      <AddStepButton onAdd={type => onAdd(branchKey, null, type)} />
      {steps.map((step) => (
        <div key={step.id} className="w-full flex flex-col items-center">
          {step.type === 'action' && (
            <div className="w-full px-2">
              <ActionStepCard
                step={step}
                onUpdate={updates => onUpdate(step.id, updates)}
                onDelete={() => onDelete(step.id)}
                processFields={processFields}
                forms={forms}
                agents={agents}
              />
            </div>
          )}
          {step.type === 'form' && (
            <div className="w-full px-2">
              <FormStepCard
                step={step}
                onUpdate={updates => onUpdate(step.id, updates)}
                onDelete={() => onDelete(step.id)}
                forms={forms}
              />
            </div>
          )}
          {step.type === 'workflow-call' && (
            <div className="w-full px-2">
              <WorkflowCallStepCard
                step={step}
                onUpdate={updates => onUpdate(step.id, updates)}
                onDelete={() => onDelete(step.id)}
                workflows={workflows}
              />
            </div>
          )}
          {step.type === 'agent-call' && (
            <div className="w-full px-2">
              <AgentCallStepCard
                step={step}
                onUpdate={updates => onUpdate(step.id, updates)}
                onDelete={() => onDelete(step.id)}
                agents={agents}
              />
            </div>
          )}
          {step.type === 'condition' && (
            <div className="w-full flex flex-col items-center">
              <div className="w-full px-2">
                <ConditionStepCard
                  step={step}
                  onUpdate={updates => onUpdate(step.id, updates)}
                  onDelete={() => onDelete(step.id)}
                  processFields={processFields}
                />
              </div>
              {/* Branches */}
              <div className="w-px h-4 bg-border" />
              <div className="w-full flex items-start gap-2">
                {/* THEN branch */}
                <div className="flex-1 min-w-0 border-t-2 border-l-2 border-green-500/40 rounded-tl-xl pt-2 pl-2">
                  <div className="text-xs font-bold text-green-400 uppercase tracking-wider px-2 pb-1 flex items-center gap-1">
                    <Check className="w-3 h-3" />THEN
                  </div>
                  <StepBranch
                    steps={step.thenSteps ?? []}
                    branchKey={`${step.id}:then`}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onAdd={onAdd}
                    processFields={processFields}
                    forms={forms}
                    agents={agents}
                    workflows={workflows}
                  />
                </div>
                {/* Divider */}
                <div className="w-px bg-border self-stretch mx-1" />
                {/* ELSE branch */}
                <div className="flex-1 min-w-0 border-t-2 border-r-2 border-red-500/40 rounded-tr-xl pt-2 pr-2">
                  <div className="text-xs font-bold text-red-400 uppercase tracking-wider px-2 pb-1 flex items-center gap-1">
                    <X className="w-3 h-3" />ELSE
                  </div>
                  <StepBranch
                    steps={step.elseSteps ?? []}
                    branchKey={`${step.id}:else`}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onAdd={onAdd}
                    processFields={processFields}
                    forms={forms}
                    agents={agents}
                    workflows={workflows}
                  />
                </div>
              </div>
              <div className="w-px h-4 bg-border" />
            </div>
          )}
          {step.type === 'decision' && (
            <div className="w-full flex flex-col items-center">
              <div className="w-full px-2">
                <DecisionStepCard
                  step={step}
                  onUpdate={updates => onUpdate(step.id, updates)}
                  onDelete={() => onDelete(step.id)}
                  processFields={processFields}
                />
              </div>
              {/* Decision outcome branches side-by-side */}
              <div className="w-px h-4 bg-border" />
              <div className="w-full flex items-start gap-1 overflow-x-auto">
                {(step.branches ?? []).map((branch, idx) => {
                  const colorClass = DECISION_BRANCH_COLORS[idx % DECISION_BRANCH_COLORS.length];
                  const textClass = DECISION_BRANCH_TEXT[idx % DECISION_BRANCH_TEXT.length];
                  return (
                    <div
                      key={branch.id}
                      className={cn(
                        "flex-1 min-w-0 border-t-2 pt-2 px-1",
                        colorClass,
                        idx === 0 ? "border-l-2 rounded-tl-xl pl-2" : "",
                        idx === (step.branches ?? []).length - 1 ? "border-r-2 rounded-tr-xl pr-2" : "",
                      )}
                    >
                      <div className={cn("text-[10px] font-bold uppercase tracking-wider px-2 pb-1 flex items-center gap-1", textClass)}>
                        <Brain className="w-2.5 h-2.5" />
                        {branch.label || `Outcome ${idx + 1}`}
                      </div>
                      <StepBranch
                        steps={branch.steps}
                        branchKey={`${step.id}:branch:${idx}`}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        onAdd={onAdd}
                        processFields={processFields}
                        forms={forms}
                        agents={agents}
                        workflows={workflows}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="w-px h-4 bg-border" />
            </div>
          )}
          {step.type === 'parallel' && (
            <div className="w-full flex flex-col items-center">
              <div className="w-full px-2">
                <ParallelStepCard
                  step={step}
                  onUpdate={updates => onUpdate(step.id, updates)}
                  onDelete={() => onDelete(step.id)}
                />
              </div>
              {/* Parallel branches side-by-side */}
              <div className="w-px h-4 bg-border" />
              <div className="w-full flex items-start gap-1 overflow-x-auto">
                {(step.branches ?? []).map((branch, idx) => {
                  const colorClass = PARALLEL_BRANCH_COLORS[idx % PARALLEL_BRANCH_COLORS.length];
                  const textClass = PARALLEL_BRANCH_TEXT[idx % PARALLEL_BRANCH_TEXT.length];
                  return (
                    <div
                      key={branch.id}
                      className={cn(
                        "flex-1 min-w-0 border-t-2 pt-2 px-1",
                        colorClass,
                        idx === 0 ? "border-l-2 rounded-tl-xl pl-2" : "",
                        idx === (step.branches ?? []).length - 1 ? "border-r-2 rounded-tr-xl pr-2" : "",
                      )}
                    >
                      <div className={cn("text-[10px] font-bold uppercase tracking-wider px-2 pb-1 flex items-center gap-1", textClass)}>
                        <Split className="w-2.5 h-2.5" />
                        {branch.label || `Branch ${idx + 1}`}
                      </div>
                      <StepBranch
                        steps={branch.steps}
                        branchKey={`${step.id}:branch:${idx}`}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        onAdd={onAdd}
                        processFields={processFields}
                        forms={forms}
                        agents={agents}
                        workflows={workflows}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="w-px h-4 bg-border" />
            </div>
          )}
          <AddStepButton onAdd={type => onAdd(branchKey, step.id, type)} />
        </div>
      ))}
    </div>
  );
}

// ── Workflow Designer ─────────────────────────────────────────────────────────

function WorkflowDesigner({
  steps, onChange, onAutoSave, processFields, forms, agents, workflows,
}: {
  steps: WStep[];
  onChange: (steps: WStep[]) => void;
  onAutoSave?: (newSteps: WStep[]) => void;
  processFields: ProcessField[];
  forms: FormOption[];
  agents: AgentOption[];
  workflows: WorkflowSummary[];
}) {
  const handleAdd = (branchKey: string, afterId: string | null, type: StepType) => {
    const newStep: WStep = {
      id: uid(),
      type,
      label: '',
      description: '',
      ...(type === 'decision' ? {
        instruction: '',
        branches: [
          { id: uid(), label: 'Outcome A', steps: [] },
          { id: uid(), label: 'Outcome B', steps: [] },
        ],
      } : {}),
      ...(type === 'parallel' ? {
        branches: [
          { id: uid(), label: 'Branch 1', steps: [] },
          { id: uid(), label: 'Branch 2', steps: [] },
        ],
      } : {}),
    };
    onChange(addStepToBranch(steps, branchKey, afterId, newStep));
  };

  const handleDelete = (id: string) => {
    const newSteps = deleteStepFromTree(steps, id);
    onChange(newSteps);
    onAutoSave?.(newSteps);
  };

  const handleUpdate = (id: string, updates: Partial<WStep>) => {
    onChange(updateStepInTree(steps, id, s => ({ ...s, ...updates })));
  };

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className="flex-1 overflow-auto p-6">
        {/* START node */}
        <div className="flex flex-col items-center">
          <div className="mx-auto px-6 py-2 bg-green-500/15 border-2 border-green-500/40 rounded-xl text-xs font-bold text-green-400 uppercase tracking-widest">
            START
          </div>
        </div>

        {/* Steps */}
        <StepBranch
          steps={steps}
          branchKey="root"
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
          processFields={processFields}
          forms={forms}
          agents={agents}
          workflows={workflows}
        />

        {/* END node */}
        <div className="flex flex-col items-center">
          <div className="w-px h-3 bg-border" />
          <div className="mx-auto px-6 py-2 bg-red-500/10 border-2 border-red-500/30 rounded-xl text-xs font-bold text-red-400 uppercase tracking-widest">
            END
          </div>
        </div>

        {steps.length === 0 && (
          <div className="flex flex-col items-center mt-4 gap-2 text-center">
            <p className="text-xs text-muted-foreground">Click <strong>+</strong> above to add your first step</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function WorkflowsView() {
  const { fetchHeaders } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNumber, setEditNumber] = useState(0);
  const [editingNumber, setEditingNumber] = useState(false);
  const [steps, setSteps] = useState<WStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processFields, setProcessFields] = useState<ProcessField[]>([]);
  const [availableForms, setAvailableForms] = useState<FormOption[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);

  const selectedWorkflow = workflows.find(w => w.id === selectedId) ?? null;

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/workflows`, { headers: fetchHeaders() });
      const data = await r.json();
      if (Array.isArray(data)) setWorkflows(data);
    } catch {}
    finally { setLoading(false); }
  }, [fetchHeaders]);

  const fetchFields = useCallback(async () => {
    const r = await fetch(`${API}/ai-agents/meta/process-fields`, { headers: fetchHeaders() });
    if (r.ok) setProcessFields(await r.json());
  }, [fetchHeaders]);

  const fetchForms = useCallback(async () => {
    const r = await fetch(`${API}/forms`, { headers: fetchHeaders() });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) setAvailableForms(data.map((f: any) => ({ id: f.id, name: f.name, formNumber: f.formNumber })));
    }
  }, [fetchHeaders]);

  const fetchAgents = useCallback(async () => {
    const r = await fetch(`${API}/ai-agents`, { headers: fetchHeaders() });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) setAvailableAgents(data.map((a: any) => ({ id: a.id, name: a.name, agentNumber: a.agentNumber })));
    }
  }, [fetchHeaders]);

  useEffect(() => { fetchWorkflows(); fetchFields(); fetchForms(); fetchAgents(); }, [fetchWorkflows, fetchFields, fetchForms, fetchAgents]);

  const loadWorkflow = useCallback(async (id: number) => {
    const r = await fetch(`${API}/workflows/${id}`, { headers: fetchHeaders() });
    if (r.ok) {
      const w: WorkflowFull = await r.json();
      setEditName(w.name);
      setEditDesc(w.description);
      setEditNumber(w.workflowNumber);
      try { setSteps(JSON.parse(w.steps)); } catch { setSteps([]); }
      setDirty(false);
    }
  }, [fetchHeaders]);

  useEffect(() => {
    if (selectedId) loadWorkflow(selectedId);
  }, [selectedId, loadWorkflow]);

  const createWorkflow = async () => {
    const r = await fetch(`${API}/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({}),
    });
    if (r.ok) {
      const w: WorkflowFull = await r.json();
      await fetchWorkflows();
      setSelectedId(w.id);
    }
  };

  const deleteWorkflow = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    await fetch(`${API}/workflows/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (selectedId === id) { setSelectedId(null); setSteps([]); }
    fetchWorkflows();
  };

  const saveWithSteps = useCallback(async (stepsToSave: WStep[]) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await fetch(`${API}/workflows/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify({
          workflowNumber: editNumber,
          name: editName,
          description: editDesc,
          steps: JSON.stringify(stepsToSave),
        }),
      });
      await fetchWorkflows();
      setDirty(false);
    } finally { setSaving(false); }
  }, [selectedId, editNumber, editName, editDesc, fetchHeaders, fetchWorkflows]);

  const save = useCallback(() => saveWithSteps(steps), [saveWithSteps, steps]);

  const markDirty = () => setDirty(true);

  return (
    <div className="flex h-full bg-background">

      {/* Left panel */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col bg-sidebar/40">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Workflows</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{workflows.length}</span>
          </div>
          <button
            onClick={createWorkflow}
            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <GitBranch className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No workflows yet.</p>
              <button onClick={createWorkflow} className="mt-2 text-xs text-primary hover:underline">Create your first workflow</button>
            </div>
          ) : workflows.map(wf => (
            <div
              key={wf.id}
              onClick={() => setSelectedId(wf.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelectedId(wf.id)}
              className={cn(
                "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 group cursor-pointer",
                selectedId === wf.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <GitBranch className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-mono">#{wf.workflowNumber}</span>
                  <span className="text-sm font-medium truncate">{wf.name}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{wf.description || "No description"}</div>
                {(wf.stepCount ?? 0) > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    <Code2 className="inline w-3 h-3 mr-0.5" />{wf.stepCount} step{wf.stepCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              <button
                onClick={e => deleteWorkflow(wf.id, e)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      {!selectedWorkflow ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <GitBranch className="w-8 h-8 text-primary/60" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-1">Workflow Designer</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Design automated workflows with if/then/else logic. Hover over any step and click the <Edit2 className="inline w-3 h-3" /> pencil icon to edit it. Use <kbd className="px-1 py-0.5 bg-secondary rounded text-xs font-mono">/</kbd> in any text field to insert process fields.
            </p>
          </div>
          <button
            onClick={createWorkflow}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />Create First Workflow
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex-none px-6 py-3 border-b border-border bg-card/60 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 flex items-center gap-3">
              {editingNumber ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground font-mono">#</span>
                  <input
                    type="number"
                    value={editNumber}
                    onChange={e => { setEditNumber(Number(e.target.value)); markDirty(); }}
                    onBlur={() => setEditingNumber(false)}
                    autoFocus
                    className="w-14 text-xs font-mono bg-background border border-primary rounded px-1.5 py-0.5 focus:outline-none"
                  />
                </div>
              ) : (
                <button onClick={() => setEditingNumber(true)} className="flex items-center gap-0.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors group" title="Edit ID">
                  <span>#{editNumber}</span>
                  <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              <input
                value={editName}
                onChange={e => { setEditName(e.target.value); markDirty(); }}
                className="text-base font-bold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors flex-1 min-w-0"
                placeholder="Workflow name…"
              />
              <input
                value={editDesc}
                onChange={e => { setEditDesc(e.target.value); markDirty(); }}
                className="text-sm text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-64 flex-shrink-0 hidden lg:block"
                placeholder="Description…"
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {dirty && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              )}
            </div>
          </div>

          {/* Designer */}
          <div className="flex-1 min-h-0">
            <WorkflowDesigner
              steps={steps}
              onChange={newSteps => { setSteps(newSteps); markDirty(); }}
              onAutoSave={newSteps => { setSteps(newSteps); saveWithSteps(newSteps); }}
              processFields={processFields}
              forms={availableForms}
              agents={availableAgents}
              workflows={workflows.filter(w => w.id !== selectedId)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
