import { useState, useMemo } from 'react';
import { EditableCell } from './editable-cell';
import { useProcessesData, useCategoriesData } from '@/hooks/use-app-data';
import { Search, Filter, Loader2 } from 'lucide-react';
import { cn, getCategoryColorClass } from '@/lib/utils';

export function ProcessTable() {
  const { data: processes, isLoading, error } = useProcessesData();
  const { data: categories } = useCategoriesData();
  
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

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

  return (
    <div className="h-full flex flex-col bg-background relative overflow-hidden">
      
      {/* Table Toolbar */}
      <div className="flex-none p-4 md:p-6 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card z-20">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Process Matrix</h2>
          <p className="text-sm text-muted-foreground mt-1">Inline editing enabled. Click any cell to update.</p>
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
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
          >
            <option value="All">All Categories</option>
            {categories?.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Scroll Area */}
      <div className="flex-1 overflow-auto bg-card">
        <table className="spreadsheet-table">
          <thead>
            <tr>
              <th className="w-16 text-center">#</th>
              <th className="w-48">Category</th>
              <th className="w-64">Process Name</th>
              <th className="w-48">AI Agent</th>
              <th className="min-w-[200px]">Purpose</th>
              <th className="min-w-[200px]">Inputs</th>
              <th className="min-w-[200px]">Outputs</th>
              <th className="min-w-[150px]">Human-in-the-loop</th>
              <th className="min-w-[150px]">KPI</th>
              <th className="min-w-[200px]">Value Impact</th>
            </tr>
          </thead>
          <tbody>
            {filteredProcesses.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted-foreground bg-background">
                  No processes found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredProcesses.map((process) => (
                <tr key={process.id}>
                  <td className="align-middle p-3 text-center text-muted-foreground font-mono text-xs">
                    {process.number}
                  </td>
                  <td className="align-middle p-3">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-semibold border inline-block whitespace-nowrap",
                      getCategoryColorClass(process.category)
                    )}>
                      {process.category}
                    </span>
                  </td>
                  <td><EditableCell processId={process.id} field="processName" initialValue={process.processName} /></td>
                  <td><EditableCell processId={process.id} field="aiAgent" initialValue={process.aiAgent} /></td>
                  <td><EditableCell processId={process.id} field="purpose" initialValue={process.purpose} multiline /></td>
                  <td><EditableCell processId={process.id} field="inputs" initialValue={process.inputs} multiline /></td>
                  <td><EditableCell processId={process.id} field="outputs" initialValue={process.outputs} multiline /></td>
                  <td><EditableCell processId={process.id} field="humanInTheLoop" initialValue={process.humanInTheLoop} multiline /></td>
                  <td><EditableCell processId={process.id} field="kpi" initialValue={process.kpi} multiline /></td>
                  <td><EditableCell processId={process.id} field="estimatedValueImpact" initialValue={process.estimatedValueImpact} multiline /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Footer Status */}
      <div className="flex-none p-3 border-t border-border bg-sidebar flex justify-between items-center text-xs text-muted-foreground">
        <span>Showing {filteredProcesses.length} of {processes?.length || 0} processes</span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          System Online
        </span>
      </div>
    </div>
  );
}
