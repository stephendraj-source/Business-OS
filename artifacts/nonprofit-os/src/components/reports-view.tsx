import { useState, useMemo, useRef } from 'react';
import {
  FileBarChart, Download, Filter, ChevronDown, CheckCircle2,
  TrendingUp, Bot, Tag, Layers, BarChart3, Search,
  SlidersHorizontal, GripVertical, X, Plus, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useListProcesses } from '@workspace/api-client-react';
import * as XLSX from 'xlsx';

type Process = {
  id: number;
  number: number;
  category: string;
  processName: string;
  processDescription: string;
  aiAgent: string;
  purpose: string;
  inputs: string;
  outputs: string;
  humanInTheLoop: string;
  kpi: string;
  estimatedValueImpact: string;
  industryBenchmark: string;
  included: boolean;
  target: string;
  achievement: string;
};

const REPORT_TYPES = [
  { id: 'coverage',   label: 'Process Coverage',   icon: CheckCircle2, description: 'Completeness of process data fields' },
  { id: 'category',   label: 'Category Summary',    icon: Tag,          description: 'Process count and completeness by category' },
  { id: 'ai-agents',  label: 'AI Agent Map',        icon: Bot,          description: 'AI agents and their assigned processes' },
  { id: 'kpi',        label: 'KPI Tracker',         icon: TrendingUp,   description: 'Targets and achievements per process' },
  { id: 'value',      label: 'Value Impact',        icon: BarChart3,    description: 'Estimated value impact per process' },
  { id: 'portfolio',  label: 'Portfolio Inclusion', icon: Layers,       description: 'Included vs excluded processes' },
] as const;

type ReportId = (typeof REPORT_TYPES)[number]['id'];

type FieldDef = { key: string; label: string };

const FIELD_DEFS: Record<ReportId, FieldDef[]> = {
  coverage: [
    { key: 'processId',   label: 'Process ID' },
    { key: 'category',    label: 'Category' },
    { key: 'processName', label: 'Process Name' },
    { key: 'description', label: 'Description' },
    { key: 'fieldsFilled',label: 'Fields Filled' },
    { key: 'completeness',label: 'Completeness' },
    { key: 'status',      label: 'Status' },
  ],
  category: [
    { key: 'category',        label: 'Category' },
    { key: 'total',           label: 'Total Processes' },
    { key: 'inPortfolio',     label: 'In Portfolio' },
    { key: 'excluded',        label: 'Excluded' },
    { key: 'avgCompleteness', label: 'Avg Completeness' },
    { key: 'status',          label: 'Status' },
  ],
  'ai-agents': [
    { key: 'agent',      label: 'AI Agent' },
    { key: 'count',      label: 'Process Count' },
    { key: 'categories', label: 'Categories Covered' },
    { key: 'processes',  label: 'Processes' },
  ],
  kpi: [
    { key: 'processId',   label: 'Process ID' },
    { key: 'processName', label: 'Process Name' },
    { key: 'category',    label: 'Category' },
    { key: 'kpi',         label: 'KPI' },
    { key: 'target',      label: 'Target' },
    { key: 'achievement', label: 'Achievement' },
  ],
  value: [
    { key: 'processId',   label: 'Process ID' },
    { key: 'processName', label: 'Process Name' },
    { key: 'category',    label: 'Category' },
    { key: 'valueImpact', label: 'Estimated Value Impact' },
    { key: 'benchmark',   label: 'Industry Benchmark' },
  ],
  portfolio: [
    { key: 'processId',      label: 'Process ID' },
    { key: 'category',       label: 'Category' },
    { key: 'processName',    label: 'Process Name' },
    { key: 'inPortfolio',    label: 'In Portfolio' },
    { key: 'purpose',        label: 'Purpose' },
    { key: 'inputs',         label: 'Inputs' },
    { key: 'outputs',        label: 'Outputs' },
    { key: 'humanInTheLoop', label: 'Human-in-the-Loop' },
  ],
};

