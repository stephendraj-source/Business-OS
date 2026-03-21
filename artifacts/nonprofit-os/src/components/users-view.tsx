import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, Edit2, X, Check, Loader2, Shield, User,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Search,
  Database, Layers, Lock, Mail, Copy, KeyRound,
  Building2, Tag, FolderOpen, Network, ChevronRight, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API = '/api';

const MODULES = [
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

const CATEGORIES = [
  'Strategy & Governance',
  'Technology & Data',
  'Programs & Services',
  'Finance & Compliance',
  'HR & Talent',
  'Fundraising & Development',
  'Marketing & Communications',
  'Operations & Facilities',
];

const CATALOGUE_FIELDS: Record<string, { key: string; label: string }[]> = {
  master: [
    { key: 'number', label: 'Number' },
    { key: 'category', label: 'Category' },
    { key: 'processName', label: 'Process Name' },
    { key: 'processDescription', label: 'Description' },
    { key: 'aiAgent', label: 'AI Agent' },
    { key: 'aiAgentActive', label: 'AI Agent Active' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'inputs', label: 'Inputs' },
    { key: 'outputs', label: 'Outputs' },
    { key: 'humanInTheLoop', label: 'Human in the Loop' },
    { key: 'kpi', label: 'KPI' },
    { key: 'estimatedValueImpact', label: 'Value Impact' },
    { key: 'industryBenchmark', label: 'Benchmark' },
    { key: 'included', label: 'Included' },
    { key: 'target', label: 'Target' },
    { key: 'achievement', label: 'Achievement' },
    { key: 'trafficLight', label: 'Traffic Light' },
  ],
  process: [
    { key: 'number', label: 'Number' },
    { key: 'category', label: 'Category' },
    { key: 'processName', label: 'Process Name' },
    { key: 'processDescription', label: 'Description' },
    { key: 'aiAgent', label: 'AI Agent' },
    { key: 'included', label: 'Included' },
    { key: 'target', label: 'Target' },
    { key: 'achievement', label: 'Achievement' },
    { key: 'trafficLight', label: 'Traffic Light' },
  ],
};

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  designation: string;
  isActive: boolean;
  dataScope: string;
  createdAt: string;
}

interface ModuleRow { module: string; hasAccess: boolean; }
interface CategoryRow { category: string; }
interface ProcessRow { processId: number; canEdit: boolean; }
interface FieldRow { catalogueType: string; fieldKey: string; canView: boolean; canEdit: boolean; }

interface UserDetail extends UserRow {
  modules: ModuleRow[];
  categories: CategoryRow[];
  processes: ProcessRow[];
  fields: FieldRow[];
}

interface ProcessMeta { id: number; processName: string; category: string; }

type Tab = 'profile' | 'modules' | 'data-access' | 'fields' | 'org';
type ViewTab = 'users' | 'roles' | 'org-structure';

interface Group { id: number; name: string; description: string; color: string; }
interface Role { id: number; name: string; description: string; color: string; }
interface Project { id: number; name: string; description: string; }
interface UserGroups { groups: { id: number; name: string; color: string; description: string }[]; }

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors focus:outline-none',
        checked ? 'bg-primary' : 'bg-muted'
      )}
    >
      <span className={cn(
        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'
      )} />
    </button>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn(
      'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide',
      role === 'admin' ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
    )}>
      {role}
    </span>
  );
}

function ActiveDot({ active }: { active: boolean }) {
  return (
    <span className={cn('w-2 h-2 rounded-full inline-block', active ? 'bg-green-500' : 'bg-muted-foreground/40')} />
  );
}

