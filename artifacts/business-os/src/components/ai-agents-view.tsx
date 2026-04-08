import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Plus, Trash2, Play, Clock, Link2, FileText, ChevronDown, ChevronRight,
  Upload, X, RefreshCw, Check, AlertCircle, Loader2, Cpu, Zap, Calendar,
  ToggleLeft, ToggleRight, Edit2, Save, Hash, Wrench, GitBranch, ArrowLeft,
  Shield, Search, Share2, Globe, Server, Webhook, ArrowRight, Star,
  FlaskConical, Tag, Eye, EyeOff, Key, ExternalLink, Plug, User,
} from "lucide-react";
import { ProcessTagSelector } from "@/components/process-tag-selector";
import { useFavourites, OPEN_FAVOURITE_EVENT } from "@/contexts/FavouritesContext";
import { cn, copyToClipboard } from "@/lib/utils";
import { dispatchCreditsRefresh } from "@/hooks/use-credits";
import { useUser } from "@/contexts/UserContext";
import { ShareModal } from "./share-modal";

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type RunMode = 'adhoc' | 'scheduled' | 'trigger';
type AgentType = 'internal' | 'external';
type ExternalProvider = 'openai' | 'anthropic' | 'azure-openai' | 'custom';

interface ExternalAgentConfig {
  provider: ExternalProvider;
  apiKey: string;
  endpoint?: string;
  model: string;
  deploymentName?: string;
}

interface Agent {
  id: number;
  agentNumber: number;
  name: string;
  description: string;
  instructions: string;
  runMode: RunMode;
  trigger: string;
  tools: string;
  outputDestType?: string | null;
  outputDestId?: number | null;
  agentType?: AgentType;
  externalConfig?: string;
  createdAt: string;
  updatedAt: string;
  urlCount?: number;
  fileCount?: number;
  scheduleCount?: number;
  createdBy?: number;
}

const EXTERNAL_PROVIDERS: { value: ExternalProvider; label: string; hint: string }[] = [
  { value: 'openai',       label: 'OpenAI',            hint: 'GPT-4o, GPT-4 Turbo, o1, etc.' },
  { value: 'anthropic',    label: 'Anthropic',          hint: 'Claude 3.5 Sonnet, Opus, Haiku' },
  { value: 'azure-openai', label: 'Azure OpenAI',       hint: 'Azure-hosted OpenAI deployment' },
  { value: 'custom',       label: 'Custom / Other',     hint: 'Any OpenAI-compatible endpoint' },
];

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
  weekDays: string | null;
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
interface UserMeta { id: number; name: string; email: string; role?: string; }

type PickerMode = 'fields' | 'processes';

