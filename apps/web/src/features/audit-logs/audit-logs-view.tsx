import { useState, useMemo } from 'react';
import { useAuditLogsData } from '@/shared/hooks/use-app-data';
import type { AuditLog } from '@workspace/api-client-react';
import {
  Loader2, FileText, Search, Filter, RefreshCw,
  Plus, Pencil, Trash2, Download, Upload, Cpu, Settings
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const ACTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  create:      { label: 'Create',      color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', icon: <Plus className="w-3 h-3" /> },
  update:      { label: 'Update',      color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',         icon: <Pencil className="w-3 h-3" /> },
  delete:      { label: 'Delete',      color: 'text-red-400 bg-red-400/10 border-red-400/30',             icon: <Trash2 className="w-3 h-3" /> },
  export:      { label: 'Export',      color: 'text-amber-400 bg-amber-400/10 border-amber-400/30',       icon: <Download className="w-3 h-3" /> },
  import:      { label: 'Import',      color: 'text-purple-400 bg-purple-400/10 border-purple-400/30',    icon: <Upload className="w-3 h-3" /> },
  'ai-populate': { label: 'AI Fill',   color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',          icon: <Cpu className="w-3 h-3" /> },
  setting:     { label: 'Setting',     color: 'text-orange-400 bg-orange-400/10 border-orange-400/30',    icon: <Settings className="w-3 h-3" /> },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, color: 'text-muted-foreground bg-secondary border-border', icon: null };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wider", meta.color)}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function formatDate(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return ts; }
}

export function AuditLogsView() {
  const { data: logs, isLoading, refetch, isFetching } = useAuditLogsData(500);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');

  const filtered = useMemo(() => {
    if (!logs) return [];
    return (logs as AuditLog[]).filter((log: AuditLog) => {
      const matchesAction = filterAction === 'all' || log.action === filterAction;
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        (log.entityName ?? '').toLowerCase().includes(q) ||
        (log.description ?? '').toLowerCase().includes(q) ||
        (log.fieldChanged ?? '').toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.entityType.toLowerCase().includes(q);
      return matchesAction && matchesSearch;
    });
  }, [logs, search, filterAction]);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* Header */}
      <div className="flex-none p-5 border-b border-border bg-card flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Audit &amp; Logs
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            All changes made to processes and settings are recorded here.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-accent border border-border rounded-lg text-sm text-muted-foreground transition-colors"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex-none px-5 py-3 border-b border-border bg-card/50 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search logs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-56"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none"
          >
            <option value="all">All Actions</option>
            {Object.keys(ACTION_META).map(a => (
              <option key={a} value={a}>{ACTION_META[a].label}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <FileText className="w-12 h-12 opacity-20" />
          <p className="text-base">{logs?.length === 0 ? 'No audit logs yet. Changes will appear here.' : 'No logs match your filters.'}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr>
                <th title="Timestamp" className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-44">Timestamp</th>
                <th title="Action" className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Action</th>
                <th title="Entity Type" className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">Type</th>
                <th title="Description" className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
                <th title="Field Changed" className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">Field</th>
                <th title="User" className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">User</th>
              </tr>
            </thead>
            <tbody>
              {(filtered as AuditLog[]).map((log: AuditLog, i: number) => (
                <tr
                  key={log.id}
                  className={cn(
                    "border-b border-border/50 hover:bg-secondary/30 transition-colors",
                    i % 2 === 0 ? "" : "bg-secondary/10"
                  )}
                >
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {formatDate(log.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={log.action} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                    {log.entityType}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground/80 max-w-xs">
                    <div className="truncate" title={log.description ?? log.entityName ?? ''}>
                      {log.description ?? log.entityName ?? '—'}
                    </div>
                    {log.oldValue && log.newValue && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <span className="truncate max-w-[100px] line-through opacity-60" title={log.oldValue}>{log.oldValue}</span>
                        <span>→</span>
                        <span className="truncate max-w-[100px] text-foreground/70" title={log.newValue}>{log.newValue}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {log.fieldChanged ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {log.user}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