const DEFAULT_ACTIVE: Record<ReportId, string[]> = {
  coverage:   ['processId', 'category', 'processName', 'fieldsFilled', 'completeness', 'status'],
  category:   ['category', 'total', 'inPortfolio', 'excluded', 'avgCompleteness', 'status'],
  'ai-agents':['agent', 'count', 'categories', 'processes'],
  kpi:        ['processId', 'processName', 'category', 'kpi', 'target', 'achievement'],
  value:      ['processId', 'processName', 'category', 'valueImpact', 'benchmark'],
  portfolio:  ['processId', 'category', 'processName', 'inPortfolio', 'purpose'],
};

const LS_KEY = 'nonprofit-os-report-fields-v1';

const TRACKABLE_FIELDS: (keyof Process)[] = [
  'processName', 'processDescription', 'aiAgent', 'purpose',
  'inputs', 'outputs', 'humanInTheLoop', 'kpi', 'estimatedValueImpact',
  'industryBenchmark', 'target', 'achievement',
];

function completeness(p: Process): number {
  const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim() !== '').length;
  return Math.round((filled / TRACKABLE_FIELDS.length) * 100);
}

function processId(n: number) { return `PRO-${n.toString().padStart(3, '0')}`; }

function CompletenessBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 80) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold">Complete</span>;
  if (pct >= 50) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 font-semibold">Partial</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/15 text-red-400 font-semibold">Sparse</span>;
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("text-left px-4 py-3 text-xs font-semibold text-muted-foreground bg-secondary/50 border-b border-border whitespace-nowrap", className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("px-4 py-3 border-b border-border/50 text-sm", className)}>{children}</td>
  );
}

function loadFieldConfig(): Record<ReportId, string[]> {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Record<ReportId, string[]>>;
      const result = { ...DEFAULT_ACTIVE };
      for (const id of REPORT_TYPES.map(r => r.id)) {
        if (parsed[id] && parsed[id]!.length > 0) result[id] = parsed[id]!;
      }
      return result;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_ACTIVE };
}

