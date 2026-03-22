import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, Edit2, X, Check, Loader2, Shield, ShieldCheck, User,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Search,
  Database, Layers, Lock, Mail, Copy, KeyRound, Eye, EyeOff,
  Building2, Tag, FolderOpen, Network, ChevronRight, Pencil, Globe, Briefcase,
} from 'lucide-react';
import { cn, copyToClipboard } from '@/lib/utils';
import { PhoneInput } from '@/components/phone-input';

const API = '/api';
const TOKEN_KEY = 'nonprofit-os-auth-token';
function authedFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

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

interface UserCategory { id: number; name: string; color: string; description: string; }

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  orgRoles: string[];
  designation: string;
  category: string;
  isActive: boolean;
  dataScope: string;
  privilegeMode: string;
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
interface Role { id: number; name: string; description: string; color: string; isSystem: boolean; }
interface Project { id: number; name: string; description: string; }
interface BusinessUnit { id: number; name: string; description: string; color: string; }
interface Region { id: number; name: string; description: string; color: string; }
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

function RoleBadge({ orgRoles }: { orgRoles: string[] }) {
  const labels = orgRoles.length > 0 ? orgRoles : ['All Users'];
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map(label => (
        <span key={label} className={cn(
          'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide',
          label.toLowerCase().includes('administrators') ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
        )}>
          {label}
        </span>
      ))}
    </div>
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
      const r = await authedFetch(`${API}/users`);
      if (r.ok) setUsers(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openUser = async (u: UserRow) => {
    const r = await authedFetch(`${API}/users/${u.id}`);
    if (r.ok) {
      const detail: UserDetail = await r.json();
      setSelectedUser(detail);
      setPanelOpen(true);
    }
  };

  const closePanel = () => { setPanelOpen(false); setSelectedUser(null); };

  const handleDelete = async (id: number) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await authedFetch(`${API}/users/${id}`, { method: 'DELETE' });
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
                  <th className="text-left px-3 py-3 font-semibold">Category</th>
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
                    <td className="px-3 py-3"><RoleBadge orgRoles={u.orgRoles ?? []} /></td>
                    <td className="px-3 py-3">
                      {u.category ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{u.category}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
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
            const r = await authedFetch(`${API}/users/${selectedUser.id}`);
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
  const [privilegeMode, setPrivilegeMode] = useState<string>(user.privilegeMode || 'user');

  useEffect(() => { setPrivilegeMode(user.privilegeMode || 'user'); }, [user.id]);

  const showSave = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2000); };

  const handlePrivilegeModeChange = async (mode: string) => {
    setPrivilegeMode(mode);
    await authedFetch(`${API}/users/${user.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privilegeMode: mode }),
    });
    await onSaved();
    showSave('Saved ✓');
  };

  const isRoleMode = privilegeMode === 'role';

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
          <RoleBadge orgRoles={user.orgRoles ?? []} />
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
        ] as { key: Tab; label: string; icon: React.ElementType }[]).map(t => {
          const isLocked = isRoleMode && (t.key === 'modules' || t.key === 'data-access' || t.key === 'fields');
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                isLocked && 'opacity-50'
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {isLocked && <Lock className="w-2.5 h-2.5 ml-0.5 opacity-60" />}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'profile' && (
          <ProfileTab user={user} privilegeMode={privilegeMode} onPrivilegeModeChange={handlePrivilegeModeChange} onSaved={async () => { await onSaved(); showSave('Saved ✓'); }} />
        )}
        {tab === 'modules' && (
          <ModulesTab user={user} privilegeMode={privilegeMode} onSaved={async () => { await onSaved(); showSave('Saved ✓'); }} />
        )}
        {tab === 'data-access' && (
          <DataAccessTab user={user} privilegeMode={privilegeMode} onSaved={async () => { await onSaved(); showSave('Saved ✓'); }} />
        )}
        {tab === 'fields' && (
          <FieldPermissionsTab user={user} privilegeMode={privilegeMode} onSaved={async () => { await onSaved(); showSave('Saved ✓'); }} />
        )}
        {tab === 'org' && (
          <OrgTab userId={user.id} />
        )}
      </div>
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ user, privilegeMode, onPrivilegeModeChange, onSaved }: { user: UserDetail; privilegeMode: string; onPrivilegeModeChange: (mode: string) => Promise<void>; onSaved: () => Promise<void> }) {
  const initForm = () => ({
    name: user.name,
    firstName: (user as any).firstName ?? '',
    lastName: (user as any).lastName ?? '',
    preferredName: (user as any).preferredName ?? '',
    email: user.email,
    role: user.role,
    designation: user.designation ?? '',
    jobDescription: (user as any).jobDescription ?? '',
    phone: (user as any).phone ?? '',
    category: (user as any).category ?? '',
    isActive: user.isActive,
  });
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [resetResult, setResetResult] = useState<{ link: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);

  useEffect(() => {
    setForm(initForm());
    setResetResult(null);
  }, [user.id]);

  useEffect(() => {
    authedFetch(`${API}/org/user-categories`).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUserCategories(d);
    }).catch(() => {});
  }, []);

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
    setSaveError('');
    try {
      const r = await authedFetch(`${API}/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, firstName: form.firstName, lastName: form.lastName, preferredName: form.preferredName, email: form.email, role: form.role, designation: form.designation, jobDescription: form.jobDescription, phone: form.phone, category: form.category, isActive: form.isActive }),
      });
      if (!r.ok) { const d = await r.json(); setSaveError(d.error || 'Failed to save changes'); return; }
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
      const r = await authedFetch(`${API}/users/${user.id}/send-password-reset`, { method: 'POST' });
      const d = await r.json();
      setResetResult({ link: window.location.origin + d.resetLink, message: d.message });
    } finally {
      setSendingReset(false);
    }
  };

  const copyLink = () => {
    if (resetResult) {
      copyToClipboard(resetResult.link);
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
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Job Description <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
        <textarea
          value={form.jobDescription}
          onChange={e => setForm(f => ({ ...f, jobDescription: e.target.value }))}
          placeholder="Describe the role's responsibilities, scope, and key duties…"
          rows={4}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[80px]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
        <PhoneInput
          value={form.phone}
          onChange={val => setForm(f => ({ ...f, phone: val }))}
          placeholder="Mobile number"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="">— None —</option>
          {userCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between py-3 px-4 bg-secondary/40 rounded-xl">
        <div>
          <div className="text-sm font-medium">Account Active</div>
          <div className="text-xs text-muted-foreground">Inactive accounts cannot log in</div>
        </div>
        <Toggle checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />
      </div>

      {saveError && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">{saveError}</div>
      )}

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

      {/* ── Privilege Mode ── */}
      <div className="border-t border-border pt-5 space-y-3">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            Access Privilege Source
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose whether this user's access privileges are managed individually or inherited from their assigned role.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([
            {
              key: 'user',
              label: 'User Privileges',
              desc: 'Privileges are set individually for this user in the Modules, Data Access, and Fields tabs.',
              icon: User,
            },
            {
              key: 'role',
              label: 'Role Privileges',
              desc: 'Privileges are inherited from the user\'s assigned role. Individual settings are locked.',
              icon: Shield,
            },
          ] as { key: string; label: string; desc: string; icon: React.ElementType }[]).map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onPrivilegeModeChange(opt.key)}
              className={cn(
                'relative text-left rounded-xl border-2 p-4 transition-all',
                privilegeMode === opt.key
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-border/80 hover:bg-secondary/40'
              )}
            >
              <div className={cn('flex items-center gap-2 font-semibold text-sm mb-1', privilegeMode === opt.key ? 'text-primary' : 'text-foreground')}>
                <opt.icon className="w-4 h-4 shrink-0" />
                {opt.label}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
              {privilegeMode === opt.key && (
                <span className="absolute top-3 right-3 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-primary-foreground" />
                </span>
              )}
            </button>
          ))}
        </div>
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

