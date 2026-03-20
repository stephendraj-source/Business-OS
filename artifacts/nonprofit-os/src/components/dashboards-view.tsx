import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useProcessesData, useAuditLogsData } from '@/hooks/use-app-data';
import {
  LayoutDashboard, Plus, X, BarChart2, Activity, CheckCircle2, Target,
  Cpu, TrendingUp, Loader2, FileText, PieChart as PieChartIcon,
  LineChart as LineChartIcon, AreaChart as AreaChartIcon, Settings2,
  AlignLeft, Layers, GripVertical, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Process } from '@workspace/api-client-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  CartesianGrid, Legend
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartType = 'bar' | 'horizontal-bar' | 'line' | 'area' | 'pie' | 'donut';

type WidgetConfig =
  | { kind: 'preset'; uid: string; id: string; active: boolean }
  | { kind: 'chart'; uid: string; metric: string; chartType: ChartType; title: string; active: boolean };

interface DashboardsViewProps {
  onNavigateToProcessMap?: (category: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'nonprofit-os-dashboard-widgets-v3';
const TRACKABLE_FIELDS = ['processName','processDescription','aiAgent','purpose','inputs','outputs','humanInTheLoop','kpi','estimatedValueImpact','industryBenchmark','target','achievement'] as const;

const CHART_TYPES: { id: ChartType; label: string; icon: React.ElementType; supports: string[] }[] = [
  { id: 'bar',            label: 'Bar',    icon: BarChart2,     supports: ['categorical', 'binary', 'comparative'] },
  { id: 'horizontal-bar', label: 'H-Bar',  icon: AlignLeft,     supports: ['categorical', 'binary', 'comparative'] },
  { id: 'line',           label: 'Line',   icon: LineChartIcon, supports: ['categorical', 'comparative'] },
  { id: 'area',           label: 'Area',   icon: AreaChartIcon, supports: ['categorical', 'comparative'] },
  { id: 'pie',            label: 'Pie',    icon: PieChartIcon,  supports: ['categorical', 'binary'] },
  { id: 'donut',          label: 'Donut',  icon: Layers,        supports: ['categorical', 'binary'] },
];

type MetricDef = { id: string; label: string; dataShape: string; defaultChart: ChartType };
const METRICS: MetricDef[] = [
  { id: 'processes-by-category',  label: 'Processes by Category',          dataShape: 'categorical',  defaultChart: 'bar' },
  { id: 'portfolio-status',       label: 'Portfolio Status',               dataShape: 'binary',       defaultChart: 'donut' },
  { id: 'ai-agent-distribution',  label: 'AI Agent Distribution',          dataShape: 'categorical',  defaultChart: 'horizontal-bar' },
  { id: 'data-completeness',      label: 'Data Completeness by Category',  dataShape: 'comparative',  defaultChart: 'bar' },
  { id: 'governance-coverage',    label: 'Governance Coverage',            dataShape: 'binary',       defaultChart: 'donut' },
  { id: 'kpi-coverage',           label: 'KPI Coverage',                   dataShape: 'binary',       defaultChart: 'pie' },
  { id: 'target-coverage',        label: 'Target Coverage',                dataShape: 'binary',       defaultChart: 'pie' },
  { id: 'value-impact-coverage',  label: 'Value Impact Coverage',          dataShape: 'binary',       defaultChart: 'pie' },
  { id: 'category-portfolio',     label: 'Included vs Excluded by Category', dataShape: 'comparative', defaultChart: 'bar' },
  { id: 'audit-by-action',        label: 'Activity by Action Type',        dataShape: 'categorical',  defaultChart: 'bar' },
];

const PALETTE = ['#6366f1','#f59e0b','#10b981','#ec4899','#3b82f6','#8b5cf6','#f97316','#06b6d4','#14b8a6','#a855f7'];

const PRESET_REGISTRY = [
  { id: 'summary',         title: 'Process Summary',      icon: BarChart2,  description: 'Total, included, and category counts' },
  { id: 'categories',      title: 'Category Breakdown',   icon: Activity,   description: 'Processes by category (clickable)' },
  { id: 'performance',     title: 'Performance Overview', icon: Target,     description: 'Processes with targets and achievements' },
  { id: 'recent-activity', title: 'Recent Activity',      icon: FileText,   description: 'Latest audit log entries' },
  { id: 'ai-agents',       title: 'AI Agent Map',         icon: Cpu,        description: 'AI agents across processes' },
  { id: 'value-impact',    title: 'Value Impact',         icon: TrendingUp, description: 'Processes with value impact data' },
];

// ─── Storage ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function buildDefaults(): WidgetConfig[] {
  return [
    { kind: 'preset', uid: uid(), id: 'summary',         active: true },
    { kind: 'preset', uid: uid(), id: 'categories',      active: true },
    { kind: 'chart',  uid: uid(), metric: 'processes-by-category', chartType: 'bar',   title: 'Processes by Category', active: true },
    { kind: 'chart',  uid: uid(), metric: 'portfolio-status',      chartType: 'donut', title: 'Portfolio Status',       active: true },
    { kind: 'preset', uid: uid(), id: 'performance',     active: false },
    { kind: 'preset', uid: uid(), id: 'recent-activity', active: false },
    { kind: 'preset', uid: uid(), id: 'ai-agents',       active: false },
    { kind: 'preset', uid: uid(), id: 'value-impact',    active: false },
  ];
}

function loadWidgets(): WidgetConfig[] {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed: WidgetConfig[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0 && 'active' in parsed[0]) return parsed;
    }
  } catch { /* ignore */ }
  return buildDefaults();
}

