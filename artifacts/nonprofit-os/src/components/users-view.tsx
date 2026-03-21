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

interface OrgRole { id: number; name: string; description: string; color: string; }
interface Division { id: number; name: string; description: string; }
interface Department { id: number; name: string; description: string; divisionId: number | null; }
interface Project { id: number; name: string; description: string; divisionId: number | null; departmentId: number | null; }
interface UserMemberships {
  roles: { id: number; name: string; color: string }[];
  divisions: { id: number; name: string }[];
  departments: { id: number; name: string }[];
  projects: { id: number; name: string }[];
}

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
  const initForm = () => ({ name: user.name, email: user.email, role: user.role, designation: user.designation ?? '', isActive: user.isActive });
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetResult, setResetResult] = useState<{ link: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setForm(initForm());
    setResetResult(null);
  }, [user.id]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/users/${user.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, role: form.role, designation: form.designation, isActive: form.isActive }),
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
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
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
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Allowed Processes ({processAccess.size} selected)
            </div>
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
  const [form, setForm] = useState({ name: '', email: '', designation: '', role: 'user' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (!form.name || !form.email) { setError('Name and email are required'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`${API}/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
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
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
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
  const [memberships, setMemberships] = useState<UserMemberships | null>(null);
  const [allRoles, setAllRoles] = useState<OrgRole[]>([]);
  const [allDivisions, setAllDivisions] = useState<Division[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const load = useCallback(async () => {
    const [m, r, div, dep, proj] = await Promise.all([
      fetch(`${API}/org/users/${userId}/memberships`).then(x => x.json()),
      fetch(`${API}/org/roles`).then(x => x.json()),
      fetch(`${API}/org/divisions`).then(x => x.json()),
      fetch(`${API}/org/departments`).then(x => x.json()),
      fetch(`${API}/org/projects`).then(x => x.json()),
    ]);
    setMemberships(m);
    setAllRoles(r);
    setAllDivisions(div);
    setAllDepartments(dep);
    setAllProjects(proj);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const [sel, setSel] = useState<{
    roleIds: Set<number>; divisionIds: Set<number>; departmentIds: Set<number>; projectIds: Set<number>;
  }>({ roleIds: new Set(), divisionIds: new Set(), departmentIds: new Set(), projectIds: new Set() });

  useEffect(() => {
    if (!memberships) return;
    setSel({
      roleIds: new Set(memberships.roles.map(r => r.id)),
      divisionIds: new Set(memberships.divisions.map(d => d.id)),
      departmentIds: new Set(memberships.departments.map(d => d.id)),
      projectIds: new Set(memberships.projects.map(p => p.id)),
    });
  }, [memberships]);

  const toggle = (kind: 'roleIds' | 'divisionIds' | 'departmentIds' | 'projectIds', id: number) => {
    setSel(s => {
      const next = new Set(s[kind]);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...s, [kind]: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API}/org/users/${userId}/memberships`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleIds: Array.from(sel.roleIds),
          divisionIds: Array.from(sel.divisionIds),
          departmentIds: Array.from(sel.departmentIds),
          projectIds: Array.from(sel.projectIds),
        }),
      });
      setSaveMsg('Saved ✓');
      setTimeout(() => setSaveMsg(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!memberships) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  const Section = ({ label, icon: Icon, children, empty }: { label: string; icon: React.ElementType; children: React.ReactNode; empty: string }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      {React.Children.count(children) === 0
        ? <div className="text-xs text-muted-foreground pl-5 py-1 italic">{empty}</div>
        : <div className="space-y-1 pl-5">{children}</div>
      }
    </div>
  );

  const CheckItem = ({ id, label, kind }: { id: number; label: string; kind: 'roleIds' | 'divisionIds' | 'departmentIds' | 'projectIds' }) => (
    <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-secondary/40 cursor-pointer transition-colors">
      <input type="checkbox" checked={sel[kind].has(id)} onChange={() => toggle(kind, id)} className="w-3.5 h-3.5 rounded accent-primary" />
      <span className="text-sm">{label}</span>
    </label>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Roles */}
      <Section label="Roles" icon={Tag} empty={allRoles.length === 0 ? 'No roles defined yet' : 'No roles assigned'}>
        {allRoles.map(r => <CheckItem key={r.id} id={r.id} label={r.name} kind="roleIds" />)}
      </Section>

      {/* Divisions */}
      <Section label="Divisions" icon={Building2} empty={allDivisions.length === 0 ? 'No divisions defined yet' : 'No divisions assigned'}>
        {allDivisions.map(d => <CheckItem key={d.id} id={d.id} label={d.name} kind="divisionIds" />)}
      </Section>

      {/* Departments */}
      <Section label="Departments" icon={Layers} empty={allDepartments.length === 0 ? 'No departments defined yet' : 'No departments assigned'}>
        {allDepartments.map(d => <CheckItem key={d.id} id={d.id} label={d.name} kind="departmentIds" />)}
      </Section>

      {/* Projects */}
      <Section label="Projects" icon={FolderOpen} empty={allProjects.length === 0 ? 'No projects defined yet' : 'No projects assigned'}>
        {allProjects.map(p => <CheckItem key={p.id} id={p.id} label={p.name} kind="projectIds" />)}
      </Section>

      <div className="flex items-center gap-3">
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

// ── Roles View ────────────────────────────────────────────────────────────────

function RolesView() {
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<OrgRole | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string; email: string }[]>([]);
  const [memberSel, setMemberSel] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<{ name: string; description: string; color: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u] = await Promise.all([
        fetch(`${API}/org/roles`).then(x => x.json()),
        fetch(`${API}/users`).then(x => x.json()),
      ]);
      setRoles(r);
      setAllUsers(u);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openRole = async (role: OrgRole) => {
    setSelectedRole(role);
    setForm({ name: role.name, description: role.description, color: role.color });
    const m = await fetch(`${API}/org/roles/${role.id}/members`).then(x => x.json());
    setMembers(m);
    setMemberSel(new Set(m.map((u: any) => u.id)));
  };

  const closeRole = () => { setSelectedRole(null); setForm(null); };

  const createRole = async () => {
    const name = `New Role`;
    const [row] = await fetch(`${API}/org/roles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    }).then(x => x.json()).then(r => [r]);
    await load();
    openRole(row);
  };

  const saveRole = async () => {
    if (!selectedRole || !form) return;
    setSaving(true);
    try {
      await fetch(`${API}/org/roles/${selectedRole.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      await fetch(`${API}/org/roles/${selectedRole.id}/members`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: Array.from(memberSel) }),
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

  const COLORS = ['', '#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

  return (
    <div className="flex h-full min-h-0">
      {/* Role list */}
      <div className={cn('flex flex-col h-full transition-all', selectedRole ? 'w-72 flex-shrink-0' : 'flex-1')}>
        <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h1 className="text-2xl font-display font-bold">Roles</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Group users into custom roles</p>
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
                <div
                  key={r.id}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') openRole(r); }}
                  onClick={() => openRole(r)}
                  className={cn('flex items-center gap-3 px-6 py-4 cursor-pointer hover:bg-secondary/40 transition-colors group', selectedRole?.id === r.id && 'bg-primary/5')}
                >
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
        <div className="flex-1 min-w-0 flex flex-col border-l border-border bg-card/40">
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

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role Name</label>
              <input value={form.name} onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
              <input value={form.description} onChange={e => setForm(f => f && ({ ...f, description: e.target.value }))}
                placeholder="Optional description…"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>

            {/* Color */}
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

            {/* Members */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members ({memberSel.size})</div>
              <div className="border border-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {allUsers.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">No users available</div>
                ) : allUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors border-b border-border last:border-0">
                    <input type="checkbox" checked={memberSel.has(u.id)} onChange={() => {
                      setMemberSel(s => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; });
                    }} className="accent-primary" />
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button onClick={saveRole} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Role
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Org Structure View ────────────────────────────────────────────────────────

function OrgStructureView() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [editTarget, setEditTarget] = useState<{ type: 'division' | 'department' | 'project'; item: Division | Department | Project } | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; divisionId?: number | null; departmentId?: number | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Create modals
  const [creating, setCreating] = useState<'division' | 'department' | 'project' | null>(null);
  const [createForm, setCreateForm] = useState({ name: '', description: '', divisionId: null as number | null, departmentId: null as number | null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [div, dep, proj] = await Promise.all([
        fetch(`${API}/org/divisions`).then(x => x.json()),
        fetch(`${API}/org/departments`).then(x => x.json()),
        fetch(`${API}/org/projects`).then(x => x.json()),
      ]);
      setDivisions(div);
      setDepartments(dep);
      setProjects(proj);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (type: 'division' | 'department' | 'project', item: Division | Department | Project) => {
    setEditTarget({ type, item });
    if (type === 'division') setEditForm({ name: item.name, description: item.description });
    else if (type === 'department') setEditForm({ name: item.name, description: item.description, divisionId: (item as Department).divisionId });
    else setEditForm({ name: item.name, description: item.description, divisionId: (item as Project).divisionId, departmentId: (item as Project).departmentId });
  };

  const saveEdit = async () => {
    if (!editTarget || !editForm) return;
    setSaving(true);
    try {
      await fetch(`${API}/org/${editTarget.type}s/${editTarget.item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      });
      setEditTarget(null); setEditForm(null);
      await load();
    } finally { setSaving(false); }
  };

  const doDelete = async (type: string, id: number) => {
    if (confirmDelete?.type !== type || confirmDelete?.id !== id) { setConfirmDelete({ type, id }); return; }
    await fetch(`${API}/org/${type}s/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (editTarget?.item.id === id) { setEditTarget(null); setEditForm(null); }
    await load();
  };

  const doCreate = async () => {
    if (!creating || !createForm.name) return;
    setSaving(true);
    try {
      const body: Record<string, any> = { name: createForm.name, description: createForm.description };
      if (creating === 'department') body.divisionId = createForm.divisionId;
      if (creating === 'project') { body.divisionId = createForm.divisionId; body.departmentId = createForm.departmentId; }
      await fetch(`${API}/org/${creating}s`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setCreating(null);
      setCreateForm({ name: '', description: '', divisionId: null, departmentId: null });
      await load();
    } finally { setSaving(false); }
  };

  const divisionName = (id: number | null) => divisions.find(d => d.id === id)?.name ?? '—';
  const departmentName = (id: number | null) => departments.find(d => d.id === id)?.name ?? '—';

  return (
    <div className="flex h-full min-h-0">
      {/* Main tree */}
      <div className={cn('flex flex-col h-full transition-all', editTarget ? 'w-[480px] flex-shrink-0' : 'flex-1')}>
        <div className="flex-none px-6 py-5 border-b border-border">
          <h1 className="text-2xl font-display font-bold">Org Structure</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Divisions contain departments; projects belong to divisions or departments</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-8">

            {/* Divisions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-semibold text-foreground">Divisions</span>
                  <span className="text-xs text-muted-foreground">({divisions.length})</span>
                </div>
                <button onClick={() => setCreating('division')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 font-medium transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Division
                </button>
              </div>
              {divisions.length === 0 ? (
                <div className="text-xs text-muted-foreground pl-6 py-2 italic">No divisions yet</div>
              ) : (
                <div className="space-y-1 pl-2">
                  {divisions.map(d => (
                    <OrgItem key={d.id} label={d.name} sub={d.description} color="blue"
                      onEdit={() => openEdit('division', d)}
                      onDelete={() => doDelete('division', d.id)}
                      confirmDelete={confirmDelete?.type === 'division' && confirmDelete.id === d.id}
                      onCancelDelete={() => setConfirmDelete(null)}
                    >
                      {/* Departments under this division */}
                      {departments.filter(dep => dep.divisionId === d.id).map(dep => (
                        <OrgItem key={dep.id} label={dep.name} sub={dep.description} color="violet" indent
                          onEdit={() => openEdit('department', dep)}
                          onDelete={() => doDelete('department', dep.id)}
                          confirmDelete={confirmDelete?.type === 'department' && confirmDelete.id === dep.id}
                          onCancelDelete={() => setConfirmDelete(null)}
                        >
                          {/* Projects under this department */}
                          {projects.filter(p => p.departmentId === dep.id).map(proj => (
                            <OrgItem key={proj.id} label={proj.name} sub={proj.description} color="green" indent
                              onEdit={() => openEdit('project', proj)}
                              onDelete={() => doDelete('project', proj.id)}
                              confirmDelete={confirmDelete?.type === 'project' && confirmDelete.id === proj.id}
                              onCancelDelete={() => setConfirmDelete(null)}
                            />
                          ))}
                        </OrgItem>
                      ))}
                      {/* Projects directly under division (no department) */}
                      {projects.filter(p => p.divisionId === d.id && !p.departmentId).map(proj => (
                        <OrgItem key={proj.id} label={proj.name} sub={proj.description} color="green" indent
                          onEdit={() => openEdit('project', proj)}
                          onDelete={() => doDelete('project', proj.id)}
                          confirmDelete={confirmDelete?.type === 'project' && confirmDelete.id === proj.id}
                          onCancelDelete={() => setConfirmDelete(null)}
                        />
                      ))}
                    </OrgItem>
                  ))}
                </div>
              )}
            </div>

            {/* Unattached Departments */}
            {departments.filter(d => !d.divisionId).length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold text-foreground">Unattached Departments</span>
                </div>
                <div className="space-y-1 pl-2">
                  {departments.filter(d => !d.divisionId).map(dep => (
                    <OrgItem key={dep.id} label={dep.name} sub={dep.description} color="violet"
                      onEdit={() => openEdit('department', dep)}
                      onDelete={() => doDelete('department', dep.id)}
                      confirmDelete={confirmDelete?.type === 'department' && confirmDelete.id === dep.id}
                      onCancelDelete={() => setConfirmDelete(null)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Departments action */}
            <div>
              <button onClick={() => setCreating('department')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 font-medium transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Department
              </button>
            </div>

            {/* Unattached Projects */}
            {projects.filter(p => !p.divisionId && !p.departmentId).length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-semibold text-foreground">Unattached Projects</span>
                </div>
                <div className="space-y-1 pl-2">
                  {projects.filter(p => !p.divisionId && !p.departmentId).map(proj => (
                    <OrgItem key={proj.id} label={proj.name} sub={proj.description} color="green"
                      onEdit={() => openEdit('project', proj)}
                      onDelete={() => doDelete('project', proj.id)}
                      confirmDelete={confirmDelete?.type === 'project' && confirmDelete.id === proj.id}
                      onCancelDelete={() => setConfirmDelete(null)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <button onClick={() => setCreating('project')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 font-medium transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Project
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {editTarget && editForm && (
        <div className="flex-1 min-w-0 flex flex-col border-l border-border bg-card/40">
          <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              {editTarget.type === 'division' && <Building2 className="w-4 h-4 text-blue-400" />}
              {editTarget.type === 'department' && <Layers className="w-4 h-4 text-violet-400" />}
              {editTarget.type === 'project' && <FolderOpen className="w-4 h-4 text-green-400" />}
              <span className="text-sm font-semibold capitalize">{editTarget.type}: {editTarget.item.name}</span>
            </div>
            <button onClick={() => { setEditTarget(null); setEditForm(null); }} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-lg">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
              <input value={editForm.name} onChange={e => setEditForm(f => f && ({ ...f, name: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
              <input value={editForm.description} onChange={e => setEditForm(f => f && ({ ...f, description: e.target.value }))}
                placeholder="Optional…"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            {(editTarget.type === 'department' || editTarget.type === 'project') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Division</label>
                <select value={editForm.divisionId ?? ''} onChange={e => setEditForm(f => f && ({ ...f, divisionId: e.target.value ? parseInt(e.target.value) : null }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">— None —</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
            {editTarget.type === 'project' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</label>
                <select value={editForm.departmentId ?? ''} onChange={e => setEditForm(f => f && ({ ...f, departmentId: e.target.value ? parseInt(e.target.value) : null }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )}
            <button onClick={saveEdit} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[440px] bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg capitalize">Add {creating}</h2>
              <button onClick={() => setCreating(null)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={`${creating.charAt(0).toUpperCase() + creating.slice(1)} name…`}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description <span className="normal-case font-normal text-muted-foreground/50">(optional)</span></label>
                <input value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description…"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              {(creating === 'department' || creating === 'project') && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Division <span className="normal-case font-normal text-muted-foreground/50">(optional)</span></label>
                  <select value={createForm.divisionId ?? ''} onChange={e => setCreateForm(f => ({ ...f, divisionId: e.target.value ? parseInt(e.target.value) : null }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">— None —</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              {creating === 'project' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department <span className="normal-case font-normal text-muted-foreground/50">(optional)</span></label>
                  <select value={createForm.departmentId ?? ''} onChange={e => setCreateForm(f => ({ ...f, departmentId: e.target.value ? parseInt(e.target.value) : null }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">— None —</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setCreating(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
              <button onClick={doCreate} disabled={saving || !createForm.name}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Org Item (tree row) ───────────────────────────────────────────────────────

function OrgItem({
  label, sub, color, indent, onEdit, onDelete, confirmDelete, onCancelDelete, children,
}: {
  label: string; sub: string; color: 'blue' | 'violet' | 'green';
  indent?: boolean; onEdit: () => void; onDelete: () => void;
  confirmDelete: boolean; onCancelDelete: () => void;
  children?: React.ReactNode;
}) {
  const colorClass = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
  }[color];

  const Icon = color === 'blue' ? Building2 : color === 'violet' ? Layers : FolderOpen;

  return (
    <div className={cn(indent && 'ml-5 border-l border-border pl-3')}>
      <div className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl border group hover:bg-secondary/40 transition-colors', colorClass)}>
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{label}</div>
          {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-background/60 text-muted-foreground transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          {confirmDelete ? (
            <>
              <button onClick={onDelete} className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold">Confirm</button>
              <button onClick={onCancelDelete} className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground font-semibold">Cancel</button>
            </>
          ) : (
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </div>
      {children && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  );
}
