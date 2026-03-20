import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { EditableCell } from './editable-cell';
import { useProcessesData, useCategoriesData } from '@/hooks/use-app-data';
import { Search, Loader2 } from 'lucide-react';
import { cn, getCategoryColorClass } from '@/lib/utils';

interface ColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  fixed?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: '#',                  label: '#',                    defaultWidth: 52,  minWidth: 40,  fixed: true },
  { key: 'category',           label: 'Category',             defaultWidth: 190, minWidth: 120 },
  { key: 'processName',        label: 'Process Name',         defaultWidth: 240, minWidth: 140 },
  { key: 'aiAgent',            label: 'AI Agent',             defaultWidth: 180, minWidth: 120 },
  { key: 'purpose',            label: 'Purpose',              defaultWidth: 220, minWidth: 140 },
  { key: 'inputs',             label: 'Inputs',               defaultWidth: 210, minWidth: 140 },
  { key: 'outputs',            label: 'Outputs',              defaultWidth: 210, minWidth: 140 },
  { key: 'humanInTheLoop',     label: 'Human-in-the-Loop',   defaultWidth: 180, minWidth: 120 },
  { key: 'kpi',                label: 'KPI',                  defaultWidth: 180, minWidth: 120 },
  { key: 'estimatedValueImpact', label: 'Value Impact',      defaultWidth: 200, minWidth: 130 },
  { key: 'industryBenchmark',  label: 'Industry Benchmark',   defaultWidth: 240, minWidth: 160 },
];

function useColumnResize(columns: ColumnDef[]) {
  const [widths, setWidths] = useState<number[]>(() => columns.map(c => c.defaultWidth));
  const resizing = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);

  const onMouseDown = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { colIndex, startX: e.clientX, startWidth: widths[colIndex] };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const { colIndex, startX, startWidth } = resizing.current;
      const delta = ev.clientX - startX;
      const newWidth = Math.max(columns[colIndex].minWidth, startWidth + delta);
      setWidths(prev => {
        const next = [...prev];
        next[colIndex] = newWidth;
        return next;
      });
    };

    const onMouseUp = () => {
      resizing.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [widths, columns]);

  return { widths, onMouseDown };
}

export function ProcessTable() {
  const { data: processes, isLoading, error } = useProcessesData();
  const { data: categories } = useCategoriesData();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const { widths, onMouseDown } = useColumnResize(COLUMNS);

  const filteredProcesses = useMemo(() => {
    if (!processes) return [];
    return processes.filter(p => {
      const matchesSearch =
        p.processName.toLowerCase().includes(search.toLowerCase()) ||
        p.purpose.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => a.number - b.number);
  }, [processes, search, selectedCategory]);

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

  const totalWidth = widths.reduce((a, b) => a + b, 0);

  return (
    <div className="h-full flex flex-col bg-background relative overflow-hidden">

      {/* Toolbar */}
      <div className="flex-none p-4 md:p-6 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card z-20">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Process Matrix</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Inline editing enabled — click any cell to update. Drag column borders to resize.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
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
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-card">
        <table
          className="spreadsheet-table border-collapse"
          style={{ width: totalWidth, tableLayout: 'fixed' }}
        >
          <colgroup>
            {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>

          <thead>
            <tr>
              {COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  className="relative select-none overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ width: widths[i], minWidth: col.minWidth }}
                >
                  <span className="block truncate pr-3">{col.label}</span>

                  {/* Resize handle */}
                  <div
                    onMouseDown={e => onMouseDown(i, e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-10 group flex items-center justify-center"
                    title="Drag to resize"
                  >
                    <div className="w-px h-4/5 bg-border group-hover:bg-primary/60 transition-colors" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredProcesses.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="p-8 text-center text-muted-foreground bg-background">
                  No processes found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredProcesses.map(process => (
                <tr key={process.id}>
                  {/* # */}
                  <td className="align-middle p-3 text-center text-muted-foreground font-mono text-xs overflow-hidden">
                    {process.number}
                  </td>

                  {/* Category badge */}
                  <td className="align-middle p-3 overflow-hidden">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-semibold border inline-block whitespace-nowrap max-w-full overflow-hidden text-ellipsis",
                      getCategoryColorClass(process.category)
                    )}>
                      {process.category}
                    </span>
                  </td>

                  {/* Editable columns */}
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="processName" initialValue={process.processName} />
                  </td>
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="aiAgent" initialValue={process.aiAgent} />
                  </td>
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="purpose" initialValue={process.purpose} multiline />
                  </td>
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="inputs" initialValue={process.inputs} multiline />
                  </td>
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="outputs" initialValue={process.outputs} multiline />
                  </td>
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="humanInTheLoop" initialValue={process.humanInTheLoop} multiline />
                  </td>
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="kpi" initialValue={process.kpi} multiline />
                  </td>
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="estimatedValueImpact" initialValue={process.estimatedValueImpact} multiline />
                  </td>
                  <td className="overflow-hidden p-0">
                    <EditableCell processId={process.id} field="industryBenchmark" initialValue={process.industryBenchmark} multiline />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex-none p-3 border-t border-border bg-sidebar flex justify-between items-center text-xs text-muted-foreground">
        <span>Showing {filteredProcesses.length} of {processes?.length || 0} processes</span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          System Online
        </span>
      </div>
    </div>
  );
}
