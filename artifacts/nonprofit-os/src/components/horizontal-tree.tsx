import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProcessesData, useOptimisticUpdateProcess } from '@/hooks/use-app-data';
import { ChevronRight, Cpu, Target, ArrowRightLeft, Users, Activity, TrendingUp, Loader2, Network, Pencil } from 'lucide-react';
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
  const { mutate: updateProcess } = useOptimisticUpdateProcess();

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

  // Keep selectedProcess synced with live server data
  const liveSelectedProcess = useMemo(() => {
    if (!selectedProcess || !processes) return selectedProcess;
    return processes.find(p => p.id === selectedProcess.id) ?? selectedProcess;
  }, [selectedProcess, processes]);

  const categoryProcesses = useMemo(() => {
    if (!processes || !selectedCategory) return [];
    return processes.filter(p => p.category === selectedCategory).sort((a, b) => a.number - b.number);
  }, [processes, selectedCategory]);

  const handleSave = useCallback((field: string, value: string) => {
    if (!liveSelectedProcess) return;
    updateProcess({ id: liveSelectedProcess.id, data: { [field]: value } });
  }, [liveSelectedProcess, updateProcess]);

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
          <h2 className="text-xl font-display font-bold text-foreground">Master Map</h2>
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
                const isActive = liveSelectedProcess?.id === process.id;
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

      {/* Level 3: Editable Info Card */}
      <AnimatePresence>
        {liveSelectedProcess && (
          <motion.div
            key={liveSelectedProcess.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
            className="flex-1 min-w-[520px] max-w-[860px] h-full bg-background overflow-y-auto shrink-0 z-20 shadow-2xl"
          >
            <div className="max-w-3xl mx-auto p-8 space-y-8">

              {/* Edit hint */}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 bg-secondary/30 border border-border/50 rounded-lg px-3 py-2">
                <Pencil className="w-3 h-3" />
                Click any field to edit inline — changes save automatically
              </div>

              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold border tracking-wide uppercase"
                    style={{ color: getCatColor(liveSelectedProcess.category), borderColor: getCatColor(liveSelectedProcess.category) + '40', background: getCatColor(liveSelectedProcess.category) + '15' }}
                  >
                    {liveSelectedProcess.category}
                  </span>
                  <span className="text-sm font-mono text-muted-foreground">PRO-{liveSelectedProcess.number.toString().padStart(3, '0')}</span>
                </div>
                <InlineEdit
                  value={liveSelectedProcess.processName ?? ''}
                  onSave={v => handleSave('processName', v)}
                  className="text-2xl font-display font-bold text-foreground leading-tight"
                  placeholder="Process name…"
                  singleLine
                />
                <div className="mt-2">
                  <InlineEdit
                    value={liveSelectedProcess.processDescription ?? ''}
                    onSave={v => handleSave('processDescription', v)}
                    className="text-sm text-muted-foreground leading-relaxed"
                    placeholder="Process description…"
                  />
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <EditableKpiCard
                  icon={<Target />}
                  label="Target KPI"
                  value={liveSelectedProcess.target ?? ''}
                  color="text-primary"
                  bg="bg-primary/10 border-primary/20"
                  emptyLabel="No target set"
                  onSave={v => handleSave('target', v)}
                />
                <EditableKpiCard
                  icon={<Activity />}
                  label="Achievement"
                  value={liveSelectedProcess.achievement ?? ''}
                  color="text-emerald-400"
                  bg="bg-emerald-400/10 border-emerald-400/20"
                  emptyLabel="No data yet"
                  onSave={v => handleSave('achievement', v)}
                />
                <EditableKpiCard
                  icon={<TrendingUp />}
                  label="Industry Benchmark"
                  value={liveSelectedProcess.industryBenchmark ?? ''}
                  color="text-amber-400"
                  bg="bg-amber-400/10 border-amber-400/20"
                  emptyLabel="No benchmark"
                  onSave={v => handleSave('industryBenchmark', v)}
                />
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <EditableDetailSection
                  icon={<Target />}
                  title="Purpose"
                  value={liveSelectedProcess.purpose ?? ''}
                  onSave={v => handleSave('purpose', v)}
                  fullWidth
                />
                <EditableDetailSection
                  icon={<Cpu />}
                  title="AI Agent"
                  value={liveSelectedProcess.aiAgent ?? ''}
                  onSave={v => handleSave('aiAgent', v)}
                  highlight
                />
                <EditableDetailSection
                  icon={<Users />}
                  title="Human-in-the-Loop"
                  value={liveSelectedProcess.humanInTheLoop ?? ''}
                  onSave={v => handleSave('humanInTheLoop', v)}
                />
                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-secondary/30 rounded-2xl border border-border/50">
                  <EditableDetailSection
                    icon={<ArrowRightLeft className="rotate-45" />}
                    title="Inputs"
                    value={liveSelectedProcess.inputs ?? ''}
                    onSave={v => handleSave('inputs', v)}
                  />
                  <EditableDetailSection
                    icon={<ArrowRightLeft className="-rotate-45" />}
                    title="Outputs"
                    value={liveSelectedProcess.outputs ?? ''}
                    onSave={v => handleSave('outputs', v)}
                  />
                </div>
                <EditableDetailSection
                  icon={<Activity />}
                  title="KPIs"
                  value={liveSelectedProcess.kpi ?? ''}
                  onSave={v => handleSave('kpi', v)}
                />
                <EditableDetailSection
                  icon={<TrendingUp />}
                  title="Estimated Value Impact"
                  value={liveSelectedProcess.estimatedValueImpact ?? ''}
                  onSave={v => handleSave('estimatedValueImpact', v)}
                />
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
      {selectedCategory && !liveSelectedProcess && (
        <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground bg-background/50">
          <ChevronRight className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-base">Select a process to view details</p>
        </div>
      )}
    </div>
  );
}

// ── Inline edit primitive ─────────────────────────────────────────────────────

function InlineEdit({
  value, onSave, className, placeholder, singleLine,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  singleLine?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  const startEdit = () => { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 30); };
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (singleLine && e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setEditing(false); setDraft(value); }
  };

  if (editing) {
    return singleLine ? (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={cn("w-full bg-secondary/60 border border-primary/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30", className)}
      />
    ) : (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        rows={3}
        className={cn("w-full resize-y bg-secondary/60 border border-primary/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30", className)}
      />
    );
  }

  return (
    <div
      onClick={startEdit}
      className={cn(
        "group relative cursor-text rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-secondary/50 hover:ring-1 hover:ring-border transition-all",
        !value && "italic text-muted-foreground",
        className
      )}
    >
      {value || placeholder}
      <Pencil className="absolute top-2 right-2 w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-opacity" />
    </div>
  );
}

