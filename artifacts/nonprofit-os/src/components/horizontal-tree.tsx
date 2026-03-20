import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProcessesData, useCategoriesData } from '@/hooks/use-app-data';
import { ChevronRight, Cpu, Target, ArrowRightLeft, Users, Activity, TrendingUp, Loader2, Workflow } from 'lucide-react';
import { cn, getCategoryColorClass } from '@/lib/utils';
import type { Process } from '@workspace/api-client-react';

export function HorizontalTree() {
  const { data: processes, isLoading } = useProcessesData();
  const { data: categories } = useCategoriesData();
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
      <div className="flex-none w-80 border-r border-border bg-sidebar flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-border bg-sidebar/50">
          <h2 className="text-xl font-display font-bold text-foreground">Architecture</h2>
          <p className="text-sm text-muted-foreground mt-1">Select a category to expand</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {categories?.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setSelectedProcess(null); // reset next level
                }}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all duration-200 group flex items-center justify-between",
                  isActive 
                    ? "bg-primary/10 border-primary/30 shadow-md" 
                    : "bg-card border-transparent hover:border-border hover:bg-secondary/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-8 rounded-full", getCategoryColorClass(cat).split(' ')[0].replace('text-', 'bg-'))} />
                  <span className={cn(
                    "font-medium line-clamp-2",
                    isActive ? "text-primary-foreground" : "text-foreground"
                  )}>{cat}</span>
                </div>
                <ChevronRight className={cn(
                  "w-5 h-5 transition-transform",
                  isActive ? "text-primary translate-x-1" : "text-muted-foreground group-hover:translate-x-1"
                )} />
              </button>
            )
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
            className="flex-none w-[360px] border-r border-border bg-card flex flex-col h-full shrink-0 shadow-2xl z-10"
          >
             <div className="p-6 border-b border-border bg-card/50 flex items-center gap-3">
               <Workflow className="w-5 h-5 text-muted-foreground" />
               <h3 className="text-lg font-display font-semibold text-foreground line-clamp-1" title={selectedCategory}>
                 {selectedCategory}
               </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
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
                      <div>
                        <div className="text-xs font-mono text-muted-foreground mb-1">PRO-{process.number.toString().padStart(3, '0')}</div>
                        <h4 className={cn(
                          "font-medium text-sm leading-snug",
                          isActive ? "text-primary-foreground" : "text-foreground"
                        )}>{process.processName || process.processDescription}</h4>
                      </div>
                      <ChevronRight className={cn(
                        "w-4 h-4 shrink-0 mt-1 transition-transform",
                        isActive ? "text-primary translate-x-1" : "text-muted-foreground group-hover:translate-x-1"
                      )} />
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level 3: Process Detail Card */}
      <AnimatePresence>
        {selectedProcess && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
            className="flex-1 min-w-[500px] max-w-[800px] h-full bg-background overflow-y-auto shrink-0 z-20 shadow-2xl relative"
          >
            <div className="max-w-3xl mx-auto p-8 space-y-8">
              
              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                   <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold border tracking-wide uppercase",
                      getCategoryColorClass(selectedProcess.category)
                    )}>
                      {selectedProcess.category}
                    </span>
                    <span className="text-sm font-mono text-muted-foreground">ID: {selectedProcess.number}</span>
                </div>
                <h1 className="text-3xl font-display font-bold text-foreground leading-tight">
                  {selectedProcess.processName || selectedProcess.processDescription}
                </h1>
                {selectedProcess.processName && (
                  <p className="text-base text-muted-foreground mt-2 leading-relaxed">{selectedProcess.processDescription}</p>
                )}
              </div>

              {/* Grid Content */}
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

      {/* Empty State placeholder if nothing selected */}
      {!selectedCategory && (
        <div className="flex-1 h-full flex flex-col items-center justify-center text-muted-foreground bg-background/50">
          <Workflow className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg">Select a category to begin exploring</p>
        </div>
      )}
    </div>
  );
}

function DetailSection({ icon, title, content, fullWidth, highlight }: { icon: React.ReactNode, title: string, content: string, fullWidth?: boolean, highlight?: boolean }) {
  if (!content) return null;
  return (
    <div className={cn(
      "space-y-2",
      fullWidth && "col-span-1 md:col-span-2",
      highlight && "p-5 bg-primary/5 border border-primary/20 rounded-xl"
    )}>
      <div className="flex items-center gap-2 text-muted-foreground font-semibold text-sm tracking-wide uppercase">
        <span className={cn("w-4 h-4", highlight && "text-primary")}>{icon}</span>
        <span className={highlight ? "text-primary" : ""}>{title}</span>
      </div>
      <p className={cn(
        "text-foreground/90 leading-relaxed text-sm",
        highlight && "text-foreground font-medium"
      )}>{content}</p>
    </div>
  )
}
