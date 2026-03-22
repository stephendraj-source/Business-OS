import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box, TableProperties, Network, Settings, Bell, LayoutDashboard, Briefcase,
  Map, Plug, FileBarChart, ShieldCheck, ChevronLeft, ChevronRight, ChevronDown, Home, Bot,
  GitBranch, Users, Flag, LogOut, Coins, ClipboardList, KeyRound, Eye, EyeOff,
  X, Check, Settings2, Activity, ListTodo, Compass, TrendingUp, GripVertical, RotateCcw,
  Star, Calendar,
} from 'lucide-react';
import { useFavourites, OPEN_FAVOURITE_EVENT } from '@/contexts/FavouritesContext';
import { cn } from '@/lib/utils';
import { useOrgName } from '@/hooks/use-org-name';
import { useUser } from '@/contexts/UserContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/hooks/use-credits';

export type ActiveView =
  | 'table' | 'tree' | 'portfolio' | 'process-map'
  | 'connectors' | 'governance'
  | 'dashboards' | 'reports' | 'audit-logs' | 'settings'
  | 'ai-agents' | 'workflows' | 'forms'
  | 'users' | 'initiatives' | 'configuration'
  | 'activities' | 'tasks' | 'strategy' | 'strategic-planning'
  | 'meetings';

interface LayoutProps {
  children: React.ReactNode;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  canGoBack?: boolean;
  onBack?: () => void;
}

// ── Navigation data ────────────────────────────────────────────────────────────

interface SectionDef { id: string; label: string; }
interface ItemDef { id: ActiveView; label: string; sectionId: string; adminOnly?: boolean; }

const SECTIONS_DEF: SectionDef[] = [
  { id: 'core',         label: 'Core Views'   },
  { id: 'strategy',     label: 'Strategy'     },
  { id: 'governance',   label: 'Governance'   },
  { id: 'workflows',    label: 'Workflows'    },
  { id: 'ai',           label: 'AI'           },
  { id: 'integrations', label: 'Integrations' },
  { id: 'system',       label: 'System'       },
  { id: 'admin',        label: 'Admin'        },
];

const ITEMS_DEF: ItemDef[] = [
  { id: 'table',             label: 'Master Catalogue',   sectionId: 'core'         },
  { id: 'tree',              label: 'Master Map',         sectionId: 'core'         },
  { id: 'portfolio',         label: 'Process Catalogue',  sectionId: 'core'         },
  { id: 'process-map',       label: 'Process Map',        sectionId: 'core'         },
  { id: 'strategy',          label: 'Mission & Vision',   sectionId: 'strategy'     },
  { id: 'strategic-planning',label: 'Strategic Planning', sectionId: 'strategy'     },
  { id: 'governance',        label: 'Governance',         sectionId: 'governance'   },
  { id: 'workflows',         label: 'Workflows',          sectionId: 'workflows'    },
  { id: 'forms',             label: 'Forms and Documents',sectionId: 'workflows'    },
  { id: 'meetings',          label: 'Meetings',           sectionId: 'workflows'    },
  { id: 'activities',        label: 'Activities',         sectionId: 'workflows'    },
  { id: 'tasks',             label: 'Tasks',              sectionId: 'workflows'    },
  { id: 'ai-agents',         label: 'AI Agents',          sectionId: 'ai'           },
  { id: 'connectors',        label: 'Connectors',         sectionId: 'integrations' },
  { id: 'dashboards',        label: 'Dashboards',         sectionId: 'system'       },
  { id: 'reports',           label: 'Reports',            sectionId: 'system'       },
  { id: 'audit-logs',        label: 'Audit & Logs',       sectionId: 'system'       },
  { id: 'settings',          label: 'Settings',           sectionId: 'system'       },
  { id: 'users',             label: 'Users',              sectionId: 'admin', adminOnly: true },
  { id: 'configuration',     label: 'Configuration',      sectionId: 'admin', adminOnly: true },
];