// ── Editable KPI card ─────────────────────────────────────────────────────────

function EditableKpiCard({
  icon, label, value, color, bg, emptyLabel, onSave,
}: {
  icon: React.ReactNode; label: string; value: string;
  color: string; bg: string; emptyLabel: string; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 30); };
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };

  return (
    <div className={cn("rounded-xl border p-4 space-y-2 group/card relative", bg)}>
      <div className={cn("flex items-center gap-2 font-semibold text-xs uppercase tracking-wide", color)}>
        <span className="w-3.5 h-3.5">{icon}</span>
        {label}
        <Pencil className="w-3 h-3 ml-auto opacity-0 group-hover/card:opacity-50 transition-opacity cursor-pointer" onClick={startEdit} />
      </div>
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Escape' && (setEditing(false), setDraft(value))}
          rows={2}
          className="w-full resize-none bg-background/50 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      ) : (
        <p
          onClick={startEdit}
          className={cn(
            "text-sm leading-relaxed cursor-text rounded px-1 py-0.5 -mx-1 hover:bg-background/30 transition-colors",
            value ? "text-foreground" : "text-muted-foreground italic"
          )}
        >
          {value || emptyLabel}
        </p>
      )}
    </div>
  );
}

// ── Editable detail section ───────────────────────────────────────────────────

function EditableDetailSection({
  icon, title, value, onSave, fullWidth, highlight,
}: {
  icon: React.ReactNode; title: string; value: string;
  onSave: (v: string) => void; fullWidth?: boolean; highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 30); };
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };

  return (
    <div className={cn(
      "space-y-2 group/section",
      fullWidth && "col-span-1 md:col-span-2",
      highlight && "p-5 bg-primary/5 border border-primary/20 rounded-xl"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground font-semibold text-xs tracking-wide uppercase">
          <span className={cn("w-4 h-4", highlight && "text-primary")}>{icon}</span>
          <span className={highlight ? "text-primary" : ""}>{title}</span>
        </div>
        <button
          onClick={startEdit}
          className="opacity-0 group-hover/section:opacity-100 transition-opacity p-1 rounded hover:bg-secondary"
          title={`Edit ${title}`}
        >
          <Pencil className="w-3 h-3 text-muted-foreground/60" />
        </button>
      </div>
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Escape' && (setEditing(false), setDraft(value))}
          rows={3}
          className={cn(
            "w-full resize-y bg-secondary/50 border border-primary/30 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed",
            highlight && "font-medium"
          )}
        />
      ) : (
        <p
          onClick={startEdit}
          className={cn(
            "text-foreground/90 leading-relaxed text-sm cursor-text rounded-lg px-2 py-1.5 -mx-2",
            "hover:bg-secondary/40 transition-colors",
            highlight && "text-foreground font-medium",
            !value && "text-muted-foreground italic"
          )}
        >
          {value || `Click to add ${title.toLowerCase()}…`}
        </p>
      )}
    </div>
  );
}
