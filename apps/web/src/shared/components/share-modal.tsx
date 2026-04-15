import React, { useState, useEffect } from 'react';
import { X, Share2, Users, Shield, Layers, Plus, Trash2, Eye, Edit3, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useUser } from '@/app/providers/UserContext';

const API = '/api';

type ShareTarget = 'user' | 'role' | 'group';

interface ShareEntry {
  id?: number;
  sharedWithUserId?: number | null;
  sharedWithRoleId?: number | null;
  sharedWithGroupId?: number | null;
  canEdit: boolean;
  privilege?: string;
}

interface UserRow  { id: number; name: string; }
interface RoleRow  { id: number; name: string; }
interface GroupRow { id: number; name: string; }

interface ShareModalProps {
  resourceType: 'report' | 'dashboard' | 'agent';
  resourceId: number;
  resourceName: string;
  isOwner: boolean;
  initialShares?: ShareEntry[];
  privilegeMode?: 'canEdit' | 'privilege';
  privilegeOptions?: string[];
  onClose: () => void;
  onSaved?: () => void;
  inline?: boolean;
}

const PRIVILEGE_OPTIONS_AGENT = ['view', 'edit', 'delete'];

export function ShareModal({
  resourceType,
  resourceId,
  resourceName,
  isOwner,
  initialShares = [],
  privilegeMode = 'canEdit',
  privilegeOptions = PRIVILEGE_OPTIONS_AGENT,
  onClose,
  onSaved,
  inline = false,
}: ShareModalProps) {
  const { fetchHeaders } = useUser();
  const [users, setUsers]   = useState<UserRow[]>([]);
  const [roles, setRoles]   = useState<RoleRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [shares, setShares] = useState<ShareEntry[]>(initialShares);
  const [saving, setSaving] = useState(false);

  const [addTarget, setAddTarget] = useState<ShareTarget>('user');
  const [addId, setAddId]         = useState<number | ''>('');
  const [addCanEdit, setAddCanEdit]  = useState(false);
  const [addPrivilege, setAddPrivilege] = useState<string>(privilegeOptions[0] ?? 'view');
  const [targetOpen, setTargetOpen] = useState(false);

  const endpointBase =
    resourceType === 'report'    ? `${API}/reports/${resourceId}` :
    resourceType === 'dashboard' ? `${API}/dashboards/${resourceId}` :
                                   `${API}/ai-agents/${resourceId}`;

  useEffect(() => {
    Promise.all([
      fetch(`${API}/users`, { headers: fetchHeaders() }).then(r => r.json()),
      fetch(`${API}/org/roles`, { headers: fetchHeaders() }).then(r => r.json()),
      fetch(`${API}/org/groups`, { headers: fetchHeaders() }).then(r => r.json()),
    ]).then(([u, ro, g]) => {
      setUsers(Array.isArray(u) ? u : []);
      setRoles(Array.isArray(ro) ? ro : []);
      setGroups(Array.isArray(g) ? g : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${endpointBase}/shares`, { headers: fetchHeaders() })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setShares(data); })
      .catch(() => {});
  }, [resourceId]);

  function getTargetOptions() {
    if (addTarget === 'user')  return users.map(u => ({ id: u.id, label: u.name }));
    if (addTarget === 'role')  return roles.map(r => ({ id: r.id, label: r.name }));
    return groups.map(g => ({ id: g.id, label: g.name }));
  }

  function resolveLabel(s: ShareEntry) {
    if (s.sharedWithUserId)  return users.find(u => u.id === s.sharedWithUserId)?.name ?? `User #${s.sharedWithUserId}`;
    if (s.sharedWithRoleId)  return roles.find(r => r.id === s.sharedWithRoleId)?.name ?? `Role #${s.sharedWithRoleId}`;
    if (s.sharedWithGroupId) return groups.find(g => g.id === s.sharedWithGroupId)?.name ?? `Group #${s.sharedWithGroupId}`;
    return '—';
  }

  function resolveType(s: ShareEntry): ShareTarget {
    if (s.sharedWithUserId)  return 'user';
    if (s.sharedWithRoleId)  return 'role';
    return 'group';
  }

  function addShare() {
    if (addId === '') return;
    const entry: ShareEntry = {
      sharedWithUserId:  addTarget === 'user'  ? addId as number : null,
      sharedWithRoleId:  addTarget === 'role'  ? addId as number : null,
      sharedWithGroupId: addTarget === 'group' ? addId as number : null,
      canEdit:    privilegeMode === 'canEdit' ? addCanEdit : addPrivilege !== 'view',
      privilege:  privilegeMode === 'privilege' ? addPrivilege : undefined,
    };
    const isDupe = shares.some(s =>
      s.sharedWithUserId === entry.sharedWithUserId &&
      s.sharedWithRoleId === entry.sharedWithRoleId &&
      s.sharedWithGroupId === entry.sharedWithGroupId
    );
    if (!isDupe) setShares(prev => [...prev, entry]);
    setAddId('');
  }

  function removeShare(idx: number) {
    setShares(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleCanEdit(idx: number) {
    setShares(prev => prev.map((s, i) => i === idx ? { ...s, canEdit: !s.canEdit } : s));
  }

  function setPrivilege(idx: number, priv: string) {
    setShares(prev => prev.map((s, i) => i === idx ? { ...s, privilege: priv, canEdit: priv !== 'view' } : s));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = resourceType === 'agent'
        ? { shares: shares.map(s => ({ sharedWithUserId: s.sharedWithUserId ?? null, sharedWithRoleId: s.sharedWithRoleId ?? null, sharedWithGroupId: s.sharedWithGroupId ?? null, privilege: s.privilege ?? (s.canEdit ? 'edit' : 'view') })) }
        : { shares: shares.map(s => ({ sharedWithUserId: s.sharedWithUserId ?? null, sharedWithRoleId: s.sharedWithRoleId ?? null, sharedWithGroupId: s.sharedWithGroupId ?? null, canEdit: s.canEdit })) };
      await fetch(`${endpointBase}/shares`, {
        method: 'PUT',
        headers: fetchHeaders(),
        body: JSON.stringify(payload),
      });
      onSaved?.();
      onClose();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  const targetOptions = getTargetOptions();
  const TYPE_ICONS: Record<ShareTarget, React.ElementType> = { user: Users, role: Shield, group: Layers };
  const TypeIcon = TYPE_ICONS[addTarget];

  const innerContent = (
    <><div className="flex-1 overflow-y-auto p-5 space-y-5">

          {isOwner && (
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Access</label>
              <div className="flex gap-2">
                <div className="relative">
                  <button
                    onClick={() => setTargetOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-xl bg-background hover:bg-secondary transition-colors min-w-[90px]"
                  >
                    <TypeIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="capitalize">{addTarget}</span>
                    <ChevronDown className={cn("w-3 h-3 text-muted-foreground ml-auto transition-transform", targetOpen && "rotate-180")} />
                  </button>
                  {targetOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-10 w-28">
                      {(['user', 'role', 'group'] as ShareTarget[]).map(t => {
                        const Icon = TYPE_ICONS[t];
                        return (
                          <button
                            key={t}
                            onClick={() => { setAddTarget(t); setAddId(''); setTargetOpen(false); }}
                            className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors capitalize", addTarget === t && "text-primary font-medium")}
                          >
                            <Icon className="w-3.5 h-3.5" /> {t}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <select
                  value={addId}
                  onChange={e => setAddId(e.target.value ? parseInt(e.target.value) : '')}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select {addTarget}…</option>
                  {targetOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>

                {privilegeMode === 'canEdit' ? (
                  <select
                    value={addCanEdit ? 'edit' : 'view'}
                    onChange={e => setAddCanEdit(e.target.value === 'edit')}
                    className="px-2 py-2 text-xs border border-border rounded-xl bg-background focus:outline-none"
                  >
                    <option value="view">View</option>
                    <option value="edit">Edit</option>
                  </select>
                ) : (
                  <select
                    value={addPrivilege}
                    onChange={e => setAddPrivilege(e.target.value)}
                    className="px-2 py-2 text-xs border border-border rounded-xl bg-background focus:outline-none"
                  >
                    {privilegeOptions.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                  </select>
                )}

                <button
                  onClick={addShare}
                  disabled={addId === ''}
                  className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Current Access {shares.length > 0 && <span className="text-primary">({shares.length})</span>}
            </label>
            {shares.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground/50 text-sm italic border border-dashed border-border rounded-xl">
                Only you can access this {resourceType}
              </div>
            ) : (
              <div className="space-y-1.5">
                {shares.map((s, idx) => {
                  const typ = resolveType(s);
                  const Icon = TYPE_ICONS[typ];
                  const label = resolveLabel(s);
                  return (
                    <div key={idx} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-secondary/30 border border-border">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-3 h-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{label}</div>
                        <div className="text-xs text-muted-foreground capitalize">{typ}</div>
                      </div>
                      {isOwner ? (
                        privilegeMode === 'privilege' ? (
                          <select
                            value={s.privilege ?? (s.canEdit ? 'edit' : 'view')}
                            onChange={e => setPrivilege(idx, e.target.value)}
                            className="px-2 py-1 text-xs border border-border rounded-lg bg-background focus:outline-none"
                          >
                            {privilegeOptions.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                          </select>
                        ) : (
                          <button
                            onClick={() => toggleCanEdit(idx)}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors border",
                              s.canEdit
                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                                : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
                            )}
                          >
                            {s.canEdit ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            {s.canEdit ? 'Edit' : 'View'}
                          </button>
                        )
                      ) : (
                        <span className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border",
                          s.canEdit
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            : "bg-secondary text-muted-foreground border-border"
                        )}>
                          {s.canEdit ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {s.canEdit ? 'Edit' : 'View'}
                        </span>
                      )}
                      {isOwner && (
                        <button onClick={() => removeShare(idx)} className="text-muted-foreground/40 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border flex-none">
          {!inline && (
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-muted-foreground hover:bg-secondary transition-colors">
              {isOwner ? 'Cancel' : 'Close'}
            </button>
          )}
          {isOwner && (
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60 transition-all"
            >
              {saving ? 'Saving…' : 'Save Access'}
            </button>
          )}
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border flex-none">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base leading-tight">Share Access</h3>
              <p className="text-xs text-muted-foreground truncate max-w-56" title={resourceName}>{resourceName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {innerContent}
      </div>
    </div>
  );
}