export function ReportsView() {
  const { data: processes = [] } = useListProcesses();
  const [activeReport, setActiveReport] = useState<ReportId>('coverage');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFieldPanel, setShowFieldPanel] = useState(false);
  const [fieldConfig, setFieldConfig] = useState<Record<ReportId, string[]>>(loadFieldConfig);

  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const categories = useMemo(() => {
    const cats = [...new Set((processes as Process[]).map(p => p.category))].sort();
    return cats;
  }, [processes]);

  const filtered = useMemo(() => {
    let ps = processes as Process[];
    if (categoryFilter !== 'all') ps = ps.filter(p => p.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      ps = ps.filter(p =>
        p.processName.toLowerCase().includes(q) ||
        p.processDescription.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }
    return ps.sort((a, b) => a.number - b.number);
  }, [processes, categoryFilter, searchQuery]);

  const reportDef = REPORT_TYPES.find(r => r.id === activeReport)!;
  const allFieldDefs = FIELD_DEFS[activeReport];
  const activeFields = fieldConfig[activeReport] ?? DEFAULT_ACTIVE[activeReport];
  const inactiveFields = allFieldDefs.filter(f => !activeFields.includes(f.key));

  function updateFields(newFields: string[]) {
    const newConfig = { ...fieldConfig, [activeReport]: newFields };
    setFieldConfig(newConfig);
    localStorage.setItem(LS_KEY, JSON.stringify(newConfig));
  }

  function addField(key: string) {
    if (!activeFields.includes(key)) updateFields([...activeFields, key]);
  }

  function removeField(key: string) {
    const next = activeFields.filter(k => k !== key);
    if (next.length === 0) return;
    updateFields(next);
  }

  function resetFields() {
    updateFields([...DEFAULT_ACTIVE[activeReport]]);
  }

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOver(index);
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) { setDragOver(null); return; }
    const next = [...activeFields];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    updateFields(next);
    dragIndexRef.current = null;
    setDragOver(null);
  }

  function handleDragEnd() {
    dragIndexRef.current = null;
    setDragOver(null);
  }

  function exportReport() {
    let rows: Record<string, unknown>[] = [];
    if (activeReport === 'coverage') {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        const pct = completeness(p);
        const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length;
        for (const key of activeFields) {
          if (key === 'processId') row['Process ID'] = processId(p.number);
          else if (key === 'category') row['Category'] = p.category;
          else if (key === 'processName') row['Process Name'] = p.processName;
          else if (key === 'description') row['Description'] = p.processDescription;
          else if (key === 'fieldsFilled') row['Fields Filled'] = `${filled}/${TRACKABLE_FIELDS.length}`;
          else if (key === 'completeness') row['Completeness (%)'] = pct;
          else if (key === 'status') row['Status'] = pct >= 80 ? 'Complete' : pct >= 50 ? 'Partial' : 'Sparse';
        }
        return row;
      });
    } else if (activeReport === 'category') {
      const grouped: Record<string, Process[]> = {};
      (processes as Process[]).forEach(p => { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p); });
      rows = Object.entries(grouped).map(([cat, ps]) => {
        const row: Record<string, unknown> = {};
        const avg = Math.round(ps.reduce((s, p) => s + completeness(p), 0) / ps.length);
        const included = ps.filter(p => p.included).length;
        for (const key of activeFields) {
          if (key === 'category') row['Category'] = cat;
          else if (key === 'total') row['Total Processes'] = ps.length;
          else if (key === 'inPortfolio') row['In Portfolio'] = included;
          else if (key === 'excluded') row['Excluded'] = ps.length - included;
          else if (key === 'avgCompleteness') row['Avg Completeness (%)'] = avg;
          else if (key === 'status') row['Status'] = avg >= 80 ? 'Complete' : avg >= 50 ? 'Partial' : 'Sparse';
        }
        return row;
      });
    } else if (activeReport === 'ai-agents') {
      const agentMap: Record<string, Process[]> = {};
      (processes as Process[]).forEach(p => { const a = p.aiAgent?.trim() || 'Unassigned'; if (!agentMap[a]) agentMap[a] = []; agentMap[a].push(p); });
      rows = Object.entries(agentMap).map(([agent, ps]) => {
        const row: Record<string, unknown> = {};
        for (const key of activeFields) {
          if (key === 'agent') row['AI Agent'] = agent;
          else if (key === 'count') row['Process Count'] = ps.length;
          else if (key === 'categories') row['Categories Covered'] = [...new Set(ps.map(p => p.category))].join(', ');
          else if (key === 'processes') row['Processes'] = ps.map(p => p.processName).join('; ');
        }
        return row;
      });
    } else if (activeReport === 'kpi') {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        for (const key of activeFields) {
          if (key === 'processId') row['Process ID'] = processId(p.number);
          else if (key === 'processName') row['Process Name'] = p.processName;
          else if (key === 'category') row['Category'] = p.category;
          else if (key === 'kpi') row['KPI'] = p.kpi;
          else if (key === 'target') row['Target'] = p.target;
          else if (key === 'achievement') row['Achievement'] = p.achievement;
        }
        return row;
      });
    } else if (activeReport === 'value') {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        for (const key of activeFields) {
          if (key === 'processId') row['Process ID'] = processId(p.number);
          else if (key === 'processName') row['Process Name'] = p.processName;
          else if (key === 'category') row['Category'] = p.category;
          else if (key === 'valueImpact') row['Estimated Value Impact'] = p.estimatedValueImpact;
          else if (key === 'benchmark') row['Industry Benchmark'] = p.industryBenchmark;
        }
        return row;
      });
    } else if (activeReport === 'portfolio') {
      rows = filtered.map(p => {
        const row: Record<string, unknown> = {};
        for (const key of activeFields) {
          if (key === 'processId') row['Process ID'] = processId(p.number);
          else if (key === 'category') row['Category'] = p.category;
          else if (key === 'processName') row['Process Name'] = p.processName;
          else if (key === 'inPortfolio') row['In Portfolio'] = p.included ? 'Yes' : 'No';
          else if (key === 'purpose') row['Purpose'] = p.purpose;
          else if (key === 'inputs') row['Inputs'] = p.inputs;
          else if (key === 'outputs') row['Outputs'] = p.outputs;
          else if (key === 'humanInTheLoop') row['Human-in-the-Loop'] = p.humanInTheLoop;
        }
        return row;
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportDef.label);
    XLSX.writeFile(wb, `${reportDef.label.replace(/\s+/g, '_')}_Report.xlsx`);
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none p-5 border-b border-border bg-card flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-primary" />
            Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Generate and export configurable reports from your process data.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportReport}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 font-medium transition-all"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: Report selector */}
        <aside className="w-56 flex-shrink-0 border-r border-border bg-sidebar flex flex-col py-4 px-3 gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">Report Types</div>
          {REPORT_TYPES.map(r => {
            const Icon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => { setActiveReport(r.id); setShowFieldPanel(false); }}
                className={cn(
                  "w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all",
                  activeReport === r.id
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", activeReport === r.id ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <div className="text-sm font-medium leading-tight">{r.label}</div>
                  <div className="text-[10px] mt-0.5 text-muted-foreground leading-tight">{r.description}</div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Right: Report content + optional fields panel */}
        <div className="flex-1 flex min-w-0 min-h-0 relative">
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Filters bar */}
            <div className="flex-none flex items-center gap-3 px-5 py-3 border-b border-border bg-card/40 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="relative">
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="all">All Categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
              {activeReport !== 'category' && activeReport !== 'ai-agents' && (
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search processes..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 w-52"
                  />
                </div>
              )}
              <span className="text-xs text-muted-foreground">
                {activeReport === 'category'
                  ? `${categories.length} categories`
                  : `${filtered.length} processes`}
              </span>
              {/* Fields button */}
              <button
                onClick={() => setShowFieldPanel(v => !v)}
                className={cn(
                  "ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all",
                  showFieldPanel
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Fields
                <span className={cn(
                  "ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold",
                  showFieldPanel ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                )}>
                  {activeFields.length}
                </span>
              </button>
            </div>

            {/* Report content */}
            <div className="flex-1 overflow-auto p-5">
              {activeReport === 'coverage'  && <CoverageReport  processes={filtered}                   activeFields={activeFields} />}
              {activeReport === 'category'  && <CategoryReport  processes={processes as Process[]}     categoryFilter={categoryFilter} activeFields={activeFields} />}
              {activeReport === 'ai-agents' && <AiAgentReport   processes={processes as Process[]}     categoryFilter={categoryFilter} activeFields={activeFields} />}
              {activeReport === 'kpi'       && <KpiReport       processes={filtered}                   activeFields={activeFields} />}
              {activeReport === 'value'     && <ValueReport     processes={filtered}                   activeFields={activeFields} />}
              {activeReport === 'portfolio' && <PortfolioReport processes={filtered}                   activeFields={activeFields} />}
            </div>
          </div>

          {/* Field configuration panel */}
          {showFieldPanel && (
            <div className="w-64 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                  Configure Fields
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={resetFields}
                    title="Reset to default"
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowFieldPanel(false)}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-5">
                {/* Active fields — draggable */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                    Active Columns ({activeFields.length})
                  </div>
                  <div className="space-y-1">
                    {activeFields.map((key, index) => {
                      const def = allFieldDefs.find(f => f.key === key);
                      if (!def) return null;
                      return (
                        <div
                          key={key}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={e => handleDragOver(e, index)}
                          onDrop={e => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "flex items-center gap-2 px-2 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing group",
                            dragOver === index
                              ? "border-primary/50 bg-primary/10"
                              : "border-border bg-secondary/30 hover:bg-secondary/60"
                          )}
                        >
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 group-hover:text-muted-foreground transition-colors" />
                          <span className="flex-1 text-xs text-foreground font-medium truncate">{def.label}</span>
                          <button
                            onClick={() => removeField(key)}
                            disabled={activeFields.length <= 1}
                            className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Available fields — click to add */}
                {inactiveFields.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                      Available to Add
                    </div>
                    <div className="space-y-1">
                      {inactiveFields.map(def => (
                        <button
                          key={def.key}
                          onClick={() => addField(def.key)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all group"
                        >
                          <Plus className="w-3.5 h-3.5 flex-shrink-0 opacity-50 group-hover:opacity-100" />
                          <span className="flex-1 text-xs text-left truncate">{def.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-3 py-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  Drag to reorder. Click <X className="inline w-2.5 h-2.5" /> to hide a column or <Plus className="inline w-2.5 h-2.5" /> to add it back. Changes are saved automatically.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderCoverageCell(p: Process, field: string): React.ReactNode {
  const pct = completeness(p);
  const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length;
  switch (field) {
    case 'processId':   return <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'category':    return <span className="text-xs text-muted-foreground">{p.category}</span>;
    case 'processName': return <span className="font-medium">{p.processName}</span>;
    case 'description': return <span className="text-xs text-muted-foreground max-w-xs truncate block">{p.processDescription || <em className="opacity-40">—</em>}</span>;
    case 'fieldsFilled':return <span className="text-xs text-muted-foreground">{filled}/{TRACKABLE_FIELDS.length}</span>;
    case 'completeness':return <CompletenessBar pct={pct} />;
    case 'status':      return <StatusBadge pct={pct} />;
    default:            return null;
  }
}

function CoverageReport({ processes, activeFields }: { processes: Process[]; activeFields: string[] }) {
  const avgCompleteness = processes.length ? Math.round(processes.reduce((s, p) => s + completeness(p), 0) / processes.length) : 0;
  const complete = processes.filter(p => completeness(p) >= 80).length;
  const partial  = processes.filter(p => completeness(p) >= 50 && completeness(p) < 80).length;
  const sparse   = processes.filter(p => completeness(p) < 50).length;

  const fieldDefs = FIELD_DEFS.coverage.filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Avg Completeness', value: `${avgCompleteness}%`, color: 'text-primary' },
          { label: 'Complete (≥80%)',  value: complete,              color: 'text-green-400' },
          { label: 'Partial (50–79%)', value: partial,               color: 'text-amber-400' },
          { label: 'Sparse (<50%)',    value: sparse,                color: 'text-red-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <Th key={f.key} className={f.key === 'completeness' ? 'w-48' : undefined}>{f.label}</Th>)}</tr></thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
              {fieldDefs.map(f => <Td key={f.key} className={f.key === 'completeness' ? 'w-48' : undefined}>{renderCoverageCell(p, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function renderCategoryCell(cat: string, ps: Process[], field: string): React.ReactNode {
  const avg = Math.round(ps.reduce((s, p) => s + completeness(p), 0) / ps.length);
  const included = ps.filter(p => p.included).length;
  switch (field) {
    case 'category':        return <span className="font-medium">{cat}</span>;
    case 'total':           return <span>{ps.length}</span>;
    case 'inPortfolio':     return <span className="text-green-400 font-medium">{included}</span>;
    case 'excluded':        return <span className="text-muted-foreground">{ps.length - included}</span>;
    case 'avgCompleteness': return <CompletenessBar pct={avg} />;
    case 'status':          return <StatusBadge pct={avg} />;
    default:                return null;
  }
}

function CategoryReport({ processes, categoryFilter, activeFields }: { processes: Process[]; categoryFilter: string; activeFields: string[] }) {
  const grouped = useMemo(() => {
    const map: Record<string, Process[]> = {};
    processes.forEach(p => { if (!map[p.category]) map[p.category] = []; map[p.category].push(p); });
    return Object.entries(map)
      .filter(([cat]) => categoryFilter === 'all' || cat === categoryFilter)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [processes, categoryFilter]);

  const fieldDefs = FIELD_DEFS.category.filter(f => activeFields.includes(f.key));

  return (
    <TableWrapper>
      <thead><tr>{fieldDefs.map(f => <Th key={f.key} className={f.key === 'avgCompleteness' ? 'w-48' : undefined}>{f.label}</Th>)}</tr></thead>
      <tbody>
        {grouped.map(([cat, ps]) => (
          <tr key={cat} className="hover:bg-secondary/20 transition-colors">
            {fieldDefs.map(f => <Td key={f.key} className={f.key === 'avgCompleteness' ? 'w-48' : undefined}>{renderCategoryCell(cat, ps, f.key)}</Td>)}
          </tr>
        ))}
      </tbody>
    </TableWrapper>
  );
}

function renderAgentCell(agent: string, ps: Process[], field: string): React.ReactNode {
  switch (field) {
    case 'agent':      return <span className={cn("font-medium", agent === 'Unassigned' ? "text-muted-foreground italic" : "text-foreground")}>{agent}</span>;
    case 'count':      return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">{ps.length}</span>;
    case 'categories': return <span className="text-xs text-muted-foreground">{[...new Set(ps.map(p => p.category))].join(', ')}</span>;
    case 'processes':  return <span className="text-xs text-muted-foreground max-w-xs truncate block">{ps.map(p => p.processName).join(', ')}</span>;
    default:           return null;
  }
}

function AiAgentReport({ processes, categoryFilter, activeFields }: { processes: Process[]; categoryFilter: string; activeFields: string[] }) {
  const agentMap = useMemo(() => {
    const filt = categoryFilter === 'all' ? processes : processes.filter(p => p.category === categoryFilter);
    const map: Record<string, Process[]> = {};
    filt.forEach(p => { const a = p.aiAgent?.trim() || 'Unassigned'; if (!map[a]) map[a] = []; map[a].push(p); });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [processes, categoryFilter]);

  const fieldDefs = FIELD_DEFS['ai-agents'].filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-2xl font-bold font-display text-primary">{agentMap.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Unique AI Agents</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-2xl font-bold font-display text-green-400">
            {agentMap.filter(([a]) => a !== 'Unassigned').reduce((s, [, ps]) => s + ps.length, 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Processes with AI Agent</div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="text-2xl font-bold font-display text-amber-400">
            {agentMap.find(([a]) => a === 'Unassigned')?.[1].length ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Unassigned Processes</div>
        </div>
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <Th key={f.key}>{f.label}</Th>)}</tr></thead>
        <tbody>
          {agentMap.map(([agent, ps]) => (
            <tr key={agent} className="hover:bg-secondary/20 transition-colors">
              {fieldDefs.map(f => <Td key={f.key}>{renderAgentCell(agent, ps, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function renderKpiCell(p: Process, field: string): React.ReactNode {
  const dash = <span className="text-muted-foreground/50 italic">—</span>;
  switch (field) {
    case 'processId':   return <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'processName': return <span className="font-medium">{p.processName}</span>;
    case 'category':    return <span className="text-xs text-muted-foreground">{p.category}</span>;
    case 'kpi':         return <span className="text-xs">{p.kpi || dash}</span>;
    case 'target':      return <span className="text-xs">{p.target || dash}</span>;
    case 'achievement': return <span className="text-xs">{p.achievement || dash}</span>;
    default:            return null;
  }
}

function KpiReport({ processes, activeFields }: { processes: Process[]; activeFields: string[] }) {
  const withKpi         = processes.filter(p => p.kpi?.trim()).length;
  const withTarget      = processes.filter(p => p.target?.trim()).length;
  const withAchievement = processes.filter(p => p.achievement?.trim()).length;
  const fieldDefs = FIELD_DEFS.kpi.filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Have KPI Defined', value: withKpi,         total: processes.length, color: 'text-primary' },
          { label: 'Have Target Set',   value: withTarget,      total: processes.length, color: 'text-blue-400' },
          { label: 'Have Achievement',  value: withAchievement, total: processes.length, color: 'text-green-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>
              {card.value}<span className="text-sm text-muted-foreground font-normal">/{card.total}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
            <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className={cn("h-full rounded-full", card.color.replace('text-', 'bg-'))} style={{ width: `${Math.round((card.value / card.total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <Th key={f.key}>{f.label}</Th>)}</tr></thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
              {fieldDefs.map(f => <Td key={f.key}>{renderKpiCell(p, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function renderValueCell(p: Process, field: string): React.ReactNode {
  const dash = <span className="text-muted-foreground/50 italic">—</span>;
  switch (field) {
    case 'processId':   return <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'processName': return <span className="font-medium">{p.processName}</span>;
    case 'category':    return <span className="text-xs text-muted-foreground">{p.category}</span>;
    case 'valueImpact': return <span className="text-xs max-w-xs">{p.estimatedValueImpact || dash}</span>;
    case 'benchmark':   return <span className="text-xs max-w-xs">{p.industryBenchmark || dash}</span>;
    default:            return null;
  }
}

function ValueReport({ processes, activeFields }: { processes: Process[]; activeFields: string[] }) {
  const withValue     = processes.filter(p => p.estimatedValueImpact?.trim()).length;
  const withBenchmark = processes.filter(p => p.industryBenchmark?.trim()).length;
  const fieldDefs = FIELD_DEFS.value.filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'With Value Impact', value: withValue,     total: processes.length, color: 'text-primary' },
          { label: 'With Benchmark',    value: withBenchmark, total: processes.length, color: 'text-violet-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>
              {card.value}<span className="text-sm text-muted-foreground font-normal">/{card.total}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <Th key={f.key}>{f.label}</Th>)}</tr></thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
              {fieldDefs.map(f => <Td key={f.key}>{renderValueCell(p, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function renderPortfolioCell(p: Process, field: string): React.ReactNode {
  const dash = <span className="text-muted-foreground/50 italic">—</span>;
  switch (field) {
    case 'processId':      return <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span>;
    case 'category':       return <span className="text-xs text-muted-foreground">{p.category}</span>;
    case 'processName':    return <span className="font-medium">{p.processName}</span>;
    case 'inPortfolio':    return p.included
      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold">Yes</span>
      : <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-semibold">No</span>;
    case 'purpose':        return <span className="text-xs max-w-xs truncate block">{p.purpose || dash}</span>;
    case 'inputs':         return <span className="text-xs max-w-xs truncate block">{p.inputs || dash}</span>;
    case 'outputs':        return <span className="text-xs max-w-xs truncate block">{p.outputs || dash}</span>;
    case 'humanInTheLoop': return <span className="text-xs max-w-xs truncate block">{p.humanInTheLoop || dash}</span>;
    default:               return null;
  }
}

function PortfolioReport({ processes, activeFields }: { processes: Process[]; activeFields: string[] }) {
  const included = processes.filter(p => p.included).length;
  const fieldDefs = FIELD_DEFS.portfolio.filter(f => activeFields.includes(f.key));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Processes',     value: processes.length,                color: 'text-primary' },
          { label: 'In Portfolio',        value: included,                        color: 'text-green-400' },
          { label: 'Excluded',            value: processes.length - included,     color: 'text-muted-foreground' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead><tr>{fieldDefs.map(f => <Th key={f.key}>{f.label}</Th>)}</tr></thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
              {fieldDefs.map(f => <Td key={f.key}>{renderPortfolioCell(p, f.key)}</Td>)}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}