function saveWidgets(w: WidgetConfig[]) { localStorage.setItem(LS_KEY, JSON.stringify(w)); }

// ─── Data computation ─────────────────────────────────────────────────────────

type ChartEntry = { name: string; value: number; value2?: number };

function completeness(p: Process): number {
  const filled = TRACKABLE_FIELDS.filter(f => p[f as keyof Process] && String(p[f as keyof Process]).trim()).length;
  return Math.round((filled / TRACKABLE_FIELDS.length) * 100);
}

function computeMetric(metric: string, processes: Process[], auditLogs: { action: string }[], govMap: Record<number, number[]>): ChartEntry[] {
  switch (metric) {
    case 'processes-by-category': {
      const map: Record<string, number> = {};
      for (const p of processes) map[p.category] = (map[p.category] ?? 0) + 1;
      return Object.entries(map).map(([name, value]) => ({ name: name.split(' ')[0], value })).sort((a, b) => b.value - a.value);
    }
    case 'portfolio-status': {
      const inc = processes.filter(p => p.included).length;
      return [{ name: 'Included', value: inc }, { name: 'Excluded', value: processes.length - inc }];
    }
    case 'ai-agent-distribution': {
      const map: Record<string, number> = {};
      for (const p of processes) { const a = p.aiAgent?.trim() || 'Unassigned'; map[a] = (map[a] ?? 0) + 1; }
      return Object.entries(map).map(([name, value]) => ({ name: name.split(' ')[0], value })).sort((a, b) => b.value - a.value).slice(0, 10);
    }
    case 'data-completeness': {
      const catMap: Record<string, number[]> = {};
      for (const p of processes) { if (!catMap[p.category]) catMap[p.category] = []; catMap[p.category].push(completeness(p)); }
      return Object.entries(catMap).map(([name, vals]) => ({ name: name.split(' ')[0], value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) })).sort((a, b) => b.value - a.value);
    }
    case 'governance-coverage': {
      const assigned = processes.filter(p => (govMap[p.id] ?? []).length > 0).length;
      return [{ name: 'Assigned', value: assigned }, { name: 'Unassigned', value: processes.length - assigned }];
    }
    case 'kpi-coverage': {
      const w = processes.filter(p => p.kpi?.trim()).length;
      return [{ name: 'Has KPI', value: w }, { name: 'No KPI', value: processes.length - w }];
    }
    case 'target-coverage': {
      const w = processes.filter(p => p.target?.trim()).length;
      return [{ name: 'Has Target', value: w }, { name: 'No Target', value: processes.length - w }];
    }
    case 'value-impact-coverage': {
      const w = processes.filter(p => p.estimatedValueImpact?.trim()).length;
      return [{ name: 'Has Impact', value: w }, { name: 'Missing', value: processes.length - w }];
    }
    case 'category-portfolio': {
      const map: Record<string, { inc: number; exc: number }> = {};
      for (const p of processes) { if (!map[p.category]) map[p.category] = { inc: 0, exc: 0 }; if (p.included) map[p.category].inc++; else map[p.category].exc++; }
      return Object.entries(map).map(([name, v]) => ({ name: name.split(' ')[0], value: v.inc, value2: v.exc })).sort((a, b) => (b.value + (b.value2 ?? 0)) - (a.value + (a.value2 ?? 0)));
    }
    case 'audit-by-action': {
      const map: Record<string, number> = {};
      for (const l of auditLogs) map[l.action] = (map[l.action] ?? 0) + 1;
      return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }
    default: return [];
  }
}

