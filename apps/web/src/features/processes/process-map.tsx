import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProcessesData, useOptimisticUpdateProcess } from '@/shared/hooks/use-app-data';
import {
  ChevronRight, Cpu, Target, ArrowRightLeft, Users, Activity,
  TrendingUp, Loader2, Map, BarChart3, CheckCircle2, Award, Pencil,
  Zap, Briefcase, X
} from 'lucide-react';
import { cn, getCategoryColorClass } from '@/shared/lib/utils';
import type { Process } from '@workspace/api-client-react';

interface AssignedUser { id: number; name: string; email: string; role: string }

const API = '/api';

export function ProcessMap() {
  const { data: processes, isLoading } = useProcessesData();
  const { mutate: updateProcess } = useOptimisticUpdateProcess();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);

  const [assignees, setAssignees] = useState<AssignedUser[]>([]);
  const [allUsers, setAllUsers] = useState<AssignedUser[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [assigneesSaving, setAssigneesSaving] = useState(false);

  // Keep selectedProcess in sync with server data
  const liveSelectedProcess = useMemo(() => {
    if (!selectedProcess || !processes) return selectedProcess;
    return processes.find(p => p.id === selectedProcess.id) ?? selectedProcess;
  }, [selectedProcess, processes]);

  const includedProcesses = useMemo(() => {
    if (!processes) return [];
    return [...processes].filter(p => p.included).sort((a, b) => a.number - b.number);
  }, [processes]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of includedProcesses) {
      if (!seen.has(p.category)) { seen.add(p.category); result.push(p.category); }
    }
    return result.sort();
  }, [includedProcesses]);

  const categoryProcesses = useMemo(() => {
    if (!selectedCategory) return [];
    return includedProcesses.filter(p => p.category === selectedCategory);
  }, [includedProcesses, selectedCategory]);

  const handleSave = useCallback((field: string, value: string) => {
    if (!liveSelectedProcess) return;
    updateProcess({ id: liveSelectedProcess.id, data: { [field]: value } });
  }, [liveSelectedProcess, updateProcess]);

  // Fetch all users once
  useEffect(() => {
    fetch(`${API}/users`).then(r => r.ok ? r.json() : []).then(setAllUsers).catch(() => {});
  }, []);

  // Fetch assignees whenever a process is selected
  useEffect(() => {
    if (!liveSelectedProcess) { setAssignees([]); return; }
    fetch(`${API}/processes/${liveSelectedProcess.id}/assignees`)
      .then(r => r.ok ? r.json() : [])
      .then(setAssignees)
      .catch(() => {});
    setShowUserPicker(false);
  }, [liveSelectedProcess?.id]);

  const saveAssignees = useCallback(async (next: AssignedUser[]) => {
    if (!liveSelectedProcess) return;
    setAssigneesSaving(true);
    await fetch(`${API}/processes/${liveSelectedProcess.id}/assignees`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: next.map(u => u.id) }),
    });
    setAssigneesSaving(false);
  }, [liveSelectedProcess]);

  const addAssignee = async (user: AssignedUser) => {
    if (assignees.find(u => u.id === user.id)) return;
    const updated = [...assignees, user];
    setAssignees(updated);
    setShowUserPicker(false);
    await saveAssignees(updated);
  };

  const removeAssignee = async (id: number) => {
    const updated = assignees.filter(u => u.id !== id);
    setAssignees(updated);
    await saveAssignees(updated);
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
      </div>
    );
  }

  if (!isLoading && includedProcesses.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground bg-background/50 gap-4">
        <Map className="w-16 h-16 opacity-20" />
        <div className="text-center">
          <p className="text-lg font-medium">No processes included</p>
          <p className="text-sm mt-1 text-muted-foreground/70">Mark processes as included in the Master Catalogue to see them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex bg-background overflow-x-auto overflow-y-hidden">

      {/* Level 1: Categories */}
      <div className="flex-none w-72 border-r border-border bg-sidebar flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-border bg-sidebar/50">
          <h2 className="text-xl font-display font-bold text-foreground">Process Map</h2>
          <p className="text-sm text-muted-foreground mt-1">{includedProcesses.length} processes across {categories.length} categories</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {categories.map((cat) => {
            const count = includedProcesses.filter(p => p.category === cat).length;
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

      {/* Level 2: Process Names */}
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
            className="flex-1 min-w-[520px] max-w-[860px] h-full bg-background overflow-y-auto shrink-0 z-20 shadow-2xl relative"
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
                  <span className={cn("px-3 py-1 rounded-full text-xs font-bold border tracking-wide uppercase", getCategoryColorClass(liveSelectedProcess.category))}>
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

              {/* Status & toggle row */}
              <div className="flex flex-wrap items-center gap-3 p-4 bg-secondary/30 rounded-xl border border-border/50">
                {/* Traffic Light */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
                  <TrafficLightSelector
                    value={liveSelectedProcess.trafficLight ?? ''}
                    onSave={v => handleSave('trafficLight', v)}
                  />
                </div>
                <div className="w-px h-5 bg-border/60" />
                {/* AI Agent Active */}
                <BooleanToggle
                  icon={<Zap className="w-3.5 h-3.5" />}
                  label="AI Agent Active"
                  value={!!liveSelectedProcess.aiAgentActive}
                  onToggle={() => updateProcess({ id: liveSelectedProcess.id, data: { aiAgentActive: !liveSelectedProcess.aiAgentActive } })}
                  activeColor="text-violet-400"
                  activeBg="bg-violet-500/10 border-violet-500/30"
                />
                <div className="w-px h-5 bg-border/60" />
                {/* In Portfolio */}
                <BooleanToggle
                  icon={<Briefcase className="w-3.5 h-3.5" />}
                  label="In Portfolio"
                  value={!!liveSelectedProcess.included}
                  onToggle={() => updateProcess({ id: liveSelectedProcess.id, data: { included: !liveSelectedProcess.included } })}
                  activeColor="text-emerald-400"
                  activeBg="bg-emerald-500/10 border-emerald-500/30"
                />
              </div>

              {/* Assigned Users */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide">
                  <Users className="w-3.5 h-3.5" />
                  Assigned Users
                  {assigneesSaving && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {assignees.map(u => (
                    <span key={u.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                      <Users className="w-3 h-3 shrink-0" />
                      {u.name}
                      <button
                        onClick={() => removeAssignee(u.id)}
                        className="ml-0.5 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {!showUserPicker && (
                    <button
                      onClick={() => setShowUserPicker(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground/60 hover:border-emerald-500/40 hover:text-emerald-400 transition-all"
                    >
                      + Assign user
                    </button>
                  )}
                </div>
                {showUserPicker && (
                  <div className="rounded-xl border border-border bg-background shadow-lg overflow-hidden">
                    <div className="px-3 py-2 text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wide border-b border-border/50">
                      Select a user
                    </div>
                    {allUsers.filter(u => !assignees.find(a => a.id === u.id)).length === 0 ? (
                      <div className="px-3 py-3 text-xs text-muted-foreground/50 text-center">All users already assigned.</div>
                    ) : allUsers.filter(u => !assignees.find(a => a.id === u.id)).map(u => (
                      <button
                        key={u.id}
                        onClick={() => addAssignee(u)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-secondary/60 transition-colors text-left"
                      >
                        <span className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[10px] font-bold shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-foreground text-xs">{u.name}</span>
                          <span className="block text-muted-foreground/60 text-[10px] truncate">{u.email}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground/40 capitalize shrink-0">{u.role}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setShowUserPicker(false)}
                      className="w-full px-3 py-2 text-xs text-muted-foreground hover:bg-secondary/40 border-t border-border/50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* KPI Performance Panel */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <EditableKpiCard
                  icon={<Award />}
                  label="Industry Benchmark"
                  value={liveSelectedProcess.industryBenchmark ?? ''}
                  color="text-amber-400"
                  bg="bg-amber-400/10 border-amber-400/20"
                  emptyLabel="No benchmark set"
                  onSave={v => handleSave('industryBenchmark', v)}
                />
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
                  icon={<CheckCircle2 />}
                  label="Achievement"
                  value={liveSelectedProcess.achievement ?? ''}
                  color="text-emerald-400"
                  bg="bg-emerald-400/10 border-emerald-400/20"
                  emptyLabel="No data yet"
                  onSave={v => handleSave('achievement', v)}
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
          <Map className="w-16 h-16 mb-4 opacity-20" />
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

// ── Inline edit primitive ────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  className,
  placeholder,
  singleLine,
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

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 30);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

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
        className={cn(
          "w-full bg-secondary/60 border border-primary/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30",
          className
        )}
      />
    ) : (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        rows={3}
        className={cn(
          "w-full resize-y bg-secondary/60 border border-primary/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30",
          className
        )}
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

// ── Editable KPI card ────────────────────────────────────────────────────────

function EditableKpiCard({
  icon, label, value, color, bg, emptyLabel, onSave,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bg: string;
  emptyLabel: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 30);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

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

// ── Editable detail section ──────────────────────────────────────────────────

function EditableDetailSection({
  icon, title, value, onSave, fullWidth, highlight,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  onSave: (v: string) => void;
  fullWidth?: boolean;
  highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 30);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

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

// ── Traffic Light Selector ───────────────────────────────────────────────────

const TRAFFIC_LIGHTS = [
  { value: '',      label: 'Not Set', dot: 'bg-slate-400/40 border-slate-400/30',  text: 'text-slate-400' },
  { value: 'green', label: 'Green',   dot: 'bg-emerald-500 border-emerald-400',     text: 'text-emerald-400' },
  { value: 'amber', label: 'Amber',   dot: 'bg-amber-500 border-amber-400',         text: 'text-amber-400' },
  { value: 'red',   label: 'Red',     dot: 'bg-red-500 border-red-400',             text: 'text-red-400' },
];

function TrafficLightSelector({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const current = TRAFFIC_LIGHTS.find(t => t.value === value) ?? TRAFFIC_LIGHTS[0];
  const next = () => {
    const idx = TRAFFIC_LIGHTS.findIndex(t => t.value === value);
    const nextItem = TRAFFIC_LIGHTS[(idx + 1) % TRAFFIC_LIGHTS.length];
    onSave(nextItem.value);
  };
  return (
    <button
      onClick={next}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:opacity-90",
        current.text,
        current.value === '' ? "bg-secondary/50 border-border/50" : "border-current/30 bg-current/5"
      )}
      title="Click to cycle status"
    >
      <span className={cn("w-2.5 h-2.5 rounded-full border shrink-0", current.dot)} />
      {current.label}
    </button>
  );
}

// ── Boolean Toggle ────────────────────────────────────────────────────────────

function BooleanToggle({
  icon, label, value, onToggle, activeColor, activeBg,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onToggle: () => void;
  activeColor: string;
  activeBg: string;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
        value
          ? cn(activeColor, activeBg)
          : "text-muted-foreground bg-secondary/30 border-border/50 hover:border-border"
      )}
    >
      <span className={cn("w-3.5 h-3.5 shrink-0", value ? activeColor : "text-muted-foreground")}>{icon}</span>
      {label}
      <span className={cn(
        "w-4 h-2 rounded-full transition-colors shrink-0",
        value ? "bg-current" : "bg-border"
      )} />
    </button>
  );
}

function getCatColor(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower.includes('strategy')) return '#60a5fa';
  if (lower.includes('fundraising')) return '#34d399';
  if (lower.includes('grant')) return '#a78bfa';
  if (lower.includes('marketing')) return '#fbbf24';
  if (lower.includes('program')) return '#fb7185';
  if (lower.includes('finance')) return '#22d3ee';
  if (lower.includes('hr') || lower.includes('talent')) return '#e879f9';
  if (lower.includes('technology') || lower.includes('data')) return '#818cf8';
  return '#94a3b8';
}