function ModulesTab({ user, privilegeMode, onSaved }: { user: UserDetail; privilegeMode: string; onSaved: () => Promise<void> }) {
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
      await authedFetch(`${API}/users/${user.id}/modules`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modules }),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (privilegeMode === 'role') {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 rounded-2xl border-2 border-dashed border-border bg-secondary/20 text-center">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            <Shield className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <div className="font-semibold text-sm">Controlled by Role</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              This user's module access is inherited from their assigned role. Switch to <span className="font-medium text-foreground">User Privileges</span> in the Profile tab to configure individual access.
            </p>
          </div>
        </div>
      </div>
    );
  }

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

function DataAccessTab({ user, privilegeMode, onSaved }: { user: UserDetail; privilegeMode: string; onSaved: () => Promise<void> }) {
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
      authedFetch(`${API}/processes`).then(r => r.json()).then(data => setProcessList(data));
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
      await authedFetch(`${API}/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataScope: scope }),
      });
      await authedFetch(`${API}/users/${user.id}/categories`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: Array.from(selectedCategories) }),
      });
      const processes = Array.from(processAccess.entries()).map(([processId, canEdit]) => ({ processId, canEdit }));
      await authedFetch(`${API}/users/${user.id}/processes`, {
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

  if (privilegeMode === 'role') {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 rounded-2xl border-2 border-dashed border-border bg-secondary/20 text-center">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            <Shield className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <div className="font-semibold text-sm">Controlled by Role</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              This user's data access is inherited from their assigned role. Switch to <span className="font-medium text-foreground">User Privileges</span> in the Profile tab to configure individual access.
            </p>
          </div>
        </div>
      </div>
    );
  }

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

function FieldPermissionsTab({ user, privilegeMode, onSaved }: { user: UserDetail; privilegeMode: string; onSaved: () => Promise<void> }) {
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
      await authedFetch(`${API}/users/${user.id}/field-permissions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions }),
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (privilegeMode === 'role') {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 rounded-2xl border-2 border-dashed border-border bg-secondary/20 text-center">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            <Shield className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <div className="font-semibold text-sm">Controlled by Role</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              This user's field permissions are inherited from their assigned role. Switch to <span className="font-medium text-foreground">User Privileges</span> in the Profile tab to configure individual access.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
  const [form, setForm] = useState({ firstName: '', lastName: '', preferredName: '', name: '', email: '', designation: '', jobDescription: '', phone: '', role: 'user', category: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdUser, setCreatedUser] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);

  useEffect(() => {
    authedFetch(`${API}/org/user-categories`).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUserCategories(d);
    }).catch(() => {});
  }, []);

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
      const r = await authedFetch(`${API}/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, name: resolvedName, phone: form.phone }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.error || 'Failed to create user'); return; }
      const d = await r.json();
      setCreatedUser({ name: d.name || [form.firstName, form.lastName].filter(Boolean).join(' ') || form.email, email: d.email, tempPassword: d.tempPassword });
      await onCreate();
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = () => {
    if (createdUser) copyToClipboard(createdUser.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (createdUser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-[440px] bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg">User Created</h2>
              <p className="text-xs text-muted-foreground">Share these credentials securely with the new user</p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex gap-2"><span className="text-muted-foreground w-16">Name:</span><span className="font-medium">{createdUser.name}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground w-16">Email:</span><span className="font-medium">{createdUser.email}</span></div>
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground w-16">Password:</span>
              <div className="flex items-center gap-2">
                <code className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{showTempPassword ? createdUser.tempPassword : '••••••••••••'}</code>
                <button onClick={() => setShowTempPassword(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {showTempPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button onClick={copyPassword} className="text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-1">The user must set a new password on their first login.</p>
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
          <KeyRound className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>A temporary password will be generated. Share it securely — the user must set a new password on first login.</span>
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
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
            <PhoneInput
              value={form.phone}
              onChange={val => setForm(f => ({ ...f, phone: val }))}
              placeholder="Mobile number"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Designation <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
            <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
              placeholder="e.g. Program Manager, Finance Director…"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Job Description <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
            <textarea
              value={form.jobDescription}
              onChange={e => setForm(f => ({ ...f, jobDescription: e.target.value }))}
              placeholder="Describe the role's responsibilities, scope, and key duties…"
              rows={4}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[80px]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category <span className="normal-case text-muted-foreground/50 font-normal">(optional)</span></label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">— None —</option>
              {userCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
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
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [allBUs, setAllBUs] = useState<BusinessUnit[]>([]);
  const [allRegions, setAllRegions] = useState<Region[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [groupIds, setGroupIds] = useState<Set<number>>(new Set());
  const [roleIds, setRoleIds] = useState<Set<number>>(new Set());
  const [buIds, setBuIds] = useState<Set<number>>(new Set());
  const [regionIds, setRegionIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const [ug, ag, ur_assigned, ar, ubu, abu, ureg, areg] = await Promise.all([
      authedFetch(`${API}/org/users/${userId}/groups`).then(x => x.json()),
      authedFetch(`${API}/org/groups`).then(x => x.json()),
      authedFetch(`${API}/org/users/${userId}/roles`).then(x => x.json()),
      authedFetch(`${API}/org/roles`).then(x => x.json()),
      authedFetch(`${API}/org/users/${userId}/business-units`).then(x => x.json()),
      authedFetch(`${API}/org/business-units`).then(x => x.json()),
      authedFetch(`${API}/org/users/${userId}/regions`).then(x => x.json()),
      authedFetch(`${API}/org/regions`).then(x => x.json()),
    ]);
    setUserGroups(ug);
    setAllGroups(ag);
    setAllRoles(Array.isArray(ar) ? ar : []);
    setAllBUs(abu);
    setAllRegions(areg);
    setGroupIds(new Set(ug.map((g: any) => g.id)));
    setRoleIds(new Set(ur_assigned.map((r: any) => r.id)));
    setBuIds(new Set(ubu.map((b: any) => b.id)));
    setRegionIds(new Set(ureg.map((r: any) => r.id)));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        authedFetch(`${API}/org/users/${userId}/groups`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: Array.from(groupIds) }),
        }),
        authedFetch(`${API}/org/users/${userId}/roles`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleIds: Array.from(roleIds) }),
        }),
        authedFetch(`${API}/org/users/${userId}/business-units`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessUnitIds: Array.from(buIds) }),
        }),
        authedFetch(`${API}/org/users/${userId}/regions`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regionIds: Array.from(regionIds) }),
        }),
      ]);
      setSaveMsg('Saved ✓');
      setTimeout(() => setSaveMsg(''), 2000);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-6 max-w-lg">
      {/* Groups */}
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
                <input type="checkbox" checked={groupIds.has(g.id)} onChange={() => setGroupIds(s => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
                <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: g.color || 'hsl(var(--secondary))' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{g.name}</div>
                  {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
                </div>
              </label>
            ))}
          </div>
        )}
        {userGroups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {userGroups.map(g => (
              <span key={g.id} className="text-xs px-2.5 py-1 rounded-full font-medium border"
                style={{ background: g.color ? `${g.color}20` : 'hsl(var(--secondary))', color: g.color || 'hsl(var(--muted-foreground))', borderColor: g.color ? `${g.color}40` : 'hsl(var(--border))' }}>
                {g.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Roles */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Roles ({roleIds.size} assigned)</span>
        </div>
        {allRoles.length === 0 ? (
          <div className="text-xs text-muted-foreground pl-5 py-2 italic">No roles defined yet — create roles in the Roles tab</div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {allRoles.map(r => (
              <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                <input type="checkbox" checked={roleIds.has(r.id)} onChange={() => setRoleIds(s => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
                <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: r.color || 'hsl(var(--secondary))' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </div>
                {roleIds.has(r.id) && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">Assigned</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Business Units */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Units ({buIds.size} assigned)</span>
        </div>
        {allBUs.length === 0 ? (
          <div className="text-xs text-muted-foreground pl-5 py-2 italic">No business units defined yet — create them in the Org Structure tab</div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {allBUs.map(b => (
              <label key={b.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                <input type="checkbox" checked={buIds.has(b.id)} onChange={() => setBuIds(s => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
                <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: b.color || 'hsl(var(--secondary))' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{b.name}</div>
                  {b.description && <div className="text-xs text-muted-foreground">{b.description}</div>}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Regions */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Regions ({regionIds.size} assigned)</span>
        </div>
        {allRegions.length === 0 ? (
          <div className="text-xs text-muted-foreground pl-5 py-2 italic">No regions defined yet — create them in the Org Structure tab</div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {allRegions.map(r => (
              <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                <input type="checkbox" checked={regionIds.has(r.id)} onChange={() => setRegionIds(s => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
                <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: r.color || 'hsl(var(--secondary))' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Org Assignments
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
    authedFetch(`${API}/org/roles/${roleId}/permissions`).then(r => r.json()).then(p => {
      const map: Record<string, boolean> = Object.fromEntries(MODULES.map(m => [m.key, true]));
      p.modules.forEach((m: any) => { map[m.module] = m.hasAccess; });
      setAccess(map);
    });
  }, [roleId]);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch(`${API}/org/roles/${roleId}/modules`, {
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
    authedFetch(`${API}/org/roles/${roleId}/permissions`).then(r => r.json()).then(p => {
      setSelectedCategories(new Set(p.categories.map((c: any) => c.category)));
      setProcessAccess(new Map(p.processes.map((pr: any) => [pr.processId, pr.canEdit])));
    });
  }, [roleId]);

  useEffect(() => {
    if (scope === 'processes' && processList.length === 0)
      authedFetch(`${API}/processes`).then(r => r.json()).then(setProcessList);
  }, [scope]);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch(`${API}/org/roles/${roleId}/categories`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: scope === 'categories' ? Array.from(selectedCategories) : [] }),
      });
      await authedFetch(`${API}/org/roles/${roleId}/processes`, {
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
    authedFetch(`${API}/org/roles/${roleId}/permissions`).then(r => r.json()).then(p => {
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
      await authedFetch(`${API}/org/roles/${roleId}/field-permissions`, {
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
        authedFetch(`${API}/org/roles`).then(x => x.json()),
        authedFetch(`${API}/org/groups`).then(x => x.json()),
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
    const gs = await authedFetch(`${API}/org/roles/${role.id}/groups`).then(x => x.json());
    setRoleGroupIds(new Set(gs.map((g: any) => g.id)));
  };

  const closeRole = () => { setSelectedRole(null); setForm(null); };

  const createRole = async () => {
    const row = await authedFetch(`${API}/org/roles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New Role' }),
    }).then(x => x.json());
    await load();
    openRole(row);
  };

  const saveOverview = async () => {
    if (!selectedRole || !form) return;
    setSaving(true);
    try {
      await authedFetch(`${API}/org/roles/${selectedRole.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      await authedFetch(`${API}/org/roles/${selectedRole.id}/groups`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: Array.from(roleGroupIds) }),
      });
      await load();
    } finally { setSaving(false); }
  };

  const deleteRole = async (id: number) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await authedFetch(`${API}/org/roles/${id}`, { method: 'DELETE' });
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
                    {r.isSystem ? (
                      <span title="System role cannot be deleted" className="p-1.5 text-muted-foreground/40">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    ) : confirmDelete === r.id ? (
                      <>
                        <button onClick={e => { e.stopPropagation(); deleteRole(r.id); }}
                          className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold">Confirm</button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                          className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground font-semibold">Cancel</button>
                      </>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete(r.id); }}
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

type OrgSubTab = 'groups' | 'business-units' | 'regions';

function OrgStructureView() {
  const [subTab, setSubTab] = useState<OrgSubTab>('groups');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none flex items-center gap-1 px-6 pt-4 pb-0 border-b border-border">
        {([
          { key: 'groups', label: 'Groups', icon: Network },
          { key: 'business-units', label: 'Business Units', icon: Briefcase },
          { key: 'regions', label: 'Regions', icon: Globe },
        ] as { key: OrgSubTab; label: string; icon: React.ElementType }[]).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition-colors -mb-px',
              subTab === t.key
                ? 'border-primary text-foreground bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {subTab === 'groups' && <GroupsManageView />}
        {subTab === 'business-units' && <OrgEntityManageView entityType="business-units" label="Business Unit" Icon={Briefcase} emptyMsg="Organize users into business units" />}
        {subTab === 'regions' && <OrgEntityManageView entityType="regions" label="Region" Icon={Globe} emptyMsg="Organize users into geographic regions" />}
      </div>
    </div>
  );
}

// ── Shared entity panel (Business Units / Regions) ─────────────────────────────

function OrgEntityManageView({
  entityType, label, Icon, emptyMsg,
}: {
  entityType: 'business-units' | 'regions';
  label: string;
  Icon: React.ElementType;
  emptyMsg: string;
}) {
  const [items, setItems] = useState<BusinessUnit[] | Region[]>([]);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BusinessUnit | Region | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; color: string } | null>(null);
  const [memberUserIds, setMemberUserIds] = useState<Set<number>>(new Set());
  const [memberGroupIds, setMemberGroupIds] = useState<Set<number>>(new Set());
  const [memberRoleIds, setMemberRoleIds] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', color: '' });

  const COLORS = ['', '#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [it, u, g, r] = await Promise.all([
        authedFetch(`${API}/org/${entityType}`).then(x => x.json()),
        authedFetch(`${API}/users`).then(x => x.json()),
        authedFetch(`${API}/org/groups`).then(x => x.json()),
        authedFetch(`${API}/org/roles`).then(x => x.json()),
      ]);
      setItems(it);
      setAllUsers(u);
      setAllGroups(g);
      setAllRoles(r);
    } finally { setLoading(false); }
  }, [entityType]);

  useEffect(() => { load(); }, [load]);

  const openItem = async (item: BusinessUnit | Region) => {
    setSelected(item);
    setEditForm({ name: item.name, description: item.description, color: item.color });
    const [uRows, gRows, rRows] = await Promise.all([
      authedFetch(`${API}/org/${entityType}/${item.id}/users`).then(x => x.json()),
      authedFetch(`${API}/org/${entityType}/${item.id}/groups`).then(x => x.json()),
      authedFetch(`${API}/org/${entityType}/${item.id}/roles`).then(x => x.json()),
    ]);
    setMemberUserIds(new Set(uRows.map((x: any) => x.id)));
    setMemberGroupIds(new Set(gRows.map((x: any) => x.id)));
    setMemberRoleIds(new Set(rRows.map((x: any) => x.id)));
  };

  const closeItem = () => { setSelected(null); setEditForm(null); };

  const saveItem = async () => {
    if (!selected || !editForm) return;
    setSaving(true);
    try {
      await Promise.all([
        authedFetch(`${API}/org/${entityType}/${selected.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
        }),
        authedFetch(`${API}/org/${entityType}/${selected.id}/users`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: Array.from(memberUserIds) }),
        }),
        authedFetch(`${API}/org/${entityType}/${selected.id}/groups`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: Array.from(memberGroupIds) }),
        }),
        authedFetch(`${API}/org/${entityType}/${selected.id}/roles`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleIds: Array.from(memberRoleIds) }),
        }),
      ]);
      await load();
    } finally { setSaving(false); }
  };

  const deleteItem = async (id: number) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await authedFetch(`${API}/org/${entityType}/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (selected?.id === id) closeItem();
    await load();
  };

  const createItem = async () => {
    if (!createForm.name) return;
    setSaving(true);
    try {
      const row = await authedFetch(`${API}/org/${entityType}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createForm),
      }).then(x => x.json());
      setCreating(false);
      setCreateForm({ name: '', description: '', color: '' });
      await load();
      openItem(row);
    } finally { setSaving(false); }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* List */}
      <div className={cn('flex flex-col h-full border-r border-border transition-all', selected ? 'w-72 flex-shrink-0' : 'flex-1')}>
        <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h1 className="text-2xl font-display font-bold">{label}s</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{emptyMsg}</p>
          </div>
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Icon className="w-10 h-10 mb-3 opacity-25" />
                <p className="text-sm">No {label.toLowerCase()}s yet — click Add to create one</p>
              </div>
            ) : (items as any[]).map((item: any) => (
              <div key={item.id} role="button" tabIndex={0}
                onKeyDown={(e: any) => { if (e.key === 'Enter') openItem(item); }}
                onClick={() => openItem(item)}
                className={cn('flex items-center gap-3 px-6 py-4 cursor-pointer hover:bg-secondary/40 transition-colors group', selected?.id === item.id && 'bg-primary/5')}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: item.color || 'hsl(var(--secondary))', color: item.color ? '#fff' : 'hsl(var(--muted-foreground))' }}>
                  {item.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.name}</div>
                  {item.description && <div className="text-xs text-muted-foreground truncate">{item.description}</div>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {confirmDelete === item.id ? (
                    <>
                      <button onClick={(e: any) => { e.stopPropagation(); deleteItem(item.id); }}
                        className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold">Confirm</button>
                      <button onClick={(e: any) => { e.stopPropagation(); setConfirmDelete(null); }}
                        className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground font-semibold">Cancel</button>
                    </>
                  ) : (
                    <button onClick={(e: any) => { e.stopPropagation(); deleteItem(item.id); }}
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

      {/* Detail panel */}
      {selected && editForm && (
        <div className="flex-1 min-w-0 flex flex-col bg-card/40">
          <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: editForm.color || 'hsl(var(--secondary))', color: editForm.color ? '#fff' : 'hsl(var(--muted-foreground))' }}>
                {editForm.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="font-semibold">{selected.name}</span>
            </div>
            <button onClick={closeItem} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5 max-w-lg">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
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
            {/* Users */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users ({memberUserIds.size})</span>
              </div>
              {allUsers.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No users available</div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                  {allUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                      <input type="checkbox" checked={memberUserIds.has(u.id)} onChange={() => setMemberUserIds(s => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
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
            {/* Groups */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Network className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Groups ({memberGroupIds.size})</span>
              </div>
              {allGroups.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No groups yet</div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                  {allGroups.map(g => (
                    <label key={g.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                      <input type="checkbox" checked={memberGroupIds.has(g.id)} onChange={() => setMemberGroupIds(s => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
                      <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: g.color || 'hsl(var(--secondary))' }} />
                      <div>
                        <div className="text-sm font-medium">{g.name}</div>
                        {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* Roles */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Roles ({memberRoleIds.size})</span>
              </div>
              {allRoles.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No roles yet</div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                  {allRoles.map(r => (
                    <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                      <input type="checkbox" checked={memberRoleIds.has(r.id)} onChange={() => setMemberRoleIds(s => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
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
            <button onClick={saveItem} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save {label}
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[420px] bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Add {label}</h2>
              <button onClick={() => setCreating(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={`${label} name…`}
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
              <button onClick={createItem} disabled={saving || !createForm.name}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create {label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Groups manage view ─────────────────────────────────────────────────────────

function GroupsManageView() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [allBUs, setAllBUs] = useState<BusinessUnit[]>([]);
  const [allRegions, setAllRegions] = useState<Region[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMemberIds, setGroupMemberIds] = useState<Set<number>>(new Set());
  const [groupRoleIds, setGroupRoleIds] = useState<Set<number>>(new Set());
  const [groupBUIds, setGroupBUIds] = useState<Set<number>>(new Set());
  const [groupRegionIds, setGroupRegionIds] = useState<Set<number>>(new Set());
  const [editForm, setEditForm] = useState<{ name: string; description: string; color: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', color: '' });

  const COLORS = ['', '#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, u, r, bu, reg] = await Promise.all([
        authedFetch(`${API}/org/groups`).then(x => x.json()),
        authedFetch(`${API}/users`).then(x => x.json()),
        authedFetch(`${API}/org/roles`).then(x => x.json()),
        authedFetch(`${API}/org/business-units`).then(x => x.json()),
        authedFetch(`${API}/org/regions`).then(x => x.json()),
      ]);
      setGroups(g); setAllUsers(u); setAllRoles(r); setAllBUs(bu); setAllRegions(reg);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openGroup = async (group: Group) => {
    setSelectedGroup(group);
    setEditForm({ name: group.name, description: group.description, color: group.color });
    const [members, roles, bus, regs] = await Promise.all([
      authedFetch(`${API}/org/groups/${group.id}/members`).then(x => x.json()),
      authedFetch(`${API}/org/groups/${group.id}/roles`).then(x => x.json()),
      authedFetch(`${API}/org/groups/${group.id}/business-units`).then(x => x.json()),
      authedFetch(`${API}/org/groups/${group.id}/regions`).then(x => x.json()),
    ]);
    setGroupMemberIds(new Set(members.map((u: any) => u.id)));
    setGroupRoleIds(new Set(roles.map((r: any) => r.id)));
    setGroupBUIds(new Set(bus.map((b: any) => b.id)));
    setGroupRegionIds(new Set(regs.map((r: any) => r.id)));
  };

  const closeGroup = () => { setSelectedGroup(null); setEditForm(null); };

  const saveGroup = async () => {
    if (!selectedGroup || !editForm) return;
    setSaving(true);
    try {
      await Promise.all([
        authedFetch(`${API}/org/groups/${selectedGroup.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
        }),
        authedFetch(`${API}/org/groups/${selectedGroup.id}/members`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: Array.from(groupMemberIds) }),
        }),
        authedFetch(`${API}/org/groups/${selectedGroup.id}/roles`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleIds: Array.from(groupRoleIds) }),
        }),
        authedFetch(`${API}/org/groups/${selectedGroup.id}/business-units`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessUnitIds: Array.from(groupBUIds) }),
        }),
        authedFetch(`${API}/org/groups/${selectedGroup.id}/regions`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regionIds: Array.from(groupRegionIds) }),
        }),
      ]);
      await load();
    } finally { setSaving(false); }
  };

  const deleteGroup = async (id: number) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await authedFetch(`${API}/org/groups/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (selectedGroup?.id === id) closeGroup();
    await load();
  };

  const createGroup = async () => {
    if (!createForm.name) return;
    setSaving(true);
    try {
      const row = await authedFetch(`${API}/org/groups`, {
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
      {/* Main list */}
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
                <div className="border border-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
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
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Business Units ({groupBUIds.size})</span>
              </div>
              {allBUs.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No business units yet — create them in the Business Units tab</div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  {allBUs.map(b => (
                    <label key={b.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                      <input type="checkbox" checked={groupBUIds.has(b.id)} onChange={() => setGroupBUIds(s => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
                      <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: b.color || 'hsl(var(--secondary))' }} />
                      <div>
                        <div className="text-sm font-medium">{b.name}</div>
                        {b.description && <div className="text-xs text-muted-foreground">{b.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Regions ({groupRegionIds.size})</span>
              </div>
              {allRegions.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No regions yet — create them in the Regions tab</div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  {allRegions.map(r => (
                    <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                      <input type="checkbox" checked={groupRegionIds.has(r.id)} onChange={() => setGroupRegionIds(s => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="w-3.5 h-3.5 rounded accent-primary" />
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
const _unused = { Building2, Layers, FolderOpen, Edit2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Database, Lock, Mail, Copy, KeyRound, Shield, User, Pencil, ChevronRight }; void _unused;
