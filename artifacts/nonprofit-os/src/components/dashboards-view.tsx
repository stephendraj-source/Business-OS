import { useState, useMemo } from 'react';
import { useProcessesData, useAuditLogsData } from '@/hooks/use-app-data';
import {
  LayoutDashboard, Plus, X, GripVertical, BarChart3, Activity,
  CheckCircle2, Target, Cpu, TrendingUp, Loader2, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Process } from '@workspace/api-client-react';

const WIDGET_REGISTRY = [
  { id: 'summary',        title: 'Process Summary',       icon: <BarChart3 className="w-4 h-4" />,    description: 'Total, included, and category counts' },
  { id: 'categories',     title: 'Category Breakdown',    icon: <Activity className="w-4 h-4" />,      description: 'Process distribution by category' },
  { id: 'performance',    title: 'Performance Overview',  icon: <Target className="w-4 h-4" />,        description: 'Processes with targets and achievements' },
  { id: 'recent-activity',title: 'Recent Activity',       icon: <FileText className="w-4 h-4" />,      description: 'Latest changes from the audit log' },
  { id: 'ai-agents',      title: 'AI Agent Map',          icon: <Cpu className="w-4 h-4" />,           description: 'Summary of AI agents across processes' },
  { id: 'value-impact',   title: 'Value Impact',          icon: <TrendingUp className="w-4 h-4" />,    description: 'Processes with estimated value impact' },
];

const LS_KEY = 'nonprofit-os-dashboard-widgets';

function loadWidgets(): string[] {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return ['summary', 'categories', 'performance', 'recent-activity'];
}

function saveWidgets(widgets: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(widgets));
}

function getCatColor(cat: string): string {
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

function CategoriesWidget({ processes }: { processes: Process[] }) {
  const cats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of processes) map[p.category] = (map[p.category] ?? 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [processes]);
  const max = Math.max(...cats.map(c => c[1]), 1);
  return (
    <div className="space-y-2">
      {cats.slice(0, 8).map(([cat, count]) => (
        <div key={cat} className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground w-36 truncate shrink-0" title={cat}>{cat}</div>
          <div className="flex-1 bg-secondary/30 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(count / max) * 100}%`, background: getCatColor(cat) }}
            />
          </div>
          <div className="text-xs font-mono text-muted-foreground w-5 text-right">{count}</div>
        </div>
      ))}
    </div>
  );
}

function PerformanceWidget({ processes }: { processes: Process[] }) {
  const withData = processes.filter(p => p.target || p.achievement).slice(0, 6);
  if (withData.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No processes with targets set yet. Edit a process to add targets.</p>;
  }
  return (
    <div className="space-y-2">
      {withData.map(p => (
        <div key={p.id} className="flex items-start gap-3 p-2.5 bg-secondary/30 rounded-lg border border-border/50">
          <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", p.achievement ? "text-emerald-400" : "text-muted-foreground/40")} />
          <div className="min-w-0">
            <div className="text-xs font-medium text-foreground truncate">{p.processName || p.processDescription}</div>
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
            <span className="text-muted-foreground ml-2">
              {new Date(log.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AiAgentsWidget({ processes }: { processes: Process[] }) {
  const agents = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of processes) {
      if (p.aiAgent) map[p.aiAgent] = (map[p.aiAgent] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [processes]);
  if (!agents.length) return <p className="text-sm text-muted-foreground italic">No AI agents defined yet.</p>;
  return (
    <div className="space-y-1.5">
      {agents.slice(0, 6).map(([agent, count]) => (
        <div key={agent} className="flex items-center justify-between text-xs">
          <span className="text-foreground/80 truncate mr-2" title={agent}>{agent}</span>
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
          <div className="text-xs font-medium text-foreground truncate">{p.processName || p.processDescription}</div>
          <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{p.estimatedValueImpact}</div>
        </div>
      ))}
    </div>
  );
}

function Widget({
  id, processes, onRemove,
}: {
  id: string;
  processes: Process[];
  onRemove: () => void;
}) {
  const reg = WIDGET_REGISTRY.find(w => w.id === id);
  if (!reg) return null;

  let content: React.ReactNode = null;
  if (id === 'summary') content = <SummaryWidget processes={processes} />;
  else if (id === 'categories') content = <CategoriesWidget processes={processes} />;
  else if (id === 'performance') content = <PerformanceWidget processes={processes} />;
  else if (id === 'recent-activity') content = <RecentActivityWidget />;
  else if (id === 'ai-agents') content = <AiAgentsWidget processes={processes} />;
  else if (id === 'value-impact') content = <ValueImpactWidget processes={processes} />;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4 group relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
          <span className="text-primary">{reg.icon}</span>
          {reg.title}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-4 h-4 text-muted-foreground/40 cursor-grab" />
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground/40 transition-colors"
            title="Remove widget"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1">{content}</div>
    </div>
  );
}

export function DashboardsView() {
  const { data: processes, isLoading } = useProcessesData();
  const [activeWidgets, setActiveWidgets] = useState<string[]>(loadWidgets);
  const [showAdd, setShowAdd] = useState(false);

  const availableToAdd = WIDGET_REGISTRY.filter(w => !activeWidgets.includes(w.id));

  const removeWidget = (id: string) => {
    const next = activeWidgets.filter(w => w !== id);
    setActiveWidgets(next);
    saveWidgets(next);
  };

  const addWidget = (id: string) => {
    const next = [...activeWidgets, id];
    setActiveWidgets(next);
    saveWidgets(next);
    setShowAdd(false);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
      </div>
    );
  }

  const procs = processes ?? [];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none p-5 border-b border-border bg-card flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            Dashboards
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Your configurable overview of nonprofit operations.</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Widget
          </button>

          {showAdd && availableToAdd.length > 0 && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl z-30 overflow-hidden">
              <div className="p-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">Available Widgets</div>
              {availableToAdd.map(w => (
                <button
                  key={w.id}
                  onClick={() => addWidget(w.id)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
                >
                  <span className="text-primary mt-0.5">{w.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-foreground">{w.title}</div>
                    <div className="text-xs text-muted-foreground">{w.description}</div>
                  </div>
                </button>
              ))}
              {availableToAdd.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground">All widgets are added.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeWidgets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
            <LayoutDashboard className="w-12 h-12 opacity-20" />
            <p className="text-base">No widgets yet. Click "Add Widget" to build your dashboard.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeWidgets.map(id => (
              <Widget key={id} id={id} processes={procs} onRemove={() => removeWidget(id)} />
            ))}
          </div>
        )}
      </div>

      {/* Overlay to close dropdown */}
      {showAdd && <div className="fixed inset-0 z-20" onClick={() => setShowAdd(false)} />}
    </div>
  );
}
