import { useState, useEffect, useRef, useCallback } from "react";
import {
  GitBranch, Plus, Trash2, Save, Edit2, Loader2, Hash,
  ChevronDown, ChevronRight, Play, AlertCircle, X, Check,
  ArrowDown, Code2, Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = '/api';

// ── Data Types ────────────────────────────────────────────────────────────────

export interface WCondition {
  field: string;
  operator: string;
  value: string;
}

export interface WStep {
  id: string;
  type: 'action' | 'condition';
  label: string;
  description: string;
  condition?: WCondition;
  thenSteps?: WStep[];
  elseSteps?: WStep[];
}

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
        className={cn("w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary", className)}
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

function AddStepButton({ onAdd }: { onAdd: (type: 'action' | 'condition') => void }) {
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
          </div>
        )}
      </div>
      <div className="w-px h-3 bg-border" />
    </div>
  );
}

// ── Action Step Card ──────────────────────────────────────────────────────────

function ActionStepCard({ step, selected, onClick, onDelete }: {
  step: WStep; selected: boolean; onClick: () => void; onDelete: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative mx-auto w-full max-w-xs rounded-xl border-2 px-4 py-3 cursor-pointer transition-all shadow-sm group",
        selected ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card hover:border-primary/50"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Play className="w-3 h-3 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-0.5">Action</div>
          <div className="text-sm font-medium truncate">{step.label || <span className="text-muted-foreground italic">Untitled action</span>}</div>
          {step.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{step.description}</div>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Condition Step Card ───────────────────────────────────────────────────────

function ConditionStepCard({ step, selected, onClick, onDelete }: {
  step: WStep; selected: boolean; onClick: () => void; onDelete: () => void;
}) {
  const op = OPERATORS.find(o => o.value === step.condition?.operator)?.label ?? step.condition?.operator ?? '?';
  const noOp = ['is_empty', 'is_not_empty'].includes(step.condition?.operator ?? '');
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative mx-auto w-full max-w-xs rounded-xl border-2 px-4 py-3 cursor-pointer transition-all shadow-sm group",
        selected ? "border-orange-400 bg-orange-400/5 shadow-md" : "border-border bg-card hover:border-orange-400/50"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-md bg-orange-500/15 flex items-center justify-center flex-shrink-0 mt-0.5 rotate-45">
          <GitBranch className="-rotate-45 w-3 h-3 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-0.5">If Condition</div>
          {step.condition?.field ? (
            <div className="text-xs font-mono text-foreground">
              <span className="text-primary">{step.condition.field}</span>
              {' '}<span className="text-muted-foreground">{op}</span>
              {!noOp && step.condition.value && <> <span className="text-green-400">"{step.condition.value}"</span></>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No condition set</div>
          )}
          {step.label && <div className="text-sm font-medium mt-1 truncate">{step.label}</div>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Recursive Step Branch Renderer ────────────────────────────────────────────

function StepBranch({
  steps, branchKey, selectedId, onSelect, onDelete, onAdd, processFields,
}: {
  steps: WStep[];
  branchKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (branchKey: string, afterId: string | null, type: 'action' | 'condition') => void;
  processFields: ProcessField[];
}) {
  return (
    <div className="flex flex-col items-center">
      <AddStepButton onAdd={type => onAdd(branchKey, null, type)} />
      {steps.map((step, i) => (
        <div key={step.id} className="w-full flex flex-col items-center">
          {step.type === 'action' ? (
            <div className="w-full px-2">
              <ActionStepCard
                step={step}
                selected={selectedId === step.id}
                onClick={() => onSelect(step.id)}
                onDelete={() => onDelete(step.id)}
              />
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              <div className="w-full px-2">
                <ConditionStepCard
                  step={step}
                  selected={selectedId === step.id}
                  onClick={() => onSelect(step.id)}
                  onDelete={() => onDelete(step.id)}
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
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onAdd={onAdd}
                    processFields={processFields}
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
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onAdd={onAdd}
                    processFields={processFields}
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

// ── Step Editor Panel ─────────────────────────────────────────────────────────

function StepEditorPanel({
  step, onUpdate, onClose, processFields,
}: {
  step: WStep;
  onUpdate: (updates: Partial<WStep>) => void;
  onClose: () => void;
  processFields: ProcessField[];
}) {
  const noOpValue = ['is_empty', 'is_not_empty'].includes(step.condition?.operator ?? '');

  return (
    <div className="h-full flex flex-col border-l border-border bg-card">
      {/* Editor header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-none">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {step.type === 'action'
            ? <Play className="w-4 h-4 text-blue-400" />
            : <GitBranch className="w-4 h-4 text-orange-400" />}
          Edit {step.type === 'action' ? 'Action' : 'Condition'}
        </div>
        <div className="flex items-center gap-2">
          {/* Type toggle */}
          <button
            onClick={() => onUpdate({
              type: step.type === 'action' ? 'condition' : 'action',
              condition: step.type === 'action' ? { field: '', operator: 'equals', value: '' } : undefined,
              thenSteps: step.type === 'action' ? [] : undefined,
              elseSteps: step.type === 'action' ? [] : undefined,
            })}
            className="text-xs px-2 py-1 rounded-md border border-border hover:bg-secondary transition-colors text-muted-foreground"
            title="Switch type"
          >
            Switch to {step.type === 'action' ? 'Condition' : 'Action'}
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
          <input
            value={step.label}
            onChange={e => onUpdate({ label: e.target.value })}
            placeholder="Step label…"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Description <span className="text-muted-foreground/60 font-normal">(type / for field picker)</span>
          </label>
          <FieldPickerTextarea
            value={step.description}
            onChange={v => onUpdate({ description: v })}
            processFields={processFields}
            rows={3}
            placeholder="Describe this step…"
          />
        </div>

        {/* Condition config */}
        {step.type === 'condition' && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Condition</div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                If field <span className="text-muted-foreground/60">(type / for picker)</span>
              </label>
              <FieldPickerTextarea
                value={step.condition?.field ?? ''}
                onChange={v => onUpdate({ condition: { ...(step.condition ?? { operator: 'equals', value: '' }), field: v } })}
                processFields={processFields}
                rows={1}
                placeholder="{{fieldName}} or field name…"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Operator</label>
              <select
                value={step.condition?.operator ?? 'equals'}
                onChange={e => onUpdate({ condition: { ...(step.condition ?? { field: '', value: '' }), operator: e.target.value } })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {!noOpValue && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Value <span className="text-muted-foreground/60">(type / for field picker)</span>
                </label>
                <FieldPickerTextarea
                  value={step.condition?.value ?? ''}
                  onChange={v => onUpdate({ condition: { ...(step.condition ?? { field: '', operator: 'equals' }), value: v } })}
                  processFields={processFields}
                  rows={1}
                  placeholder="Value or {{fieldName}}…"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Workflow Designer ─────────────────────────────────────────────────────────

function WorkflowDesigner({
  steps, onChange, processFields,
}: {
  steps: WStep[];
  onChange: (steps: WStep[]) => void;
  processFields: ProcessField[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedStep = selectedId ? findStep(steps, selectedId) : null;

  function findStep(steps: WStep[], id: string): WStep | null {
    for (const s of steps) {
      if (s.id === id) return s;
      if (s.type === 'condition') {
        const found = findStep(s.thenSteps ?? [], id) ?? findStep(s.elseSteps ?? [], id);
        if (found) return found;
      }
    }
    return null;
  }

  const handleAdd = (branchKey: string, afterId: string | null, type: 'action' | 'condition') => {
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
    setSelectedId(newStep.id);
  };

  const handleDelete = (id: string) => {
    onChange(deleteStepFromTree(steps, id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdate = (id: string, updates: Partial<WStep>) => {
    onChange(updateStepInTree(steps, id, s => ({ ...s, ...updates })));
  };

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className="flex-1 overflow-auto p-6" onClick={e => { if (e.target === e.currentTarget) setSelectedId(null); }}>
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
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDelete={handleDelete}
          onAdd={handleAdd}
          processFields={processFields}
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

      {/* Step editor */}
      {selectedStep && (
        <div className="w-80 flex-shrink-0">
          <StepEditorPanel
            step={selectedStep}
            onUpdate={updates => handleUpdate(selectedStep.id, updates)}
            onClose={() => setSelectedId(null)}
            processFields={processFields}
          />
        </div>
      )}
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function WorkflowsView() {
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

  const selectedWorkflow = workflows.find(w => w.id === selectedId) ?? null;

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/workflows`);
      const data = await r.json();
      if (Array.isArray(data)) setWorkflows(data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const fetchFields = useCallback(async () => {
    const r = await fetch(`${API}/ai-agents/meta/process-fields`);
    if (r.ok) setProcessFields(await r.json());
  }, []);

  useEffect(() => { fetchWorkflows(); fetchFields(); }, [fetchWorkflows, fetchFields]);

  const loadWorkflow = useCallback(async (id: number) => {
    const r = await fetch(`${API}/workflows/${id}`);
    if (r.ok) {
      const w: WorkflowFull = await r.json();
      setEditName(w.name);
      setEditDesc(w.description);
      setEditNumber(w.workflowNumber);
      try { setSteps(JSON.parse(w.steps)); } catch { setSteps([]); }
      setDirty(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadWorkflow(selectedId);
  }, [selectedId, loadWorkflow]);

  const createWorkflow = async () => {
    const r = await fetch(`${API}/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    await fetch(`${API}/workflows/${id}`, { method: "DELETE" });
    if (selectedId === id) { setSelectedId(null); setSteps([]); }
    fetchWorkflows();
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await fetch(`${API}/workflows/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
              Design automated workflows with if/then/else logic. Reference any database field using the <kbd className="px-1 py-0.5 bg-secondary rounded text-xs font-mono">/</kbd> command.
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
            {dirty && (
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm flex-shrink-0"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            )}
          </div>

          {/* Designer */}
          <div className="flex-1 min-h-0">
            <WorkflowDesigner
              steps={steps}
              onChange={newSteps => { setSteps(newSteps); markDirty(); }}
              processFields={processFields}
            />
          </div>
        </div>
      )}
    </div>
  );
}
