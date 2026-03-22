import { useState, useEffect, useCallback } from 'react';
import {
  Cloud, CheckCircle2, AlertCircle, Link2, X, Eye, EyeOff,
  ExternalLink, Zap, Database, RefreshCw, Plus, Trash2,
  Server, Globe, Key, Webhook, Settings, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ConnectorConfig {
  id: number;
  type: string;
  name: string;
  config: Record<string, string>;
  status: 'disconnected' | 'connected' | 'error' | 'testing';
}

// ── Connector definitions ─────────────────────────────────────────────────────
const CONNECTOR_DEFS = [
  {
    type: 'n8n',
    label: 'n8n',
    tagline: 'Self-hosted workflow automation',
    desc: 'Trigger n8n workflows from AI agents and processes. Connect to your self-hosted or cloud n8n instance via webhooks.',
    icon: <span className="font-black text-xl text-white">n8n</span>,
    color: 'bg-[#EA4B71]',
    docsUrl: 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://your-n8n.com/webhook/...', type: 'url', required: true },
      { key: 'apiKey', label: 'n8n API Key (optional)', placeholder: 'n8n_api_...', type: 'password', required: false },
      { key: 'instanceUrl', label: 'n8n Instance URL (optional)', placeholder: 'https://your-n8n.com', type: 'url', required: false },
    ],
  },
  {
    type: 'zapier',
    label: 'Zapier',
    tagline: 'Connect 7,000+ apps via automation',
    desc: 'Trigger Zapier Zaps from AI agents and workflows using Webhook triggers.',
    icon: <span className="font-black text-xl text-white">Z</span>,
    color: 'bg-[#FF4A00]',
    docsUrl: 'https://zapier.com/help/doc/how-to-use-webhooks-in-zapier',
    fields: [
      { key: 'webhookUrl', label: 'Zapier Webhook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/...', type: 'url', required: true },
    ],
  },
  {
    type: 'api',
    label: 'Custom API',
    tagline: 'Connect any REST API',
    desc: 'Connect to any third-party REST API with flexible authentication support — Bearer token, API key, or Basic auth.',
    icon: <Globe className="w-6 h-6 text-white" />,
    color: 'bg-indigo-500',
    docsUrl: null,
    fields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.example.com/v1', type: 'url', required: true },
      { key: 'authType', label: 'Auth Type', placeholder: '', type: 'select', required: false,
        options: [
          { value: 'none', label: 'None' },
          { value: 'bearer', label: 'Bearer Token' },
          { value: 'apikey', label: 'API Key Header' },
          { value: 'basic', label: 'Basic Auth' },
        ],
      },
      { key: 'apiKey', label: 'Token / API Key', placeholder: 'your-token-or-key', type: 'password', required: false },
      { key: 'apiKeyHeader', label: 'API Key Header name (if API Key auth)', placeholder: 'X-API-Key', type: 'text', required: false },
      { key: 'username', label: 'Username (if Basic auth)', placeholder: 'username', type: 'text', required: false },
      { key: 'password', label: 'Password (if Basic auth)', placeholder: '••••••', type: 'password', required: false },
    ],
  },
  {
    type: 'mcp',
    label: 'MCP Server',
    tagline: 'Model Context Protocol integration',
    desc: 'Connect to a Model Context Protocol (MCP) server to give AI agents access to tools, resources, and prompts.',
    icon: <Server className="w-6 h-6 text-white" />,
    color: 'bg-violet-600',
    docsUrl: 'https://modelcontextprotocol.io/',
    fields: [
      { key: 'serverUrl', label: 'MCP Server URL', placeholder: 'https://your-mcp-server.com', type: 'url', required: true },
      { key: 'apiKey', label: 'API Key / Bearer Token (if required)', placeholder: 'sk-...', type: 'password', required: false },
      { key: 'transport', label: 'Transport', placeholder: '', type: 'select', required: false,
        options: [
          { value: 'http', label: 'HTTP/SSE (Streamable HTTP)' },
          { value: 'stdio', label: 'stdio' },
        ],
      },
    ],
  },
  {
    type: 'salesforce',
    label: 'Salesforce',
    tagline: 'Nonprofit Success Pack (NPSP)',
    desc: 'Sync donor records, opportunities, campaigns, and contacts with Salesforce for Nonprofits.',
    icon: <SalesforceIcon className="w-10 h-10" />,
    color: 'bg-[#00A1E0]',
    docsUrl: 'https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm',
    fields: [
      { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://yourorg.salesforce.com', type: 'url', required: true },
      { key: 'clientId', label: 'Consumer Key (Client ID)', placeholder: '3MVG9...', type: 'text', required: true },
      { key: 'clientSecret', label: 'Consumer Secret', placeholder: '••••••••', type: 'password', required: true },
      { key: 'username', label: 'Salesforce Username (optional)', placeholder: 'admin@org.com', type: 'text', required: false },
    ],
  },
] as const;

