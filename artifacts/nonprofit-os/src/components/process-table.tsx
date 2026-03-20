import { useState, useMemo, useRef, useCallback } from 'react';
import { EditableCell } from './editable-cell';
import { useProcessesData, useCategoriesData, useOptimisticUpdateProcess, useDeleteProcessRow } from '@/hooks/use-app-data';
import { Search, Loader2, Trash2, GripVertical, Download, Upload, CheckCircle2 } from 'lucide-react';
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
  { key: '#',       label: '#',       defaultWidth: 52, minWidth: 40, fixed: true },
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

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

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

  const title = mode === 'portfolio' ? 'Portfolio' : 'Process Matrix';
  const subtitle = mode === 'portfolio'
    ? 'Showing only included processes. Drag column headers to reorder.'
    : 'Inline editing enabled — click any cell to update. Drag column headers to reorder, borders to resize.';

  function renderCell(process: Process, colKey: string) {
    switch (colKey) {
      case 'include':
        return (
          <td key="include" className="align-middle p-0 text-center" style={{ width: widths['include'] }}>
            <label className="flex items-center justify-center h-full w-full cursor-pointer py-3">
              <input
                type="checkbox"
                checked={process.included}
                onChange={() => handleIncludeToggle(process)}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
            </label>
          </td>
        );
      case '#':
        return (
          <td key="#" className="align-middle p-3 text-center text-muted-foreground font-mono text-xs overflow-hidden" style={{ width: widths['#'] }}>
            {process.number}
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
                      isDragOver && "bg-primary/10"
                    )}
                    style={{ width: widths[col.key] ?? col.defaultWidth }}
                    draggable={isReorderable}
                    onDragStart={isReorderable ? () => onDragStart(col.key) : undefined}
                    onDragOver={isReorderable ? (e) => onDragOver(e, col.key) : undefined}
                    onDrop={isReorderable ? () => onDrop(col.key) : undefined}
                    onDragEnd={isReorderable ? onDragEnd : undefined}
                  >
                    <span className="flex items-center gap-1 pr-3">
                      {isReorderable && (
                        <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                      )}
                      <span className="truncate">{col.label}</span>
                    </span>

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
    </div>
  );
}