function InstructionsEditor({
  value, onChange, processFields, workflows = [], rows = 8, placeholder, hint, fetchHeaders,
}: {
  value: string;
  onChange: (v: string) => void;
  processFields: ProcessField[];
  workflows?: WorkflowMeta[];
  rows?: number;
  placeholder?: string;
  hint?: string;
  fetchHeaders?: () => Record<string, string>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [pickerFilter, setPickerFilter] = useState("");
  const [pickerMode, setPickerMode] = useState<PickerMode>('fields');
  const [processList, setProcessList] = useState<ProcessMeta[]>([]);
  const [userList, setUserList] = useState<UserMeta[]>([]);
  const slashIndexRef = useRef<number>(-1);

  const loadUsers = async () => {
    if (userList.length > 0) return;
    try {
      const headers = fetchHeaders ? fetchHeaders() : {};
      const r = await fetch(`${API}/users`, { headers });
      if (r.ok) setUserList(await r.json());
    } catch {}
  };

  const openPicker = (ta: HTMLTextAreaElement) => {
    slashIndexRef.current = ta.selectionStart;
    const rect = ta.getBoundingClientRect();
    setPickerPos({ top: rect.bottom + 4, left: rect.left });
    setPickerFilter("");
    setPickerMode('fields');
    loadUsers();
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
  const filteredUsers = userList.filter(u =>
    u.name.toLowerCase().includes(pickerFilter) || u.email.toLowerCase().includes(pickerFilter)
  );

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder ?? `Write the agent's instructions here.\nType / to insert a reference (process, category, AI agent, target, achievement, traffic light, portfolio, or workflow)...`}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary font-mono"
      />
      <div className="flex items-center gap-2 mt-1">
        <Cpu className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{hint ?? <>Type <kbd className="px-1 py-0.5 bg-secondary rounded text-xs font-mono">/</kbd> to insert: process, category, AI agent, target, achievement, traffic light, portfolio, or workflow</>}</span>
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
                {filteredUsers.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/30 border-t border-border">Users</div>
                    {filteredUsers.map(u => (
                      <button
                        key={u.id}
                        onMouseDown={e => { e.preventDefault(); insertRaw(`@${u.name}`); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent text-sm transition-colors"
                      >
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-3 h-3 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{u.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">@{u.name}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
                {filteredFields.length === 0 && filteredWorkflows.length === 0 && filteredUsers.length === 0 && (
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

// ── Connector type → icon/label ────────────────────────────────────────────────
const CONNECTOR_META: Record<string, { icon: React.ReactNode; color: string }> = {
  zapier:   { icon: <span className="font-black text-[10px] leading-none">Z</span>,   color: "bg-[#FF4A00]" },
  api:      { icon: <Globe className="w-3 h-3" />,   color: "bg-indigo-500" },
  mcp:      { icon: <Server className="w-3 h-3" />,  color: "bg-violet-600" },
  salesforce: { icon: <span className="font-black text-[10px]">SF</span>, color: "bg-[#00A1E0]" },
};

// ── Tools Picker ──────────────────────────────────────────────────────────────

function ToolsPicker({ tools, onChange }: { tools: string[]; onChange: (t: string[]) => void }) {
  const { fetchHeaders } = useUser();
  const [custom, setCustom] = useState("");
  const [connectors, setConnectors] = useState<Array<{ id: number; type: string; name: string; status: string }>>([]);

  useEffect(() => {
    fetch(`${API}/connector-configs`, { headers: fetchHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setConnectors(data.filter((c: any) => c.status === 'connected')))
      .catch(() => setConnectors([]));
  }, []);

  const toggle = (t: string) => {
    onChange(tools.includes(t) ? tools.filter(x => x !== t) : [...tools, t]);
  };

  const addCustom = () => {
    const trimmed = custom.trim();
    if (trimmed && !tools.includes(trimmed)) onChange([...tools, trimmed]);
    setCustom("");
  };

  // All known tool keys (built-in + connector-based)
  const connectorToolKeys = connectors.map(c => `connector:${c.id}:${c.name}`);
  const allKnownKeys = [...TOOL_OPTIONS, ...connectorToolKeys];
  const customTools = tools.filter(t => !allKnownKeys.includes(t));

  return (
    <div className="space-y-4">
      {/* ── Built-in Tools ── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Built-in Tools</p>
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
      </div>

      {/* ── Connected Services ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Connected Services</p>
          {connectors.length === 0 && (
            <span className="text-[11px] text-muted-foreground/60 italic">No connectors connected yet</span>
          )}
        </div>
        {connectors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {connectors.map(c => {
              const key = `connector:${c.id}:${c.name}`;
              const meta = CONNECTOR_META[c.type] ?? { icon: <Webhook className="w-3 h-3" />, color: "bg-slate-500" };
              const selected = tools.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggle(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-all",
                    selected
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  <span className={cn("w-4 h-4 rounded flex items-center justify-center text-white shrink-0", meta.color)}>
                    {meta.icon}
                  </span>
                  {selected && <Check className="w-3 h-3" />}
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
        {connectors.length === 0 && (
          <p className="text-xs text-muted-foreground/60 bg-secondary/40 rounded-lg px-3 py-2">
            Configure connectors (Zapier, APIs, MCP Servers) in the Connectors section to make them available as agent tools.
          </p>
        )}
      </div>

      {/* ── Custom tools ── */}
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

      {/* ── Add custom ── */}
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addCustom()}
          placeholder="Add custom tool name…"
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
  const { fetchHeaders } = useUser();
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
    const r = await fetch(`${API}/ai-agents/${agentId}/logs`, { headers: fetchHeaders() });
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
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const run = useCallback(async () => {
    setRunning(true);
    setOutput("");
    setError("");
    try {
      const res = await fetch(`${API}/ai-agents/${agentId}/run`, { method: "POST", headers: fetchHeaders() });
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
      dispatchCreditsRefresh();
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

// ── Test Panel ────────────────────────────────────────────────────────────────

interface Evaluation {
  criterion: string;
  description: string;
  rating: number;
  notes: string;
}

function ratingColor(r: number) {
  if (r >= 4) return "text-green-400 bg-green-500/10 border-green-500/30";
  if (r >= 3) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-red-400 bg-red-500/10 border-red-500/30";
}

function TestPanel({ agentId }: { agentId: number }) {
  const { fetchHeaders } = useUser();
  const [testScenario, setTestScenario] = useState("");
  const [running, setRunning] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const runTest = async () => {
    setRunning(true);
    setEvaluating(false);
    setOutput("");
    setError("");
    setEvaluations([]);
    try {
      const res = await fetch(`${API}/ai-agents/${agentId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify({ testScenario }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n").filter(l => l.startsWith("data:"))) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.content) setOutput(o => o + data.content);
            if (data.evaluating) { setRunning(false); setEvaluating(true); }
            if (data.error) setError(data.error);
            if (data.done) {
              setEvaluating(false);
              if (Array.isArray(data.evaluations)) setEvaluations(data.evaluations);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "Test failed");
    } finally {
      setRunning(false);
      setEvaluating(false);
      dispatchCreditsRefresh();
    }
  };

  const updateEval = (idx: number, field: keyof Evaluation, value: any) => {
    setEvaluations(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  return (
    <div className="space-y-6">
      {/* Test scenario */}
      <div className="space-y-2">
        <label className="block text-sm font-medium flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          Test Scenario
          <span className="text-xs font-normal text-muted-foreground">— optional context or input for this test run</span>
        </label>
        <textarea
          value={testScenario}
          onChange={e => setTestScenario(e.target.value)}
          rows={3}
          placeholder="Describe a specific scenario to test, e.g. 'Quarterly review for Q1 2026' or 'Process #5 has a KPI of 85%…' Leave blank to run with the agent's default instructions."
          className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Run Test button */}
      <button
        onClick={runTest}
        disabled={running || evaluating}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" />Running test…</>
        ) : evaluating ? (
          <><Loader2 className="w-4 h-4 animate-spin" />Evaluating output…</>
        ) : (
          <><FlaskConical className="w-4 h-4" />Run Test</>
        )}
      </button>

      {/* Output */}
      {(output || running) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Test Output</div>
            {running && <span className="text-xs text-primary animate-pulse">Streaming…</span>}
          </div>
          <div
            ref={outputRef}
            className="bg-[#0f1117] border border-border rounded-xl p-4 font-mono text-xs leading-relaxed min-h-[120px] max-h-80 overflow-y-auto whitespace-pre-wrap text-slate-300"
          >
            {running && !output && <span className="text-slate-500 animate-pulse">Executing agent…</span>}
            {output && <span>{output}</span>}
            {error && <span className="text-red-400">{'\n'}{error}</span>}
          </div>
          {evaluating && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              AI is generating evaluation rubric…
            </div>
          )}
        </div>
      )}

      {/* Evaluation rubric */}
      {evaluations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Evaluation</div>
            <span className="text-xs text-muted-foreground/60">— suggested by AI, edit as needed</span>
          </div>
          <div className="space-y-3">
            {evaluations.map((ev, i) => (
              <div key={i} className={cn("rounded-xl border p-4 space-y-3", ratingColor(ev.rating))}>
                {/* Header: criterion + rating */}
                <div className="flex items-start gap-3">
                  <input
                    value={ev.criterion}
                    onChange={e => updateEval(i, 'criterion', e.target.value)}
                    className="flex-1 text-sm font-semibold bg-transparent border-b border-current/20 focus:border-current focus:outline-none pb-0.5 placeholder:text-current/40"
                    placeholder="Criterion name"
                  />
                  {/* Star rating */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button
                        key={s}
                        onClick={() => updateEval(i, 'rating', s)}
                        className="transition-transform hover:scale-110"
                        title={`Rate ${s}/5`}
                      >
                        <Star className={cn("w-4 h-4", s <= ev.rating ? "fill-current text-current" : "text-current/25")} />
                      </button>
                    ))}
                    <span className="ml-1.5 text-xs font-bold tabular-nums">{ev.rating}/5</span>
                  </div>
                </div>
                {/* Description */}
                <p className="text-xs opacity-70">{ev.description}</p>
                {/* Notes */}
                <textarea
                  value={ev.notes}
                  onChange={e => updateEval(i, 'notes', e.target.value)}
                  rows={2}
                  placeholder="Add notes…"
                  className="w-full bg-white/10 dark:bg-black/10 border border-current/20 rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-current/40 placeholder:opacity-40"
                />
              </div>
            ))}
          </div>
          {/* Overall score */}
          {evaluations.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/40 border border-border">
              <div className="text-xs font-medium text-muted-foreground">Overall score</div>
              <div className="font-bold text-sm">
                {(evaluations.reduce((s, e) => s + e.rating, 0) / evaluations.length).toFixed(1)} / 5
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => {
                  const avg = evaluations.reduce((acc, e) => acc + e.rating, 0) / evaluations.length;
                  return <Star key={s} className={cn("w-3.5 h-3.5", s <= Math.round(avg) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Schedule Panel ────────────────────────────────────────────────────────────

const WEEK_DAY_OPTIONS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

function formatWeekDays(weekDays: string | null): string {
  if (!weekDays) return "";
  const days = weekDays.split(",");
  if (days.length === 7) return "Every day";
  if (days.length === 5 && !days.includes("sat") && !days.includes("sun")) return "Weekdays";
  if (days.length === 2 && days.includes("sat") && days.includes("sun")) return "Weekends";
  return days.map(d => WEEK_DAY_OPTIONS.find(o => o.key === d)?.label ?? d).join(", ");
}

function SchedulePanel({ agentId }: { agentId: number }) {
  const { fetchHeaders } = useUser();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedType, setSchedType] = useState("once");
  const [schedAt, setSchedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [selectedDays, setSelectedDays] = useState<string[]>(
    WEEK_DAY_OPTIONS.map(d => d.key)
  );
  const [adding, setAdding] = useState(false);

  const fetchSchedules = useCallback(async () => {
    const r = await fetch(`${API}/ai-agents/${agentId}/schedules`, { headers: fetchHeaders() });
    if (r.ok) setSchedules(await r.json());
  }, [agentId]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const toggleDay = (key: string) => {
    setSelectedDays(prev =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter(d => d !== key) : prev // keep at least one
        : [...prev, key]
    );
  };

  const addSchedule = async () => {
    if (schedType === "weekly" && selectedDays.length === 0) return;
    setAdding(true);
    try {
      const body: Record<string, string> = { scheduleType: schedType, scheduledAt: schedAt };
      if (schedType === "weekly") {
        // Preserve Mon-Sun order
        body.weekDays = WEEK_DAY_OPTIONS.filter(d => selectedDays.includes(d.key)).map(d => d.key).join(",");
      }
      const r = await fetch(`${API}/ai-agents/${agentId}/schedules`, {
        method: "POST",
        headers: { ...fetchHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) fetchSchedules();
    } finally { setAdding(false); }
  };

  const toggleSchedule = async (sched: Schedule) => {
    await fetch(`${API}/ai-agents/${agentId}/schedules/${sched.id}`, {
      method: "PUT",
      headers: { ...fetchHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !sched.isActive }),
    });
    fetchSchedules();
  };

  const deleteSchedule = async (id: number) => {
    await fetch(`${API}/ai-agents/${agentId}/schedules/${id}`, { method: "DELETE", headers: fetchHeaders() });
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

        {/* Day picker — only for Weekly */}
        {schedType === "weekly" && (
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Run on days</label>
            <div className="flex gap-1.5 flex-wrap">
              {WEEK_DAY_OPTIONS.map(day => {
                const active = selectedDays.includes(day.key);
                return (
                  <button
                    key={day.key}
                    onClick={() => toggleDay(day.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors select-none",
                      active
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {selectedDays.length === 7 ? "Every day" : selectedDays.length === 0 ? "Select at least one day" : formatWeekDays(WEEK_DAY_OPTIONS.filter(d => selectedDays.includes(d.key)).map(d => d.key).join(","))}
            </p>
          </div>
        )}

        <button
          onClick={addSchedule}
          disabled={adding || (schedType === "weekly" && selectedDays.length === 0)}
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
              {s.scheduleType === "weekly" && s.weekDays && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {WEEK_DAY_OPTIONS.map(day => {
                    const on = s.weekDays!.split(",").includes(day.key);
                    return (
                      <span
                        key={day.key}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                          on
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "bg-secondary/50 border-border text-muted-foreground/40"
                        )}
                      >
                        {day.label}
                      </span>
                    );
                  })}
                </div>
              )}
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
  const { fetchHeaders } = useUser();
  const [urls, setUrls] = useState<KnowledgeUrl[]>([]);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newUrlLabel, setNewUrlLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchKnowledge = useCallback(async () => {
    const [ur, fr] = await Promise.all([
      fetch(`${API}/ai-agents/${agentId}/knowledge/urls`, { headers: fetchHeaders() }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/ai-agents/${agentId}/knowledge/files`, { headers: fetchHeaders() }).then(r => r.ok ? r.json() : []),
    ]);
    setUrls(ur); setFiles(fr);
  }, [agentId]);

  useEffect(() => { fetchKnowledge(); }, [fetchKnowledge]);

  const addUrl = async () => {
    if (!newUrl.trim()) return;
    await fetch(`${API}/ai-agents/${agentId}/knowledge/urls`, {
      method: "POST",
      headers: { ...fetchHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ url: newUrl.trim(), label: newUrlLabel.trim() }),
    });
    setNewUrl(""); setNewUrlLabel("");
    fetchKnowledge();
  };

  const removeUrl = async (id: number) => {
    await fetch(`${API}/ai-agents/${agentId}/knowledge/urls/${id}`, { method: "DELETE", headers: fetchHeaders() });
    fetchKnowledge();
  };

  const uploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files;
    if (!f?.length) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(f).forEach(file => fd.append("files", file));
    const { 'Content-Type': _ct, ...uploadHeaders } = fetchHeaders();
    await fetch(`${API}/ai-agents/${agentId}/knowledge/files`, { method: "POST", headers: uploadHeaders, body: fd });
    setUploading(false);
    fetchKnowledge();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = async (id: number) => {
    await fetch(`${API}/ai-agents/${agentId}/knowledge/files/${id}`, { method: "DELETE", headers: fetchHeaders() });
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
  const { fetchHeaders } = useUser();
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
    fetch(`${API}/ai-agents/${agentId}/permissions`, { headers: fetchHeaders() }).then(r => r.json()).then(p => {
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
      fetch(`${API}/processes`, { headers: fetchHeaders() }).then(r => r.json()).then(setProcessList);
  }, [scope]);

  const saveModules = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/ai-agents/${agentId}/permissions/modules`, {
        method: 'PUT', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: AP_MODULES.map(m => ({ module: m.key, hasAccess: moduleAccess[m.key] ?? true })) }),
      });
      setSaveMsg('Saved ✓'); setTimeout(() => setSaveMsg(''), 2000);
    } finally { setSaving(false); }
  };

  const saveDataAccess = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/ai-agents/${agentId}/permissions/categories`, {
        method: 'PUT', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: scope === 'categories' ? Array.from(selectedCategories) : [] }),
      });
      await fetch(`${API}/ai-agents/${agentId}/permissions/processes`, {
        method: 'PUT', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
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
        method: 'PUT', headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
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

type Tab = "overview" | "knowledge" | "schedule" | "run" | "test" | "permissions" | "shares" | "processes";

export function AiAgentsView() {
  const { fetchHeaders, currentUser } = useUser();
  const { isFavourite, toggleFavourite } = useFavourites();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [runKey, setRunKey] = useState(0);
  const [processFields, setProcessFields] = useState<ProcessField[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editRunMode, setEditRunMode] = useState<RunMode>("adhoc");
  const [editTrigger, setEditTrigger] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editTools, setEditTools] = useState<string[]>([]);
  const [editNumber, setEditNumber] = useState(0);
  const [editingId, setEditingId] = useState(false);
  const [editOutputDestType, setEditOutputDestType] = useState<string>("");
  const [editOutputDestId, setEditOutputDestId] = useState<number | null>(null);
  const [editAgentType, setEditAgentType] = useState<AgentType>("internal");
  const [editExternalConfig, setEditExternalConfig] = useState<ExternalAgentConfig>({ provider: 'openai', apiKey: '', model: '', endpoint: '' });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selectedAgent = agents.find(a => a.id === selectedId) ?? null;

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const r = await fetch(`${API}/ai-agents`, { headers: fetchHeaders() });
      const data = await r.json();
      if (Array.isArray(data)) setAgents(data);
    } catch {}
    finally { setLoadingAgents(false); }
  }, [fetchHeaders]);

  const fetchFields = useCallback(async () => {
    const r = await fetch(`${API}/ai-agents/meta/process-fields`, { headers: fetchHeaders() });
    if (r.ok) setProcessFields(await r.json());
  }, [fetchHeaders]);

  const fetchWorkflows = useCallback(async () => {
    const r = await fetch(`${API}/workflows`, { headers: fetchHeaders() });
    if (r.ok) setWorkflows(await r.json());
  }, [fetchHeaders]);

  useEffect(() => { fetchAgents(); fetchFields(); fetchWorkflows(); }, [fetchAgents, fetchFields, fetchWorkflows]);

  useEffect(() => {
    function handleOpen(e: Event) {
      const d = (e as CustomEvent).detail;
      if (d?.type === 'agent') { setSelectedId(d.id); setTab("overview"); }
    }
    window.addEventListener(OPEN_FAVOURITE_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_FAVOURITE_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      setEditName(selectedAgent.name);
      setEditDesc(selectedAgent.description);
      setEditRunMode((selectedAgent.runMode ?? "adhoc") as RunMode);
      setEditTrigger(selectedAgent.trigger ?? "");
      setEditInstructions(selectedAgent.instructions);
      setEditNumber(selectedAgent.agentNumber);
      setEditOutputDestType(selectedAgent.outputDestType ?? "");
      setEditOutputDestId(selectedAgent.outputDestId ?? null);
      setEditAgentType((selectedAgent.agentType ?? 'internal') as AgentType);
      try {
        const cfg = JSON.parse(selectedAgent.externalConfig || '{}');
        setEditExternalConfig({ provider: 'openai', apiKey: '', model: '', endpoint: '', ...cfg });
      } catch { setEditExternalConfig({ provider: 'openai', apiKey: '', model: '', endpoint: '' }); }
      setShowApiKey(false);
      try { setEditTools(JSON.parse(selectedAgent.tools)); } catch { setEditTools([]); }
      setDirty(false);
    }
  }, [selectedAgent?.id]);

  const createAgent = async () => {
    const r = await fetch(`${API}/ai-agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
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
    await fetch(`${API}/ai-agents/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (selectedId === id) setSelectedId(null);
    fetchAgents();
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await fetch(`${API}/ai-agents/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify({
          agentNumber: editNumber,
          name: editName,
          description: editDesc,
          runMode: editRunMode,
          trigger: editTrigger,
          instructions: editInstructions,
          tools: JSON.stringify(editTools),
          outputDestType: editOutputDestType || null,
          outputDestId: editOutputDestId || null,
          agentType: editAgentType,
          externalConfig: JSON.stringify(editExternalConfig),
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
    { id: "processes", label: "Processes", icon: <Tag className="w-3.5 h-3.5" /> },
    { id: "knowledge", label: "Knowledge", icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "schedule", label: "Schedule", icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: "run", label: "Run", icon: <Play className="w-3.5 h-3.5" /> },
    { id: "test", label: "Test", icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { id: "permissions", label: "Permissions", icon: <Shield className="w-3.5 h-3.5" /> },
    { id: "shares", label: "Share", icon: <Share2 className="w-3.5 h-3.5" /> },
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">#{agent.agentNumber}</span>
                  <span className="text-sm font-medium truncate">{agent.name}</span>
                  {agent.agentType === 'external' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      <ExternalLink className="w-2.5 h-2.5" />EXTERNAL
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{agent.description || "No description"}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  {(() => {
                    const mode = agent.runMode ?? 'adhoc';
                    const cfg = {
                      adhoc:     { label: 'Ad-hoc',    cls: 'text-blue-500   bg-blue-500/10   border-blue-500/20',   icon: <Cpu className="inline w-3 h-3 mr-0.5" /> },
                      scheduled: { label: 'Scheduled',  cls: 'text-violet-500 bg-violet-500/10 border-violet-500/20', icon: <Calendar className="inline w-3 h-3 mr-0.5" /> },
                      trigger:   { label: 'Trigger',    cls: 'text-amber-500  bg-amber-500/10  border-amber-500/20',  icon: <Zap className="inline w-3 h-3 mr-0.5" /> },
                    }[mode as RunMode] ?? { label: mode, cls: '', icon: null };
                    return (
                      <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium", cfg.cls)}>
                        {cfg.icon}{cfg.label}
                      </span>
                    );
                  })()}
                  {(agent.urlCount ?? 0) > 0 && <span><Link2 className="inline w-3 h-3 mr-0.5" />{agent.urlCount}</span>}
                  {(agent.fileCount ?? 0) > 0 && <span><FileText className="inline w-3 h-3 mr-0.5" />{agent.fileCount}</span>}
                  {(agent.scheduleCount ?? 0) > 0 && <span><Clock className="inline w-3 h-3 mr-0.5" />{agent.scheduleCount}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); toggleFavourite('agent', agent.id, agent.name); }}
                  className={cn("text-muted-foreground hover:text-amber-400 transition-colors flex-shrink-0", isFavourite('agent', agent.id) && "opacity-100 text-amber-400")}
                  title={isFavourite('agent', agent.id) ? "Remove from favourites" : "Add to favourites"}
                >
                  <Star className={cn("w-4 h-4", isFavourite('agent', agent.id) && "fill-amber-400")} />
                </button>
                <button
                  onClick={e => deleteAgent(agent.id, e)}
                  className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
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

          {/* Tab content — Processes tab is full-height, all others scroll */}
          {tab === "processes" ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              <ProcessTagSelector entityType="ai-agents" entityId={selectedAgent.id} />
            </div>
          ) : null}
          <div className={cn("flex-1 overflow-y-auto p-6", tab === "processes" && "hidden")}>
            {tab === "overview" && (
              <div className="max-w-2xl space-y-6">

                {/* Run Mode selector */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    Run Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      {
                        value: 'adhoc' as RunMode,
                        label: 'Ad-hoc',
                        sublabel: 'Manually triggered via the Run tab',
                        icon: <Cpu className="w-4 h-4" />,
                        color: 'blue',
                      },
                      {
                        value: 'scheduled' as RunMode,
                        label: 'Scheduled',
                        sublabel: 'Runs automatically on a set schedule',
                        icon: <Calendar className="w-4 h-4" />,
                        color: 'violet',
                      },
                      {
                        value: 'trigger' as RunMode,
                        label: 'Trigger',
                        sublabel: 'Activated by a form, workflow, or event',
                        icon: <Zap className="w-4 h-4" />,
                        color: 'amber',
                      },
                    ] as const).map(opt => {
                      const active = editRunMode === opt.value;
                      const colorMap = {
                        blue:   { border: 'border-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-500',   ring: 'ring-blue-500/30' },
                        violet: { border: 'border-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-500', ring: 'ring-violet-500/30' },
                        amber:  { border: 'border-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-500',  ring: 'ring-amber-500/30' },
                      };
                      const c = colorMap[opt.color];
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => { setEditRunMode(opt.value); setDirty(true); }}
                          className={cn(
                            "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                            active
                              ? `${c.border} ${c.bg} ring-2 ${c.ring}`
                              : "border-border bg-secondary/30 hover:border-border/70 hover:bg-secondary/50"
                          )}
                        >
                          <div className={cn("flex items-center gap-1.5 font-medium text-sm", active ? c.text : "text-foreground")}>
                            {opt.icon}
                            {opt.label}
                          </div>
                          <p className="text-xs text-muted-foreground leading-tight">{opt.sublabel}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Contextual hints per mode */}
                  {editRunMode === 'adhoc' && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
                      Switch to the <strong>Run</strong> tab to execute this agent on demand.
                    </div>
                  )}
                  {editRunMode === 'scheduled' && (
                    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-600 dark:text-violet-400 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      Configure run times in the <strong>Schedule</strong> tab.
                    </div>
                  )}
                </div>

                {/* Trigger condition — only shown when run mode is "trigger" */}
                {editRunMode === 'trigger' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Trigger Condition
                  </label>
                  <div className="relative rounded-xl border border-amber-500/30 bg-amber-500/5 p-0.5">
                    <InstructionsEditor
                      value={editTrigger}
                      onChange={markDirty(setEditTrigger)}
                      processFields={processFields}
                      workflows={workflows}
                      fetchHeaders={fetchHeaders}
                      rows={3}
                      placeholder={`Describe when this agent should run…\nType / to insert a reference (e.g. "When {{process:Employee Review}} status changes to Complete")`}
                      hint="Describe the condition or event that triggers this agent. Type / to insert a dynamic reference."
                    />
                  </div>
                </div>
                )}

                {/* Agent Type — Internal vs External */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium flex items-center gap-2">
                    <Plug className="w-4 h-4 text-primary" />Agent Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'internal' as AgentType, label: 'Internal', sublabel: 'Uses built-in AI (Claude)', icon: <Bot className="w-4 h-4" />, color: 'primary' },
                      { value: 'external' as AgentType, label: 'External', sublabel: 'Connect to your own AI API', icon: <ExternalLink className="w-4 h-4" />, color: 'emerald' },
                    ]).map(opt => {
                      const active = editAgentType === opt.value;
                      const cls = opt.color === 'emerald'
                        ? { border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500', ring: 'ring-emerald-500/30' }
                        : { border: 'border-primary', bg: 'bg-primary/10', text: 'text-primary', ring: 'ring-primary/30' };
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => { setEditAgentType(opt.value); setDirty(true); }}
                          className={cn("flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                            active ? `${cls.border} ${cls.bg} ring-2 ${cls.ring}` : "border-border bg-secondary/30 hover:border-border/70 hover:bg-secondary/50"
                          )}
                        >
                          <div className={cn("flex items-center gap-1.5 font-medium text-sm", active ? cls.text : "text-foreground")}>
                            {opt.icon}{opt.label}
                          </div>
                          <p className="text-xs text-muted-foreground leading-tight">{opt.sublabel}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* External configuration panel */}
                  {editAgentType === 'external' && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        <Key className="w-4 h-4" />External API Configuration
                      </div>

                      {/* Provider */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-medium">Provider</label>
                        <div className="grid grid-cols-2 gap-2">
                          {EXTERNAL_PROVIDERS.map(p => (
                            <button key={p.value} type="button"
                              onClick={() => { setEditExternalConfig(c => ({ ...c, provider: p.value })); setDirty(true); }}
                              className={cn("flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all text-xs",
                                editExternalConfig.provider === p.value
                                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "border-border bg-background hover:bg-secondary/60 text-muted-foreground"
                              )}
                            >
                              <span className="font-medium">{p.label}</span>
                              <span className="text-[10px] text-muted-foreground">{p.hint}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* API Key */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-medium">API Key</label>
                        <div className="relative">
                          <input
                            type={showApiKey ? "text" : "password"}
                            value={editExternalConfig.apiKey}
                            onChange={e => { setEditExternalConfig(c => ({ ...c, apiKey: e.target.value })); setDirty(true); }}
                            placeholder="sk-..."
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-mono"
                          />
                          <button type="button" onClick={() => setShowApiKey(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Stored encrypted. Never shared or logged.</p>
                      </div>

                      {/* Model */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-medium">Model</label>
                        <input
                          type="text"
                          value={editExternalConfig.model}
                          onChange={e => { setEditExternalConfig(c => ({ ...c, model: e.target.value })); setDirty(true); }}
                          placeholder={
                            editExternalConfig.provider === 'openai' ? 'gpt-4o' :
                            editExternalConfig.provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' :
                            editExternalConfig.provider === 'azure-openai' ? 'gpt-4o' : 'model-name'
                          }
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-mono"
                        />
                      </div>

                      {/* Endpoint URL — required for Azure and Custom */}
                      {(editExternalConfig.provider === 'azure-openai' || editExternalConfig.provider === 'custom') && (
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground font-medium">
                            {editExternalConfig.provider === 'azure-openai' ? 'Azure Endpoint URL' : 'API Base URL'}
                            <span className="text-red-400 ml-1">*</span>
                          </label>
                          <input
                            type="url"
                            value={editExternalConfig.endpoint ?? ''}
                            onChange={e => { setEditExternalConfig(c => ({ ...c, endpoint: e.target.value })); setDirty(true); }}
                            placeholder={
                              editExternalConfig.provider === 'azure-openai'
                                ? 'https://my-resource.openai.azure.com'
                                : 'https://api.example.com'
                            }
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-mono"
                          />
                          {editExternalConfig.provider === 'azure-openai' && (
                            <div className="space-y-1.5">
                              <label className="text-xs text-muted-foreground font-medium">Deployment Name</label>
                              <input
                                type="text"
                                value={editExternalConfig.deploymentName ?? ''}
                                onChange={e => { setEditExternalConfig(c => ({ ...c, deploymentName: e.target.value })); setDirty(true); }}
                                placeholder="my-gpt4o-deployment"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 font-mono"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status hint */}
                      <div className={cn("rounded-lg px-3 py-2 text-xs flex items-center gap-2",
                        editExternalConfig.apiKey
                          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}>
                        {editExternalConfig.apiKey
                          ? <><Check className="w-3.5 h-3.5 flex-shrink-0" />API key configured — this agent will call your external endpoint when run.</>
                          : <><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />Enter an API key to enable running this external agent.</>
                        }
                      </div>
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-primary" />Instructions
                  </label>
                  <InstructionsEditor
                    value={editInstructions}
                    onChange={markDirty(setEditInstructions)}
                    processFields={processFields}
                    workflows={workflows}
                    fetchHeaders={fetchHeaders}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-primary" />Tools
                  </label>
                  <ToolsPicker tools={editTools} onChange={markDirty(setEditTools)} />
                </div>

                {/* Output Destination */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-emerald-500" />
                    Output Destination
                    <span className="text-xs font-normal text-muted-foreground">— where this agent sends its results</span>
                  </label>
                  <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {(["none", "workflow", "form"] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => { markDirty(setEditOutputDestType)(t === "none" ? "" : t); if (t === "none") markDirty(setEditOutputDestId)(null); }}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                            (editOutputDestType === t || (t === "none" && !editOutputDestType))
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-border bg-background hover:bg-secondary/60 text-muted-foreground"
                          )}
                        >
                          {t === "none" && <X className="w-3.5 h-3.5" />}
                          {t === "workflow" && <GitBranch className="w-3.5 h-3.5" />}
                          {t === "form" && <FileText className="w-3.5 h-3.5" />}
                          {t === "none" ? "None" : t === "workflow" ? "Workflow" : "Form"}
                        </button>
                      ))}
                    </div>
                    {editOutputDestType === "workflow" && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">Select Workflow</label>
                        <select
                          value={editOutputDestId ?? ""}
                          onChange={e => markDirty(setEditOutputDestId)(e.target.value ? Number(e.target.value) : null)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">— choose a workflow —</option>
                          {workflows.map(w => (
                            <option key={w.id} value={w.id}>#{w.workflowNumber} {w.name}</option>
                          ))}
                        </select>
                        {editOutputDestId && (
                          <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-500" />
                            Agent output will trigger the selected workflow
                          </p>
                        )}
                      </div>
                    )}
                    {editOutputDestType === "form" && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">
                          Route output to a form — the agent's result will be pre-filled into the form
                        </label>
                        <p className="text-xs text-muted-foreground italic">
                          Form-based output routing is configured from the Forms view.
                        </p>
                      </div>
                    )}
                    {!editOutputDestType && (
                      <p className="text-xs text-muted-foreground">
                        Agent output is returned inline. Select a destination to route results automatically.
                      </p>
                    )}
                  </div>
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
            {tab === "test" && (
              <div className="max-w-2xl">
                <TestPanel agentId={selectedAgent.id} />
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
            {tab === "shares" && (
              <div className="max-w-lg space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Share2 className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Agent Sharing</h3>
                  <span className="text-xs text-muted-foreground">— control who can view, edit, or delete this agent</span>
                </div>
                <AgentSharesPanel
                  agentId={selectedAgent.id}
                  isOwner={selectedAgent.createdBy === currentUser?.id || currentUser?.role === 'admin'}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentSharesPanel({ agentId, isOwner }: { agentId: number; isOwner: boolean }) {
  return (
    <ShareModal
      resourceType="agent"
      resourceId={agentId}
      resourceName=""
      isOwner={isOwner}
      privilegeMode="privilege"
      privilegeOptions={['view', 'edit', 'delete']}
      onClose={() => {}}
      onSaved={() => {}}
      inline
    />
  );
}
