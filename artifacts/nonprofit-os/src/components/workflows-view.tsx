import { useState, useEffect, useRef, useCallback } from "react";
import {
  GitBranch, Plus, Trash2, Save, Edit2, Loader2, Hash,
  Play, X, Check,
  Code2, ClipboardList, Bot, ArrowDownToLine,
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

export interface WStep {
  id: string;
  type: 'action' | 'condition' | 'form';
  label: string;
  description: string;
  condition?: WCondition;
  thenSteps?: WStep[];
  elseSteps?: WStep[];
  formId?: number | null;
  formName?: string;
  dataSourceType?: 'agent' | 'form' | null;
  dataSourceId?: number | null;
  dataSourceName?: string;
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
      return s;
    });
}

// Branch key: "root" | "{stepId}:then" | "{stepId}:else"
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

function AddStepButton({ onAdd }: { onAdd: (type: 'action' | 'condition' | 'form') => void }) {
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
          <div className="absolute z-50 top-8 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-xl shadow-xl overflow-hidden w-44">
            <button onClick={() => { setOpen(false); onAdd('action'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left">
              <Play className="w-3.5 h-3.5 text-blue-400" />Action Step
            </button>
            <button onClick={() => { setOpen(false); onAdd('condition'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left border-t border-border">
              <GitBranch className="w-3.5 h-3.5 text-orange-400" />Condition (If/Then/Else)
            </button>
            <button onClick={() => { setOpen(false); onAdd('form'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left border-t border-border">
              <ClipboardList className="w-3.5 h-3.5 text-violet-400" />Collect Form Data
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
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
              <X className="w-3.5 h-3.5" />
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
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
              <X className="w-3.5 h-3.5" />
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
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recursive Step Branch Renderer ────────────────────────────────────────────

function StepBranch({
  steps, branchKey, onUpdate, onDelete, onAdd, processFields, forms, agents,
}: {
  steps: WStep[];
  branchKey: string;
  onUpdate: (id: string, updates: Partial<WStep>) => void;
  onDelete: (id: string) => void;
  onAdd: (branchKey: string, afterId: string | null, type: 'action' | 'condition' | 'form') => void;
  processFields: ProcessField[];
  forms: FormOption[];
  agents: AgentOption[];
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
                  />
                </div>
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
  steps, onChange, processFields, forms, agents,
}: {
  steps: WStep[];
  onChange: (steps: WStep[]) => void;
  processFields: ProcessField[];
  forms: FormOption[];
  agents: AgentOption[];
}) {
  const handleAdd = (branchKey: string, afterId: string | null, type: 'action' | 'condition' | 'form') => {
    const newStep: WStep = {
      id: uid(),
      type,
      label: '',
      description: '',
      ...(type === 'condition' ? {
        condition: { field: '', operator: 'equals', value: '' },
        thenSteps: [],
        elseSteps: [],
      } : {}),
    };
    onChange(addStepToBranch(steps, branchKey, afterId, newStep));
  };

  const handleDelete = (id: string) => {
    onChange(deleteStepFromTree(steps, id));
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

  const save = async () => {
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
          steps: JSON.stringify(steps),
        }),
      });
      await fetchWorkflows();
      setDirty(false);
    } finally { setSaving(false); }
  };

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
              processFields={processFields}
              forms={availableForms}
              agents={availableAgents}
            />
          </div>
        </div>
      )}
    </div>
  );
}
