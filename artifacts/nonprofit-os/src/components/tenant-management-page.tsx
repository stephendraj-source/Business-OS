import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Plus, Users, LogOut, Check, Eye, EyeOff, Copy } from 'lucide-react';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}

interface CreatedAdmin {
  user: { id: number; name: string; email: string };
  tempPassword: string;
}

export function TenantManagementPage() {
  const { logout, fetchHeaders } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState<number | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState<CreatedAdmin | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const [tenantForm, setTenantForm] = useState({ name: '', slug: '' });
  const [adminForm, setAdminForm] = useState({ name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const API = '/api';

  useEffect(() => {
    fetch(`${API}/auth/tenants`, { headers: fetchHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setTenants)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const r = await fetch(`${API}/auth/tenants`, {
      method: 'POST',
      headers: fetchHeaders(),
      body: JSON.stringify({ name: tenantForm.name, slug: tenantForm.slug }),
    });
    const data = await r.json();
    setSaving(false);
    if (!r.ok) { setError(data.error || 'Failed to create tenant'); return; }
    setTenants(prev => [...prev, data]);
    setTenantForm({ name: '', slug: '' });
    setShowCreateTenant(false);
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!showCreateAdmin) return;
    setSaving(true); setError('');
    const r = await fetch(`${API}/auth/tenants/${showCreateAdmin}/admin`, {
      method: 'POST',
      headers: fetchHeaders(),
      body: JSON.stringify(adminForm),
    });
    const data = await r.json();
    setSaving(false);
    if (!r.ok) { setError(data.error || 'Failed to create admin'); return; }
    setCreatedAdmin(data);
    setAdminForm({ name: '', email: '' });
    setShowCreateAdmin(null);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-base">Tenant Management</h1>
              <p className="text-xs text-muted-foreground">NonprofitOS Administration</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-display font-bold">Tenants</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{tenants.length} tenant{tenants.length !== 1 ? 's' : ''} registered</p>
          </div>
          <button
            onClick={() => { setShowCreateTenant(true); setError(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Tenant
          </button>
        </div>

        {showCreateTenant && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold">Create New Tenant</h3>
            <form onSubmit={createTenant} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Organisation Name</label>
                  <input
                    type="text"
                    value={tenantForm.name}
                    onChange={e => {
                      const name = e.target.value;
                      setTenantForm({ name, slug: slugify(name) });
                    }}
                    placeholder="Acme Nonprofit Inc."
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Slug <span className="text-muted-foreground font-normal">(URL identifier)</span></label>
                  <input
                    type="text"
                    value={tenantForm.slug}
                    onChange={e => setTenantForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="acme-nonprofit"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowCreateTenant(false)} className="px-4 py-2 text-sm rounded-xl text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60 transition-all">
                  {saving ? 'Creating…' : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        )}

        {showCreateAdmin !== null && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold">Create Initial Admin for Tenant #{showCreateAdmin}</h3>
            <form onSubmit={createAdmin} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Admin Full Name</label>
                  <input
                    type="text"
                    value={adminForm.name}
                    onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Jane Smith"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Admin Email</label>
                  <input
                    type="email"
                    value={adminForm.email}
                    onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="jane@example.org"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
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
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="w-4 h-4" />
              <h3 className="font-semibold">Admin account created</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20">Name:</span>
                <span className="font-medium">{createdAdmin.user.name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20">Email:</span>
                <span className="font-medium">{createdAdmin.user.email}</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground w-20">Password:</span>
                <div className="flex items-center gap-2">
                  <code className="font-mono bg-muted px-2 py-0.5 rounded text-xs">
                    {showPassword ? createdAdmin.tempPassword : '••••••••••••••••'}
                  </code>
                  <button onClick={() => setShowPassword(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => copyToClipboard(createdAdmin.tempPassword)} className="text-muted-foreground hover:text-foreground transition-colors">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Share these credentials with the admin. They can change their password after first login.</p>
            <button onClick={() => setCreatedAdmin(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading tenants…</div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-2xl">
            <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No tenants yet. Create your first one above.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {tenants.map(tenant => (
              <div key={tenant.id} className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{tenant.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                        tenant.status === 'active'
                          ? 'bg-green-500/10 text-green-600 border-green-500/20'
                          : 'bg-secondary text-muted-foreground border-border'
                      }`}>{tenant.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{tenant.slug}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCreateAdmin(tenant.id); setError(''); setAdminForm({ name: '', email: '' }); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                  Add Admin
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
