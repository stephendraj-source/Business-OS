import { useState } from 'react';
import { Cloud, CheckCircle2, AlertCircle, Link2, X, Eye, EyeOff, ExternalLink, Zap, Database, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectorConfig {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
}

type ConnectorStatus = 'disconnected' | 'testing' | 'connected' | 'error';

export function Connectors() {
  const [showModal, setShowModal] = useState(false);
  const [status, setStatus] = useState<ConnectorStatus>('disconnected');
  const [showSecret, setShowSecret] = useState(false);
  const [config, setConfig] = useState<ConnectorConfig>({
    instanceUrl: '',
    clientId: '',
    clientSecret: '',
    username: '',
  });
  const [savedConfig, setSavedConfig] = useState<ConnectorConfig | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleTest = async () => {
    if (!config.instanceUrl || !config.clientId || !config.clientSecret) {
      setErrorMsg('Instance URL, Client ID, and Client Secret are required.');
      return;
    }
    setStatus('testing');
    setErrorMsg('');

    // Simulate connection test
    await new Promise(r => setTimeout(r, 2000));

    // Validate URL format
    try {
      new URL(config.instanceUrl);
      setStatus('connected');
      setSavedConfig({ ...config });
      setShowModal(false);
    } catch {
      setStatus('error');
      setErrorMsg('Invalid instance URL. Please use the format: https://yourorg.salesforce.com');
    }
  };

  const handleDisconnect = () => {
    setStatus('disconnected');
    setSavedConfig(null);
    setConfig({ instanceUrl: '', clientId: '', clientSecret: '', username: '' });
  };

  return (
    <div className="h-full flex flex-col bg-background">

      {/* Header */}
      <div className="flex-none p-6 border-b border-border bg-card">
        <h2 className="text-xl font-display font-bold text-foreground">Connectors</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Integrate with external platforms to sync data and extend capabilities.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Coming soon strip */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl text-sm text-primary">
            <Zap className="w-4 h-4 shrink-0" />
            <span>More connectors coming soon: HubSpot, Raiser's Edge NXT, Blackbaud, Microsoft Dynamics, Google Sheets</span>
          </div>

          {/* Salesforce card */}
          <SalesforceCard
            status={status}
            savedConfig={savedConfig}
            onConfigure={() => { setShowModal(true); setErrorMsg(''); }}
            onDisconnect={handleDisconnect}
          />

          {/* Placeholder connectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <PlaceholderCard name="HubSpot" desc="CRM and fundraising pipeline sync" icon="H" color="bg-orange-500" />
            <PlaceholderCard name="Google Sheets" desc="Export process data to Sheets" icon="G" color="bg-green-500" />
            <PlaceholderCard name="Raiser's Edge NXT" desc="Donor management integration" icon="R" color="bg-blue-500" />
            <PlaceholderCard name="Microsoft Dynamics" desc="ERP and finance integration" icon="M" color="bg-sky-500" />
            <PlaceholderCard name="Blackbaud" desc="Nonprofit suite integration" icon="B" color="bg-purple-500" />
            <PlaceholderCard name="Zapier" desc="Connect 5,000+ apps via automation" icon="Z" color="bg-amber-500" />
          </div>

        </div>
      </div>

      {/* Salesforce Config Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <SalesforceIcon className="w-8 h-8" />
                <div>
                  <h3 className="font-display font-bold text-foreground">Salesforce Configuration</h3>
                  <p className="text-xs text-muted-foreground">Connected App OAuth 2.0</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">

              <a href="https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm" target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-xs text-primary hover:underline">
                <ExternalLink className="w-3 h-3" />
                How to create a Salesforce Connected App
              </a>

              <div className="space-y-3">
                <Field label="Instance URL" placeholder="https://yourorg.salesforce.com" value={config.instanceUrl}
                  onChange={v => setConfig(c => ({ ...c, instanceUrl: v }))} />
                <Field label="Consumer Key (Client ID)" placeholder="3MVG9..." value={config.clientId}
                  onChange={v => setConfig(c => ({ ...c, clientId: v }))} />

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Consumer Secret (Client Secret)</label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={config.clientSecret}
                      onChange={e => setConfig(c => ({ ...c, clientSecret: e.target.value }))}
                      placeholder="••••••••••••••••"
                      className="w-full pr-10 px-3 py-2.5 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <button onClick={() => setShowSecret(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Field label="Salesforce Username (optional)" placeholder="admin@yourorg.com" value={config.username}
                  onChange={v => setConfig(c => ({ ...c, username: v }))} />
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-border bg-sidebar">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleTest}
                disabled={status === 'testing'}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-primary-foreground text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {status === 'testing' ? <><RefreshCw className="w-4 h-4 animate-spin" /> Testing...</> : 'Test & Connect'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function SalesforceCard({ status, savedConfig, onConfigure, onDisconnect }: {
  status: ConnectorStatus;
  savedConfig: ConnectorConfig | null;
  onConfigure: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <SalesforceIcon className="w-12 h-12 shrink-0" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display font-bold text-foreground text-lg">Salesforce</h3>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sync donor records, opportunities, campaigns, and contacts between NonprofitOS and Salesforce Nonprofit Success Pack (NPSP) or Salesforce for Nonprofits.
            </p>
            {savedConfig && (
              <p className="text-xs text-muted-foreground/70 mt-2 flex items-center gap-1.5">
                <Link2 className="w-3 h-3" />
                {savedConfig.instanceUrl}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {status === 'connected' ? (
            <>
              <button className="px-4 py-2 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors">
                Sync Now
              </button>
              <button onClick={onDisconnect} className="px-4 py-2 text-xs font-medium text-destructive border border-destructive/20 rounded-lg hover:bg-destructive/10 transition-colors">
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={onConfigure} className="px-5 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors">
              Configure
            </button>
          )}
        </div>
      </div>

      {/* Capabilities */}
      <div className="px-6 pb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Database, label: "Donor Sync", desc: "Contacts & accounts" },
          { icon: RefreshCw, label: "Opportunity Sync", desc: "Grants & campaigns" },
          { icon: Cloud, label: "Reports", desc: "Import Salesforce reports" },
          { icon: Zap, label: "Automation", desc: "Trigger workflows" },
        ].map(cap => (
          <div key={cap.label} className="p-3 bg-secondary/30 rounded-xl border border-border/50">
            <cap.icon className="w-4 h-4 text-primary mb-2" />
            <div className="text-xs font-semibold text-foreground">{cap.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{cap.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectorStatus }) {
  const map = {
    disconnected: { color: "text-muted-foreground bg-secondary border-border", label: "Not Connected", icon: null },
    testing: { color: "text-amber-400 bg-amber-400/10 border-amber-400/20", label: "Testing...", icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
    connected: { color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", label: "Connected", icon: <CheckCircle2 className="w-3 h-3" /> },
    error: { color: "text-destructive bg-destructive/10 border-destructive/20", label: "Error", icon: <AlertCircle className="w-3 h-3" /> },
  }[status];

  return (
    <span className={cn("flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold border rounded-full", map.color)}>
      {map.icon}
      {map.label}
    </span>
  );
}

function PlaceholderCard({ name, desc, icon, color }: { name: string; desc: string; icon: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 opacity-60 hover:opacity-80 transition-opacity">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm", color)}>
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{name}</div>
          <div className="text-[11px] text-muted-foreground">Coming Soon</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
      />
    </div>
  );
}

function SalesforceIcon({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl bg-[#00A1E0] flex items-center justify-center", className)}>
      <svg viewBox="0 0 64 64" className="w-6 h-6 fill-white">
        <path d="M26.7 13.2c2.1-2.2 5-3.6 8.2-3.6 4.4 0 8.2 2.4 10.2 6 1.5-.7 3.1-1 4.9-1 6.6 0 12 5.4 12 12s-5.4 12-12 12c-.8 0-1.6-.1-2.4-.2-1.8 3.3-5.2 5.5-9.2 5.5-1.5 0-3-.4-4.3-1-1.8 4-5.8 6.7-10.4 6.7-5.1 0-9.5-3.3-11.1-7.8-.7.1-1.4.2-2.1.2C5.1 42 0 36.9 0 30.5c0-4.9 2.9-9.1 7.1-11.1-.4-1.2-.7-2.5-.7-3.8C6.4 9 12 3.4 18.8 3.4c3.5 0 6.6 1.4 8.9 3.8" />
      </svg>
    </div>
  );
}
