import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProcessesData } from '@/hooks/use-app-data';
import { ChevronRight, Cpu, Target, ArrowRightLeft, Users, Activity, TrendingUp, Loader2, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Process } from '@workspace/api-client-react';

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

interface HorizontalTreeProps {
  initialCategory?: string | null;
}

export function HorizontalTree({ initialCategory }: HorizontalTreeProps) {
  const { data: processes, isLoading } = useProcessesData();

  const categories = useMemo(() => {
    if (!processes) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of [...processes].sort((a, b) => a.number - b.number)) {
      if (!seen.has(p.category)) { seen.add(p.category); result.push(p.category); }
    }
    return result.sort();
  }, [processes]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory ?? null);
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);

  const categoryProcesses = useMemo(() => {
    if (!processes || !selectedCategory) return [];
    return processes.filter(p => p.category === selectedCategory).sort((a, b) => a.number - b.number);
  }, [processes, selectedCategory]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex bg-background overflow-x-auto overflow-y-hidden">

      {/* Level 1: Categories */}
      <div className="flex-none w-72 border-r border-border bg-sidebar flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-border bg-sidebar/50">
          <h2 className="text-xl font-display font-bold text-foreground">Process Map</h2>
          <p className="text-sm text-muted-foreground mt-1">{processes?.length ?? 0} total processes</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {categories.map((cat) => {
            const count = processes?.filter(p => p.category === cat).length ?? 0;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => { setSelectedCategory(cat); setSelectedProcess(null); }}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all duration-200 group flex items-center justify-between",
                  isActive
                    ? "bg-primary/10 border-primary/30 shadow-md"
                    : "bg-card border-transparent hover:border-border hover:bg-secondary/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 rounded-full shrink-0" style={{ background: getCatColor(cat) }} />
                  <span className={cn("font-medium text-sm leading-snug", isActive ? "text-primary" : "text-foreground")}>
                    {cat}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{count}</span>
                  <ChevronRight className={cn("w-4 h-4 transition-transform", isActive ? "text-primary translate-x-1" : "text-muted-foreground group-hover:translate-x-1")} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Level 2: Processes */}
      <AnimatePresence>
        {selectedCategory && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex-none w-72 border-r border-border bg-card flex flex-col h-full shrink-0 shadow-2xl z-10"
          >
            <div className="p-5 border-b border-border bg-card/50 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: getCatColor(selectedCategory) }} />
              <h3 className="text-base font-display font-semibold text-foreground line-clamp-1">{selectedCategory}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {categoryProcesses.map((process) => {
                const isActive = selectedProcess?.id === process.id;
                return (
                  <button
                    key={process.id}
                    onClick={() => setSelectedProcess(process)}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all duration-200 group",
                      isActive
                        ? "bg-accent border-primary/30 shadow-lg"
                        : "bg-background border-border/50 hover:border-border hover:bg-secondary/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono text-muted-foreground mb-1">PRO-{process.number.toString().padStart(3, '0')}</div>
                        <h4 className={cn("font-semibold text-sm leading-snug", isActive ? "text-primary" : "text-foreground")}>
                          {process.processName || process.processDescription}
                        </h4>
                      </div>
                      <ChevronRight className={cn("w-4 h-4 shrink-0 mt-1 transition-transform", isActive ? "text-primary translate-x-1" : "text-muted-foreground group-hover:translate-x-1")} />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level 3: Process Detail */}
      <AnimatePresence>
        {selectedProcess && (
          <motion.div
            key={selectedProcess.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
            className="flex-1 min-w-[520px] max-w-[860px] h-full bg-background overflow-y-auto shrink-0 z-20 shadow-2xl"
          >
            <div className="max-w-3xl mx-auto p-8 space-y-8">

              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold border tracking-wide uppercase"
                    style={{ color: getCatColor(selectedProcess.category), borderColor: getCatColor(selectedProcess.category) + '40', background: getCatColor(selectedProcess.category) + '15' }}
                  >
                    {selectedProcess.category}
                  </span>
                  <span className="text-sm font-mono text-muted-foreground">PRO-{selectedProcess.number.toString().padStart(3, '0')}</span>
                </div>
                <h1 className="text-2xl font-display font-bold text-foreground leading-tight">
                  {selectedProcess.processName || selectedProcess.processDescription}
                </h1>
                {selectedProcess.processName && (
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{selectedProcess.processDescription}</p>
                )}
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard icon={<Target />} label="Target KPI" value={selectedProcess.target} color="text-primary" bg="bg-primary/10 border-primary/20" emptyLabel="No target set" />
                <KpiCard icon={<Activity />} label="Achievement" value={selectedProcess.achievement} color="text-emerald-400" bg="bg-emerald-400/10 border-emerald-400/20" emptyLabel="No data yet" />
                <KpiCard icon={<TrendingUp />} label="Industry Benchmark" value={selectedProcess.industryBenchmark} color="text-amber-400" bg="bg-amber-400/10 border-amber-400/20" emptyLabel="No benchmark" />
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DetailSection icon={<Target />} title="Purpose" content={selectedProcess.purpose} fullWidth />
                <DetailSection icon={<Cpu />} title="AI Agent" content={selectedProcess.aiAgent} highlight />
                <DetailSection icon={<Users />} title="Human-in-the-Loop" content={selectedProcess.humanInTheLoop} />
                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-secondary/30 rounded-2xl border border-border/50">
                  <DetailSection icon={<ArrowRightLeft className="rotate-45" />} title="Inputs" content={selectedProcess.inputs} />
                  <DetailSection icon={<ArrowRightLeft className="-rotate-45" />} title="Outputs" content={selectedProcess.outputs} />
                </div>
                <DetailSection icon={<Activity />} title="KPIs" content={selectedProcess.kpi} />
                <DetailSection icon={<TrendingUp />} title="Estimated Value Impact" content={selectedProcess.estimatedValueImpact} />
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty states */}
      {!selectedCategory && (
        <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground bg-background/50">
          <Network className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg">Select a category to begin</p>
        </div>
      )}
      {selectedCategory && !selectedProcess && (
        <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground bg-background/50">
          <ChevronRight className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-base">Select a process to view details</p>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color, bg, emptyLabel }: {
  icon: React.ReactNode; label: string; value?: string | null;
  color: string; bg: string; emptyLabel: string;
}) {
  return (
    <div className={cn("rounded-xl border p-4 space-y-2", bg)}>
      <div className={cn("flex items-center gap-2 font-semibold text-xs uppercase tracking-wide", color)}>
        <span className="w-3.5 h-3.5">{icon}</span>
        {label}
      </div>
      <p className={cn("text-sm leading-relaxed", value ? "text-foreground" : "text-muted-foreground italic")}>
        {value || emptyLabel}
      </p>
    </div>
  );
}

function DetailSection({ icon, title, content, fullWidth, highlight }: {
  icon: React.ReactNode; title: string; content?: string | null; fullWidth?: boolean; highlight?: boolean;
}) {
  if (!content) return null;
  return (
    <div className={cn(
      "space-y-2",
      fullWidth && "col-span-1 md:col-span-2",
      highlight && "p-5 bg-primary/5 border border-primary/20 rounded-xl"
    )}>
      <div className="flex items-center gap-2 text-muted-foreground font-semibold text-xs tracking-wide uppercase">
        <span className={cn("w-4 h-4", highlight && "text-primary")}>{icon}</span>
        <span className={highlight ? "text-primary" : ""}>{title}</span>
      </div>
      <p className={cn(
        "text-foreground/90 leading-relaxed text-sm",
        highlight && "text-foreground font-medium"
      )}>{content}</p>
    </div>
  );
}