// ─── Chart renderer ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="font-semibold" style={{ color: p.color ?? p.fill }}>{p.name ?? 'Value'}: {p.value}</div>
      ))}
    </div>
  );
};

function ChartRenderer({ data, chartType, metric }: { data: ChartEntry[]; chartType: ChartType; metric: string }) {
  const isStacked = metric === 'category-portfolio';
  const textColor = 'hsl(var(--muted-foreground))';
  const gridColor = 'hsl(var(--border))';
  if (!data.length) return <p className="text-xs text-muted-foreground italic py-4">No data available yet.</p>;

  if (chartType === 'pie' || chartType === 'donut') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={chartType === 'donut' ? '55%' : '0%'} outerRadius="80%" dataKey="value" paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={(v) => <span style={{ color: textColor, fontSize: 10 }}>{v}</span>} iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === 'horizontal-bar') {
    return (
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={gridColor} strokeOpacity={0.3} />
          <XAxis type="number" tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid stroke={gridColor} strokeOpacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2} dot={{ r: 3, fill: PALETTE[0] }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="ag0" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PALETTE[0]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={PALETTE[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridColor} strokeOpacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="value" stroke={PALETTE[0]} fill="url(#ag0)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={gridColor} strokeOpacity={0.3} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" name={isStacked ? 'Included' : 'Value'} radius={[4, 4, 0, 0]} maxBarSize={40}>
          {!isStacked && data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          {isStacked && data.map((_, i) => <Cell key={i} fill={PALETTE[0]} />)}
        </Bar>
        {isStacked && <Bar dataKey="value2" name="Excluded" fill={PALETTE[1]} radius={[4, 4, 0, 0]} maxBarSize={40} />}
        {isStacked && <Legend formatter={(v) => <span style={{ color: textColor, fontSize: 10 }}>{v}</span>} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Chart config panel ───────────────────────────────────────────────────────

function ChartConfigPanel({ initial, onConfirm, onCancel }: {
  initial?: { metric: string; chartType: ChartType; title: string };
  onConfirm: (cfg: { metric: string; chartType: ChartType; title: string }) => void;
  onCancel: () => void;
}) {
  const defaultMetric = initial?.metric ?? METRICS[0].id;
  const [selectedMetric, setSelectedMetric] = useState(defaultMetric);
  const [selectedChart, setSelectedChart] = useState<ChartType>(initial?.chartType ?? METRICS[0].defaultChart);
  const [title, setTitle] = useState(initial?.title ?? '');

  const metricDef = METRICS.find(m => m.id === selectedMetric)!;
  const availableCharts = CHART_TYPES.filter(ct => ct.supports.includes(metricDef.dataShape));

  const handleMetricChange = (id: string) => {
    setSelectedMetric(id);
    const def = METRICS.find(m => m.id === id)!;
    const available = CHART_TYPES.filter(ct => ct.supports.includes(def.dataShape));
    if (!available.find(c => c.id === selectedChart)) setSelectedChart(def.defaultChart);
    if (!title || title === METRICS.find(m => m.id === selectedMetric)?.label) setTitle(def.label);
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Metric</label>
        <select value={selectedMetric} onChange={e => handleMetricChange(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
          {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Chart Type</label>
        <div className="flex gap-1.5 flex-wrap">
          {availableCharts.map(ct => {
            const Icon = ct.icon;
            return (
              <button key={ct.id} onClick={() => setSelectedChart(ct.id)} title={ct.label}
                className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                  selectedChart === ct.id ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-secondary/50")}>
                <Icon className="w-3.5 h-3.5" />{ct.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Widget Title (optional)</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={metricDef.label}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onConfirm({ metric: selectedMetric, chartType: selectedChart, title: title || metricDef.label })}
          className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          {initial ? 'Update Chart' : 'Add Chart'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-secondary transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Preset widget contents ───────────────────────────────────────────────────

function getCatColor(cat: string) {
  const lower = cat.toLowerCase();
  if (lower.includes('strategy')) return '#6366f1';
  if (lower.includes('fundraising')) return '#f59e0b';
  if (lower.includes('grant')) return '#10b981';
  if (lower.includes('marketing')) return '#ec4899';
  if (lower.includes('program')) return '#3b82f6';
  if (lower.includes('finance')) return '#8b5cf6';
  if (lower.includes('hr') || lower.includes('talent')) return '#f97316';
  if (lower.includes('technology') || lower.includes('data')) return '#06b6d4';
  return '#64748b';
}

function SummaryWidget({ processes }: { processes: Process[] }) {
  const included = processes.filter(p => p.included).length;
  const cats = new Set(processes.map(p => p.category)).size;
  const withTargets = processes.filter(p => p.target).length;
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: 'Total Processes', value: processes.length, color: 'text-primary' },
        { label: 'Included', value: included, color: 'text-emerald-400' },
        { label: 'Categories', value: cats, color: 'text-amber-400' },
        { label: 'With Targets', value: withTargets, color: 'text-blue-400' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-secondary/30 rounded-xl p-3 border border-border/50">
          <div className={cn("text-2xl font-bold font-display", color)}>{value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  );
}

function CategoriesWidget({ processes, onNavigate }: { processes: Process[]; onNavigate?: (cat: string) => void }) {
  const cats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of processes) map[p.category] = (map[p.category] ?? 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [processes]);
  const max = Math.max(...cats.map(c => c[1]), 1);
  return (
    <div className="space-y-2">
      {onNavigate && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mb-3">
          <ExternalLink className="w-3 h-3" />
          Click a category to open in Process Map
        </div>
      )}
      {cats.slice(0, 8).map(([cat, count]) => (
        <button
          key={cat}
          onClick={() => onNavigate?.(cat)}
          className={cn(
            "w-full flex items-center gap-2 text-left rounded-lg px-1 py-0.5 transition-all",
            onNavigate ? "hover:bg-secondary/50 cursor-pointer group" : "cursor-default"
          )}
          title={onNavigate ? `Open "${cat}" in Process Map` : cat}
        >
          <div className="text-xs text-muted-foreground w-36 truncate shrink-0 group-hover:text-foreground transition-colors" title={cat}>{cat}</div>
          <div className="flex-1 bg-secondary/30 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${(count / max) * 100}%`, background: getCatColor(cat) }} />
          </div>
          <div className="text-xs font-mono text-muted-foreground w-5 text-right">{count}</div>
          {onNavigate && <ExternalLink className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-opacity shrink-0" />}
        </button>
      ))}
    </div>
  );
}

function PerformanceWidget({ processes }: { processes: Process[] }) {
  const withData = processes.filter(p => p.target || p.achievement).slice(0, 6);
  if (!withData.length) return <p className="text-sm text-muted-foreground italic">No processes with targets yet.</p>;
  return (
    <div className="space-y-2">
      {withData.map(p => (
        <div key={p.id} className="flex items-start gap-3 p-2.5 bg-secondary/30 rounded-lg border border-border/50">
          <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", p.achievement ? "text-emerald-400" : "text-muted-foreground/40")} />
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">{p.processName || p.processDescription}</div>
            <div className="flex gap-3 mt-1">
              {p.target && <span className="text-[10px] text-primary">Target: {p.target.slice(0, 30)}</span>}
              {p.achievement && <span className="text-[10px] text-emerald-400">Got: {p.achievement.slice(0, 30)}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentActivityWidget() {
  const { data: logs } = useAuditLogsData(10);
  if (!logs?.length) return <p className="text-sm text-muted-foreground italic">No activity yet.</p>;
  return (
    <div className="space-y-2">
      {logs.slice(0, 7).map(log => (
        <div key={log.id} className="flex items-start gap-2.5 text-xs">
          <Activity className="w-3 h-3 mt-0.5 text-muted-foreground/60 shrink-0" />
          <div className="min-w-0">
            <span className="text-foreground/80">{log.description ?? log.entityName ?? log.action}</span>
            <span className="text-muted-foreground ml-2">{new Date(log.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AiAgentsWidget({ processes }: { processes: Process[] }) {
  const agents = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of processes) if (p.aiAgent) map[p.aiAgent] = (map[p.aiAgent] ?? 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [processes]);
  if (!agents.length) return <p className="text-sm text-muted-foreground italic">No AI agents defined yet.</p>;
  return (
    <div className="space-y-1.5">
      {agents.slice(0, 6).map(([agent, count]) => (
        <div key={agent} className="flex items-center justify-between text-xs">
          <span className="text-foreground/80 truncate mr-2">{agent}</span>
          <span className="shrink-0 px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">{count}</span>
        </div>
      ))}
    </div>
  );
}

function ValueImpactWidget({ processes }: { processes: Process[] }) {
  const withImpact = processes.filter(p => p.estimatedValueImpact).slice(0, 5);
  if (!withImpact.length) return <p className="text-sm text-muted-foreground italic">No value impact data yet.</p>;
  return (
    <div className="space-y-2">
      {withImpact.map(p => (
        <div key={p.id} className="p-2.5 bg-secondary/30 rounded-lg border border-border/50">
          <div className="text-xs font-medium truncate">{p.processName || p.processDescription}</div>
          <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{p.estimatedValueImpact}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Widget shell ─────────────────────────────────────────────────────────────

function WidgetShell({ title, icon, onClose, onConfigure, children }: {
  title: string; icon?: React.ReactNode;
  onClose: () => void; onConfigure?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4 group relative">
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-2 text-foreground font-semibold text-sm min-w-0">
          {icon && <span className="text-primary shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
          {onConfigure && (
            <button onClick={onConfigure} title="Configure" className="p-1 rounded hover:bg-secondary text-muted-foreground/40 hover:text-muted-foreground transition-colors">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onClose} title="Close widget (returns to pool)" className="p-1 rounded hover:bg-amber-500/10 hover:text-amber-400 text-muted-foreground/40 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function DashboardsView({ onNavigateToProcessMap }: DashboardsViewProps) {
  const { data: processes, isLoading } = useProcessesData();
  const { data: rawLogs } = useAuditLogsData(100);
  const [govMap, setGovMap] = useState<Record<number, number[]>>({});
  const [widgets, setWidgets] = useState<WidgetConfig[]>(loadWidgets);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<'picker' | 'chart-config'>('picker');
  const [configuringUid, setConfiguringUid] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragUid = useRef<string | null>(null);

  useEffect(() => {
    fetch('/api/processes/governance-map').then(r => r.json()).then(setGovMap).catch(() => {});
  }, []);

  const persist = useCallback((next: WidgetConfig[]) => { setWidgets(next); saveWidgets(next); }, []);

  const activeWidgets = useMemo(() => widgets.filter(w => w.active), [widgets]);
  const poolWidgets = useMemo(() => widgets.filter(w => !w.active), [widgets]);

  const closeWidget = (u: string) => persist(widgets.map(w => w.uid === u ? { ...w, active: false } : w));
  const activateWidget = (u: string) => persist(widgets.map(w => w.uid === u ? { ...w, active: true } : w));

  const addChart = (cfg: { metric: string; chartType: ChartType; title: string }) => {
    const newW: WidgetConfig = { kind: 'chart', uid: uid(), ...cfg, active: true };
    persist([...widgets, newW]);
    setShowAdd(false);
    setAddMode('picker');
  };

  const updateChart = (u: string, cfg: { metric: string; chartType: ChartType; title: string }) => {
    persist(widgets.map(w => w.uid === u ? { kind: 'chart', uid: u, ...cfg, active: true } : w));
    setConfiguringUid(null);
  };

  const handleDragStart = (u: string) => { dragUid.current = u; };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (dragUid.current) { activateWidget(dragUid.current); dragUid.current = null; }
  };

  const procs = processes ?? [];
  const auditLogs = (rawLogs ?? []) as { action: string }[];
  const configuringWidget = widgets.find(w => w.uid === configuringUid);

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary/50" /></div>;
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* Header */}
      <div className="flex-none px-5 py-4 border-b border-border bg-card flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            Dashboards
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Drag widgets from the pool back onto the board.</p>
        </div>
        <div className="relative">
          <button onClick={() => { setShowAdd(v => !v); setAddMode('picker'); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />Add Chart
          </button>

          {showAdd && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-30 overflow-hidden">
              {addMode === 'picker' ? (
                <ChartConfigPanel onConfirm={addChart} onCancel={() => { setShowAdd(false); setAddMode('picker'); }} />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Body: pool panel + grid */}
      <div className="flex-1 flex overflow-hidden">

        {/* Widget pool */}
        <div className="flex-none w-52 border-r border-border bg-sidebar flex flex-col h-full overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Widget Pool</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Drag to dashboard →</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {poolWidgets.length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic text-center py-6">All widgets are on the dashboard</p>
            )}
            {poolWidgets.map(w => {
              const label = w.kind === 'preset'
                ? (PRESET_REGISTRY.find(r => r.id === w.id)?.title ?? w.id)
                : w.title;
              const IconComp = w.kind === 'preset'
                ? (PRESET_REGISTRY.find(r => r.id === w.id)?.icon ?? BarChart2)
                : (CHART_TYPES.find(ct => ct.id === w.chartType)?.icon ?? BarChart2);
              return (
                <div
                  key={w.uid}
                  draggable
                  onDragStart={() => handleDragStart(w.uid)}
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-card border border-border rounded-xl cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-primary/5 transition-all group select-none"
                  title="Drag onto the dashboard to activate"
                >
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0" />
                  <IconComp className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate">{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dashboard grid (drop target) */}
        <div
          className={cn("flex-1 overflow-y-auto p-5 transition-colors", dragOver && "bg-primary/5")}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {dragOver && (
            <div className="fixed inset-0 pointer-events-none z-10 flex items-center justify-center">
              <div className="px-6 py-4 bg-primary/20 border-2 border-dashed border-primary/60 rounded-2xl text-primary font-semibold text-sm">
                Drop to add widget to dashboard
              </div>
            </div>
          )}

          {activeWidgets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
              <LayoutDashboard className="w-12 h-12 opacity-20" />
              <p className="text-base">Dashboard is empty.</p>
              <p className="text-sm opacity-60">Drag a widget from the pool on the left, or add a chart above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeWidgets.map(w => {
                if (w.kind === 'preset') {
                  const reg = PRESET_REGISTRY.find(r => r.id === w.id);
                  if (!reg) return null;
                  const Icon = reg.icon;
                  let content: React.ReactNode = null;
                  if (w.id === 'summary') content = <SummaryWidget processes={procs} />;
                  else if (w.id === 'categories') content = (
                    <CategoriesWidget
                      processes={procs}
                      onNavigate={onNavigateToProcessMap}
                    />
                  );
                  else if (w.id === 'performance') content = <PerformanceWidget processes={procs} />;
                  else if (w.id === 'recent-activity') content = <RecentActivityWidget />;
                  else if (w.id === 'ai-agents') content = <AiAgentsWidget processes={procs} />;
                  else if (w.id === 'value-impact') content = <ValueImpactWidget processes={procs} />;
                  return (
                    <WidgetShell key={w.uid} title={reg.title} icon={<Icon className="w-4 h-4" />} onClose={() => closeWidget(w.uid)}>
                      {content}
                    </WidgetShell>
                  );
                }

                if (w.kind === 'chart') {
                  const data = computeMetric(w.metric, procs, auditLogs, govMap);
                  const ChartIcon = CHART_TYPES.find(ct => ct.id === w.chartType)?.icon ?? BarChart2;
                  return (
                    <WidgetShell
                      key={w.uid}
                      title={w.title}
                      icon={<ChartIcon className="w-4 h-4" />}
                      onClose={() => closeWidget(w.uid)}
                      onConfigure={() => setConfiguringUid(w.uid)}
                    >
                      <ChartRenderer data={data} chartType={w.chartType} metric={w.metric} />
                    </WidgetShell>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>
      </div>

      {/* Reconfigure modal */}
      {configuringUid && configuringWidget?.kind === 'chart' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-2xl w-80 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">Reconfigure Chart</span>
              <button onClick={() => setConfiguringUid(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ChartConfigPanel
              initial={{ metric: configuringWidget.metric, chartType: configuringWidget.chartType, title: configuringWidget.title }}
              onConfirm={cfg => updateChart(configuringUid, cfg)}
              onCancel={() => setConfiguringUid(null)}
            />
          </div>
        </div>
      )}

      {showAdd && <div className="fixed inset-0 z-20" onClick={() => { setShowAdd(false); setAddMode('picker'); }} />}
    </div>
  );
}
