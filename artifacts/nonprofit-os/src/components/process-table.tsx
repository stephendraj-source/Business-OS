import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EditableCell } from './editable-cell';
import { useProcessesData, useCategoriesData, useOptimisticUpdateProcess, useDeleteProcessRow, useCreateProcessMutation, useAiPopulateProcessMutation } from '@/hooks/use-app-data';
import { Search, Loader2, Trash2, GripVertical, Download, Upload, CheckCircle2, Plus, X, Cpu, Sparkles, ShieldCheck, Eye } from 'lucide-react';
import { cn, getCategoryColorClass } from '@/lib/utils';
import type { Process } from '@workspace/api-client-react';

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
  const { data: processes } = useProcessesData();
  const process = (processes?.find(p => p.id === initialProcess.id) ?? initialProcess) as Process;
  const { mutate: updateProcess } = useOptimisticUpdateProcess();
  const { data: categories = [] } = useCategoriesData();

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
          <button onClick={onClose} className="ml-3 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Process ID – read-only */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">Process ID</div>
            <div className="text-sm rounded-lg bg-secondary/30 px-3 py-2 border border-border/50">
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{pid}</span>
            </div>
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
            <PanelTextField label="Est. Value Impact"  value={process.estimatedValueImpact ?? ''} onSave={v => save('estimatedValueImpact', v)} />
            <PanelTextField label="Industry Benchmark" value={process.industryBenchmark ?? ''}    onSave={v => save('industryBenchmark', v)} />
          </div>
        </div>
      </div>
    </>
  );
}

