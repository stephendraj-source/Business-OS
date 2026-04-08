import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, CheckCircle2, Target, Eye, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const API = '/api';

interface StrategyData {
  mission: string;
  vision: string;
  purpose: string;
}

function StrategyCard({
  icon,
  title,
  description,
  placeholder,
  value,
  onChange,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className={cn("px-6 py-5 flex items-center gap-4 border-b border-border", color)}>
        <div className="w-10 h-10 rounded-xl bg-background/20 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="font-semibold text-base">{title}</h2>
          <p className="text-sm opacity-75 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="p-6">
        <textarea
          className="w-full min-h-[140px] resize-y rounded-lg border border-input bg-background px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 transition-colors"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export function StrategyView() {
  const { fetchHeaders } = useAuth();
  const [data, setData] = useState<StrategyData>({ mission: '', vision: '', purpose: '' });
  const [original, setOriginal] = useState<StrategyData>({ mission: '', vision: '', purpose: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/strategy`, { headers: fetchHeaders() });
      if (res.ok) {
        const d = await res.json();
        const clean = { mission: d.mission || '', vision: d.vision || '', purpose: d.purpose || '' };
        setData(clean);
        setOriginal(clean);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchHeaders]);

  useEffect(() => { load(); }, [load]);

  const isDirty = JSON.stringify(data) !== JSON.stringify(original);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/strategy`, {
        method: 'PUT',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setOriginal({ ...data });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-border bg-background/80 backdrop-blur shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mission, Vision & Purpose</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define the strategic foundation of your organisation
          </p>
        </div>
        <button
          onClick={save}
          disabled={!isDirty || saving}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all",
            isDirty && !saving
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
          )}
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : saved ? (
            <><CheckCircle2 className="w-4 h-4" /> Saved</>
          ) : (
            <><Save className="w-4 h-4" /> Save Changes</>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <StrategyCard
            icon={<Target className="w-5 h-5 text-blue-100" />}
            title="Mission"
            description="Why we exist — our fundamental reason for being"
            placeholder="e.g. To empower underserved communities through education, advocacy, and access to resources…"
            value={data.mission}
            onChange={v => setData(d => ({ ...d, mission: v }))}
            color="bg-blue-600 text-white"
          />
          <StrategyCard
            icon={<Eye className="w-5 h-5 text-violet-100" />}
            title="Vision"
            description="Where we are going — the future we are working to create"
            placeholder="e.g. A world where every individual, regardless of background, has the opportunity to thrive…"
            value={data.vision}
            onChange={v => setData(d => ({ ...d, vision: v }))}
            color="bg-violet-600 text-white"
          />
          <StrategyCard
            icon={<Sparkles className="w-5 h-5 text-amber-100" />}
            title="Purpose"
            description="Our deeper 'why' — the values and beliefs that drive everything we do"
            placeholder="e.g. We believe that lasting change comes from within communities. Our purpose is to ignite that change…"
            value={data.purpose}
            onChange={v => setData(d => ({ ...d, purpose: v }))}
            color="bg-amber-500 text-white"
          />

          {isDirty && (
            <p className="text-xs text-muted-foreground text-center">
              You have unsaved changes — click <strong>Save Changes</strong> to apply them.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