export function UsersView() {
  const [viewTab, setViewTab] = useState<ViewTab>('users');

  return (
    <div className="flex flex-col h-full">
      {/* Top-level view switcher */}
      <div className="flex-none flex items-center gap-1 px-6 pt-5 pb-0">
        {([
          { key: 'users', label: 'Users', icon: Users },
          { key: 'roles', label: 'Roles', icon: Tag },
          { key: 'org-structure', label: 'Org Structure', icon: Network },
        ] as { key: ViewTab; label: string; icon: React.ElementType }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setViewTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              viewTab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {viewTab === 'users' && <UsersListView />}
        {viewTab === 'roles' && <RolesView />}
        {viewTab === 'org-structure' && <OrgStructureView />}
      </div>
    </div>
  );
}

function UsersListView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/users`);
      if (r.ok) setUsers(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openUser = async (u: UserRow) => {
    const r = await fetch(`${API}/users/${u.id}`);
    if (r.ok) {
      const detail: UserDetail = await r.json();
      setSelectedUser(detail);
      setPanelOpen(true);
    }
  };

  const closePanel = () => { setPanelOpen(false); setSelectedUser(null); };

  const handleDelete = async (id: number) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await fetch(`${API}/users/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    fetchUsers();
    if (selectedUser?.id === id) closePanel();
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full">
      {/* Left: User list */}
      <div className={cn('flex flex-col h-full transition-all duration-300', panelOpen ? 'w-[420px] flex-shrink-0' : 'flex-1')}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Users</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage accounts and access permissions</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>

        {/* Search */}
        <div className="flex-none px-6 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-full pl-9 pr-3 py-2 bg-secondary/60 rounded-lg text-sm border border-transparent focus:outline-none focus:border-primary focus:bg-background transition"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{search ? 'No users match your search' : 'No users yet — click Add User to create one'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm border-b border-border">
                <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-semibold">User</th>
                  <th className="text-left px-3 py-3 font-semibold">Role</th>
                  <th className="text-center px-3 py-3 font-semibold">Active</th>
                  <th className="text-center px-3 py-3 font-semibold">Scope</th>
                  <th className="text-right px-6 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(u => (
                  <tr
                    key={u.id}
                    className={cn(
                      'group hover:bg-secondary/40 transition-colors cursor-pointer',
                      selectedUser?.id === u.id && 'bg-primary/5'
                    )}
                    onClick={() => openUser(u)}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold border border-border flex-shrink-0">
                          {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                          {u.designation && <div className="text-[10px] text-muted-foreground/60 italic">{u.designation}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-3 py-3 text-center"><ActiveDot active={u.isActive} /></td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium capitalize">{u.dataScope}</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {confirmDelete === u.id ? (
                          <>
                            <button onClick={e => { e.stopPropagation(); handleDelete(u.id); }}
                              className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold">
                              Confirm
                            </button>
                            <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                              className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground hover:bg-secondary/80 font-semibold">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); handleDelete(u.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: Detail panel */}
      {panelOpen && selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          onClose={closePanel}
          onSaved={async () => {
            await fetchUsers();
            const r = await fetch(`${API}/users/${selectedUser.id}`);
            if (r.ok) setSelectedUser(await r.json());
          }}
        />
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreate={async () => { await fetchUsers(); setShowCreateModal(false); }}
        />
      )}
    </div>
  );
}

// ── User Detail Panel ─────────────────────────────────────────────────────────

function UserDetailPanel({
  user, onClose, onSaved,
}: {
  user: UserDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>('profile');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const showSave = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2000); };

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full border-l border-border bg-card/40">
      {/* Panel header */}
      <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold border border-border">
            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-base">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
          <RoleBadge role={user.role} />
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="text-xs text-green-400 font-medium">{saveMsg}</span>}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-none flex border-b border-border px-6 gap-0">
        {([
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'modules', label: 'Modules', icon: Layers },
          { key: 'data-access', label: 'Data Access', icon: Database },
          { key: 'fields', label: 'Fields', icon: Lock },
          { key: 'org', label: 'Org', icon: Network },
        ] as { key: Tab; label: string; icon: React.ElementType }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'profile' && (
          <ProfileTab user={user} onSaved={async () => { await onSaved(); showSave('Saved ✓'); }} />
        )}
        {tab === 'modules' && (
          <ModulesTab user={user} onSaved={async () => { await onSaved(); showSave('Saved ✓'); }} />
        )}
        {tab === 'data-access' && (
          <DataAccessTab user={user} onSaved={async () => { await onSaved(); showSave('Saved ✓'); }} />
        )}
        {tab === 'fields' && (
          <FieldPermissionsTab user={user} onSaved={async () => { await onSaved(); showSave('Saved ✓'); }} />
        )}
        {tab === 'org' && (
          <OrgTab userId={user.id} />
        )}
      </div>
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ user, onSaved }: { user: UserDetail; onSaved: () => Promise<void> }) {
  const initForm = () => ({
    name: user.name,
    firstName: (user as any).firstName ?? '',
    lastName: (user as any).lastName ?? '',
    preferredName: (user as any).preferredName ?? '',
    email: user.email,
    role: user.role,
    designation: user.designation ?? '',
    isActive: user.isActive,
  });
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetResult, setResetResult] = useState<{ link: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setForm(initForm());
    setResetResult(null);
  }, [user.id]);

  const handleFirstName = (value: string) => {
    setForm(f => {
      const autoName = [f.firstName, f.lastName].filter(Boolean).join(' ');
      const shouldSync = f.name === autoName || f.name === '';
      return { ...f, firstName: value, name: shouldSync ? [value, f.lastName].filter(Boolean).join(' ') : f.name };
    });
  };

  const handleLastName = (value: string) => {
    setForm(f => {
      const autoName = [f.firstName, f.lastName].filter(Boolean).join(' ');
      const shouldSync = f.name === autoName || f.name === '';
      return { ...f, lastName: value, name: shouldSync ? [f.firstName, value].filter(Boolean).join(' ') : f.name };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, firstName: form.firstName, lastName: form.lastName, preferredName: form.preferredName, email: form.email, role: form.role, designation: form.designation, isActive: form.isActive }),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => setForm(initForm());

  const sendReset = async () => {
    setSendingReset(true);
    setResetResult(null);
    try {
      const r = await fetch(`${API}/users/${user.id}/send-password-reset`, { method: 'POST' });
      const d = await r.json();
      setResetResult({ link: window.location.origin + d.resetLink, message: d.message });
    } finally {
      setSendingReset(false);
    }
  };

  const copyLink = () => {
    if (resetResult) {
      navigator.clipboard.writeText(resetResult.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">First Name</label>
          <input value={form.firstName} onChange={e => handleFirstName(e.target.value)}
            placeholder="Jane"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Name</label>
          <input value={form.lastName} onChange={e => handleLastName(e.target.value)}
            placeholder="Smith"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preferred Name <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
        <input value={form.preferredName} onChange={e => setForm(f => ({ ...f, preferredName: e.target.value }))}
          placeholder="e.g. nickname or goes-by name"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
          <span className="text-[10px] text-muted-foreground/60">Auto-filled from first + last name</span>
        </div>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Designation</label>
        <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
          placeholder="e.g. Program Manager, Finance Director…"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</label>
        <div className="flex gap-3">
          {['user', 'admin'].map(r => (
            <button
              key={r}
              onClick={() => setForm(f => ({ ...f, role: r }))}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all',
                form.role === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {r === 'admin' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
              {r === 'admin' ? 'Admin' : 'User'}
            </button>
          ))}
        </div>
        {form.role === 'admin' && (
          <p className="text-xs text-muted-foreground pl-1">Admins have full access to all modules and can manage users.</p>
        )}
      </div>

      <div className="flex items-center justify-between py-3 px-4 bg-secondary/40 rounded-xl">
        <div>
          <div className="text-sm font-medium">Account Active</div>
          <div className="text-xs text-muted-foreground">Inactive accounts cannot log in</div>
        </div>
        <Toggle checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />
      </div>

      <div className="flex gap-3">
        <button onClick={cancel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      <div className="border-t border-border pt-5 space-y-3">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            Password Reset
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate a secure reset link to share with this user so they can set a new password.
          </p>
        </div>
        <button onClick={sendReset} disabled={sendingReset}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60 transition-colors">
          {sendingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Send Password Reset Link
        </button>

        {resetResult && (
          <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
            <p className="text-xs text-muted-foreground">{resetResult.message}</p>
            <div className="flex items-center gap-2">
              <input readOnly value={resetResult.link}
                className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none font-mono truncate" />
              <button onClick={copyLink}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  copied ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-border text-muted-foreground hover:bg-secondary'
                )}>
                <Copy className="w-3.5 h-3.5" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modules Tab ───────────────────────────────────────────────────────────────

function ModulesTab({ user, onSaved }: { user: UserDetail; onSaved: () => Promise<void> }) {
  const initAccess = () => {
    if (!user.modules.length) {
      return Object.fromEntries(MODULES.map(m => [m.key, true]));
    }
    const map: Record<string, boolean> = {};
    MODULES.forEach(m => {
      const found = user.modules.find(r => r.module === m.key);
      map[m.key] = found ? found.hasAccess : true;
    });
    return map;
  };

  const [access, setAccess] = useState<Record<string, boolean>>(initAccess);
  const [saving, setSaving] = useState(false);

  const allOn = MODULES.every(m => access[m.key]);
  const allOff = MODULES.every(m => !access[m.key]);

  const save = async () => {
    setSaving(true);
    try {
      const modules = MODULES.map(m => ({ module: m.key, hasAccess: access[m.key] ?? true }));
      await fetch(`${API}/users/${user.id}/modules`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modules }),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Module Access</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Control which sections of the app this user can see</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAccess(Object.fromEntries(MODULES.map(m => [m.key, true])))}
            className="text-xs px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground font-medium transition-colors">
            All On
          </button>
          <button onClick={() => setAccess(Object.fromEntries(MODULES.map(m => [m.key, false])))}
            className="text-xs px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground font-medium transition-colors">
            All Off
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {MODULES.map(m => (
          <div key={m.key} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-secondary/40 transition-colors">
            <span className="text-sm font-medium">{m.label}</span>
            <Toggle checked={access[m.key] ?? true} onChange={v => setAccess(a => ({ ...a, [m.key]: v }))} />
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save Module Access
      </button>
    </div>
  );
}

// ── Data Access Tab ───────────────────────────────────────────────────────────

function DataAccessTab({ user, onSaved }: { user: UserDetail; onSaved: () => Promise<void> }) {
  const [scope, setScope] = useState<string>(user.dataScope || 'all');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(user.categories.map(c => c.category))
  );
  const [processList, setProcessList] = useState<ProcessMeta[]>([]);
  const [processAccess, setProcessAccess] = useState<Map<number, boolean>>(
    new Map(user.processes.map(p => [p.processId, p.canEdit]))
  );
  const [processSearch, setProcessSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (scope === 'processes' && processList.length === 0) {
      fetch(`${API}/processes`).then(r => r.json()).then(data => setProcessList(data));
    }
  }, [scope]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(s => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const toggleProcess = (id: number) => {
    setProcessAccess(m => {
      const next = new Map(m);
      if (next.has(id)) next.delete(id); else next.set(id, false);
      return next;
    });
  };

  const setProcessEditAccess = (id: number, canEdit: boolean) => {
    setProcessAccess(m => {
      const next = new Map(m);
      next.set(id, canEdit);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataScope: scope }),
      });
      await fetch(`${API}/users/${user.id}/categories`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: Array.from(selectedCategories) }),
      });
      const processes = Array.from(processAccess.entries()).map(([processId, canEdit]) => ({ processId, canEdit }));
      await fetch(`${API}/users/${user.id}/processes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ processes }),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const filteredProcesses = processList.filter(p => {
    const matchesSearch = !processSearch || p.processName?.toLowerCase().includes(processSearch.toLowerCase()) ||
      p.category?.toLowerCase().includes(processSearch.toLowerCase());
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(p.category);
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-sm">Data Scope</h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">Choose how much data this user can see</p>
        <div className="space-y-2">
          {[
            { key: 'all', label: 'All Data', desc: 'User can see all categories and processes' },
            { key: 'categories', label: 'By Category', desc: 'Restrict to selected categories only' },
            { key: 'processes', label: 'By Process', desc: 'Grant access to specific processes individually' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setScope(opt.key)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                scope === opt.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              )}
            >
              <div className={cn(
                'mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                scope === opt.key ? 'border-primary' : 'border-muted-foreground/40'
              )}>
                {scope === opt.key && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div>
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {(scope === 'categories' || scope === 'processes') && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {scope === 'categories' ? 'Allowed Categories' : 'Filter by Category'}
          </div>
          {scope === 'processes' && (
            <p className="text-xs text-muted-foreground -mt-1">
              Select categories to narrow the process list below. Leave all unchecked to show all processes.
            </p>
          )}
          {CATEGORIES.map(cat => (
            <label key={cat} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/40 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={selectedCategories.has(cat)}
                onChange={() => toggleCategory(cat)}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm">{cat}</span>
            </label>
          ))}
        </div>
      )}

      {scope === 'processes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0">
              Allowed Processes ({processAccess.size} selected)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setProcessAccess(m => {
                    const next = new Map(m);
                    filteredProcesses.forEach(p => { if (!next.has(p.id)) next.set(p.id, false); });
                    return next;
                  });
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground font-medium transition-colors"
              >
                Select All
              </button>
              <button
                onClick={() => {
                  setProcessAccess(m => {
                    const next = new Map(m);
                    filteredProcesses.forEach(p => next.delete(p.id));
                    return next;
                  });
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground font-medium transition-colors"
              >
                Deselect All
              </button>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={processSearch}
                  onChange={e => setProcessSearch(e.target.value)}
                  placeholder="Filter…"
                  className="pl-7 pr-2 py-1 text-xs bg-secondary/60 rounded-lg border border-transparent focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {processList.length === 0 ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : filteredProcesses.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">No processes match the selected categories or search.</div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/60 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-8"></th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Process</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Category</th>
                    <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Can Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProcesses.map(p => {
                    const selected = processAccess.has(p.id);
                    const canEdit = processAccess.get(p.id) ?? false;
                    return (
                      <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected} onChange={() => toggleProcess(p.id)} className="accent-primary" />
                        </td>
                        <td className="px-3 py-2 font-medium">{p.processName || '(unnamed)'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.category}</td>
                        <td className="px-3 py-2 text-center">
                          {selected && (
                            <Toggle checked={canEdit} onChange={v => setProcessEditAccess(p.id, v)} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save Data Access
      </button>
    </div>
  );
}

// ── Field Permissions Tab ─────────────────────────────────────────────────────

function FieldPermissionsTab({ user, onSaved }: { user: UserDetail; onSaved: () => Promise<void> }) {
  const initPerms = () => {
    const map: Record<string, { canView: boolean; canEdit: boolean }> = {};
    for (const ct of ['master', 'process']) {
      for (const f of CATALOGUE_FIELDS[ct]) {
        const key = `${ct}:${f.key}`;
        const found = user.fields.find(r => r.catalogueType === ct && r.fieldKey === f.key);
        map[key] = found ? { canView: found.canView, canEdit: found.canEdit } : { canView: true, canEdit: true };
      }
    }
    return map;
  };

  const [perms, setPerms] = useState(initPerms);
  const [saving, setSaving] = useState(false);

  const setField = (ct: string, fieldKey: string, prop: 'canView' | 'canEdit', val: boolean) => {
    const key = `${ct}:${fieldKey}`;
    setPerms(p => ({
      ...p,
      [key]: {
        ...p[key],
        [prop]: val,
        ...(prop === 'canEdit' && val ? { canView: true } : {}),
        ...(prop === 'canView' && !val ? { canEdit: false } : {}),
      },
    }));
  };

  const allViewOn = (ct: string) => CATALOGUE_FIELDS[ct].every(f => perms[`${ct}:${f.key}`]?.canView !== false);
  const allEditOn = (ct: string) => CATALOGUE_FIELDS[ct].every(f => perms[`${ct}:${f.key}`]?.canEdit !== false);

  const setAllCt = (ct: string, canView: boolean, canEdit: boolean) => {
    setPerms(p => {
      const next = { ...p };
      CATALOGUE_FIELDS[ct].forEach(f => { next[`${ct}:${f.key}`] = { canView, canEdit: canEdit && canView }; });
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const permissions = Object.entries(perms).map(([key, val]) => {
        const [catalogueType, fieldKey] = key.split(':');
        return { catalogueType, fieldKey, canView: val.canView, canEdit: val.canEdit };
      });
      await fetch(`${API}/users/${user.id}/field-permissions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions }),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <p className="text-xs text-muted-foreground">Set view and edit access per field. Disabling view also disables edit. Enabling edit also enables view.</p>

      {(['master', 'process'] as const).map(ct => (
        <div key={ct} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {ct === 'master' ? 'Master Catalogue' : 'Process Catalogue'} Fields
            </div>
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              <button onClick={() => setAllCt(ct, true, false)}
                className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 font-medium">View All</button>
              <button onClick={() => setAllCt(ct, true, true)}
                className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 font-medium">Edit All</button>
              <button onClick={() => setAllCt(ct, false, false)}
                className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 font-medium">None</button>
            </div>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Field</th>
                  <th className="text-center px-4 py-2 font-semibold text-muted-foreground w-20">View</th>
                  <th className="text-center px-4 py-2 font-semibold text-muted-foreground w-20">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CATALOGUE_FIELDS[ct].map(f => {
                  const key = `${ct}:${f.key}`;
                  const p = perms[key] ?? { canView: true, canEdit: true };
                  return (
                    <tr key={f.key} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{f.label}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Toggle checked={p.canView} onChange={v => setField(ct, f.key, 'canView', v)} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Toggle checked={p.canEdit} onChange={v => setField(ct, f.key, 'canEdit', v)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save Field Permissions
      </button>
    </div>
  );
}

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => Promise<void> }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', preferredName: '', name: '', email: '', designation: '', role: 'user' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleFirstName = (value: string) => {
    setForm(f => {
      const autoName = [f.firstName, f.lastName].filter(Boolean).join(' ');
      const shouldSync = f.name === autoName || f.name === '';
      return { ...f, firstName: value, name: shouldSync ? [value, f.lastName].filter(Boolean).join(' ') : f.name };
    });
  };

  const handleLastName = (value: string) => {
    setForm(f => {
      const autoName = [f.firstName, f.lastName].filter(Boolean).join(' ');
      const shouldSync = f.name === autoName || f.name === '';
      return { ...f, lastName: value, name: shouldSync ? [f.firstName, value].filter(Boolean).join(' ') : f.name };
    });
  };

  const submit = async () => {
    const resolvedName = form.name || [form.firstName, form.lastName].filter(Boolean).join(' ');
    if (!resolvedName || !form.email) { setError('Name (or first/last name) and email are required'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`${API}/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, name: resolvedName }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.error || 'Failed to create user'); return; }
      const d = await r.json();
      const link = window.location.origin + d.resetLink;
      setResetLink(link);
      await onCreate();
    } finally {
      setSaving(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (resetLink) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-[480px] bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg">User Created</h2>
              <p className="text-xs text-muted-foreground">Share this password setup link with the new user</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="w-3.5 h-3.5" />
              <span>In production this link would be emailed automatically. Please share it manually for now.</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input readOnly value={resetLink}
                className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none font-mono truncate" />
              <button onClick={copyLink}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex-shrink-0',
                  copied ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-border text-muted-foreground hover:bg-secondary'
                )}>
                <Copy className="w-3.5 h-3.5" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <button onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[440px] bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">Create User</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-secondary/50 text-xs text-muted-foreground">
          <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>The user will receive a password setup link after their account is created.</span>
        </div>

        {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">{error}</div>}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">First Name</label>
              <input value={form.firstName} onChange={e => handleFirstName(e.target.value)}
                placeholder="Jane"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Name</label>
              <input value={form.lastName} onChange={e => handleLastName(e.target.value)}
                placeholder="Smith"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preferred Name <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
            <input value={form.preferredName} onChange={e => setForm(f => ({ ...f, preferredName: e.target.value }))}
              placeholder="e.g. nickname or goes-by name"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
              <span className="text-[10px] text-muted-foreground/60">Auto-filled from first + last name</span>
            </div>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@org.org"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Designation <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
            <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
              placeholder="e.g. Program Manager, Finance Director…"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</label>
            <div className="flex gap-2">
              {['user', 'admin'].map(r => (
                <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all',
                    form.role === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  )}>
                  {r === 'admin' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  {r === 'admin' ? 'Admin' : 'User'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create User
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Org Tab (user detail) ─────────────────────────────────────────────────────

function OrgTab({ userId }: { userId: number }) {
  const [userGroups, setUserGroups] = useState<{ id: number; name: string; color: string; description: string }[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [groupIds, setGroupIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const [ug, ag] = await Promise.all([
      fetch(`${API}/org/users/${userId}/groups`).then(x => x.json()),
      fetch(`${API}/org/groups`).then(x => x.json()),
    ]);
    setUserGroups(ug);
    setAllGroups(ag);
    setGroupIds(new Set(ug.map((g: any) => g.id)));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: number) => {
    setGroupIds(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/org/users/${userId}/groups`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: Array.from(groupIds) }),
      });
      setSaveMsg('Saved ✓');
      setTimeout(() => setSaveMsg(''), 2000);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-5 max-w-lg">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Network className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Groups ({groupIds.size} assigned)</span>
        </div>
        {allGroups.length === 0 ? (
          <div className="text-xs text-muted-foreground pl-5 py-2 italic">No groups defined yet — create groups in the Org Structure tab</div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {allGroups.map(g => (
              <label key={g.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                <input type="checkbox" checked={groupIds.has(g.id)} onChange={() => toggle(g.id)} className="w-3.5 h-3.5 rounded accent-primary" />
                <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: g.color || 'hsl(var(--secondary))' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{g.name}</div>
                  {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {userGroups.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Roles via Groups</div>
          <div className="text-xs text-muted-foreground">Permissions are inherited from the Roles that the user's groups belong to.</div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {userGroups.map(g => (
              <span key={g.id} className="text-xs px-2.5 py-1 rounded-full font-medium border"
                style={{ background: g.color ? `${g.color}20` : 'hsl(var(--secondary))', color: g.color || 'hsl(var(--muted-foreground))', borderColor: g.color ? `${g.color}40` : 'hsl(var(--border))' }}>
                {g.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Group Assignments
        </button>
        {saveMsg && <span className="text-xs text-green-400 font-medium">{saveMsg}</span>}
      </div>
    </div>
  );
}

// ── Role Permissions Detail ────────────────────────────────────────────────────

type RoleTab = 'overview' | 'modules' | 'data-access' | 'fields';

function RoleModulesTab({ roleId }: { roleId: number }) {
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/org/roles/${roleId}/permissions`).then(r => r.json()).then(p => {
      const map: Record<string, boolean> = Object.fromEntries(MODULES.map(m => [m.key, true]));
      p.modules.forEach((m: any) => { map[m.module] = m.hasAccess; });
      setAccess(map);
    });
  }, [roleId]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/org/roles/${roleId}/modules`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: MODULES.map(m => ({ module: m.key, hasAccess: access[m.key] ?? true })) }),
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setAccess(Object.fromEntries(MODULES.map(m => [m.key, true])))}
          className="text-xs px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 font-medium transition-colors">All On</button>
        <button onClick={() => setAccess(Object.fromEntries(MODULES.map(m => [m.key, false])))}
          className="text-xs px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground font-medium transition-colors">All Off</button>
      </div>
      <div className="space-y-1 border border-border rounded-xl overflow-hidden">
        {MODULES.map(m => (
          <div key={m.key} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors border-b border-border last:border-0">
            <span className="text-sm font-medium">{m.label}</span>
            <Toggle checked={access[m.key] ?? true} onChange={v => setAccess(a => ({ ...a, [m.key]: v }))} />
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save Module Access
      </button>
    </div>
  );
}

function RoleDataAccessTab({ roleId }: { roleId: number }) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<'all' | 'categories' | 'processes'>('all');
  const [processList, setProcessList] = useState<ProcessMeta[]>([]);
  const [processAccess, setProcessAccess] = useState<Map<number, boolean>>(new Map());
  const [processSearch, setProcessSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/org/roles/${roleId}/permissions`).then(r => r.json()).then(p => {
      setSelectedCategories(new Set(p.categories.map((c: any) => c.category)));
      setProcessAccess(new Map(p.processes.map((pr: any) => [pr.processId, pr.canEdit])));
    });
  }, [roleId]);

  useEffect(() => {
    if (scope === 'processes' && processList.length === 0)
      fetch(`${API}/processes`).then(r => r.json()).then(setProcessList);
  }, [scope]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/org/roles/${roleId}/categories`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: scope === 'categories' ? Array.from(selectedCategories) : [] }),
      });
      await fetch(`${API}/org/roles/${roleId}/processes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processes: scope === 'processes' ? Array.from(processAccess.entries()).map(([processId, canEdit]) => ({ processId, canEdit })) : [] }),
      });
    } finally { setSaving(false); }
  };

  const visibleProcesses = processList.filter(p =>
    !processSearch || p.processName.toLowerCase().includes(processSearch.toLowerCase()) || p.category.toLowerCase().includes(processSearch.toLowerCase())
  );
  const categoryProcesses = (cat: string) => visibleProcesses.filter(p => p.category === cat);

  return (
    <div className="p-5 space-y-5">
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scope</div>
        {(['all', 'categories', 'processes'] as const).map(s => (
          <label key={s} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary/40 cursor-pointer transition-colors">
            <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} className="w-3.5 h-3.5 accent-primary" />
            <div>
              <div className="text-sm font-medium capitalize">{s === 'all' ? 'All processes' : s === 'categories' ? 'Selected categories' : 'Selected processes'}</div>
              <div className="text-xs text-muted-foreground">{s === 'all' ? 'Full access to all processes' : s === 'categories' ? 'Restrict to chosen categories' : 'Restrict to specific processes'}</div>
            </div>
          </label>
        ))}
      </div>

      {scope === 'categories' && (
        <div className="space-y-1 border border-border rounded-xl overflow-hidden">
          {CATEGORIES.map(cat => (
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
            <input value={processSearch} onChange={e => setProcessSearch(e.target.value)}
              placeholder="Search processes…"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { const m = new Map<number, boolean>(); visibleProcesses.forEach(p => m.set(p.id, false)); setProcessAccess(m); }}
              className="text-xs px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 font-medium transition-colors">Select All</button>
            <button onClick={() => { const m = new Map(processAccess); visibleProcesses.forEach(p => m.delete(p.id)); setProcessAccess(m); }}
              className="text-xs px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground font-medium transition-colors">Deselect All</button>
          </div>
          {CATEGORIES.filter(cat => categoryProcesses(cat).length > 0).map(cat => (
            <div key={cat} className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">{cat}</div>
              <div className="border border-border rounded-xl overflow-hidden">
                {categoryProcesses(cat).map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                    <input type="checkbox" checked={processAccess.has(p.id)} onChange={() => {
                      setProcessAccess(m => { const n = new Map(m); if (n.has(p.id)) n.delete(p.id); else n.set(p.id, false); return n; });
                    }} className="w-3.5 h-3.5 rounded accent-primary" />
                    <span className="text-sm flex-1">{p.processName}</span>
                    {processAccess.has(p.id) && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" checked={processAccess.get(p.id) ?? false} onChange={e => {
                          setProcessAccess(m => { const n = new Map(m); n.set(p.id, e.target.checked); return n; });
                        }} className="w-3 h-3 rounded accent-primary" />
                        Can Edit
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save Data Access
      </button>
    </div>
  );
}

function RoleFieldsTab({ roleId }: { roleId: number }) {
  const [fields, setFields] = useState<Record<string, { canView: boolean; canEdit: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const allFields = Object.entries(CATALOGUE_FIELDS).flatMap(([type, fs]) => fs.map(f => ({ type, ...f })));

  useEffect(() => {
    fetch(`${API}/org/roles/${roleId}/permissions`).then(r => r.json()).then(p => {
      const m: Record<string, { canView: boolean; canEdit: boolean }> = {};
      allFields.forEach(f => { m[`${f.type}:${f.key}`] = { canView: true, canEdit: true }; });
      p.fields.forEach((f: any) => { m[`${f.catalogueType}:${f.fieldKey}`] = { canView: f.canView, canEdit: f.canEdit }; });
      setFields(m);
    });
  }, [roleId]);

  const save = async () => {
    setSaving(true);
    try {
      const permissions = allFields.map(f => {
        const v = fields[`${f.type}:${f.key}`] ?? { canView: true, canEdit: true };
        return { catalogueType: f.type, fieldKey: f.key, canView: v.canView, canEdit: v.canEdit };
      });
      await fetch(`${API}/org/roles/${roleId}/field-permissions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="p-5 space-y-5">
      {Object.entries(CATALOGUE_FIELDS).map(([type, fs]) => (
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
              const v = fields[key] ?? { canView: true, canEdit: true };
              return (
                <div key={f.key} className="grid grid-cols-[1fr_80px_80px] items-center px-4 py-2.5 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                  <span className="text-sm">{f.label}</span>
                  <div className="flex justify-center">
                    <input type="checkbox" checked={v.canView} onChange={e => setFields(fd => ({ ...fd, [key]: { ...v, canView: e.target.checked, canEdit: e.target.checked ? v.canEdit : false } }))} className="w-3.5 h-3.5 rounded accent-primary" />
                  </div>
                  <div className="flex justify-center">
                    <input type="checkbox" checked={v.canEdit} disabled={!v.canView} onChange={e => setFields(fd => ({ ...fd, [key]: { ...v, canEdit: e.target.checked } }))} className="w-3.5 h-3.5 rounded accent-primary disabled:opacity-40" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save Field Permissions
      </button>
    </div>
  );
}

// ── Roles View ────────────────────────────────────────────────────────────────

function RolesView() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleTab, setRoleTab] = useState<RoleTab>('overview');
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [roleGroupIds, setRoleGroupIds] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<{ name: string; description: string; color: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const COLORS = ['', '#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, g] = await Promise.all([
        fetch(`${API}/org/roles`).then(x => x.json()),
        fetch(`${API}/org/groups`).then(x => x.json()),
      ]);
      setRoles(r);
      setAllGroups(g);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openRole = async (role: Role) => {
    setSelectedRole(role);
    setRoleTab('overview');
    setForm({ name: role.name, description: role.description, color: role.color });
    const gs = await fetch(`${API}/org/roles/${role.id}/groups`).then(x => x.json());
    setRoleGroupIds(new Set(gs.map((g: any) => g.id)));
  };

  const closeRole = () => { setSelectedRole(null); setForm(null); };

  const createRole = async () => {
    const row = await fetch(`${API}/org/roles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New Role' }),
    }).then(x => x.json());
    await load();
    openRole(row);
  };

  const saveOverview = async () => {
    if (!selectedRole || !form) return;
    setSaving(true);
    try {
      await fetch(`${API}/org/roles/${selectedRole.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      await fetch(`${API}/org/roles/${selectedRole.id}/groups`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: Array.from(roleGroupIds) }),
      });
      await load();
    } finally { setSaving(false); }
  };

  const deleteRole = async (id: number) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await fetch(`${API}/org/roles/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (selectedRole?.id === id) closeRole();
    await load();
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Role list */}
      <div className={cn('flex flex-col h-full transition-all border-r border-border', selectedRole ? 'w-72 flex-shrink-0' : 'flex-1')}>
        <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h1 className="text-2xl font-display font-bold">Roles</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Define permission sets assigned to groups</p>
          </div>
          <button onClick={createRole} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Add Role
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Tag className="w-10 h-10 mb-3 opacity-25" />
              <p className="text-sm">No roles yet — click Add Role to create one</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {roles.map(r => (
                <div key={r.id} role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') openRole(r); }}
                  onClick={() => openRole(r)}
                  className={cn('flex items-center gap-3 px-6 py-4 cursor-pointer hover:bg-secondary/40 transition-colors group', selectedRole?.id === r.id && 'bg-primary/5')}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: r.color || 'hsl(var(--secondary))', color: r.color ? '#fff' : 'hsl(var(--muted-foreground))' }}>
                    {r.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    {r.description && <div className="text-xs text-muted-foreground truncate">{r.description}</div>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {confirmDelete === r.id ? (
                      <>
                        <button onClick={e => { e.stopPropagation(); deleteRole(r.id); }}
                          className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold">Confirm</button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                          className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground font-semibold">Cancel</button>
                      </>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); deleteRole(r.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Role detail */}
      {selectedRole && form && (
        <div className="flex-1 min-w-0 flex flex-col bg-card/40">
          {/* Header */}
          <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: form.color || 'hsl(var(--secondary))', color: form.color ? '#fff' : 'hsl(var(--muted-foreground))' }}>
                {form.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="font-semibold">{selectedRole.name}</span>
            </div>
            <button onClick={closeRole} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
          {/* Tabs */}
          <div className="flex-none flex items-center gap-1 px-6 py-3 border-b border-border">
            {([
              { key: 'overview', label: 'Overview' },
              { key: 'modules', label: 'Modules' },
              { key: 'data-access', label: 'Data Access' },
              { key: 'fields', label: 'Fields' },
            ] as { key: RoleTab; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setRoleTab(t.key)}
                className={cn('px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors', roleTab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary')}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {roleTab === 'overview' && (
              <div className="p-5 space-y-5 max-w-lg">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role Name</label>
                  <input value={form.name} onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
                  <input value={form.description} onChange={e => setForm(f => f && ({ ...f, description: e.target.value }))}
                    placeholder="Optional description…"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setForm(f => f && ({ ...f, color: c }))}
                        className={cn('w-7 h-7 rounded-full border-2 transition-transform hover:scale-110', form.color === c ? 'border-primary scale-110' : 'border-transparent')}
                        style={{ background: c || 'hsl(var(--secondary))' }} />
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Groups with this Role ({roleGroupIds.size})</div>
                  <div className="text-xs text-muted-foreground">Assign groups to this role to grant its permissions to all group members.</div>
                  {allGroups.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No groups yet — create groups in Org Structure</div>
                  ) : (
                    <div className="border border-border rounded-xl overflow-hidden">
                      {allGroups.map(g => (
                        <label key={g.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                          <input type="checkbox" checked={roleGroupIds.has(g.id)} onChange={() => {
                            setRoleGroupIds(s => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; });
                          }} className="w-3.5 h-3.5 rounded accent-primary" />
                          <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: g.color || 'hsl(var(--secondary))' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{g.name}</div>
                            {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={saveOverview} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Role
                </button>
              </div>
            )}
            {roleTab === 'modules' && <RoleModulesTab key={selectedRole.id} roleId={selectedRole.id} />}
            {roleTab === 'data-access' && <RoleDataAccessTab key={selectedRole.id} roleId={selectedRole.id} />}
            {roleTab === 'fields' && <RoleFieldsTab key={selectedRole.id} roleId={selectedRole.id} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Org Structure View (Groups) ───────────────────────────────────────────────

function OrgStructureView() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMemberIds, setGroupMemberIds] = useState<Set<number>>(new Set());
  const [groupRoleIds, setGroupRoleIds] = useState<Set<number>>(new Set());
  const [editForm, setEditForm] = useState<{ name: string; description: string; color: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', color: '' });

  const COLORS = ['', '#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, u, r] = await Promise.all([
        fetch(`${API}/org/groups`).then(x => x.json()),
        fetch(`${API}/users`).then(x => x.json()),
        fetch(`${API}/org/roles`).then(x => x.json()),
      ]);
      setGroups(g);
      setAllUsers(u);
      setAllRoles(r);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openGroup = async (group: Group) => {
    setSelectedGroup(group);
    setEditForm({ name: group.name, description: group.description, color: group.color });
    const [members, roles] = await Promise.all([
      fetch(`${API}/org/groups/${group.id}/members`).then(x => x.json()),
      fetch(`${API}/org/groups/${group.id}/roles`).then(x => x.json()),
    ]);
    setGroupMemberIds(new Set(members.map((u: any) => u.id)));
    setGroupRoleIds(new Set(roles.map((r: any) => r.id)));
  };

  const closeGroup = () => { setSelectedGroup(null); setEditForm(null); };

  const saveGroup = async () => {
    if (!selectedGroup || !editForm) return;
    setSaving(true);
    try {
      await fetch(`${API}/org/groups/${selectedGroup.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      });
      await fetch(`${API}/org/groups/${selectedGroup.id}/members`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(groupMemberIds) }),
      });
      await fetch(`${API}/org/groups/${selectedGroup.id}/roles`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleIds: Array.from(groupRoleIds) }),
      });
      await load();
    } finally { setSaving(false); }
  };

  const deleteGroup = async (id: number) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await fetch(`${API}/org/groups/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (selectedGroup?.id === id) closeGroup();
    await load();
  };

  const createGroup = async () => {
    if (!createForm.name) return;
    setSaving(true);
    try {
      const row = await fetch(`${API}/org/groups`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      }).then(x => x.json());
      setCreating(false);
      setCreateForm({ name: '', description: '', color: '' });
      await load();
      openGroup(row);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Main tree */}
      <div className={cn('flex flex-col h-full border-r border-border transition-all', selectedGroup ? 'w-72 flex-shrink-0' : 'flex-1')}>
        <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h1 className="text-2xl font-display font-bold">Groups</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Organize users into groups and assign roles</p>
          </div>
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Add Group
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-border">

            {/* Groups list */}
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Network className="w-10 h-10 mb-3 opacity-25" />
                <p className="text-sm">No groups yet — click Add Group to create one</p>
              </div>
            ) : groups.map(g => (
              <div key={g.id} role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') openGroup(g); }}
                onClick={() => openGroup(g)}
                className={cn('flex items-center gap-3 px-6 py-4 cursor-pointer hover:bg-secondary/40 transition-colors group', selectedGroup?.id === g.id && 'bg-primary/5')}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: g.color || 'hsl(var(--secondary))', color: g.color ? '#fff' : 'hsl(var(--muted-foreground))' }}>
                  {g.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.name}</div>
                  {g.description && <div className="text-xs text-muted-foreground truncate">{g.description}</div>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {confirmDelete === g.id ? (
                    <>
                      <button onClick={e => { e.stopPropagation(); deleteGroup(g.id); }}
                        className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold">Confirm</button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                        className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground font-semibold">Cancel</button>
                    </>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); deleteGroup(g.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

          </div>
        )}
      </div>

      {/* Group detail panel */}
      {selectedGroup && editForm && (
        <div className="flex-1 min-w-0 flex flex-col bg-card/40">
          <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: editForm.color || 'hsl(var(--secondary))', color: editForm.color ? '#fff' : 'hsl(var(--muted-foreground))' }}>
                {editForm.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="font-semibold">{selectedGroup.name}</span>
            </div>
            <button onClick={closeGroup} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5 max-w-lg">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Group Name</label>
              <input value={editForm.name} onChange={e => setEditForm(f => f && ({ ...f, name: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
              <input value={editForm.description} onChange={e => setEditForm(f => f && ({ ...f, description: e.target.value }))}
                placeholder="Optional description…"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setEditForm(f => f && ({ ...f, color: c }))}
                    className={cn('w-7 h-7 rounded-full border-2 transition-transform hover:scale-110', editForm.color === c ? 'border-primary scale-110' : 'border-transparent')}
                    style={{ background: c || 'hsl(var(--secondary))' }} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members ({groupMemberIds.size})</div>
              {allUsers.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No users available</div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  {allUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                      <input type="checkbox" checked={groupMemberIds.has(u.id)} onChange={() => {
                        setGroupMemberIds(s => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; });
                      }} className="w-3.5 h-3.5 rounded accent-primary" />
                      <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {u.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Roles ({groupRoleIds.size})</div>
              <div className="text-xs text-muted-foreground">Roles define what permissions members of this group inherit.</div>
              {allRoles.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No roles yet — create roles in the Roles tab</div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  {allRoles.map(r => (
                    <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                      <input type="checkbox" checked={groupRoleIds.has(r.id)} onChange={() => {
                        setGroupRoleIds(s => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
                      }} className="w-3.5 h-3.5 rounded accent-primary" />
                      <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: r.color || 'hsl(var(--secondary))' }} />
                      <div>
                        <div className="text-sm font-medium">{r.name}</div>
                        {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button onClick={saveGroup} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Group
            </button>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[420px] bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Add Group</h2>
              <button onClick={() => setCreating(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Group name…"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description <span className="normal-case font-normal text-muted-foreground/50">(optional)</span></label>
                <input value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description…"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setCreateForm(f => ({ ...f, color: c }))}
                      className={cn('w-7 h-7 rounded-full border-2 transition-transform hover:scale-110', createForm.color === c ? 'border-primary scale-110' : 'border-transparent')}
                      style={{ background: c || 'hsl(var(--secondary))' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setCreating(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
              <button onClick={createGroup} disabled={saving || !createForm.name}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── dummy used-for-import removal guard ──────────────────────────────────────
// These were previously used and might be unused now — TypeScript will warn
// but app runs fine with tsx
const _unused = { Building2, Layers, FolderOpen }; void _unused;
