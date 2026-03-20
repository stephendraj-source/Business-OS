import { useState, useMemo } from 'react';
import { FileBarChart, Download, Filter, ChevronDown, CheckCircle2, AlertCircle, TrendingUp, Bot, Tag, Layers, BarChart3, Search } from 'lucide-react';
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

const TRACKABLE_FIELDS: (keyof Process)[] = [
  'processName', 'processDescription', 'aiAgent', 'purpose',
  'inputs', 'outputs', 'humanInTheLoop', 'kpi', 'estimatedValueImpact',
  'industryBenchmark', 'target', 'achievement',
];

function completeness(p: Process): number {
  const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim() !== '').length;
  return Math.round((filled / TRACKABLE_FIELDS.length) * 100);
}

function processId(n: number) {
  return `PRO-${n.toString().padStart(3, '0')}`;
}

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

export function ReportsView() {
  const { data: processes = [] } = useListProcesses();
  const [activeReport, setActiveReport] = useState<ReportId>('coverage');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  function exportReport() {
    let rows: Record<string, unknown>[] = [];

    if (activeReport === 'coverage') {
      rows = filtered.map(p => ({
        'Process ID': processId(p.number),
        'Category': p.category,
        'Process Name': p.processName,
        'Description': p.processDescription,
        'Completeness (%)': completeness(p),
        'Fields Filled': TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length,
        'Total Fields': TRACKABLE_FIELDS.length,
      }));
    } else if (activeReport === 'category') {
      const grouped: Record<string, Process[]> = {};
      (processes as Process[]).forEach(p => {
        if (!grouped[p.category]) grouped[p.category] = [];
        grouped[p.category].push(p);
      });
      rows = Object.entries(grouped).map(([cat, ps]) => ({
        'Category': cat,
        'Total Processes': ps.length,
        'Included in Portfolio': ps.filter(p => p.included).length,
        'Avg Completeness (%)': Math.round(ps.reduce((s, p) => s + completeness(p), 0) / ps.length),
      }));
    } else if (activeReport === 'ai-agents') {
      const agentMap: Record<string, Process[]> = {};
      (processes as Process[]).forEach(p => {
        const a = p.aiAgent?.trim() || 'Unassigned';
        if (!agentMap[a]) agentMap[a] = [];
        agentMap[a].push(p);
      });
      rows = Object.entries(agentMap).map(([agent, ps]) => ({
        'AI Agent': agent,
        'Process Count': ps.length,
        'Categories Covered': [...new Set(ps.map(p => p.category))].join(', '),
        'Processes': ps.map(p => p.processName).join('; '),
      }));
    } else if (activeReport === 'kpi') {
      rows = filtered.map(p => ({
        'Process ID': processId(p.number),
        'Category': p.category,
        'Process Name': p.processName,
        'KPI': p.kpi,
        'Target': p.target,
        'Achievement': p.achievement,
      }));
    } else if (activeReport === 'value') {
      rows = filtered.map(p => ({
        'Process ID': processId(p.number),
        'Category': p.category,
        'Process Name': p.processName,
        'Estimated Value Impact': p.estimatedValueImpact,
        'Industry Benchmark': p.industryBenchmark,
      }));
    } else if (activeReport === 'portfolio') {
      rows = filtered.map(p => ({
        'Process ID': processId(p.number),
        'Category': p.category,
        'Process Name': p.processName,
        'In Portfolio': p.included ? 'Yes' : 'No',
        'Purpose': p.purpose,
      }));
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
        <button
          onClick={exportReport}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 font-medium transition-all"
        >
          <Download className="w-4 h-4" />
          Export Report
        </button>
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
                onClick={() => setActiveReport(r.id)}
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

        {/* Right: Report content */}
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
            <span className="ml-auto text-xs text-muted-foreground">
              {activeReport === 'category'
                ? `${categories.length} categories`
                : `${filtered.length} processes`}
            </span>
          </div>

          {/* Report content */}
          <div className="flex-1 overflow-auto p-5">
            {activeReport === 'coverage' && <CoverageReport processes={filtered} />}
            {activeReport === 'category' && <CategoryReport processes={processes as Process[]} categoryFilter={categoryFilter} />}
            {activeReport === 'ai-agents' && <AiAgentReport processes={processes as Process[]} categoryFilter={categoryFilter} />}
            {activeReport === 'kpi' && <KpiReport processes={filtered} />}
            {activeReport === 'value' && <ValueReport processes={filtered} />}
            {activeReport === 'portfolio' && <PortfolioReport processes={filtered} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoverageReport({ processes }: { processes: Process[] }) {
  const avgCompleteness = processes.length
    ? Math.round(processes.reduce((s, p) => s + completeness(p), 0) / processes.length)
    : 0;
  const complete = processes.filter(p => completeness(p) >= 80).length;
  const partial = processes.filter(p => completeness(p) >= 50 && completeness(p) < 80).length;
  const sparse = processes.filter(p => completeness(p) < 50).length;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Avg Completeness', value: `${avgCompleteness}%`, color: 'text-primary' },
          { label: 'Complete (≥80%)', value: complete, color: 'text-green-400' },
          { label: 'Partial (50–79%)', value: partial, color: 'text-amber-400' },
          { label: 'Sparse (<50%)', value: sparse, color: 'text-red-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      {/* Table */}
      <TableWrapper>
        <thead>
          <tr>
            <Th>Process ID</Th>
            <Th>Category</Th>
            <Th>Process Name</Th>
            <Th>Fields Filled</Th>
            <Th className="w-48">Completeness</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {processes.map(p => {
            const pct = completeness(p);
            const filled = TRACKABLE_FIELDS.filter(f => p[f] && String(p[f]).trim()).length;
            return (
              <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                <Td><span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span></Td>
                <Td className="text-muted-foreground text-xs">{p.category}</Td>
                <Td className="font-medium">{p.processName}</Td>
                <Td className="text-muted-foreground text-xs">{filled}/{TRACKABLE_FIELDS.length}</Td>
                <Td className="w-48"><CompletenessBar pct={pct} /></Td>
                <Td><StatusBadge pct={pct} /></Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function CategoryReport({ processes, categoryFilter }: { processes: Process[]; categoryFilter: string }) {
  const grouped = useMemo(() => {
    const map: Record<string, Process[]> = {};
    processes.forEach(p => {
      if (!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    });
    return Object.entries(map)
      .filter(([cat]) => categoryFilter === 'all' || cat === categoryFilter)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [processes, categoryFilter]);

  return (
    <TableWrapper>
      <thead>
        <tr>
          <Th>Category</Th>
          <Th>Total Processes</Th>
          <Th>In Portfolio</Th>
          <Th>Excluded</Th>
          <Th className="w-48">Avg Completeness</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {grouped.map(([cat, ps]) => {
          const avg = Math.round(ps.reduce((s, p) => s + completeness(p), 0) / ps.length);
          const included = ps.filter(p => p.included).length;
          return (
            <tr key={cat} className="hover:bg-secondary/20 transition-colors">
              <Td className="font-medium">{cat}</Td>
              <Td>{ps.length}</Td>
              <Td className="text-green-400 font-medium">{included}</Td>
              <Td className="text-muted-foreground">{ps.length - included}</Td>
              <Td><CompletenessBar pct={avg} /></Td>
              <Td><StatusBadge pct={avg} /></Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrapper>
  );
}

function AiAgentReport({ processes, categoryFilter }: { processes: Process[]; categoryFilter: string }) {
  const agentMap = useMemo(() => {
    const filtered = categoryFilter === 'all' ? processes : processes.filter(p => p.category === categoryFilter);
    const map: Record<string, Process[]> = {};
    filtered.forEach(p => {
      const a = p.aiAgent?.trim() || 'Unassigned';
      if (!map[a]) map[a] = [];
      map[a].push(p);
    });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [processes, categoryFilter]);

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
        <thead>
          <tr>
            <Th>AI Agent</Th>
            <Th>Process Count</Th>
            <Th>Categories Covered</Th>
            <Th>Processes</Th>
          </tr>
        </thead>
        <tbody>
          {agentMap.map(([agent, ps]) => (
            <tr key={agent} className="hover:bg-secondary/20 transition-colors">
              <Td>
                <span className={cn("font-medium", agent === 'Unassigned' ? "text-muted-foreground italic" : "text-foreground")}>
                  {agent}
                </span>
              </Td>
              <Td>
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {ps.length}
                </span>
              </Td>
              <Td className="text-xs text-muted-foreground">{[...new Set(ps.map(p => p.category))].join(', ')}</Td>
              <Td className="text-xs text-muted-foreground max-w-xs truncate">{ps.map(p => p.processName).join(', ')}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function KpiReport({ processes }: { processes: Process[] }) {
  const withKpi = processes.filter(p => p.kpi?.trim()).length;
  const withTarget = processes.filter(p => p.target?.trim()).length;
  const withAchievement = processes.filter(p => p.achievement?.trim()).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Have KPI Defined', value: withKpi, total: processes.length, color: 'text-primary' },
          { label: 'Have Target Set', value: withTarget, total: processes.length, color: 'text-blue-400' },
          { label: 'Have Achievement', value: withAchievement, total: processes.length, color: 'text-green-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>{card.value}<span className="text-sm text-muted-foreground font-normal">/{card.total}</span></div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
            <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className={cn("h-full rounded-full", card.color.replace('text-', 'bg-'))} style={{ width: `${Math.round((card.value / card.total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead>
          <tr>
            <Th>Process ID</Th>
            <Th>Process Name</Th>
            <Th>Category</Th>
            <Th>KPI</Th>
            <Th>Target</Th>
            <Th>Achievement</Th>
          </tr>
        </thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
              <Td><span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span></Td>
              <Td className="font-medium">{p.processName}</Td>
              <Td className="text-xs text-muted-foreground">{p.category}</Td>
              <Td className="text-xs">{p.kpi || <span className="text-muted-foreground/50 italic">—</span>}</Td>
              <Td className="text-xs">{p.target || <span className="text-muted-foreground/50 italic">—</span>}</Td>
              <Td className="text-xs">{p.achievement || <span className="text-muted-foreground/50 italic">—</span>}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function ValueReport({ processes }: { processes: Process[] }) {
  const withValue = processes.filter(p => p.estimatedValueImpact?.trim()).length;
  const withBenchmark = processes.filter(p => p.industryBenchmark?.trim()).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'With Value Impact', value: withValue, total: processes.length, color: 'text-primary' },
          { label: 'With Benchmark', value: withBenchmark, total: processes.length, color: 'text-violet-400' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>{card.value}<span className="text-sm text-muted-foreground font-normal">/{card.total}</span></div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead>
          <tr>
            <Th>Process ID</Th>
            <Th>Process Name</Th>
            <Th>Category</Th>
            <Th>Estimated Value Impact</Th>
            <Th>Industry Benchmark</Th>
          </tr>
        </thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
              <Td><span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span></Td>
              <Td className="font-medium">{p.processName}</Td>
              <Td className="text-xs text-muted-foreground">{p.category}</Td>
              <Td className="text-xs max-w-xs">{p.estimatedValueImpact || <span className="text-muted-foreground/50 italic">—</span>}</Td>
              <Td className="text-xs max-w-xs">{p.industryBenchmark || <span className="text-muted-foreground/50 italic">—</span>}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}

function PortfolioReport({ processes }: { processes: Process[] }) {
  const included = processes.filter(p => p.included).length;
  const excluded = processes.filter(p => !p.included).length;
  const pct = processes.length ? Math.round((included / processes.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Processes', value: processes.length, color: 'text-primary' },
          { label: 'Included in Portfolio', value: `${included} (${pct}%)`, color: 'text-green-400' },
          { label: 'Excluded', value: `${excluded} (${100 - pct}%)`, color: 'text-muted-foreground' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-xl border border-border bg-card">
            <div className={cn("text-2xl font-bold font-display", card.color)}>{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <TableWrapper>
        <thead>
          <tr>
            <Th>Process ID</Th>
            <Th>Process Name</Th>
            <Th>Category</Th>
            <Th>Portfolio Status</Th>
            <Th>Purpose</Th>
          </tr>
        </thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
              <Td><span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{processId(p.number)}</span></Td>
              <Td className="font-medium">{p.processName}</Td>
              <Td className="text-xs text-muted-foreground">{p.category}</Td>
              <Td>
                {p.included
                  ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold"><CheckCircle2 className="w-3 h-3" /> Included</span>
                  : <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-semibold"><AlertCircle className="w-3 h-3" /> Excluded</span>
                }
              </Td>
              <Td className="text-xs max-w-xs truncate text-muted-foreground">{p.purpose || '—'}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    </div>
  );
}
