import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Building2, Plus, Users, LogOut, Check, Eye, EyeOff, Copy,
  BookOpen, ChevronDown, Hash, Trash2, AlertTriangle, ShieldCheck,
  Coins, Edit2, X, UserPlus, Mail, KeyRound,
} from 'lucide-react';
import { cn, copyToClipboard as clipCopy } from '@/lib/utils';

const API = '/api';

const INDUSTRY_BLUEPRINTS = [
  'Healthcare & Life Sciences', 'Nonprofit & Social Services', 'Technology & Software',
  'Education & Research', 'Financial Services', 'Manufacturing & Supply Chain',
  'Retail & E-Commerce', 'Professional Services', 'Government & Public Sector',
  'Real Estate & Construction', 'Media & Entertainment', 'Energy & Utilities',
  'Hospitality & Tourism', 'Legal Services', 'Agriculture & Food',
];

interface Tenant {
  id: number;
  name: string;
  slug: string;
  status: string;
  industryBlueprint?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  credits: number;
  createdAt: string;
}

interface SuperUser {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface CreatedAccount {
  user: { id: number; name: string; email: string };
  tempPassword: string;
}

const emptyTenantForm = { name: '', slug: '', firstName: '', lastName: '', preferredName: '', adminEmail: '', adminPhone: '' };

export function TenantManagementPage() {
  const { logout, fetchHeaders, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'tenants' | 'system-users'>('tenants');

  // ── Tenants state ──────────────────────────────────────────────────────────
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState<number | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState<CreatedAccount | null>(null);
  const [tenantForm, setTenantForm] = useState(emptyTenantForm);
  const [adminForm, setAdminForm] = useState({ name: '', email: '' });
  const [blueprintSelecting, setBlueprintSelecting] = useState<Record<number, boolean>>({});
  const [blueprintSaving, setBlueprintSaving] = useState<Record<number, boolean>>({});
  const [blueprintValues, setBlueprintValues] = useState<Record<number, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creditsEditing, setCreditsEditing] = useState<Record<number, boolean>>({});
  const [creditsValues, setCreditsValues] = useState<Record<number, number>>({});
  const [creditsSaving, setCreditsSaving] = useState<Record<number, boolean>>({});

  // ── System Users state ─────────────────────────────────────────────────────
  const [superusers, setSuperusers] = useState<SuperUser[]>([]);
  const [superusersLoading, setSuperusersLoading] = useState(false);
  const [showCreateSuperuser, setShowCreateSuperuser] = useState(false);
  const [createdSuperuser, setCreatedSuperuser] = useState<CreatedAccount | null>(null);
  const [superuserForm, setSuperuserForm] = useState({ name: '', email: '' });
  const [confirmDeleteSuperuserId, setConfirmDeleteSuperuserId] = useState<number | null>(null);
  const [deletingSuperuser, setDeletingSuperuser] = useState(false);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchTenants = useCallback(() => {
    setTenantsLoading(true);
    fetch(`${API}/auth/tenants`, { headers: fetchHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Tenant[]) => {
        setTenants(data);
        const bpVals: Record<number, string> = {};
        const crVals: Record<number, number> = {};
        data.forEach(t => { bpVals[t.id] = t.industryBlueprint ?? ''; crVals[t.id] = t.credits ?? 0; });
        setBlueprintValues(bpVals);
        setCreditsValues(crVals);
      })
      .catch(() => {})
      .finally(() => setTenantsLoading(false));
  }, [fetchHeaders]);

  const fetchSuperusers = useCallback(() => {
    setSuperusersLoading(true);
    fetch(`${API}/auth/superusers`, { headers: fetchHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: SuperUser[]) => setSuperusers(data))
      .catch(() => {})
      .finally(() => setSuperusersLoading(false));
  }, [fetchHeaders]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);
  useEffect(() => { if (activeTab === 'system-users') fetchSuperusers(); }, [activeTab, fetchSuperusers]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function copyToClipboard(text: string) {
    clipCopy(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function displayName(t: Tenant) {
    const parts = [t.firstName, t.lastName].filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }

  // ── Tenant actions ─────────────────────────────────────────────────────────
  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const r = await fetch(`${API}/auth/tenants`, {
      method: 'POST', headers: fetchHeaders(),
      body: JSON.stringify({
        name: tenantForm.name,
        slug: tenantForm.slug,
        firstName: tenantForm.firstName || undefined,
        lastName: tenantForm.lastName || undefined,
        preferredName: tenantForm.preferredName || undefined,
        adminEmail: tenantForm.adminEmail || undefined,
        adminPhone: tenantForm.adminPhone || undefined,
      }),
    });
    const data = await r.json();
    setSaving(false);
    if (!r.ok) { setError(data.error || 'Failed to create tenant'); return; }
    fetchTenants();
    setTenantForm(emptyTenantForm);
    setShowCreateTenant(false);
    if (data.admin) setCreatedAdmin(data.admin);
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!showCreateAdmin) return;
    setSaving(true); setError('');
    const r = await fetch(`${API}/auth/tenants/${showCreateAdmin}/admin`, {
      method: 'POST', headers: fetchHeaders(), body: JSON.stringify(adminForm),
    });
    const data = await r.json();
    setSaving(false);
    if (!r.ok) { setError(data.error || 'Failed to create admin'); return; }
    setCreatedAdmin(data);
    setAdminForm({ name: '', email: '' });
    setShowCreateAdmin(null);
  }

  async function saveBlueprintForTenant(tenantId: number) {
    setBlueprintSaving(prev => ({ ...prev, [tenantId]: true }));
    try {
      const r = await fetch(`${API}/auth/tenants/${tenantId}/blueprint`, {
        method: 'PATCH', headers: fetchHeaders(),
        body: JSON.stringify({ industryBlueprint: blueprintValues[tenantId] || null }),
      });
      const data = await r.json();
      if (r.ok) { setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, industryBlueprint: data.industryBlueprint } : t)); setBlueprintSelecting(prev => ({ ...prev, [tenantId]: false })); }
    } finally { setBlueprintSaving(prev => ({ ...prev, [tenantId]: false })); }
  }

  async function saveCreditsForTenant(tenantId: number) {
    setCreditsSaving(prev => ({ ...prev, [tenantId]: true }));
    try {
      const r = await fetch(`${API}/auth/tenants/${tenantId}/credits`, {
        method: 'PATCH', headers: fetchHeaders(),
        body: JSON.stringify({ credits: creditsValues[tenantId] }),
      });
      const data = await r.json();
      if (r.ok) {
        setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, credits: data.credits } : t));
        setCreditsEditing(prev => ({ ...prev, [tenantId]: false }));
      }
    } finally { setCreditsSaving(prev => ({ ...prev, [tenantId]: false })); }
  }

  async function deleteTenant(tenantId: number) {
    setDeleting(true);
    try {
      const r = await fetch(`${API}/auth/tenants/${tenantId}`, { method: 'DELETE', headers: fetchHeaders() });
      if (r.ok) {
        setTenants(prev => prev.filter(t => t.id !== tenantId));
        setBlueprintValues(prev => { const n = { ...prev }; delete n[tenantId]; return n; });
        setCreditsValues(prev => { const n = { ...prev }; delete n[tenantId]; return n; });
      }
    } finally { setDeleting(false); setConfirmDeleteId(null); }
  }

  // ── Superuser actions ──────────────────────────────────────────────────────
  async function createSuperuser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const r = await fetch(`${API}/auth/superusers`, {
      method: 'POST', headers: fetchHeaders(), body: JSON.stringify(superuserForm),
    });
    const data = await r.json();
    setSaving(false);
    if (!r.ok) { setError(data.error || 'Failed to create superuser'); return; }
    setCreatedSuperuser(data);
    setSuperuserForm({ name: '', email: '' });
    setShowCreateSuperuser(false);
    fetchSuperusers();
  }

  async function deleteSuperuser(userId: number) {
    setDeletingSuperuser(true);
    try {
      const r = await fetch(`${API}/auth/superusers/${userId}`, { method: 'DELETE', headers: fetchHeaders() });
      const data = await r.json();
      if (r.ok) setSuperusers(prev => prev.filter(u => u.id !== userId));
      else setError(data.error || 'Failed to delete');
    } finally { setDeletingSuperuser(false); setConfirmDeleteSuperuserId(null); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-base">BusinessOS Administration</h1>
              <p className="text-xs text-muted-foreground">Super User Portal</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />Sign out
          </button>
        </div>
        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-0">
          {[
            { key: 'tenants', label: 'Tenants', icon: <Building2 className="w-3.5 h-3.5" /> },
            { key: 'system-users', label: 'System Users', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key as any); setError(''); }}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── TENANTS TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'tenants' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-display font-bold">Tenants</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{tenants.length} tenant{tenants.length !== 1 ? 's' : ''} registered</p>
              </div>
              <button
                onClick={() => { setShowCreateTenant(true); setError(''); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
              >
                <Plus className="w-4 h-4" />New Tenant
              </button>
            </div>

            {showCreateTenant && (
              <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Create New Tenant</h3>
                  <button onClick={() => { setShowCreateTenant(false); setTenantForm(emptyTenantForm); }} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <form onSubmit={createTenant} className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin User</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'First Name', key: 'firstName', ph: 'Jane' },
                        { label: 'Last Name', key: 'lastName', ph: 'Smith' },
                        { label: 'Preferred Name', key: 'preferredName', ph: 'Jay' },
                      ].map(({ label, key, ph }) => (
                        <div key={key} className="space-y-1.5">
                          <label className="text-sm font-medium">{label}</label>
                          <input type="text" value={(tenantForm as any)[key]} onChange={e => setTenantForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Email</label>
                        <input
                          type="email"
                          value={tenantForm.adminEmail}
                          onChange={e => setTenantForm(f => ({ ...f, adminEmail: e.target.value }))}
                          placeholder="jane@example.com"
                          className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Phone</label>
                        <input
                          type="tel"
                          value={tenantForm.adminPhone}
                          onChange={e => setTenantForm(f => ({ ...f, adminPhone: e.target.value }))}
                          placeholder="+65 9123 4567"
                          className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                    {tenantForm.adminEmail && (
                      <p className="text-xs text-muted-foreground">A temporary password will be generated and shown after creation.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Organisation</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
                        <input type="text" value={tenantForm.name} onChange={e => setTenantForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))} placeholder="Acme Corp" required
                          className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Slug <span className="text-red-500">*</span></label>
                        <input type="text" value={tenantForm.slug} onChange={e => setTenantForm(f => ({ ...f, slug: e.target.value }))} placeholder="acme-corp" required
                          className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                      </div>
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="flex gap-2 justify-end pt-1">
                    <button type="button" onClick={() => { setShowCreateTenant(false); setTenantForm(emptyTenantForm); }} className="px-4 py-2 text-sm rounded-xl text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60 transition-all">
                      {saving ? 'Creating…' : 'Create Tenant'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {showCreateAdmin !== null && (
              <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Create Initial Admin for Tenant #{showCreateAdmin}</h3>
                  <button onClick={() => setShowCreateAdmin(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={createAdmin} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Admin Full Name</label>
                      <input type="text" value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required
                        className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Admin Email</label>
                      <input type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.org" required
                        className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowCreateAdmin(null)} className="px-4 py-2 text-sm rounded-xl text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60 transition-all">
                      {saving ? 'Creating…' : 'Create Admin'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {createdAdmin && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <Check className="w-4 h-4" /><h3 className="font-semibold">Admin account created</h3>
                  </div>
                  <button onClick={() => setCreatedAdmin(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <CredentialCard user={createdAdmin.user} tempPassword={createdAdmin.tempPassword} showPassword={showPassword} setShowPassword={setShowPassword} copied={copied} copyToClipboard={copyToClipboard} />
              </div>
            )}

            {tenantsLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Loading tenants…</div>
            ) : tenants.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-2xl">
                <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No tenants yet. Create your first one above.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {tenants.map(tenant => {
                  const contactName = displayName(tenant);
                  return (
                    <div key={tenant.id} className="bg-card border border-border rounded-2xl p-5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Building2 className="w-5 h-5 text-primary" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm">{tenant.name}</h3>
                              <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium',
                                tenant.status === 'active' ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-secondary text-muted-foreground border-border'
                              )}>{tenant.status}</span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                            {contactName && (
                              <p className="text-xs text-muted-foreground">
                                Contact: <span className="text-foreground font-medium">{contactName}</span>
                                {tenant.preferredName && <span className="text-muted-foreground"> · prefers <span className="text-foreground font-medium">{tenant.preferredName}</span></span>}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/60 border border-border text-xs font-mono text-muted-foreground select-all" title="Tenant ID">
                            <Hash className="w-3 h-3" />{tenant.id}
                          </div>
                          <button
                            onClick={() => { setShowCreateAdmin(tenant.id); setError(''); setAdminForm({ name: '', email: '' }); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          >
                            <Users className="w-3.5 h-3.5" />Add Admin
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(confirmDeleteId === tenant.id ? null : tenant.id)}
                            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Credits + Blueprint row */}
                      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">

                        {/* Credits */}
                        <div className="flex items-center gap-2">
                          <Coins className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          <span className="text-xs text-muted-foreground w-16 flex-shrink-0">Credits:</span>
                          {creditsEditing[tenant.id] ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                type="number"
                                min={0}
                                value={creditsValues[tenant.id] ?? tenant.credits}
                                onChange={e => setCreditsValues(prev => ({ ...prev, [tenant.id]: Number(e.target.value) }))}
                                className="w-28 px-2 py-0.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                              />
                              <button
                                onClick={() => saveCreditsForTenant(tenant.id)}
                                disabled={creditsSaving[tenant.id]}
                                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-60"
                              >
                                <Check className="w-3 h-3" />{creditsSaving[tenant.id] ? '…' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setCreditsEditing(prev => ({ ...prev, [tenant.id]: false })); setCreditsValues(prev => ({ ...prev, [tenant.id]: tenant.credits })); }}
                                className="px-2 py-0.5 text-xs rounded-lg text-muted-foreground hover:bg-secondary border border-border transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setCreditsEditing(prev => ({ ...prev, [tenant.id]: true }))}
                              className="flex items-center gap-1.5 text-xs group hover:text-foreground transition-colors"
                            >
                              <span className={cn('font-mono font-semibold', (tenant.credits ?? 0) <= 0 ? 'text-red-500' : (tenant.credits ?? 0) < 1000 ? 'text-amber-500' : 'text-foreground')}>
                                {(tenant.credits ?? 0).toLocaleString()}
                              </span>
                              <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                            </button>
                          )}
                        </div>

                        {/* Blueprint */}
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-muted-foreground w-28 flex-shrink-0">Blueprint:</span>
                          {blueprintSelecting[tenant.id] ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <select
                                value={blueprintValues[tenant.id] ?? ''}
                                onChange={e => setBlueprintValues(prev => ({ ...prev, [tenant.id]: e.target.value }))}
                                className="flex-1 max-w-xs px-2 py-0.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                <option value="">— None —</option>
                                {INDUSTRY_BLUEPRINTS.map(bp => <option key={bp} value={bp}>{bp}</option>)}
                              </select>
                              <button onClick={() => saveBlueprintForTenant(tenant.id)} disabled={blueprintSaving[tenant.id]}
                                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-60">
                                <Check className="w-3 h-3" />{blueprintSaving[tenant.id] ? '…' : 'Save'}
                              </button>
                              <button onClick={() => { setBlueprintSelecting(prev => ({ ...prev, [tenant.id]: false })); setBlueprintValues(prev => ({ ...prev, [tenant.id]: tenant.industryBlueprint ?? '' })); }}
                                className="px-2 py-0.5 text-xs rounded-lg text-muted-foreground hover:bg-secondary border border-border transition-colors">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setBlueprintSelecting(prev => ({ ...prev, [tenant.id]: true }))}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                              {tenant.industryBlueprint ? (
                                <span className="font-medium text-foreground">{tenant.industryBlueprint}</span>
                              ) : (
                                <span className="italic">Not assigned</span>
                              )}
                              <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </div>
                      </div>

                      {confirmDeleteId === tenant.id && (
                        <div className="flex items-center gap-3 pt-3 border-t border-red-500/20 bg-red-500/5 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl">
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <p className="text-xs text-red-600 dark:text-red-400 flex-1">Permanently delete <span className="font-semibold">{tenant.name}</span>? This cannot be undone.</p>
                          <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
                          <button onClick={() => deleteTenant(tenant.id)} disabled={deleting} className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-60 transition-colors">
                            {deleting ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── SYSTEM USERS TAB ────────────────────────────────────────────── */}
        {activeTab === 'system-users' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-display font-bold">System Users</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Super user accounts with full platform access</p>
              </div>
              <button
                onClick={() => { setShowCreateSuperuser(true); setError(''); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
              >
                <UserPlus className="w-4 h-4" />New System User
              </button>
            </div>

            {showCreateSuperuser && (
              <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Create System User</h3>
                  <button onClick={() => { setShowCreateSuperuser(false); setSuperuserForm({ name: '', email: '' }); setError(''); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={createSuperuser} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Full Name <span className="text-red-500">*</span></label>
                      <input type="text" value={superuserForm.name} onChange={e => setSuperuserForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required
                        className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Email <span className="text-red-500">*</span></label>
                      <input type="email" value={superuserForm.email} onChange={e => setSuperuserForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" required
                        className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">A temporary password will be generated. The user can change it after first login.</p>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => { setShowCreateSuperuser(false); setSuperuserForm({ name: '', email: '' }); }} className="px-4 py-2 text-sm rounded-xl text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60 transition-all">
                      {saving ? 'Creating…' : 'Create System User'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {createdSuperuser && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <Check className="w-4 h-4" /><h3 className="font-semibold">System user account created</h3>
                  </div>
                  <button onClick={() => setCreatedSuperuser(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <CredentialCard user={createdSuperuser.user} tempPassword={createdSuperuser.tempPassword} showPassword={showPassword} setShowPassword={setShowPassword} copied={copied} copyToClipboard={copyToClipboard} />
              </div>
            )}

            {superusersLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Loading system users…</div>
            ) : superusers.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-2xl">
                <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No system users found.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {superusers.map(u => {
                  const isSelf = u.id === (currentUser as any)?.id;
                  return (
                    <div key={u.id} className="bg-card border border-border rounded-2xl p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                            <ShieldCheck className="w-5 h-5 text-violet-500" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{u.name}</span>
                              {isSelf && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">You</span>
                              )}
                              <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium',
                                u.isActive ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-secondary text-muted-foreground border-border'
                              )}>
                                {u.isActive ? 'active' : 'inactive'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="w-3 h-3" />{u.email}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <KeyRound className="w-3 h-3" />
                              <span className="capitalize font-medium text-violet-600 dark:text-violet-400">{u.role}</span>
                              <span>·</span>
                              <span>Joined {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                          </div>
                        </div>

                        {!isSelf && (
                          <div className="flex items-center gap-2">
                            {confirmDeleteSuperuserId === u.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-500">Delete this user?</span>
                                <button onClick={() => setConfirmDeleteSuperuserId(null)} className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
                                <button onClick={() => deleteSuperuser(u.id)} disabled={deletingSuperuser} className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-60 transition-colors">
                                  {deletingSuperuser ? 'Deleting…' : 'Confirm'}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteSuperuserId(u.id)}
                                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/5 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Shared credential card ─────────────────────────────────────────────────────
function CredentialCard({ user, tempPassword, showPassword, setShowPassword, copied, copyToClipboard }: {
  user: { id: number; name: string; email: string };
  tempPassword: string;
  showPassword: boolean;
  setShowPassword: (v: (p: boolean) => boolean) => void;
  copied: boolean;
  copyToClipboard: (s: string) => void;
}) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-2"><span className="text-muted-foreground w-20">Name:</span><span className="font-medium">{user.name}</span></div>
      <div className="flex gap-2"><span className="text-muted-foreground w-20">Email:</span><span className="font-medium">{user.email}</span></div>
      <div className="flex gap-2 items-center">
        <span className="text-muted-foreground w-20">Password:</span>
        <div className="flex items-center gap-2">
          <code className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{showPassword ? tempPassword : '••••••••••••'}</code>
          <button onClick={() => setShowPassword(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => copyToClipboard(tempPassword)} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Share these credentials securely. The user can change their password after first login.</p>
    </div>
  );
}
