import { useState, useEffect, useCallback } from 'react';
import { Search, Check, Loader2, Save, Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

interface Process {
  id: number;
  processName: string;
  category: string;
}

interface ProcessTagSelectorProps {
  entityType: 'ai-agents' | 'workflows';
  entityId: number;
}

export function ProcessTagSelector({ entityType, entityId }: ProcessTagSelectorProps) {
  const { fetchHeaders } = useAuth();

  const [allProcesses, setAllProcesses] = useState<Process[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const isDirty = (() => {
    if (selectedIds.size !== savedIds.size) return true;
    for (const id of selectedIds) if (!savedIds.has(id)) return true;
    return false;
  })();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [allR, taggedR] = await Promise.all([
        fetch(`${API}/processes`, { headers: fetchHeaders() }),
        fetch(`${API}/${entityType}/${entityId}/processes`, { headers: fetchHeaders() }),
      ]);
      if (allR.ok) {
        const data = await allR.json();
        const list: Process[] = (Array.isArray(data) ? data : (data.processes ?? data.data ?? []))
          .map((p: any) => ({ id: p.id, processName: p.processName ?? p.process_name, category: p.category ?? '' }))
          .sort((a: Process, b: Process) => a.category.localeCompare(b.category) || a.processName.localeCompare(b.processName));
        setAllProcesses(list);
      }
      if (taggedR.ok) {
        const tagged = await taggedR.json();
        const ids = new Set<number>((tagged as any[]).map((p: any) => p.id));
        setSelectedIds(new Set(ids));
        setSavedIds(new Set(ids));
      }
    } catch {}
    finally { setLoading(false); }
  }, [entityType, entityId, fetchHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/${entityType}/${entityId}/processes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ processIds: Array.from(selectedIds) }),
      });
      if (r.ok) setSavedIds(new Set(selectedIds));
    } catch {}
    finally { setSaving(false); }
  };

  const filtered = search.trim()
    ? allProcesses.filter(p =>
        p.processName.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())
      )
    : allProcesses;

  // Group by category
  const grouped = filtered.reduce<Record<string, Process[]>>((acc, p) => {
    const cat = p.category || 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const selectedCount = selectedIds.size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading processes…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/40 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 bg-secondary rounded-lg px-3 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search processes…"
            className="bg-transparent text-sm focus:outline-none flex-1 min-w-0"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1 flex-shrink-0">
            <Tag className="w-3 h-3" />
            {selectedCount} tagged
          </div>
        )}

        <button
          onClick={save}
          disabled={saving || !isDirty}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0",
            isDirty
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-secondary text-muted-foreground cursor-not-allowed",
          )}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {/* Process list */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Tag className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">{search ? 'No matching processes' : 'No processes found'}</p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, processes]) => (
            <div key={category}>
              <div className="px-4 py-2 bg-muted/30 border-y border-border sticky top-0 z-10">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {category}
                </span>
                <span className="ml-2 text-[10px] text-muted-foreground/60">
                  {processes.filter(p => selectedIds.has(p.id)).length}/{processes.length} tagged
                </span>
              </div>
              {processes.map(process => {
                const checked = selectedIds.has(process.id);
                return (
                  <button
                    key={process.id}
                    onClick={() => toggle(process.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-border/40 hover:bg-secondary/50",
                      checked && "bg-primary/5"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors",
                      checked
                        ? "bg-primary border-primary"
                        : "border-border bg-background"
                    )}>
                      {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className={cn(
                      "text-sm leading-snug",
                      checked ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {process.processName}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Unsaved changes footer */}
      {isDirty && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-amber-500/30 bg-amber-500/5 flex items-center justify-between">
          <span className="text-xs text-amber-600 dark:text-amber-400">You have unsaved changes</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set(savedIds))}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Discard
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