const VIEW_META: Record<ActiveView, { label: string; section: string }> = {
  table:               { label: 'Master Catalogue',    section: 'Core Views'   },
  tree:                { label: 'Master Map',           section: 'Core Views'   },
  portfolio:           { label: 'Process Catalogue',   section: 'Core Views'   },
  'process-map':       { label: 'Process Map',         section: 'Core Views'   },
  governance:          { label: 'Governance',           section: 'Governance'   },
  connectors:          { label: 'Connectors',           section: 'Integrations' },
  dashboards:          { label: 'Dashboards',           section: 'System'       },
  reports:             { label: 'Reports',              section: 'System'       },
  'audit-logs':        { label: 'Audit & Logs',         section: 'System'       },
  settings:            { label: 'Settings',             section: 'System'       },
  'ai-agents':         { label: 'AI Agents',            section: 'AI'           },
  workflows:           { label: 'Workflows',            section: 'Workflows'    },
  forms:               { label: 'Forms and Documents',  section: 'Workflows'    },
  users:               { label: 'Users',                section: 'Admin'        },
  configuration:       { label: 'Configuration',        section: 'Admin'        },
  initiatives:         { label: 'Initiatives',          section: 'Strategy'     },
  strategy:            { label: 'Mission & Vision',     section: 'Strategy'     },
  'strategic-planning':{ label: 'Strategic Planning',   section: 'Strategy'     },
  activities:          { label: 'Activities',           section: 'Workflows'    },
  tasks:               { label: 'Tasks',                section: 'Workflows'    },
  meetings:            { label: 'Meetings',             section: 'Workflows'    },
};

function getIcon(id: ActiveView) {
  const cls = 'w-5 h-5';
  switch (id) {
    case 'table':              return <TableProperties className={cls} />;
    case 'tree':               return <Network className={cls} />;
    case 'portfolio':          return <Briefcase className={cls} />;
    case 'process-map':        return <Map className={cls} />;
    case 'strategy':           return <Compass className={cls} />;
    case 'strategic-planning': return <TrendingUp className={cls} />;
    case 'governance':         return <ShieldCheck className={cls} />;
    case 'workflows':          return <GitBranch className={cls} />;
    case 'forms':              return <ClipboardList className={cls} />;
    case 'meetings':           return <Calendar className={cls} />;
    case 'activities':         return <Activity className={cls} />;
    case 'tasks':              return <ListTodo className={cls} />;
    case 'ai-agents':          return <Bot className={cls} />;
    case 'connectors':         return <Plug className={cls} />;
    case 'dashboards':         return <LayoutDashboard className={cls} />;
    case 'reports':            return <FileBarChart className={cls} />;
    case 'audit-logs':         return <Bell className={cls} />;
    case 'settings':           return <Settings className={cls} />;
    case 'users':              return <Users className={cls} />;
    case 'configuration':      return <Settings2 className={cls} />;
    case 'initiatives':        return <Flag className={cls} />;
    default:                   return <Box className={cls} />;
  }
}

// ── Storage helpers ────────────────────────────────────────────────────────────

const API = '/api';
const STORAGE_SECTIONS  = 'bos-nav-sections-v1';
const STORAGE_ITEMS     = 'bos-nav-items-v1';
const STORAGE_COLLAPSED = 'bos-nav-collapsed-v1';

function defaultSectionOrder(): string[] {
  return SECTIONS_DEF.map(s => s.id);
}

function defaultItemOrder(): Record<string, ActiveView[]> {
  const out: Record<string, ActiveView[]> = {};
  for (const s of SECTIONS_DEF) out[s.id] = [];
  for (const item of ITEMS_DEF) out[item.sectionId].push(item.id);
  return out;
}

function loadSectionOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_SECTIONS);
    if (!raw) return defaultSectionOrder();
    const parsed: string[] = JSON.parse(raw);
    const valid = new Set(SECTIONS_DEF.map(s => s.id));
    const filtered = parsed.filter(id => valid.has(id));
    const missing = SECTIONS_DEF.map(s => s.id).filter(id => !filtered.includes(id));
    return [...filtered, ...missing];
  } catch { return defaultSectionOrder(); }
}

function loadItemOrder(): Record<string, ActiveView[]> {
  try {
    const raw = localStorage.getItem(STORAGE_ITEMS);
    if (!raw) return defaultItemOrder();
    const parsed: Record<string, ActiveView[]> = JSON.parse(raw);
    const validItems = new Set(ITEMS_DEF.map(i => i.id));
    const def = defaultItemOrder();
    // For each section, ensure all items are present and no invalid ones
    const out: Record<string, ActiveView[]> = {};
    const allAccountedFor = new Set<ActiveView>();
    for (const s of SECTIONS_DEF) {
      const saved = (parsed[s.id] || []).filter(id => validItems.has(id as ActiveView));
      out[s.id] = saved as ActiveView[];
      saved.forEach(id => allAccountedFor.add(id as ActiveView));
    }
    // Add any items not in saved state to their default section
    for (const item of ITEMS_DEF) {
      if (!allAccountedFor.has(item.id)) out[item.sectionId].push(item.id);
    }
    return out;
  } catch { return defaultItemOrder(); }
}

// ── Drag & drop types ──────────────────────────────────────────────────────────

type DragKind = 'section' | 'item';
interface DragState { kind: DragKind; id: string; sectionId?: string; }
interface DropTarget { kind: DragKind; id: string; pos: 'before' | 'after'; sectionId?: string; }

// ── Main Layout ────────────────────────────────────────────────────────────────

