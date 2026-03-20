import { useState, useMemo, useRef, useCallback } from 'react';
import { EditableCell } from './editable-cell';
import { useProcessesData, useCategoriesData, useOptimisticUpdateProcess, useDeleteProcessRow, useCreateProcessMutation, useAiPopulateProcessMutation } from '@/hooks/use-app-data';
import { Search, Loader2, Trash2, GripVertical, Download, Upload, CheckCircle2, Plus, X, Cpu, Sparkles } from 'lucide-react';
import { cn, getCategoryColorClass } from '@/lib/utils';
import type { Process } from '@workspace/api-client-react';

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
  { key: 'purpose',              label: 'Purpose',               defaultWidth: 215, minWidth: 130 },
  { key: 'inputs',               label: 'Inputs',                defaultWidth: 200, minWidth: 130 },
  { key: 'outputs',              label: 'Outputs',               defaultWidth: 200, minWidth: 130 },
  { key: 'humanInTheLoop',       label: 'Human-in-the-Loop',    defaultWidth: 175, minWidth: 110 },
  { key: 'kpi',                  label: 'KPI',                   defaultWidth: 175, minWidth: 110 },
  { key: 'target',               label: 'Target',                defaultWidth: 160, minWidth: 110 },
  { key: 'achievement',          label: 'Achievement',           defaultWidth: 160, minWidth: 110 },
  { key: 'estimatedValueImpact', label: 'Value Impact',          defaultWidth: 190, minWidth: 120 },
  { key: 'industryBenchmark',    label: 'Industry Benchmark',    defaultWidth: 235, minWidth: 150 },
];

const FIXED_END: ColumnDef[] = [
  { key: 'actions', label: '', defaultWidth: 52, minWidth: 48, fixed: true },
];

const ALL_COLS = [...FIXED_START, ...REORDERABLE, ...FIXED_END];

function initWidths() {
  return Object.fromEntries(ALL_COLS.map(c => [c.key, c.defaultWidth]));
}

interface TableProps {
  mode?: 'matrix' | 'portfolio';
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

  const [widths, setWidths] = useState<Record<string, number>>(initWidths);
  const [colOrder, setColOrder] = useState<string[]>(REORDERABLE.map(c => c.key));

  const resizing = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const dragKey = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
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
    if (dragKey.current && dragKey.current !== key) setDragOverKey(key);
  };
  const onDrop = (targetKey: string) => {
    const fromKey = dragKey.current;
    if (!fromKey || fromKey === targetKey) { setDragOverKey(null); return; }
    setColOrder(prev => {
      const next = prev.filter(k => k !== fromKey);
      const toIdx = next.indexOf(targetKey);
      next.splice(toIdx, 0, fromKey);
      return next;
    });
    dragKey.current = null;
    setDragOverKey(null);
  };
  const onDragEnd = () => { dragKey.current = null; setDragOverKey(null); };

  const filteredProcesses = useMemo(() => {
    if (!processes) return [];
    return processes.filter(p => {
      if (mode === 'portfolio' && !p.included) return false;
      const matchesSearch = !search ||
        (p.processName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        p.processDescription.toLowerCase().includes(search.toLowerCase()) ||
        p.purpose.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => a.number - b.number);
  }, [processes, search, selectedCategory, mode]);

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
      case '#':
        return (
          <td key="#" className="align-middle p-3 text-center font-mono text-xs overflow-hidden" style={{ width: widths['#'] }}>
            <span className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold tracking-wide text-[10px]">
              PRO-{process.number.toString().padStart(3, '0')}
            </span>
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
      case 'actions':
        return (
          <td key="actions" className="align-middle p-2 text-center" style={{ width: widths['actions'] }}>
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
                return (
                  <th
                    key={col.key}
                    className={cn(
                      "relative select-none overflow-hidden text-ellipsis whitespace-nowrap",
                      isReorderable && "cursor-grab active:cursor-grabbing",
                      isDragOver && "bg-primary/10",
                      col.key === 'include' && "text-center"
                    )}
                    style={{ width: widths[col.key] ?? col.defaultWidth }}
                    draggable={isReorderable}
                    onDragStart={isReorderable ? () => onDragStart(col.key) : undefined}
                    onDragOver={isReorderable ? (e) => onDragOver(e, col.key) : undefined}
                    onDrop={isReorderable ? () => onDrop(col.key) : undefined}
                    onDragEnd={isReorderable ? onDragEnd : undefined}
                  >
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
                      <span className="flex items-center gap-1 pr-3">
                        {isReorderable && (
                          <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className="truncate">{col.label}</span>
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

function AddProcessModal({
  categories,
  onClose,
  onCreateAndPopulate,
  isCreating,
  isPopulating,
}: {
  categories: string[];
  onClose: () => void;
  onCreateAndPopulate: (body: Record<string, string>, useAi: boolean) => void;
  isCreating: boolean;
  isPopulating: boolean;
}) {
  const [category, setCategory] = useState(categories[0] ?? '');
  const [processName, setProcessName] = useState('');
  const [processDescription, setProcessDescription] = useState('');
  const [useAi, setUseAi] = useState(true);
  const isBusy = isCreating || isPopulating;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !processDescription.trim()) return;
    onCreateAndPopulate({ category, processName, processDescription }, useAi);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Plus className="w-4 h-4 text-primary" />
            Add New Process
          </div>
          <button onClick={onClose} disabled={isBusy} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Category *</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              required
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Process Name (short)</label>
            <input
              type="text"
              value={processName}
              onChange={e => setProcessName(e.target.value)}
              placeholder="e.g. Donor Retention"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Process Description *</label>
            <textarea
              value={processDescription}
              onChange={e => setProcessDescription(e.target.value)}
              required
              rows={3}
              placeholder="Describe what this process does…"
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* AI Auto-Fill Toggle */}
          <button
            type="button"
            onClick={() => setUseAi(v => !v)}
            className={cn(
              "w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all",
              useAi
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-secondary/30 opacity-70"
            )}
          >
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              useAi ? "bg-primary/20" : "bg-secondary"
            )}>
              <Sparkles className={cn("w-4 h-4", useAi ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
              <div className={cn("text-sm font-semibold", useAi ? "text-foreground" : "text-muted-foreground")}>
                AI Auto-Fill
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {useAi
                  ? "Claude will auto-populate all blank fields after creation"
                  : "Create with manual data only"}
              </div>
            </div>
            <div className={cn(
              "ml-auto w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
              useAi ? "bg-primary border-primary" : "border-muted-foreground/40"
            )} />
          </button>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="flex-1 px-4 py-2.5 border border-border bg-secondary/50 hover:bg-secondary text-foreground rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isBusy || !processDescription.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isCreating ? 'Creating…' : 'AI Filling…'}
                </>
              ) : (
                <>
                  {useAi ? <Cpu className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {useAi ? 'Create & AI Fill' : 'Create Process'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