type ConnectorType = typeof CONNECTOR_DEFS[number]['type'];

// ── Main Connectors Component ──────────────────────────────────────────────────
export function Connectors() {
  const { fetchHeaders } = useAuth();
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState<{ type: ConnectorType; existing?: ConnectorConfig } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/connector-configs`, { headers: fetchHeaders() });
      if (r.ok) setConnectors(await r.json());
    } finally { setLoading(false); }
  }, [fetchHeaders]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = async () => { setConfiguring(null); await load(); };
  const handleDelete = async (id: number) => {
    await fetch(`${API}/connector-configs/${id}`, { method: 'DELETE', headers: fetchHeaders() });
    setConnectors(prev => prev.filter(c => c.id !== id));
  };

  const getConnectorsByType = (type: string) => connectors.filter(c => c.type === type);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-none px-6 py-5 border-b border-border bg-card">
        <h2 className="text-xl font-bold text-foreground">Connectors</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Integrate with external platforms, automation tools, and AI services.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-5">

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            CONNECTOR_DEFS.map(def => {
              const instances = getConnectorsByType(def.type);
              return (
                <ConnectorCard
                  key={def.type}
                  def={def}
                  instances={instances}
                  onAdd={() => setConfiguring({ type: def.type as ConnectorType })}
                  onEdit={(c) => setConfiguring({ type: def.type as ConnectorType, existing: c })}
                  onDelete={handleDelete}
                  onRefresh={load}
                  fetchHeaders={fetchHeaders}
                />
              );
            })
          )}

        </div>
      </div>

      {configuring && (
        <ConfigModal
          def={CONNECTOR_DEFS.find(d => d.type === configuring.type)!}
          existing={configuring.existing}
          onClose={() => setConfiguring(null)}
          onSaved={handleSaved}
          fetchHeaders={fetchHeaders}
        />
      )}
    </div>
  );
}

// ── Connector Card ─────────────────────────────────────────────────────────────
function ConnectorCard({
  def, instances, onAdd, onEdit, onDelete, onRefresh, fetchHeaders,
}: {
  def: typeof CONNECTOR_DEFS[number];
  instances: ConnectorConfig[];
  onAdd: () => void;
  onEdit: (c: ConnectorConfig) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
  fetchHeaders: () => Record<string, string>;
}) {
  const [testing, setTesting] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);

  const testConnector = async (id: number) => {
    setTesting(id);
    try {
      await fetch(`${API}/connector-configs/${id}/test`, { method: 'POST', headers: fetchHeaders() });
      await onRefresh();
    } finally { setTesting(null); }
  };

  const hasConnected = instances.some(c => c.status === 'connected');

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", def.color)}>
          {def.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="font-bold text-foreground text-base">{def.label}</h3>
            <span className="text-xs text-muted-foreground">{def.tagline}</span>
            {hasConnected && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                <CheckCircle2 className="w-3 h-3" />Connected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{def.desc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {def.docsUrl && (
            <a href={def.docsUrl} target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Documentation">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium border border-primary/20 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />Add
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Instances */}
      {expanded && instances.length > 0 && (
        <div className="border-t border-border/50 divide-y divide-border/30">
          {instances.map(inst => {
            const cfg = typeof inst.config === 'string' ? JSON.parse(inst.config) : inst.config;
            const primaryField = cfg.webhookUrl || cfg.serverUrl || cfg.baseUrl || cfg.instanceUrl || '';
            return (
              <div key={inst.id} className="flex items-center gap-3 px-6 py-3 bg-sidebar/20 group">
                <StatusDot status={inst.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{inst.name}</div>
                  {primaryField && (
                    <div className="text-xs text-muted-foreground truncate max-w-sm">{primaryField}</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => testConnector(inst.id)}
                    disabled={testing === inst.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-xs text-foreground transition-colors disabled:opacity-50"
                  >
                    {testing === inst.id
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Testing…</>
                      : <><RefreshCw className="w-3 h-3" />Test</>}
                  </button>
                  <button
                    onClick={() => onEdit(inst)}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  ><Settings className="w-3.5 h-3.5" /></button>
                  <button
                    onClick={() => onDelete(inst.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expanded && instances.length === 0 && (
        <div className="border-t border-border/50 px-6 py-4 text-xs text-muted-foreground italic">
          No connections configured yet. Click Add to set one up.
        </div>
      )}
    </div>
  );
}

// ── Config Modal ──────────────────────────────────────────────────────────────
function ConfigModal({
  def, existing, onClose, onSaved, fetchHeaders,
}: {
  def: typeof CONNECTOR_DEFS[number];
  existing?: ConnectorConfig;
  onClose: () => void;
  onSaved: () => void;
  fetchHeaders: () => Record<string, string>;
}) {
  const [name, setName] = useState(existing?.name ?? def.label);
  const [cfg, setCfg] = useState<Record<string, string>>(
    existing ? (typeof existing.config === 'string' ? JSON.parse(existing.config) : existing.config) : {}
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const setField = (key: string, value: string) => {
    setCfg(prev => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (existing) {
        await fetch(`${API}/connector-configs/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify({ name, config: cfg }),
        });
      } else {
        await fetch(`${API}/connector-configs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify({ type: def.type, name, config: cfg }),
        });
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    // Save first then test
    setSaving(true);
    let id = existing?.id;
    try {
      if (existing) {
        await fetch(`${API}/connector-configs/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify({ name, config: cfg }),
        });
      } else {
        const r = await fetch(`${API}/connector-configs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify({ type: def.type, name, config: cfg }),
        });
        const created = await r.json();
        id = created.id;
      }
    } finally { setSaving(false); }

    if (!id) return;
    setTesting(true);
    try {
      const r = await fetch(`${API}/connector-configs/${id}/test`, { method: 'POST', headers: fetchHeaders() });
      const result = await r.json();
      setTestResult({ ok: result.ok, error: result.error });
      if (result.ok) { onSaved(); }
    } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", def.color)}>
              {def.icon}
            </div>
            <div>
              <h3 className="font-bold text-foreground">{existing ? 'Edit' : 'Add'} {def.label}</h3>
              <p className="text-xs text-muted-foreground">{def.tagline}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {def.docsUrl && (
            <a href={def.docsUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <ExternalLink className="w-3 h-3" />View setup docs
            </a>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Connection Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder={`My ${def.label}`}
            />
          </div>

          {/* Dynamic fields */}
          {def.fields.map((field) => {
            if (field.type === 'select' && 'options' in field) {
              return (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{field.label}</label>
                  <select
                    value={cfg[field.key] ?? 'none'}
                    onChange={e => setField(field.key, e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {field.options.map((o: { value: string; label: string }) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              );
            }
            const isPassword = field.type === 'password';
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={isPassword && !showPasswords[field.key] ? 'password' : 'text'}
                    value={cfg[field.key] ?? ''}
                    onChange={e => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2.5 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-10"
                  />
                  {isPassword && (
                    <button
                      type="button"
                      onClick={() => setShowPasswords(p => ({ ...p, [field.key]: !p[field.key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Test result */}
          {testResult && (
            <div className={cn(
              "flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs border",
              testResult.ok
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-destructive/10 border-destructive/20 text-destructive",
            )}>
              {testResult.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              {testResult.ok ? 'Connection successful!' : testResult.error || 'Connection failed.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border bg-sidebar/50">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleTest}
            disabled={saving || testing}
            className="flex-1 px-4 py-2.5 bg-secondary border border-border hover:bg-accent text-foreground text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {testing ? <><Loader2 className="w-4 h-4 animate-spin" />Testing…</> : <><RefreshCw className="w-4 h-4" />Test & Save</>}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || testing}
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    connected: 'bg-emerald-400',
    error: 'bg-red-400',
    testing: 'bg-amber-400 animate-pulse',
    disconnected: 'bg-muted-foreground/40',
  };
  return <div className={cn('w-2 h-2 rounded-full shrink-0', map[status] ?? map.disconnected)} />;
}

function SalesforceIcon({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl bg-[#00A1E0] flex items-center justify-center', className)}>
      <svg viewBox="0 0 64 64" className="w-6 h-6 fill-white">
        <path d="M26.7 13.2c2.1-2.2 5-3.6 8.2-3.6 4.4 0 8.2 2.4 10.2 6 1.5-.7 3.1-1 4.9-1 6.6 0 12 5.4 12 12s-5.4 12-12 12c-.8 0-1.6-.1-2.4-.2-1.8 3.3-5.2 5.5-9.2 5.5-1.5 0-3-.4-4.3-1-1.8 4-5.8 6.7-10.4 6.7-5.1 0-9.5-3.3-11.1-7.8-.7.1-1.4.2-2.1.2C5.1 42 0 36.9 0 30.5c0-4.9 2.9-9.1 7.1-11.1-.4-1.2-.7-2.5-.7-3.8C6.4 9 12 3.4 18.8 3.4c3.5 0 6.6 1.4 8.9 3.8" />
      </svg>
    </div>
  );
}