export function ProcessTable({ mode = 'matrix' }: TableProps) {
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

  const [widths, setWidths] = useState<Record<string, number>>(initWidths);
  const [colOrder, setColOrder] = useState<string[]>(REORDERABLE.map(c => c.key));

  const [govStandards, setGovStandards] = useState<GovStandard[]>([]);
  const [govMap, setGovMap] = useState<GovMap>({});
  const [govPopoverFor, setGovPopoverFor] = useState<number | null>(null);
  const [govPopoverPos, setGovPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [editingNumberFor, setEditingNumberFor] = useState<number | null>(null);
  const [editingNumberValue, setEditingNumberValue] = useState('');
  const [editingNumberError, setEditingNumberError] = useState<string | null>(null);
  const [savingNumber, setSavingNumber] = useState(false);

  function startEditNumber(process: Process) {
    setEditingNumberFor(process.id);
    setEditingNumberValue(String(process.number));
    setEditingNumberError(null);
  }

  function cancelEditNumber() {
    setEditingNumberFor(null);
    setEditingNumberValue('');
    setEditingNumberError(null);
  }

  async function commitEditNumber(processId: number) {
    const raw = editingNumberValue.trim().replace(/^pro-?/i, '');
    const newNumber = parseInt(raw, 10);
    if (isNaN(newNumber) || newNumber < 1) {
      setEditingNumberError('Enter a valid number (e.g. 5 or PRO-005)');
      return;
    }
    setSavingNumber(true);
    setEditingNumberError(null);
    try {
      const res = await fetch(`/api/processes/${processId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: newNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditingNumberError(data.error ?? 'Failed to update');
        return;
      }
      updateProcess({ id: processId, data: { number: newNumber } as any });
      setEditingNumberFor(null);
    } catch {
      setEditingNumberError('Network error — please try again');
    } finally {
      setSavingNumber(false);
    }
  }

  useEffect(() => {
    fetch('/api/governance').then(r => r.json()).then((data: { id: number; complianceName: string }[]) => {
      setGovStandards(data.map(d => ({ id: d.id, complianceName: d.complianceName })));
    }).catch(() => {});
    fetch('/api/processes/governance-map').then(r => r.json()).then((data: GovMap) => {
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
      headers: { 'Content-Type': 'application/json' },
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

  const handleExport = () => {
    const a = document.createElement('a');
    a.href = '/api/processes/export';
    a.download = 'nonprofit-processes.xlsx';
    a.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/processes/import', { method: 'POST', body: formData });
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
    if (!sortKey) return filtered.sort((a, b) => a.number - b.number);
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
        case 'trafficLight':         av = TL_ORD[(a as any).trafficLight] ?? 0; bv = TL_ORD[(b as any).trafficLight] ?? 0; break;
        case 'estimatedValueImpact': av = a.estimatedValueImpact ?? '';      bv = b.estimatedValueImpact ?? ''; break;
        case 'industryBenchmark':    av = a.industryBenchmark ?? '';         bv = b.industryBenchmark ?? ''; break;
        default: return a.number - b.number;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * m;
      return String(av).localeCompare(String(bv)) * m;
    });
  }, [processes, search, selectedCategory, mode, sortKey, sortDir]);

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

  const title = mode === 'portfolio' ? 'Portfolio Catalogue' : 'Process Catalogue';
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
      case '#': {
        const isEditingNum = editingNumberFor === process.id;
        return (
          <td key="#" className="align-middle p-0 text-center overflow-visible" style={{ width: widths['#'] }}>
            {isEditingNum ? (
              <div className="relative flex flex-col items-center px-1 py-1 gap-0.5">
                <div className="flex items-center gap-0.5">
                  <span className="text-[9px] text-muted-foreground font-mono font-bold">PRO-</span>
                  <input
                    autoFocus
                    type="text"
                    value={editingNumberValue}
                    onChange={e => { setEditingNumberValue(e.target.value); setEditingNumberError(null); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitEditNumber(process.id); }
                      if (e.key === 'Escape') cancelEditNumber();
                    }}
                    onBlur={() => { if (!savingNumber) commitEditNumber(process.id); }}
                    className={cn(
                      "w-10 px-1 py-0.5 text-[10px] font-mono font-semibold rounded border text-center bg-background text-primary focus:outline-none focus:ring-1 focus:ring-primary/50",
                      editingNumberError ? "border-red-500" : "border-primary/40"
                    )}
                    placeholder="001"
                  />
                </div>
                {editingNumberError && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 z-50 whitespace-nowrap px-2 py-1 rounded bg-red-500/90 text-white text-[9px] font-medium shadow-lg">
                    {editingNumberError}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-3 px-2">
                <button
                  onClick={() => startEditNumber(process)}
                  title="Click to edit Process ID"
                  className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold tracking-wide text-[10px] font-mono hover:bg-primary/20 hover:ring-1 hover:ring-primary/40 transition-all cursor-pointer"
                >
                  PRO-{process.number.toString().padStart(3, '0')}
                </button>
              </div>
            )}
          </td>
        );
      }
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
            <EditableCell processId={process.id} field="processName" initialValue={process.processName} />
          </td>
        );
      case 'processDescription':
        return (
          <td key="processDescription" className="overflow-hidden p-0" style={{ width: widths['processDescription'] }}>
            <EditableCell processId={process.id} field="processDescription" initialValue={process.processDescription} multiline />
          </td>
        );
      case 'aiAgent':
        return (
          <td key="aiAgent" className="overflow-hidden p-0" style={{ width: widths['aiAgent'] }}>
            <EditableCell processId={process.id} field="aiAgent" initialValue={process.aiAgent} />
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
            <EditableCell processId={process.id} field="purpose" initialValue={process.purpose} multiline />
          </td>
        );
      case 'inputs':
        return (
          <td key="inputs" className="overflow-hidden p-0" style={{ width: widths['inputs'] }}>
            <EditableCell processId={process.id} field="inputs" initialValue={process.inputs} multiline />
          </td>
        );
      case 'outputs':
        return (
          <td key="outputs" className="overflow-hidden p-0" style={{ width: widths['outputs'] }}>
            <EditableCell processId={process.id} field="outputs" initialValue={process.outputs} multiline />
          </td>
        );
      case 'humanInTheLoop':
        return (
          <td key="humanInTheLoop" className="overflow-hidden p-0" style={{ width: widths['humanInTheLoop'] }}>
            <EditableCell processId={process.id} field="humanInTheLoop" initialValue={process.humanInTheLoop} multiline />
          </td>
        );
      case 'kpi':
        return (
          <td key="kpi" className="overflow-hidden p-0" style={{ width: widths['kpi'] }}>
            <EditableCell processId={process.id} field="kpi" initialValue={process.kpi} multiline />
          </td>
        );
      case 'target':
        return (
          <td key="target" className="overflow-hidden p-0" style={{ width: widths['target'] }}>
            <EditableCell processId={process.id} field="target" initialValue={process.target} multiline />
          </td>
        );
      case 'achievement':
        return (
          <td key="achievement" className="overflow-hidden p-0" style={{ width: widths['achievement'] }}>
            <EditableCell processId={process.id} field="achievement" initialValue={process.achievement} multiline />
          </td>
        );
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
            <EditableCell processId={process.id} field="estimatedValueImpact" initialValue={process.estimatedValueImpact} multiline />
          </td>
        );
      case 'industryBenchmark':
        return (
          <td key="industryBenchmark" className="overflow-hidden p-0" style={{ width: widths['industryBenchmark'] }}>
            <EditableCell processId={process.id} field="industryBenchmark" initialValue={process.industryBenchmark} multiline />
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
                const isSortable = col.key !== 'include' && col.key !== 'actions';
                const isActiveSort = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    title={col.label || undefined}
                    className={cn(
                      "relative select-none overflow-hidden text-ellipsis whitespace-nowrap transition-colors",
                      isReorderable && "cursor-grab active:cursor-grabbing",
                      isSortable && "hover:text-foreground",
                      isActiveSort ? "text-primary" : "",
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
                      <span className="flex items-center gap-1 pr-3 pointer-events-none">
                        {isReorderable && (
                          <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className="truncate">{col.label}</span>
                        {isSortable && col.label && (
                          <span className={cn("text-[9px] leading-none shrink-0", isActiveSort ? "text-primary" : "text-muted-foreground/30")}>
                            {isActiveSort ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                          </span>
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
              filteredProcesses.map(process => (
                <tr key={process.id} className={cn(process.included && mode === 'matrix' && "bg-primary/[0.03]")}>
                  {allVisibleCols.map(col => renderCell(process, col.key))}
                </tr>
              ))
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

      {/* Process Detail Panel */}
      {detailProcess && (
        <ProcessDetailPanel process={detailProcess} onClose={() => setDetailProcess(null)} />
      )}

      {/* Add Process Modal */}
      {showAddModal && (
        <AddProcessModal
          categories={categories ?? []}
          onClose={() => setShowAddModal(false)}
          onCreateAndPopulate={(body, useAi) => {
            createProcess({ data: body }, {
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