export function Layout({ children, activeView, onViewChange, canGoBack = false, onBack }: LayoutProps) {
  const orgName = useOrgName();
  const meta = VIEW_META[activeView];
  const { currentUser } = useUser();
  const { logout, isSuperUser, isAdmin, fetchHeaders } = useAuth();
  const { credits } = useCredits();

  // ── Change password modal state ──────────────────────────────────────────────
  const [showChangePw, setShowChangePw]     = useState(false);
  const [currentPw, setCurrentPw]           = useState('');
  const [newPw, setNewPw]                   = useState('');
  const [confirmPw, setConfirmPw]           = useState('');
  const [showCurrentPw, setShowCurrentPw]   = useState(false);
  const [showNewPw, setShowNewPw]           = useState(false);
  const [pwSaving, setPwSaving]             = useState(false);
  const [pwError, setPwError]               = useState('');
  const [pwSuccess, setPwSuccess]           = useState(false);

  // ── Favourites ───────────────────────────────────────────────────────────────
  const { favourites, removeFavourite } = useFavourites();

  const FAV_VIEW_MAP: Record<string, ActiveView> = {
    process: 'table', form: 'forms', agent: 'ai-agents', workflow: 'workflows', task: 'tasks',
  };
  const FAV_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
    process:  { label: 'PROC', cls: 'bg-blue-500/15 text-blue-400' },
    form:     { label: 'FORM', cls: 'bg-violet-500/15 text-violet-400' },
    agent:    { label: 'AI',   cls: 'bg-amber-500/15 text-amber-400' },
    workflow: { label: 'WF',   cls: 'bg-green-500/15 text-green-400' },
    task:     { label: 'TASK', cls: 'bg-rose-500/15 text-rose-400' },
  };

  function handleFavouriteClick(fav: typeof favourites[0]) {
    const view = FAV_VIEW_MAP[fav.item_type];
    if (view) {
      onViewChange(view);
      // Delay dispatch until the view has mounted/re-rendered
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(OPEN_FAVOURITE_EVENT, {
          detail: { type: fav.item_type, id: fav.item_id },
        }));
      }, 100);
    }
  }

  // ── Section collapsed state ───────────────────────────────────────────────────
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_COLLAPSED);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  function toggleSection(sectionId: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      localStorage.setItem(STORAGE_COLLAPSED, JSON.stringify([...next]));
      return next;
    });
  }

  // ── Nav reorder state ────────────────────────────────────────────────────────
  const [sectionOrder, setSectionOrder] = useState<string[]>(loadSectionOrder);
  const [itemOrder, setItemOrder]       = useState<Record<string, ActiveView[]>>(loadItemOrder);
  const dragRef = useRef<DragState | null>(null);
  const [dropTarget, setDropTarget]     = useState<DropTarget | null>(null);

  // Refs for server sync (avoids stale closures + prevents re-saving during hydration)
  const serverLoadingRef  = useRef(false);
  const sectionOrderRef   = useRef(sectionOrder);
  const itemOrderRef      = useRef(itemOrder);
  const saveTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleNavServerSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const token = localStorage.getItem('nonprofit-os-auth-token');
      if (!token) return;
      fetch(`${API}/nav-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sections: JSON.stringify(sectionOrderRef.current),
          items: JSON.stringify(itemOrderRef.current),
        }),
      }).catch(() => {});
    }, 600);
  }

  // On mount: load effective nav order from server (user-specific or tenant default)
  useEffect(() => {
    const token = localStorage.getItem('nonprofit-os-auth-token');
    if (!token) return;
    serverLoadingRef.current = true;
    fetch(`${API}/nav-preferences`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.sections && data?.items) {
          try {
            const parsedSec: string[] = JSON.parse(data.sections);
            const parsedItems: Record<string, ActiveView[]> = JSON.parse(data.items);
            const validSectionIds = new Set(SECTIONS_DEF.map(s => s.id));
            const validItemIds    = new Set(ITEMS_DEF.map(i => i.id));
            const cleanSec = parsedSec.filter(id => validSectionIds.has(id));
            const missingSec = SECTIONS_DEF.map(s => s.id).filter(id => !cleanSec.includes(id));
            const finalSec = [...cleanSec, ...missingSec];
            const cleanItems: Record<string, ActiveView[]> = {};
            const accounted = new Set<string>();
            for (const s of SECTIONS_DEF) {
              cleanItems[s.id] = (parsedItems[s.id] || []).filter(id => validItemIds.has(id as ActiveView)) as ActiveView[];
              cleanItems[s.id].forEach(id => accounted.add(id));
            }
            for (const item of ITEMS_DEF) { if (!accounted.has(item.id)) cleanItems[item.sectionId].push(item.id); }
            setSectionOrder(finalSec);
            setItemOrder(cleanItems);
            localStorage.setItem(STORAGE_SECTIONS, data.sections);
            localStorage.setItem(STORAGE_ITEMS, data.items);
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => { setTimeout(() => { serverLoadingRef.current = false; }, 0); });
  }, []);

  // Persist whenever order changes (localStorage + debounced server save)
  useEffect(() => {
    sectionOrderRef.current = sectionOrder;
    localStorage.setItem(STORAGE_SECTIONS, JSON.stringify(sectionOrder));
    if (!serverLoadingRef.current) scheduleNavServerSave();
  }, [sectionOrder]);
  useEffect(() => {
    itemOrderRef.current = itemOrder;
    localStorage.setItem(STORAGE_ITEMS, JSON.stringify(itemOrder));
    if (!serverLoadingRef.current) scheduleNavServerSave();
  }, [itemOrder]);

  function resetNavOrder() {
    setSectionOrder(defaultSectionOrder());
    setItemOrder(defaultItemOrder());
    localStorage.removeItem(STORAGE_SECTIONS);
    localStorage.removeItem(STORAGE_ITEMS);
  }

  // ── Drag handlers — sections ─────────────────────────────────────────────────

  function onSectionDragStart(e: React.DragEvent, sectionId: string) {
    dragRef.current = { kind: 'section', id: sectionId };
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag image
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;top:-100px;opacity:0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }

  function onSectionDragOver(e: React.DragEvent, sectionId: string) {
    if (!dragRef.current || dragRef.current.id === sectionId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget({ kind: 'section', id: sectionId, pos });
  }

  function onSectionDrop(e: React.DragEvent, targetSectionId: string) {
    e.preventDefault();
    const src = dragRef.current;
    if (!src || src.kind !== 'section' || src.id === targetSectionId) { endDrag(); return; }
    setSectionOrder(prev => {
      const next = prev.filter(s => s !== src.id);
      const targetIdx = next.indexOf(targetSectionId);
      const pos = dropTarget?.pos ?? 'after';
      next.splice(pos === 'before' ? targetIdx : targetIdx + 1, 0, src.id);
      return next;
    });
    endDrag();
  }

  // ── Drag handlers — items ────────────────────────────────────────────────────

  function onItemDragStart(e: React.DragEvent, itemId: ActiveView, sectionId: string) {
    dragRef.current = { kind: 'item', id: itemId, sectionId };
    e.dataTransfer.effectAllowed = 'move';
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;top:-100px;opacity:0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }

  function onItemDragOver(e: React.DragEvent, itemId: ActiveView, sectionId: string) {
    const src = dragRef.current;
    if (!src || src.kind !== 'item') return;
    if (src.id === itemId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget({ kind: 'item', id: itemId, pos, sectionId });
  }

  // Allow dropping item onto a section header → append to that section
  function onSectionHeaderItemDragOver(e: React.DragEvent, sectionId: string) {
    const src = dragRef.current;
    if (!src || src.kind !== 'item') return;
    if (src.sectionId === sectionId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ kind: 'section', id: sectionId, pos: 'after' });
  }

  function onItemDrop(e: React.DragEvent, targetItemId: ActiveView, targetSectionId: string) {
    e.preventDefault();
    const src = dragRef.current;
    if (!src || src.kind !== 'item') { endDrag(); return; }
    const srcId = src.id as ActiveView;
    const srcSection = src.sectionId!;
    const pos = dropTarget?.pos ?? 'after';

    setItemOrder(prev => {
      const next = { ...prev };
      // Remove from source section
      next[srcSection] = next[srcSection].filter(id => id !== srcId);
      // Insert into target section
      const targetList = [...(next[targetSectionId] || [])];
      const targetIdx = targetList.indexOf(targetItemId);
      if (targetIdx === -1) {
        targetList.push(srcId);
      } else {
        targetList.splice(pos === 'before' ? targetIdx : targetIdx + 1, 0, srcId);
      }
      next[targetSectionId] = targetList;
      return next;
    });
    endDrag();
  }

  function onSectionHeaderItemDrop(e: React.DragEvent, targetSectionId: string) {
    e.preventDefault();
    const src = dragRef.current;
    if (!src || src.kind !== 'item' || src.sectionId === targetSectionId) { endDrag(); return; }
    const srcId = src.id as ActiveView;
    setItemOrder(prev => {
      const next = { ...prev };
      next[src.sectionId!] = next[src.sectionId!].filter(id => id !== srcId);
      next[targetSectionId] = [...(next[targetSectionId] || []), srcId];
      return next;
    });
    endDrag();
  }

  function endDrag() {
    dragRef.current = null;
    setDropTarget(null);
  }

  // ── Password handlers ────────────────────────────────────────────────────────

  async function handleChangePw(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return; }
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    setPwError(''); setPwSaving(true);
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: fetchHeaders(),
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await r.json();
      if (!r.ok) { setPwError(data.error || 'Failed to change password'); return; }
      setPwSuccess(true);
      setTimeout(() => { setShowChangePw(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwSuccess(false); setPwError(''); }, 1500);
    } catch { setPwError('Network error — please try again'); }
    finally { setPwSaving(false); }
  }

  function closePwModal() { setShowChangePw(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError(''); setPwSuccess(false); }

  // ── Render ───────────────────────────────────────────────────────────────────

  const sectionMap = Object.fromEntries(SECTIONS_DEF.map(s => [s.id, s]));
  const itemMap    = Object.fromEntries(ITEMS_DEF.map(i => [i.id, i]));

  const draggingItemId = dragRef.current?.kind === 'item' ? dragRef.current.id : null;

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">

      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">

        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
            <Box className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight truncate" title={orgName}>{orgName}</span>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 overflow-y-auto py-4 px-3 space-y-6"
          onDragOver={e => e.preventDefault()}
          onDrop={endDrag}
        >
          {/* ── Favourites (pinned, not draggable) ────────────────────────── */}
          <div>
            <div className="flex items-center gap-1.5 px-1 mb-1.5">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Favourites
              </span>
            </div>
            {favourites.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-muted-foreground/50 leading-snug">
                Pin items with ★ to access them quickly
              </div>
            ) : (
              <div className="space-y-0.5">
                {favourites.map(fav => {
                  const cfg = FAV_TYPE_CONFIG[fav.item_type] ?? { label: '?', cls: 'bg-muted text-muted-foreground' };
                  return (
                    <div
                      key={fav.id}
                      onClick={() => handleFavouriteClick(fav)}
                      className="group flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 cursor-pointer hover:bg-accent/60 transition-colors"
                    >
                      <span className={cn('shrink-0 text-[9px] font-bold px-1 py-0.5 rounded leading-none', cfg.cls)}>
                        {cfg.label}
                      </span>
                      <span className="flex-1 text-xs truncate text-foreground/80">{fav.item_name || '(Unnamed)'}</span>
                      <button
                        onClick={e => { e.stopPropagation(); removeFavourite(fav.item_type, fav.item_id); }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-all"
                        title="Remove from favourites"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Draggable sections ─────────────────────────────────────────── */}
          {sectionOrder.map(sectionId => {
            const section = sectionMap[sectionId];
            if (!section) return null;
            const items = (itemOrder[sectionId] || [])
              .map(id => itemMap[id])
              .filter(Boolean)
              .filter(item => !item.adminOnly || isAdmin);
            // Hide admin section entirely for non-admins
            if (section.id === 'admin' && !isAdmin) return null;

            const isSectionDropTarget = dropTarget?.kind === 'section' && dropTarget.id === sectionId;
            const isDraggingSection = dragRef.current?.kind === 'section' && dragRef.current.id === sectionId;

            return (
              <div
                key={sectionId}
                className={cn(
                  'relative rounded-xl transition-all duration-150',
                  isDraggingSection && 'opacity-40',
                )}
              >
                {/* Drop indicator before section */}
                {isSectionDropTarget && dropTarget?.pos === 'before' && (
                  <div className="absolute -top-3 left-0 right-0 flex items-center gap-1 z-10 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 h-0.5 bg-primary rounded-full" />
                  </div>
                )}

                {/* Section header — draggable + collapse toggle */}
                <div
                  className="group flex items-center gap-1 mb-1.5 px-2"
                  draggable
                  onDragStart={e => onSectionDragStart(e, sectionId)}
                  onDragOver={e => {
                    onSectionDragOver(e, sectionId);
                    onSectionHeaderItemDragOver(e, sectionId);
                  }}
                  onDrop={e => {
                    if (dragRef.current?.kind === 'section') onSectionDrop(e, sectionId);
                    else onSectionHeaderItemDrop(e, sectionId);
                  }}
                >
                  <div className="opacity-0 group-hover:opacity-50 cursor-grab active:cursor-grabbing transition-opacity mr-0.5">
                    <GripVertical className="w-3 h-3 text-sidebar-foreground/50" />
                  </div>
                  <button
                    onClick={() => toggleSection(sectionId)}
                    className="flex items-center gap-1 flex-1 min-w-0 text-left"
                    title={collapsedSections.has(sectionId) ? 'Expand section' : 'Collapse section'}
                  >
                    <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider select-none truncate">
                      {section.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        'w-3 h-3 text-sidebar-foreground/30 flex-shrink-0 transition-transform duration-200',
                        collapsedSections.has(sectionId) && '-rotate-90'
                      )}
                    />
                  </button>
                </div>

                {/* Drop indicator when item dragged onto section header */}
                {dropTarget?.kind === 'section' && dropTarget.id === sectionId && dragRef.current?.kind === 'item' && (
                  <div className="mx-2 mb-1 h-0.5 bg-primary/60 rounded-full" />
                )}

                {/* Items — hidden when section is collapsed */}
                <div className={cn(
                  'space-y-0.5 overflow-hidden transition-all duration-200',
                  collapsedSections.has(sectionId) ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
                )}>
                  {items.map(item => {
                    const isDragging  = draggingItemId === item.id;
                    const isDropBefore = dropTarget?.kind === 'item' && dropTarget.id === item.id && dropTarget.pos === 'before';
                    const isDropAfter  = dropTarget?.kind === 'item' && dropTarget.id === item.id && dropTarget.pos === 'after';

                    return (
                      <div key={item.id} className={cn('relative', isDragging && 'opacity-40')}>
                        {/* Drop line before */}
                        {isDropBefore && (
                          <div className="absolute -top-px left-3 right-3 flex items-center gap-1 z-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            <div className="flex-1 h-0.5 bg-primary rounded-full" />
                          </div>
                        )}

                        <div
                          className="group flex items-center"
                          draggable
                          onDragStart={e => onItemDragStart(e, item.id, sectionId)}
                          onDragOver={e => onItemDragOver(e, item.id, sectionId)}
                          onDrop={e => onItemDrop(e, item.id, sectionId)}
                          onDragEnd={endDrag}
                        >
                          {/* Drag handle */}
                          <div className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing transition-opacity pl-1 pr-0.5 py-2 flex-shrink-0">
                            <GripVertical className="w-3 h-3 text-sidebar-foreground/50" />
                          </div>

                          {/* Nav button */}
                          <button
                            onClick={() => onViewChange(item.id)}
                            className={cn(
                              'flex-1 flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium min-w-0',
                              activeView === item.id
                                ? 'bg-primary/10 text-primary'
                                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                            )}
                          >
                            <span className={cn('w-5 h-5 flex-shrink-0', activeView === item.id ? 'text-primary' : 'text-sidebar-foreground/60')}>
                              {getIcon(item.id)}
                            </span>
                            <span className="truncate">{item.label}</span>
                          </button>
                        </div>

                        {/* Drop line after */}
                        {isDropAfter && (
                          <div className="absolute -bottom-px left-3 right-3 flex items-center gap-1 z-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            <div className="flex-1 h-0.5 bg-primary rounded-full" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Drop indicator after section */}
                {isSectionDropTarget && dropTarget?.pos === 'after' && dragRef.current?.kind === 'section' && (
                  <div className="absolute -bottom-3 left-0 right-0 flex items-center gap-1 z-10 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 h-0.5 bg-primary rounded-full" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Reset button */}
          <button
            onClick={resetNavOrder}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-sidebar-foreground/30 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent/50 transition-colors"
            title="Reset navigation to default order"
          >
            <RotateCcw className="w-3 h-3 flex-shrink-0" />
            Reset navigation order
          </button>
        </nav>

        {/* Credits Widget — visible to tenant admins only */}
        {!isSuperUser && isAdmin && credits !== null && (
          <div className="px-4 pb-3">
            <div className={cn(
              "rounded-xl px-3 py-2.5 border text-xs",
              credits <= 0
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : credits < 500
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-primary/5 border-primary/20 text-sidebar-foreground/70"
            )}>
              <div className="flex items-center gap-2 mb-1">
                <Coins className={cn("w-3.5 h-3.5 flex-shrink-0",
                  credits <= 0 ? "text-red-400" : credits < 500 ? "text-amber-400" : "text-primary"
                )} />
                <span className="font-semibold uppercase tracking-wider text-[10px]">AI Credits</span>
              </div>
              <div className={cn("text-lg font-bold tabular-nums leading-none",
                credits <= 0 ? "text-red-400" : credits < 500 ? "text-amber-400" : "text-foreground"
              )}>
                {credits.toLocaleString()}
              </div>
              {credits <= 0 && <div className="mt-1 text-[10px] text-red-400/80">No credits remaining</div>}
              {credits > 0 && credits < 500 && <div className="mt-1 text-[10px] text-amber-400/80">Credits running low</div>}
            </div>
          </div>
        )}

        {/* User Profile Footer */}
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary border border-primary/30 flex-shrink-0">
              {currentUser ? (currentUser.firstName?.[0] || currentUser.name?.[0] || '?').toUpperCase() : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate leading-tight">{currentUser?.name || '—'}</div>
              <div className="text-[11px] text-sidebar-foreground/50 truncate capitalize">{currentUser?.role || '—'}</div>
            </div>
          </div>
          <button
            onClick={() => { setShowChangePw(true); setPwError(''); setPwSuccess(false); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 flex-shrink-0" />
            Change password
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors group"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0 group-hover:text-red-400 transition-colors" />
            <span className="group-hover:text-red-400 transition-colors">Sign out</span>
          </button>
        </div>

      </aside>

      {/* Change Password Modal */}
      {showChangePw && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={closePwModal} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">Change Password</h3>
                </div>
                <button onClick={closePwModal} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {pwSuccess ? (
                <div className="px-6 py-8 text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 mb-1">
                    <Check className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-sm font-medium">Password changed successfully</p>
                </div>
              ) : (
                <form onSubmit={handleChangePw} className="px-6 py-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Password</label>
                    <div className="relative">
                      <input type={showCurrentPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" required autoFocus
                        className="w-full px-3 pr-9 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showCurrentPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New Password</label>
                    <div className="relative">
                      <input type={showNewPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 6 characters" required minLength={6}
                        className="w-full px-3 pr-9 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Confirm New Password</label>
                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" required
                      className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {pwError && (
                    <div className="px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">{pwError}</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={closePwModal} className="flex-1 px-4 py-2 text-sm rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
                    <button type="submit" disabled={pwSaving} className="flex-1 px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60 transition-all">
                      {pwSaving ? 'Saving…' : 'Update Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.5)]">

        {/* Breadcrumb bar */}
        <div className="flex-none flex items-center gap-1 h-10 px-4 border-b border-border bg-card/60 backdrop-blur-sm z-30">
          <button onClick={onBack} disabled={!canGoBack} title={canGoBack ? 'Go back' : 'No history'}
            className={cn("flex items-center justify-center w-6 h-6 rounded-md transition-all duration-150",
              canGoBack ? "text-foreground/70 hover:text-foreground hover:bg-secondary cursor-pointer" : "text-muted-foreground/30 cursor-not-allowed")}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <div className="flex items-center gap-0.5 text-xs min-w-0">
            <button onClick={() => onViewChange('table')}
              className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap",
                activeView === 'table' ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}>
              <Home className="w-3 h-3 flex-shrink-0" />
              <span className="hidden sm:inline truncate max-w-[120px]">{orgName}</span>
            </button>
            <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
            <span className="px-1.5 py-0.5 text-muted-foreground whitespace-nowrap hidden md:inline">{meta.section}</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 hidden md:inline" />
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium whitespace-nowrap">{meta.label}</span>
          </div>
        </div>

        {/* View content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>

      </main>
    </div>
  );
}
