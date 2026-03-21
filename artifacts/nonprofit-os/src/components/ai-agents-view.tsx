import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Plus, Trash2, Play, Clock, Link2, FileText, ChevronDown, ChevronRight,
  Upload, X, RefreshCw, Check, AlertCircle, Loader2, Cpu, Zap, Calendar,
  ToggleLeft, ToggleRight, Edit2, Save, Hash, Wrench, GitBranch, ArrowLeft,
  Shield, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: number;
  agentNumber: number;
  name: string;
  description: string;
  instructions: string;
  tools: string;
  createdAt: string;
  updatedAt: string;
  urlCount?: number;
  fileCount?: number;
  scheduleCount?: number;
}

interface KnowledgeUrl {
  id: number;
  agentId: number;
  url: string;
  label: string;
  createdAt: string;
}

interface KnowledgeFile {
  id: number;
  agentId: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

interface Schedule {
  id: number;
  agentId: number;
  scheduleType: string;
  scheduledAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface RunLog {
  id: number;
  agentId: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  output: string;
  error: string | null;
}

interface ProcessField {
  key: string;
  label: string;
}

const TOOL_OPTIONS = [
  "Database Query", "Web Search", "File Analysis", "Process Analytics",
  "Report Generation", "Email Draft", "Data Export", "Sentiment Analysis",
  "Trend Detection", "Anomaly Detection",
];

const SCHEDULE_TYPES = [
  { value: "once", label: "One-time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function statusBadge(status: string) {
  if (status === "success") return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-500/15 text-green-400"><Check className="w-3 h-3" />Success</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-500/15 text-red-400"><AlertCircle className="w-3 h-3" />Error</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-500/15 text-yellow-400"><Loader2 className="w-3 h-3 animate-spin" />Running</span>;
}

// ── Instructions Editor with "/" field picker ────────────────────────────────

interface WorkflowMeta { id: number; workflowNumber: number; name: string; description: string; }
interface ProcessMeta { id: number; processName: string; category: string; }

type PickerMode = 'fields' | 'processes';

function InstructionsEditor({
  value, onChange, processFields, workflows = [],
}: {
  value: string;
  onChange: (v: string) => void;
  processFields: ProcessField[];
  workflows?: WorkflowMeta[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [pickerFilter, setPickerFilter] = useState("");
  const [pickerMode, setPickerMode] = useState<PickerMode>('fields');
  const [processList, setProcessList] = useState<ProcessMeta[]>([]);
  const slashIndexRef = useRef<number>(-1);

  const openPicker = (ta: HTMLTextAreaElement) => {
    slashIndexRef.current = ta.selectionStart;
    const rect = ta.getBoundingClientRect();
    setPickerPos({ top: rect.bottom + 4, left: rect.left });
    setPickerFilter("");
    setPickerMode('fields');
    setShowPicker(true);
  };

  const closePicker = () => { setShowPicker(false); setPickerMode('fields'); };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPicker) { if (e.key === "Escape") { closePicker(); e.preventDefault(); } return; }
    if (e.key === "/" && textareaRef.current) openPicker(textareaRef.current);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    if (showPicker && pickerMode === 'fields') {
      const afterSlash = e.target.value.slice(slashIndexRef.current + 1, e.target.selectionStart);
      if (afterSlash.includes(" ") || afterSlash.includes("\n")) closePicker();
      else setPickerFilter(afterSlash.toLowerCase());
    }
  };

  const insertRaw = (token: string) => {
    const ta = textareaRef.current; if (!ta) return;
    const before = value.slice(0, slashIndexRef.current);
    const after = value.slice(ta.selectionStart);
    onChange(`${before}${token}${after}`);
    closePicker();
    setTimeout(() => { ta.focus(); }, 0);
  };

  const loadProcesses = async () => {
    if (processList.length > 0) return;
    try {
      const r = await fetch(`${API}/processes`);
      if (r.ok) setProcessList(await r.json());
    } catch {}
  };

  const handleFieldSelect = (field: ProcessField) => {
    if ((field as any).hasSublist) {
      loadProcesses();
      setPickerFilter("");
      setPickerMode('processes');
    } else {
      insertRaw(`{{${field.key}}}`);
    }
  };

  const filteredFields = processFields.filter(f =>
    f.key.toLowerCase().includes(pickerFilter) || f.label.toLowerCase().includes(pickerFilter)
  );
  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(pickerFilter) || `wf${w.workflowNumber}`.includes(pickerFilter)
  );
  const filteredProcesses = processList.filter(p =>
    (p.processName || '').toLowerCase().includes(pickerFilter) ||
    (p.category || '').toLowerCase().includes(pickerFilter)
  );

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={8}
        placeholder={`Write the agent's instructions here.\nType / to insert a reference (process, category, AI agent, target, achievement, traffic light, portfolio, or workflow)...`}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary font-mono"
      />
      <div className="flex items-center gap-2 mt-1">
        <Cpu className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Type <kbd className="px-1 py-0.5 bg-secondary rounded text-xs font-mono">/</kbd> to insert: process, category, AI agent, target, achievement, traffic light, portfolio, or workflow</span>
      </div>
      {showPicker && (
        <div className="fixed z-[99] w-80 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden" style={{ top: pickerPos.top, left: pickerPos.left }}>
          {pickerMode === 'fields' ? (
            <>
              <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Insert reference
              </div>
              <div className="max-h-72 overflow-y-auto">
                {filteredFields.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/30">Fields</div>
                    {filteredFields.map(f => (
                      <button
                        key={f.key}
                        onMouseDown={e => { e.preventDefault(); handleFieldSelect(f); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent text-sm transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <Hash className="w-3.5 h-3.5 mt-0.5 text-primary flex-shrink-0" />
                          <div>
                            <div className="font-medium">{f.label}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {(f as any).hasSublist ? 'Select a process →' : `{{${f.key}}}`}
                            </div>
                          </div>
                        </div>
                        {(f as any).hasSublist && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                      </button>
                    ))}
                  </>
                )}
                {filteredWorkflows.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/30 border-t border-border">Workflows</div>
                    {filteredWorkflows.map(wf => (
                      <button
                        key={wf.id}
                        onMouseDown={e => { e.preventDefault(); insertRaw(`{{workflow:${wf.name}}}`); }}
                        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent text-sm transition-colors"
                      >
                        <GitBranch className="w-3.5 h-3.5 mt-0.5 text-orange-400 flex-shrink-0" />
                        <div>
                          <div className="font-medium">{wf.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{`{{workflow:${wf.name}}}`}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
                {filteredFields.length === 0 && filteredWorkflows.length === 0 && (
                  <div className="px-3 py-3 text-xs text-muted-foreground text-center">No matches</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                <button onMouseDown={e => { e.preventDefault(); setPickerMode('fields'); setPickerFilter(""); }}
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">Select Process</span>
                <input
                  value={pickerFilter}
                  onChange={e => setPickerFilter(e.target.value.toLowerCase())}
                  onMouseDown={e => e.stopPropagation()}
                  placeholder="Filter…"
                  className="w-24 text-xs bg-background border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {processList.length === 0 ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                ) : filteredProcesses.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground text-center">No matches</div>
                ) : filteredProcesses.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={e => { e.preventDefault(); insertRaw(`{{process:${p.processName}}}`); }}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent text-sm transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 mt-0.5 text-primary flex-shrink-0" />
                    <div>
                      <div className="font-medium">{p.processName || '(unnamed)'}</div>
                      <div className="text-xs text-muted-foreground">{p.category}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tools Picker ──────────────────────────────────────────────────────────────

function ToolsPicker({ tools, onChange }: { tools: string[]; onChange: (t: string[]) => void }) {
  const [custom, setCustom] = useState("");

  const toggle = (t: string) => {
    onChange(tools.includes(t) ? tools.filter(x => x !== t) : [...tools, t]);
  };

  const addCustom = () => {
    const trimmed = custom.trim();
    if (trimmed && !tools.includes(trimmed)) {
      onChange([...tools, trimmed]);
    }
    setCustom("");
  };

  const customTools = tools.filter(t => !TOOL_OPTIONS.includes(t));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TOOL_OPTIONS.map(t => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-full border transition-all",
              tools.includes(t)
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            {tools.includes(t) && <Check className="inline w-3 h-3 mr-1" />}{t}
          </button>
        ))}
      </div>
      {customTools.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customTools.map(t => (
            <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-primary/15 border border-primary/40 text-primary">
              {t}
              <button onClick={() => onChange(tools.filter(x => x !== t))} className="ml-1 hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addCustom()}
          placeholder="Add custom tool…"
          className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={addCustom} className="px-3 py-1.5 bg-secondary border border-border rounded-lg text-sm hover:bg-accent transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}

// ── Run Panel ─────────────────────────────────────────────────────────────────

type OutputFormat = "plain" | "json" | "xml" | "html";

function highlightJson(json: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(json).replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span class="json-key">${match}</span>`;
        return `<span class="json-str">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span class="json-bool">${match}</span>`;
      if (/null/.test(match)) return `<span class="json-null">${match}</span>`;
      return `<span class="json-num">${match}</span>`;
    }
  );
}

function formatOutput(raw: string, fmt: OutputFormat): string {
  if (!raw) return "";
  if (fmt === "json") {
    // Strategy 1: extract from triple-backtick code blocks
    const blockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (blockMatch) {
      try { return JSON.stringify(JSON.parse(blockMatch[1].trim()), null, 2); } catch {}
    }
    // Strategy 2: try the whole trimmed string
    try { return JSON.stringify(JSON.parse(raw.trim()), null, 2); } catch {}
    // Strategy 3: find outermost { } or [ ] block
    const firstBrace = raw.indexOf('{');
    const firstBracket = raw.indexOf('[');
    const jsonStart = [firstBrace, firstBracket].filter(i => i !== -1).reduce((a, b) => Math.min(a, b), Infinity);
    if (jsonStart < Infinity) {
      const lastBrace = raw.lastIndexOf('}');
      const lastBracket = raw.lastIndexOf(']');
      const jsonEnd = Math.max(lastBrace, lastBracket);
      if (jsonEnd > jsonStart) {
        try { return JSON.stringify(JSON.parse(raw.slice(jsonStart, jsonEnd + 1)), null, 2); } catch {}
      }
    }
    return raw;
  }
  if (fmt === "xml") {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = raw.trim().split("\n");
    return `<output>\n${lines.map(l => `  <line>${esc(l)}</line>`).join("\n")}\n</output>`;
  }
  if (fmt === "html") {
    // Extract from ```html ... ``` code block if present
    const blockMatch = raw.match(/```(?:html)?\s*([\s\S]*?)```/);
    if (blockMatch) return blockMatch[1].trim();
    return raw;
  }
  return raw;
}

function RunPanel({ agentId, runKey }: { agentId: number; runKey: number }) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("plain");
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const lastRunKey = useRef(0);

  const fetchLogs = useCallback(async () => {
    const r = await fetch(`${API}/ai-agents/${agentId}/logs`);
    if (r.ok) setLogs(await r.json());
  }, [agentId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const copyOutput = async () => {
    const text = formatOutput(output, outputFormat);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const run = useCallback(async () => {
    setRunning(true);
    setOutput("");
    setError("");
    try {
      const res = await fetch(`${API}/ai-agents/${agentId}/run`, { method: "POST" });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter(l => l.startsWith("data:"));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.content) setOutput(p => p + data.content);
            if (data.error) setError(data.error);
          } catch {}
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
      fetchLogs();
    }
  }, [agentId, fetchLogs]);

  // Auto-run when runKey changes (triggered by parent tab click)
  useEffect(() => {
    if (runKey > 0 && runKey !== lastRunKey.current) {
      lastRunKey.current = runKey;
      run();
    }
  }, [runKey, run]);

  const displayedOutput = formatOutput(output, outputFormat);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin text-primary" />Running…</>
            : <><Play className="w-4 h-4 text-primary" />Run Agent</>}
        </h3>
        {!running && (
          <button
            onClick={run}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <RefreshCw className="w-3 h-3" />{output || error ? "Re-run" : "Run"}
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Output</div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-border text-xs">
              {(["plain", "json", "xml", "html"] as OutputFormat[]).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setOutputFormat(fmt)}
                  className={cn(
                    "px-2.5 py-1 font-medium uppercase transition-colors",
                    outputFormat === fmt ? "bg-primary text-primary-foreground" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                  )}
                >
                  {fmt}
                </button>
              ))}
            </div>
            {output && (
              <button
                onClick={copyOutput}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-secondary/30 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                {copied ? <><Check className="w-3 h-3 text-green-500" />Copied</> : <><Link2 className="w-3 h-3" />Copy</>}
              </button>
            )}
          </div>
        </div>
        {outputFormat === "html" ? (
          <div
            ref={outputRef}
            className="border border-border rounded-xl min-h-[120px] max-h-80 overflow-y-auto bg-white"
          >
            {running && !output && (
              <div className="p-4 text-muted-foreground text-xs animate-pulse">Executing agent…</div>
            )}
            {displayedOutput ? (
              <div
                className="p-4 html-output"
                dangerouslySetInnerHTML={{ __html: displayedOutput }}
              />
            ) : null}
            {error && <div className="p-4 text-red-500 text-xs">{error}</div>}
            {!running && !output && !error && (
              <div className="p-4 text-muted-foreground/40 text-xs italic">Starting agent run…</div>
            )}
          </div>
        ) : (
          <div
            ref={outputRef}
            className="bg-[#0f1117] border border-border rounded-xl p-4 font-mono text-xs leading-relaxed min-h-[120px] max-h-80 overflow-y-auto whitespace-pre-wrap text-slate-300"
          >
            {running && !output && <span className="text-slate-500 animate-pulse">Executing agent…</span>}
            {displayedOutput && (
              outputFormat === "json" ? (
                <span dangerouslySetInnerHTML={{ __html: highlightJson(displayedOutput) }} />
              ) : (
                <span>{displayedOutput}</span>
              )
            )}
            {error && <span className="text-red-400">{'\n'}{error}</span>}
            {!running && !output && !error && (
              <span className="text-slate-600 italic">Starting agent run…</span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Run History</div>
          <button onClick={fetchLogs} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <RefreshCw className="w-3 h-3" />Refresh
          </button>
        </div>
        {logs.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 bg-secondary/30 rounded-xl border border-border">
            No previous runs found.
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="bg-secondary/30 border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {statusBadge(log.status)}
                    <span className="text-xs text-muted-foreground">{formatDate(log.startedAt)}</span>
                    {log.completedAt && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}s
                      </span>
                    )}
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", expandedLog === log.id && "rotate-180")} />
                </button>
                {expandedLog === log.id && (
                  <div className="border-t border-border px-4 py-3 font-mono text-xs leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap bg-background/40">
                    {log.status === "error" ? (
                      <span className="text-red-400">{log.error || "Unknown error"}</span>
                    ) : (
                      log.output || <span className="text-muted-foreground italic">No output</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schedule Panel ────────────────────────────────────────────────────────────

function SchedulePanel({ agentId }: { agentId: number }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedType, setSchedType] = useState("once");
  const [schedAt, setSchedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [adding, setAdding] = useState(false);

  const fetchSchedules = useCallback(async () => {
    const r = await fetch(`${API}/ai-agents/${agentId}/schedules`);
    if (r.ok) setSchedules(await r.json());
  }, [agentId]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const addSchedule = async () => {
    setAdding(true);
    try {
      const r = await fetch(`${API}/ai-agents/${agentId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleType: schedType, scheduledAt: schedAt }),
      });
      if (r.ok) fetchSchedules();
    } finally { setAdding(false); }
  };

  const toggleSchedule = async (sched: Schedule) => {
    await fetch(`${API}/ai-agents/${agentId}/schedules/${sched.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !sched.isActive }),
    });
    fetchSchedules();
  };

  const deleteSchedule = async (id: number) => {
    await fetch(`${API}/ai-agents/${agentId}/schedules/${id}`, { method: "DELETE" });
    fetchSchedules();
  };

  return (
    <div className="space-y-4">
      <div className="bg-secondary/30 border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />Add Schedule</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Schedule Type</label>
            <select
              value={schedType}
              onChange={e => setSchedType(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {SCHEDULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {schedType === "once" ? "Run At" : "First Run At"}
            </label>
            <input
              type="datetime-local"
              value={schedAt}
              onChange={e => setSchedAt(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <button
          onClick={addSchedule}
          disabled={adding}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Schedule
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Schedules</div>
        {schedules.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 bg-secondary/30 rounded-xl border border-border">
            No schedules configured.
          </div>
        ) : schedules.map(s => (
          <div key={s.id} className="flex items-start justify-between bg-secondary/30 border border-border rounded-xl px-4 py-3 gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                {SCHEDULE_TYPES.find(t => t.value === s.scheduleType)?.label ?? s.scheduleType}
                {!s.isActive && <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">Paused</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <div>First run: {formatDate(s.scheduledAt)}</div>
                {s.nextRunAt && s.isActive && <div>Next run: {formatDate(s.nextRunAt)}</div>}
                {s.lastRunAt && <div>Last run: {formatDate(s.lastRunAt)}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => toggleSchedule(s)}
                title={s.isActive ? "Pause" : "Resume"}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {s.isActive
                  ? <ToggleRight className="w-5 h-5 text-primary" />
                  : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => deleteSchedule(s.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Knowledge Panel ───────────────────────────────────────────────────────────

function KnowledgePanel({ agentId }: { agentId: number }) {
  const [urls, setUrls] = useState<KnowledgeUrl[]>([]);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newUrlLabel, setNewUrlLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchKnowledge = useCallback(async () => {
    const [ur, fr] = await Promise.all([
      fetch(`${API}/ai-agents/${agentId}/knowledge/urls`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/ai-agents/${agentId}/knowledge/files`).then(r => r.ok ? r.json() : []),
    ]);
    setUrls(ur); setFiles(fr);
  }, [agentId]);

  useEffect(() => { fetchKnowledge(); }, [fetchKnowledge]);

  const addUrl = async () => {
    if (!newUrl.trim()) return;
    await fetch(`${API}/ai-agents/${agentId}/knowledge/urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: newUrl.trim(), label: newUrlLabel.trim() }),
    });
    setNewUrl(""); setNewUrlLabel("");
    fetchKnowledge();
  };

  const removeUrl = async (id: number) => {
    await fetch(`${API}/ai-agents/${agentId}/knowledge/urls/${id}`, { method: "DELETE" });
    fetchKnowledge();
  };

  const uploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files;
    if (!f?.length) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(f).forEach(file => fd.append("files", file));
    await fetch(`${API}/ai-agents/${agentId}/knowledge/files`, { method: "POST", body: fd });
    setUploading(false);
    fetchKnowledge();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = async (id: number) => {
    await fetch(`${API}/ai-agents/${agentId}/knowledge/files/${id}`, { method: "DELETE" });
    fetchKnowledge();
  };

  return (
    <div className="space-y-6">
      {/* URLs */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Link2 className="w-4 h-4 text-primary" />Knowledge URLs</h3>
        <div className="flex gap-2">
          <input
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addUrl()}
            placeholder="https://example.com/document"
            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={newUrlLabel}
            onChange={e => setNewUrlLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-36 bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={addUrl} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {urls.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4 bg-secondary/30 rounded-xl border border-border">No URLs added yet.</div>
        ) : (
          <div className="space-y-2">
            {urls.map(u => (
              <div key={u.id} className="flex items-center gap-3 bg-secondary/30 border border-border rounded-xl px-3 py-2">
                <Link2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {u.label && <div className="text-xs font-medium text-foreground">{u.label}</div>}
                  <div className="text-xs text-muted-foreground truncate">{u.url}</div>
                </div>
                <button onClick={() => removeUrl(u.id)} className="text-muted-foreground hover:text-red-400 flex-shrink-0 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Files */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Knowledge Files</h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded-lg text-sm hover:bg-accent transition-colors disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload Files
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={uploadFiles}
            accept=".txt,.md,.csv,.xlsx,.xls,.pdf,.json" />
        </div>
        {files.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4 bg-secondary/30 rounded-xl border border-border">
            No files uploaded. Supports TXT, CSV, XLSX, PDF, JSON, Markdown.
          </div>
        ) : (
          <div className="space-y-2">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-3 bg-secondary/30 border border-border rounded-xl px-3 py-2">
                <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{f.originalName}</div>
                  <div className="text-xs text-muted-foreground">{formatBytes(f.fileSize)} · {formatDate(f.uploadedAt)}</div>
                </div>
                <button onClick={() => removeFile(f.id)} className="text-muted-foreground hover:text-red-400 flex-shrink-0 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

// ── Permission constants ───────────────────────────────────────────────────────

const AP_MODULES = [
  { key: 'table',       label: 'Master Catalogue' },
  { key: 'tree',        label: 'Master Map' },
  { key: 'portfolio',   label: 'Process Catalogue' },
  { key: 'process-map', label: 'Process Map' },
  { key: 'governance',  label: 'Governance' },
  { key: 'workflows',   label: 'Workflows' },
  { key: 'ai-agents',   label: 'AI Agents' },
  { key: 'connectors',  label: 'Connectors' },
  { key: 'dashboards',  label: 'Dashboards' },
  { key: 'reports',     label: 'Reports' },
  { key: 'audit-logs',  label: 'Audit & Logs' },
  { key: 'settings',    label: 'Settings' },
  { key: 'users',       label: 'Admin: Users' },
];

const AP_CATEGORIES = [
  'Strategy & Governance', 'Technology & Data', 'Programs & Services',
  'Finance & Compliance', 'HR & Talent', 'Fundraising & Development',
  'Marketing & Communications', 'Operations & Facilities',
];

const AP_FIELDS: Record<string, { key: string; label: string }[]> = {
  master: [
    { key: 'number', label: 'Number' }, { key: 'category', label: 'Category' },
    { key: 'processName', label: 'Process Name' }, { key: 'processDescription', label: 'Description' },
    { key: 'aiAgent', label: 'AI Agent' }, { key: 'aiAgentActive', label: 'AI Agent Active' },
    { key: 'purpose', label: 'Purpose' }, { key: 'inputs', label: 'Inputs' },
    { key: 'outputs', label: 'Outputs' }, { key: 'humanInTheLoop', label: 'Human in the Loop' },
    { key: 'kpi', label: 'KPI' }, { key: 'estimatedValueImpact', label: 'Value Impact' },
    { key: 'industryBenchmark', label: 'Benchmark' }, { key: 'included', label: 'Included' },
    { key: 'target', label: 'Target' }, { key: 'achievement', label: 'Achievement' },
    { key: 'trafficLight', label: 'Traffic Light' },
  ],
  process: [
    { key: 'number', label: 'Number' }, { key: 'category', label: 'Category' },
    { key: 'processName', label: 'Process Name' }, { key: 'processDescription', label: 'Description' },
    { key: 'aiAgent', label: 'AI Agent' }, { key: 'included', label: 'Included' },
    { key: 'target', label: 'Target' }, { key: 'achievement', label: 'Achievement' },
    { key: 'trafficLight', label: 'Traffic Light' },
  ],
};

function AgentToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors focus:outline-none', checked ? 'bg-primary' : 'bg-muted')}>
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  );
}

type AgentPermTab = 'modules' | 'data-access' | 'fields';

interface ProcessMetaAP { id: number; processName: string; category: string; }

function AgentPermissionsPanel({ agentId }: { agentId: number }) {
  const [permTab, setPermTab] = useState<AgentPermTab>('modules');
  const [moduleAccess, setModuleAccess] = useState<Record<string, boolean>>({});
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<'all' | 'categories' | 'processes'>('all');
  const [processList, setProcessList] = useState<ProcessMetaAP[]>([]);
  const [processAccess, setProcessAccess] = useState<Map<number, boolean>>(new Map());
  const [processSearch, setProcessSearch] = useState('');
  const [fieldPerms, setFieldPerms] = useState<Record<string, { canView: boolean; canEdit: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    fetch(`${API}/ai-agents/${agentId}/permissions`).then(r => r.json()).then(p => {
      const mmap: Record<string, boolean> = Object.fromEntries(AP_MODULES.map(m => [m.key, true]));
      p.modules.forEach((m: any) => { mmap[m.module] = m.hasAccess; });
      setModuleAccess(mmap);
      setSelectedCategories(new Set(p.categories.map((c: any) => c.category)));
      setProcessAccess(new Map(p.processes.map((pr: any) => [pr.processId, pr.canEdit])));
      const allFields = Object.entries(AP_FIELDS).flatMap(([type, fs]) => fs.map(f => ({ type, ...f })));
      const fmap: Record<string, { canView: boolean; canEdit: boolean }> = {};
      allFields.forEach(f => { fmap[`${f.type}:${f.key}`] = { canView: true, canEdit: true }; });
      p.fields.forEach((f: any) => { fmap[`${f.catalogueType}:${f.fieldKey}`] = { canView: f.canView, canEdit: f.canEdit }; });
      setFieldPerms(fmap);
    });
  }, [agentId]);

  useEffect(() => {
    if (scope === 'processes' && processList.length === 0)
      fetch(`${API}/processes`).then(r => r.json()).then(setProcessList);
  }, [scope]);

  const saveModules = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/ai-agents/${agentId}/permissions/modules`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: AP_MODULES.map(m => ({ module: m.key, hasAccess: moduleAccess[m.key] ?? true })) }),
      });
      setSaveMsg('Saved ✓'); setTimeout(() => setSaveMsg(''), 2000);
    } finally { setSaving(false); }
  };

  const saveDataAccess = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/ai-agents/${agentId}/permissions/categories`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: scope === 'categories' ? Array.from(selectedCategories) : [] }),
      });
      await fetch(`${API}/ai-agents/${agentId}/permissions/processes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processes: scope === 'processes' ? Array.from(processAccess.entries()).map(([processId, canEdit]) => ({ processId, canEdit })) : [] }),
      });
      setSaveMsg('Saved ✓'); setTimeout(() => setSaveMsg(''), 2000);
    } finally { setSaving(false); }
  };

  const saveFields = async () => {
    setSaving(true);
    try {
      const allFields = Object.entries(AP_FIELDS).flatMap(([type, fs]) => fs.map(f => ({ type, ...f })));
      const permissions = allFields.map(f => {
        const v = fieldPerms[`${f.type}:${f.key}`] ?? { canView: true, canEdit: true };
        return { catalogueType: f.type, fieldKey: f.key, canView: v.canView, canEdit: v.canEdit };
      });
      await fetch(`${API}/ai-agents/${agentId}/permissions/field-permissions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
      setSaveMsg('Saved ✓'); setTimeout(() => setSaveMsg(''), 2000);
    } finally { setSaving(false); }
  };

  const visProcs = processList.filter(p =>
    !processSearch || p.processName.toLowerCase().includes(processSearch.toLowerCase()) || p.category.toLowerCase().includes(processSearch.toLowerCase())
  );
  const catProcs = (cat: string) => visProcs.filter(p => p.category === cat);

  return (
    <div className="space-y-4">
      {/* Permission subtabs */}
      <div className="flex items-center gap-1">
        {(['modules', 'data-access', 'fields'] as AgentPermTab[]).map(t => (
          <button key={t} onClick={() => setPermTab(t)}
            className={cn('px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize', permTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary')}>
            {t === 'data-access' ? 'Data Access' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {saveMsg && <span className="ml-3 text-xs text-green-400 font-medium">{saveMsg}</span>}
      </div>

      {/* Modules tab */}
      {permTab === 'modules' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setModuleAccess(Object.fromEntries(AP_MODULES.map(m => [m.key, true])))}
              className="text-xs px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 font-medium">All On</button>
            <button onClick={() => setModuleAccess(Object.fromEntries(AP_MODULES.map(m => [m.key, false])))}
              className="text-xs px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground font-medium">All Off</button>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            {AP_MODULES.map(m => (
              <div key={m.key} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors border-b border-border last:border-0">
                <span className="text-sm font-medium">{m.label}</span>
                <AgentToggle checked={moduleAccess[m.key] ?? true} onChange={v => setModuleAccess(a => ({ ...a, [m.key]: v }))} />
              </div>
            ))}
          </div>
          <button onClick={saveModules} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Module Access
          </button>
        </div>
      )}

      {/* Data Access tab */}
      {permTab === 'data-access' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scope</div>
            {(['all', 'categories', 'processes'] as const).map(s => (
              <label key={s} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary/40 cursor-pointer transition-colors">
                <input type="radio" name="agentScope" checked={scope === s} onChange={() => setScope(s)} className="w-3.5 h-3.5 accent-primary" />
                <div>
                  <div className="text-sm font-medium capitalize">{s === 'all' ? 'All processes' : s === 'categories' ? 'Selected categories' : 'Selected processes'}</div>
                  <div className="text-xs text-muted-foreground">{s === 'all' ? 'Full access to all processes' : s === 'categories' ? 'Restrict to chosen categories' : 'Restrict to specific processes'}</div>
                </div>
              </label>
            ))}
          </div>
          {scope === 'categories' && (
            <div className="border border-border rounded-xl overflow-hidden">
              {AP_CATEGORIES.map(cat => (
                <label key={cat} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                  <input type="checkbox" checked={selectedCategories.has(cat)} onChange={() => {
                    setSelectedCategories(s => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
                  }} className="w-3.5 h-3.5 rounded accent-primary" />
                  <span className="text-sm">{cat}</span>
                </label>
              ))}
            </div>
          )}
          {scope === 'processes' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input value={processSearch} onChange={e => setProcessSearch(e.target.value)} placeholder="Search processes…"
                  className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              {AP_CATEGORIES.filter(cat => catProcs(cat).length > 0).map(cat => (
                <div key={cat} className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">{cat}</div>
                  <div className="border border-border rounded-xl overflow-hidden">
                    {catProcs(cat).map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                        <input type="checkbox" checked={processAccess.has(p.id)} onChange={() => {
                          setProcessAccess(m => { const n = new Map(m); if (n.has(p.id)) n.delete(p.id); else n.set(p.id, false); return n; });
                        }} className="w-3.5 h-3.5 rounded accent-primary" />
                        <span className="text-sm flex-1">{p.processName}</span>
                        {processAccess.has(p.id) && (
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input type="checkbox" checked={processAccess.get(p.id) ?? false} onChange={e => {
                              setProcessAccess(m => { const n = new Map(m); n.set(p.id, e.target.checked); return n; });
                            }} className="w-3 h-3 rounded accent-primary" /> Can Edit
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={saveDataAccess} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Data Access
          </button>
        </div>
      )}

      {/* Fields tab */}
      {permTab === 'fields' && (
        <div className="space-y-4">
          {Object.entries(AP_FIELDS).map(([type, fs]) => (
            <div key={type} className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{type === 'master' ? 'Master Catalogue' : 'Process Catalogue'}</div>
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_80px] px-4 py-2 border-b border-border bg-secondary/30">
                  <span className="text-xs font-semibold text-muted-foreground">Field</span>
                  <span className="text-xs font-semibold text-muted-foreground text-center">View</span>
                  <span className="text-xs font-semibold text-muted-foreground text-center">Edit</span>
                </div>
                {fs.map(f => {
                  const key = `${type}:${f.key}`;
                  const v = fieldPerms[key] ?? { canView: true, canEdit: true };
                  return (
                    <div key={f.key} className="grid grid-cols-[1fr_80px_80px] items-center px-4 py-2.5 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                      <span className="text-sm">{f.label}</span>
                      <div className="flex justify-center">
                        <input type="checkbox" checked={v.canView} onChange={e => setFieldPerms(fd => ({ ...fd, [key]: { ...v, canView: e.target.checked, canEdit: e.target.checked ? v.canEdit : false } }))} className="w-3.5 h-3.5 rounded accent-primary" />
                      </div>
                      <div className="flex justify-center">
                        <input type="checkbox" checked={v.canEdit} disabled={!v.canView} onChange={e => setFieldPerms(fd => ({ ...fd, [key]: { ...v, canEdit: e.target.checked } }))} className="w-3.5 h-3.5 rounded accent-primary disabled:opacity-40" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button onClick={saveFields} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Field Permissions
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main AI Agents View ────────────────────────────────────────────────────────

type Tab = "overview" | "knowledge" | "schedule" | "run" | "permissions";

export function AiAgentsView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [runKey, setRunKey] = useState(0);
  const [processFields, setProcessFields] = useState<ProcessField[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editTools, setEditTools] = useState<string[]>([]);
  const [editNumber, setEditNumber] = useState(0);
  const [editingId, setEditingId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selectedAgent = agents.find(a => a.id === selectedId) ?? null;

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const r = await fetch(`${API}/ai-agents`);
      const data = await r.json();
      if (Array.isArray(data)) setAgents(data);
    } catch {}
    finally { setLoadingAgents(false); }
  }, []);

  const fetchFields = useCallback(async () => {
    const r = await fetch(`${API}/ai-agents/meta/process-fields`);
    if (r.ok) setProcessFields(await r.json());
  }, []);

  const fetchWorkflows = useCallback(async () => {
    const r = await fetch(`${API}/workflows`);
    if (r.ok) setWorkflows(await r.json());
  }, []);

  useEffect(() => { fetchAgents(); fetchFields(); fetchWorkflows(); }, [fetchAgents, fetchFields, fetchWorkflows]);

  useEffect(() => {
    if (selectedAgent) {
      setEditName(selectedAgent.name);
      setEditDesc(selectedAgent.description);
      setEditInstructions(selectedAgent.instructions);
      setEditNumber(selectedAgent.agentNumber);
      try { setEditTools(JSON.parse(selectedAgent.tools)); } catch { setEditTools([]); }
      setDirty(false);
    }
  }, [selectedAgent?.id]);

  const createAgent = async () => {
    const r = await fetch(`${API}/ai-agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (r.ok) {
      const agent: Agent = await r.json();
      await fetchAgents();
      setSelectedId(agent.id);
      setTab("overview");
    }
  };

  const deleteAgent = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    await fetch(`${API}/ai-agents/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    fetchAgents();
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await fetch(`${API}/ai-agents/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentNumber: editNumber,
          name: editName,
          description: editDesc,
          instructions: editInstructions,
          tools: JSON.stringify(editTools),
        }),
      });
      await fetchAgents();
      setDirty(false);
    } finally { setSaving(false); }
  };

  const handleTabClick = useCallback(async (tabId: Tab) => {
    if (tabId === "run") {
      if (dirty) await save();
      setTab("run");
      setRunKey(k => k + 1);
    } else {
      setTab(tabId);
    }
  }, [dirty, save]);

  const markDirty = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (v: T) => {
    setter(v); setDirty(true);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: "knowledge", label: "Knowledge", icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "schedule", label: "Schedule", icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "run", label: "Run", icon: <Play className="w-3.5 h-3.5" /> },
    { id: "permissions", label: "Permissions", icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex h-full bg-background">

      {/* Left panel: Agent list */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col bg-sidebar/40">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">AI Agents</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{agents.length}</span>
          </div>
          <button
            onClick={createAgent}
            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loadingAgents ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : agents.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bot className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No agents yet.</p>
              <button onClick={createAgent} className="mt-2 text-xs text-primary hover:underline">Create your first agent</button>
            </div>
          ) : agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => { setSelectedId(agent.id); setTab("overview"); }}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && (setSelectedId(agent.id), setTab("overview"))}
              className={cn(
                "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 group cursor-pointer",
                selectedId === agent.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-mono">#{agent.agentNumber}</span>
                  <span className="text-sm font-medium truncate">{agent.name}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{agent.description || "No description"}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {(agent.urlCount ?? 0) > 0 && <span><Link2 className="inline w-3 h-3 mr-0.5" />{agent.urlCount}</span>}
                  {(agent.fileCount ?? 0) > 0 && <span><FileText className="inline w-3 h-3 mr-0.5" />{agent.fileCount}</span>}
                  {(agent.scheduleCount ?? 0) > 0 && <span><Clock className="inline w-3 h-3 mr-0.5" />{agent.scheduleCount}</span>}
                </div>
              </div>
              <button
                onClick={e => deleteAgent(agent.id, e)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      {!selectedAgent ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Bot className="w-8 h-8 text-primary/60" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-1">AI Agents</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create intelligent agents with custom instructions, knowledge bases, and automated schedules to automate your nonprofit operations.
            </p>
          </div>
          <button
            onClick={createAgent}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />Create First Agent
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex-none px-6 py-4 border-b border-border bg-card/60 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                {editingId ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground font-mono">#</span>
                    <input
                      type="number"
                      value={editNumber}
                      onChange={e => { setEditNumber(Number(e.target.value)); setDirty(true); }}
                      onBlur={() => setEditingId(false)}
                      autoFocus
                      className="w-16 text-xs font-mono bg-background border border-primary rounded px-1.5 py-0.5 focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingId(true)}
                    className="flex items-center gap-0.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors group"
                    title="Click to edit agent number"
                  >
                    <span>#{editNumber}</span>
                    <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                <input
                  value={editName}
                  onChange={e => markDirty(setEditName)(e.target.value)}
                  className="text-lg font-bold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors flex-1 min-w-0"
                  placeholder="Agent name…"
                />
              </div>
              <input
                value={editDesc}
                onChange={e => markDirty(setEditDesc)(e.target.value)}
                className="text-sm text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-full"
                placeholder="Add a description…"
              />
            </div>
            {dirty && (
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm flex-shrink-0"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex-none flex items-center gap-1 px-6 pt-3 border-b border-border bg-card/30">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => handleTabClick(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg transition-colors border-b-2 -mb-px",
                  tab === t.id
                    ? "text-primary border-primary font-medium"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
                )}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === "overview" && (
              <div className="max-w-2xl space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-primary" />Instructions
                  </label>
                  <InstructionsEditor
                    value={editInstructions}
                    onChange={markDirty(setEditInstructions)}
                    processFields={processFields}
                    workflows={workflows}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-primary" />Tools
                  </label>
                  <ToolsPicker tools={editTools} onChange={markDirty(setEditTools)} />
                </div>
                <div className="bg-secondary/30 border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
                  <div>Created: {formatDate(selectedAgent.createdAt)}</div>
                  <div>Last updated: {formatDate(selectedAgent.updatedAt)}</div>
                </div>
              </div>
            )}
            {tab === "knowledge" && (
              <div className="max-w-2xl">
                <KnowledgePanel agentId={selectedAgent.id} />
              </div>
            )}
            {tab === "schedule" && (
              <div className="max-w-2xl">
                <SchedulePanel agentId={selectedAgent.id} />
              </div>
            )}
            {tab === "run" && (
              <div className="max-w-2xl">
                <RunPanel agentId={selectedAgent.id} runKey={runKey} />
              </div>
            )}
            {tab === "permissions" && (
              <div className="max-w-2xl space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Agent Permissions</h3>
                  <span className="text-xs text-muted-foreground">— control what this agent can access and read/write</span>
                </div>
                <AgentPermissionsPanel agentId={selectedAgent.id} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
