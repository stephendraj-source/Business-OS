import React, { useState, useEffect, useRef, useCallback } from 'react';
import MindElixir, { type MindElixirInstance, type MindElixirData } from 'mind-elixir';
import { Loader2, Pencil, Check, X, ZoomIn, ZoomOut, Maximize2, FileDown } from 'lucide-react';
import { TaskCreatePanel } from './task-create-panel';
import { useAuth } from '@/app/providers/AuthContext';

const API = '/api';
const TASK_STATUS_ICONS = ['🟡', '🔵', '🟢', '🔴', '⚪'];

type MindmapTaskStatus = 'todo' | 'open' | 'in_progress' | 'done' | 'completed' | 'cancelled' | 'rejected';
type MindmapNodeMeta = {
  taskId?: number;
  taskStatus?: MindmapTaskStatus | string;
};

function statusToIndicator(status?: string) {
  switch (status) {
    case 'in_progress':
      return '🔵';
    case 'done':
    case 'completed':
      return '🟢';
    case 'cancelled':
    case 'rejected':
      return '🔴';
    case 'open':
    case 'todo':
      return '🟡';
    default:
      return '⚪';
  }
}

function decorateNodeTaskStatus(node: any) {
  if (!node) return;
  const metadata = (node.metadata ?? {}) as MindmapNodeMeta;
  const baseIcons = Array.isArray(node.icons) ? node.icons.filter((icon: string) => !TASK_STATUS_ICONS.includes(icon)) : [];
  if (metadata.taskId) {
    node.metadata = metadata;
    node.icons = [...baseIcons, statusToIndicator(metadata.taskStatus)];
  } else {
    node.icons = baseIcons;
  }
  (node.children ?? []).forEach((child: any) => decorateNodeTaskStatus(child));
}

function collectTaskIds(node: any, ids: number[] = []) {
  if (!node) return ids;
  const taskId = node.metadata?.taskId;
  if (typeof taskId === 'number') ids.push(taskId);
  (node.children ?? []).forEach((child: any) => collectTaskIds(child, ids));
  return ids;
}

function findNodeById(node: any, id: string): any | null {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function countNodes(node: any): number {
  if (!node) return 0;
  return 1 + (node.children ?? []).reduce((sum: number, child: any) => sum + countNodes(child), 0);
}

function collectNodeIds(node: any, ids = new Set<string>()) {
  if (!node) return ids;
  if (typeof node.id === 'string') ids.add(node.id);
  (node.children ?? []).forEach((child: any) => collectNodeIds(child, ids));
  return ids;
}

function createNodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return Math.random().toString(16).slice(2, 18);
}

function appendChildNode(parent: any, direction: 0 | 1, topic = 'New node') {
  const child = {
    id: createNodeId(),
    topic,
    direction,
    expanded: true,
  };
  parent.children = Array.isArray(parent.children) ? [...parent.children, child] : [child];
  return child;
}

// ── Legacy format converter ────────────────────────────────────────────────────
// The old editor stored {nodes: [...], edges: [...]}. We convert that to
// mind-elixir's hierarchical {nodeData: {id, topic, children: [...]}} format.

function convertLegacyData(raw: unknown): MindElixirData {
  const r = raw as any;

  // Already in mind-elixir format
  if (r?.nodeData) return r as MindElixirData;

  const nodes: any[] = r?.nodes ?? [];
  const edges: any[] = r?.edges ?? [];

  if (!nodes.length) return MindElixir.new('Mind Map');

  const nodeMap: Record<string, any> = {};
  const childrenOf: Record<string, string[]> = {};
  const hasParent = new Set<string>();

  for (const n of nodes) nodeMap[n.id] = n;
  for (const e of edges) {
    if (!childrenOf[e.sourceId]) childrenOf[e.sourceId] = [];
    childrenOf[e.sourceId].push(e.targetId);
    hasParent.add(e.targetId);
  }

  const rootNode = nodes.find(n => !hasParent.has(n.id)) ?? nodes[0];

  function buildTree(id: string): any {
    const n = nodeMap[id];
    if (!n) return null;
    const kids = (childrenOf[id] ?? []).map(buildTree).filter(Boolean);
    return {
      id: n.id,
      topic: n.label || 'Node',
      expanded: n.expanded ?? true,
      style: { background: n.color ?? '#6366f1', color: '#fff' },
      ...(kids.length ? { children: kids } : {}),
    };
  }

  const root = buildTree(rootNode.id);
  if (!root) return MindElixir.new('Mind Map');
  return { nodeData: { ...root, root: true } };
}

// ── Inject CSS once ────────────────────────────────────────────────────────────
// mind-elixir ships its own CSS; we import it here so Vite picks it up.
import 'mind-elixir/style.css';

// ── Component props ────────────────────────────────────────────────────────────

interface MindmapEditorProps {
  mindmapId: number;
  mindmapName: string;
  onRename?: (newName: string) => void;
}

// ── MindmapEditor ──────────────────────────────────────────────────────────────

export function MindmapEditor({ mindmapId, mindmapName, onRename }: MindmapEditorProps) {
  const { fetchHeaders } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixirInstance | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [nameValue, setNameValue] = useState(mindmapName);
  const [editingName, setEditingName] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    topic: string;
    el: HTMLElement | null;
  } | null>(null);

  // ── Create-task panel state ───────────────────────────────────────────────────
  const [taskPanelTopic, setTaskPanelTopic] = useState<string | null>(null);
  const taskPanelNodeIdRef = useRef<string | null>(null);
  // Ref so the non-React mind-elixir onclick can open the panel
  const openTaskPanelRef = useRef<((topic: string) => void) | null>(null);
  openTaskPanelRef.current = (topic: string) => setTaskPanelTopic(topic);
  // Capture the node topic when the context menu is shown (node is guaranteed selected)
  const pendingTopicRef = useRef<string>('');

  // ── Node "+" buttons overlay refs ─────────────────────────────────────────────
  const nodeButtonsRef = useRef<HTMLDivElement>(null);
  const activeTopicRef = useRef<any>(null);   // current me-tpc HTMLElement being hovered

  useEffect(() => { setNameValue(mindmapName); }, [mindmapName]);

  // ── Auto-save helper ─────────────────────────────────────────────────────────

  const triggerSave = useCallback((me: MindElixirInstance) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const payload = JSON.stringify(me.getData());
        await fetch(`${API}/mindmaps/${mindmapId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify({ data: payload }),
        });
        setSavedAt(new Date());
      } catch { /* silent — will retry on next change */ }
    }, 1500);
  }, [mindmapId, fetchHeaders]);

  // ── Initialise / re-initialise when mindmapId changes ───────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    setLoading(true);

    // Flush pending save from a previous map
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    // Destroy previous instance
    if (containerRef.current) containerRef.current.innerHTML = '';
    meRef.current = null;
    let cleanupCanvasListeners: (() => void) | null = null;

    fetch(`${API}/mindmaps/${mindmapId}`, { headers: fetchHeaders() })
      .then(r => r.json())
      .then(async record => {
        if (cancelled || !containerRef.current) return;

        let raw: unknown;
        try { raw = JSON.parse(record.data); } catch { raw = null; }
        const data = convertLegacyData(raw);
        const taskIds = Array.from(new Set(collectTaskIds(data.nodeData)));

        if (taskIds.length > 0) {
          try {
            const taskRows = await fetch(`${API}/tasks`, { headers: fetchHeaders() }).then(r => r.ok ? r.json() : []);
            const taskStatusById = new Map(
              (Array.isArray(taskRows) ? taskRows : [])
                .filter((task: any) => taskIds.includes(task.id))
                .map((task: any) => [task.id, task.status]),
            );

            const applyStatuses = (node: any) => {
              if (!node) return;
              const taskId = node.metadata?.taskId;
              if (typeof taskId === 'number' && taskStatusById.has(taskId)) {
                node.metadata = { ...(node.metadata ?? {}), taskId, taskStatus: taskStatusById.get(taskId) };
              }
              (node.children ?? []).forEach((child: any) => applyStatuses(child));
            };

            applyStatuses(data.nodeData);
          } catch {
            // Silent fallback: local node metadata will still render if present.
          }
        }

        decorateNodeTaskStatus(data.nodeData);

        const me = new MindElixir({
          el: containerRef.current,
          direction: MindElixir.SIDE,
          data,
          draggable: true,
          editable: true,
          contextMenu: false,
          toolBar: false,
          keypress: true,
          allowUndo: true,
          newTopicName: 'New node',
          theme: {
            name: 'BusinessOS',
            type: 'light',
            palette: [
              '#000000','#000000','#000000','#000000',
              '#000000','#000000','#000000','#000000',
            ],
            cssVar: {
              '--node-gap-x': '32px',
              '--node-gap-y': '12px',
              '--main-gap-x': '64px',
              '--main-gap-y': '16px',
              '--main-color': '#000000',
              '--main-bgcolor': '#f3f4f6',
              '--main-bgcolor-transparent': '#f3f4f699',
              '--color': '#000000',
              '--bgcolor': '#f3f4f6',
              '--selected': '#d1d5db',
              '--accent-color': '#000000',
              '--root-color': '#000000',
              '--root-bgcolor': '#f3f4f6',
              '--root-border-color': '#000000',
              '--root-radius': '8px',
              '--main-radius': '6px',
              '--topic-padding': '4px 14px',
              '--panel-color': '#1e293b',
              '--panel-bgcolor': '#ffffff',
              '--panel-border-color': '#000000',
              '--map-padding': '20px',
            },
          },
        });

        me.init(data);
        meRef.current = me;

        // ── Hover "+" buttons ───────────────────────────────────────────────
        const wrapper = containerRef.current!.parentElement!;
        let leaveTimer: ReturnType<typeof setTimeout> | null = null;

        function showButtons(tpc: HTMLElement) {
          if (!nodeButtonsRef.current) return;
          activeTopicRef.current = tpc;
          const wRect = wrapper.getBoundingClientRect();
          const tRect = tpc.getBoundingClientRect();
          const btn = nodeButtonsRef.current;
          btn.style.top  = `${tRect.top - wRect.top}px`;
          btn.style.left = `${tRect.left - wRect.left}px`;
          btn.style.width = `${tRect.width}px`;
          btn.style.height = `${tRect.height}px`;
          btn.style.display = 'flex';
        }

        function hideButtons() {
          if (nodeButtonsRef.current) nodeButtonsRef.current.style.display = 'none';
          activeTopicRef.current = null;
        }

        const onContainerOver = (e: MouseEvent) => {
          let el = e.target as HTMLElement | null;
          while (el && el !== containerRef.current) {
            if (el.tagName === 'ME-TPC') {
              if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
              showButtons(el);
              return;
            }
            el = el.parentElement;
          }

          if (nodeButtonsRef.current && !nodeButtonsRef.current.contains(e.target as Node)) {
            hideButtons();
          }
        };

        const onContainerLeave = () => {
          leaveTimer = setTimeout(hideButtons, 120);
        };

        me.bus.addListener('operation', (operation: any) => {
          hideButtons();
          if (operation?.name === 'moveNode') {
            const latest = me.getData();
            decorateNodeTaskStatus(latest.nodeData);
            me.refresh(latest);
          }
          if (!cancelled) triggerSave(me);
        });

        const onKeyDown = async (e: KeyboardEvent) => {
          if (e.key !== 'Enter') return;

          let el = e.target as HTMLElement | null;
          while (el && el !== containerRef.current) {
            if (el.tagName === 'ME-TPC') {
              e.preventDefault();
              e.stopPropagation();
              me.selectNode(el as any);
              if (e.ctrlKey || e.metaKey) {
                addChildForElement(el);
              }
              else await me.insertSibling('after', el as any);
              return;
            }
            el = el.parentElement;
          }
        };

        const onContextMenu = (e: MouseEvent) => {
          const canvasRect = containerRef.current?.getBoundingClientRect();
          let el = e.target as HTMLElement | null;
          while (el && el !== containerRef.current) {
            if (el.tagName === 'ME-TPC') {
              e.preventDefault();
              e.stopPropagation();
              me.selectNode(el as any, false, e);
              pendingTopicRef.current = (el as any).nodeObj?.topic ?? '';
              setContextMenu({
                x: e.clientX - (canvasRect?.left ?? 0),
                y: e.clientY - (canvasRect?.top ?? 0),
                topic: pendingTopicRef.current,
                el,
              });
              return;
            }
            el = el.parentElement;
          }
          setContextMenu(null);
        };

        containerRef.current!.addEventListener('mouseover', onContainerOver);
        containerRef.current!.addEventListener('mouseleave', onContainerLeave);
        containerRef.current!.addEventListener('contextmenu', onContextMenu);
        containerRef.current!.addEventListener('keydown', onKeyDown, true);

        const onButtonsEnter = () => {
          if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
        };
        const onButtonsLeave = () => {
          leaveTimer = setTimeout(hideButtons, 80);
        };

        // Keep buttons visible when the mouse moves into them
        nodeButtonsRef.current?.addEventListener('mouseenter', onButtonsEnter);
        nodeButtonsRef.current?.addEventListener('mouseleave', onButtonsLeave);

        setLoading(false);

        cleanupCanvasListeners = () => {
          containerRef.current?.removeEventListener('mouseover', onContainerOver);
          containerRef.current?.removeEventListener('mouseleave', onContainerLeave);
          containerRef.current?.removeEventListener('contextmenu', onContextMenu);
          containerRef.current?.removeEventListener('keydown', onKeyDown, true);
          nodeButtonsRef.current?.removeEventListener('mouseenter', onButtonsEnter);
          nodeButtonsRef.current?.removeEventListener('mouseleave', onButtonsLeave);
        };
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      cleanupCanvasListeners?.();
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (containerRef.current) containerRef.current.innerHTML = '';
      meRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmapId]);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  // ── Rename ────────────────────────────────────────────────────────────────────

  const commitRename = useCallback(async () => {
    const trimmed = nameValue.trim();
    setEditingName(false);
    if (!trimmed || trimmed === mindmapName) return;
    await fetch(`${API}/mindmaps/${mindmapId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
      body: JSON.stringify({ name: trimmed }),
    });
    onRename?.(trimmed);
  }, [nameValue, mindmapName, mindmapId, fetchHeaders, onRename]);

  // ── Zoom helpers ──────────────────────────────────────────────────────────────

  const zoomIn  = () => { const me = meRef.current; if (me) me.scale(me.scaleVal + 0.25); };
  const zoomOut = () => { const me = meRef.current; if (me) me.scale(Math.max(0.25, me.scaleVal - 0.25)); };
  const fitView = () => meRef.current?.scaleFit();

  // ── Export as PDF ─────────────────────────────────────────────────────────────

  const exportPDF = useCallback(async () => {
    if (!containerRef.current) return;
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const canvas = await html2canvas(containerRef.current, {
      backgroundColor: '#0f172a',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width / 2, canvas.height / 2],
    });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
    pdf.save(`${nameValue}.pdf`);
  }, [nameValue]);

  // ── Node "+" button handlers ──────────────────────────────────────────────────

  const inferBranchDirection = useCallback((tpc: HTMLElement, data: any): 0 | 1 => {
    const nodeDirection = (tpc as any).nodeObj?.direction;
    if (nodeDirection === MindElixir.LEFT) return MindElixir.LEFT;
    if (nodeDirection === MindElixir.RIGHT) return MindElixir.RIGHT;

    const rootTopic = containerRef.current?.querySelector('me-root me-tpc') as HTMLElement | null;
    const activeRect = tpc.getBoundingClientRect();
    const rootRect = rootTopic?.getBoundingClientRect();
    const isVisuallyLeftOfRoot = rootRect
      ? activeRect.left + activeRect.width / 2 < rootRect.left + rootRect.width / 2
      : false;

    const rootId = data?.nodeData?.id;
    const activeId = (tpc as any).nodeObj?.id;
    const isRootNode = !!(tpc as any).nodeObj?.root || (rootId && activeId === rootId);
    if (isRootNode) return MindElixir.RIGHT;

    return isVisuallyLeftOfRoot ? MindElixir.LEFT : MindElixir.RIGHT;
  }, []);

  const addChildForElement = useCallback((tpc: HTMLElement, forcedDirection?: 0 | 1) => {
    const me = meRef.current;
    if (!me) return;

    me.selectNode(tpc as any);
    const data = me.getData();
    const parentId = (tpc as any).nodeObj?.id as string | undefined;
    if (!parentId) return;

    const parentNode = findNodeById(data.nodeData, parentId);
    if (!parentNode) return;

    const direction = forcedDirection ?? inferBranchDirection(tpc, data);
    appendChildNode(parentNode, direction);
    decorateNodeTaskStatus(data.nodeData);
    me.refresh(data);
    triggerSave(me);

    if (nodeButtonsRef.current) nodeButtonsRef.current.style.display = 'none';
    activeTopicRef.current = null;
  }, [inferBranchDirection, triggerSave]);

  const handleAddChild = useCallback(async (direction?: number) => {
    const tpc = activeTopicRef.current;
    if (!tpc) return;
    const resolvedDirection = direction === undefined ? undefined : (direction as 0 | 1);
    addChildForElement(tpc, resolvedDirection);
  }, [addChildForElement]);

  const handleAddSibling = useCallback(async () => {
    const me = meRef.current;
    const tpc = activeTopicRef.current;
    if (!me || !tpc) return;
    me.selectNode(tpc);
    await me.insertSibling('after', tpc);
    if (nodeButtonsRef.current) nodeButtonsRef.current.style.display = 'none';
    activeTopicRef.current = null;
  }, []);

  const handleAddSiblingAbove = useCallback(async () => {
    const me = meRef.current;
    const tpc = activeTopicRef.current;
    if (!me || !tpc) return;
    me.selectNode(tpc);
    await me.insertSibling('before', tpc);
    if (nodeButtonsRef.current) nodeButtonsRef.current.style.display = 'none';
    activeTopicRef.current = null;
  }, []);

  const handleLeftEdgeAdd = useCallback(async () => {
    const me = meRef.current;
    const tpc = activeTopicRef.current;
    if (!me || !tpc) return;

    const data = me.getData();
    const isOnlyNode = countNodes(data.nodeData) === 1;
    const rootId = data.nodeData?.id;
    const activeId = (tpc as any).nodeObj?.id;
    const isRootNode = !!(tpc as any).nodeObj?.root || (rootId && activeId === rootId);
    const isLeftBranch = inferBranchDirection(tpc as HTMLElement, data) === MindElixir.LEFT;

    if (isRootNode || isOnlyNode || isLeftBranch) {
      await handleAddChild(MindElixir.LEFT);
      return;
    }

    await handleAddSibling();
  }, [handleAddChild, handleAddSibling, inferBranchDirection]);

  const handleRightEdgeAdd = useCallback(async () => {
    const tpc = activeTopicRef.current;
    if (!tpc) return;
    await handleAddChild(MindElixir.RIGHT);
  }, [handleAddChild]);

  const handleContextCreateTask = useCallback(() => {
    if (!contextMenu?.topic || !contextMenu?.el) return;
    taskPanelNodeIdRef.current = (contextMenu.el as any).nodeObj?.id ?? null;
    setTaskPanelTopic(contextMenu.topic);
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextRename = useCallback(async () => {
    const me = meRef.current;
    const tpc = contextMenu?.el;
    if (!me || !tpc) return;
    me.selectNode(tpc as any);
    setContextMenu(null);
    await me.beginEdit(tpc as any);
  }, [contextMenu]);

  const handleContextAddChild = useCallback(async () => {
    const tpc = contextMenu?.el;
    if (!tpc) return;
    setContextMenu(null);
    addChildForElement(tpc as HTMLElement);
  }, [addChildForElement, contextMenu]);

  const handleContextAddSibling = useCallback(async () => {
    const me = meRef.current;
    const tpc = contextMenu?.el;
    if (!me || !tpc) return;
    me.selectNode(tpc as any);
    setContextMenu(null);
    await me.insertSibling('after', tpc as any);
  }, [contextMenu]);

  const handleContextDelete = useCallback(async () => {
    const me = meRef.current;
    const tpc = contextMenu?.el;
    if (!me || !tpc) return;
    me.selectNode(tpc as any);
    setContextMenu(null);
    await me.removeNodes([tpc as any]);
  }, [contextMenu]);


  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0 bg-card">

        {/* Name */}
        {editingName ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  commitRename();
                if (e.key === 'Escape') { setNameValue(mindmapName); setEditingName(false); }
              }}
              className="text-sm font-medium px-2 py-1 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0 w-48"
            />
            <button onClick={commitRename} className="p-1 rounded hover:bg-green-500/10 text-green-500 transition-colors">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setNameValue(mindmapName); setEditingName(false); }} className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors group"
          >
            {nameValue}
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          {savedAt && (
            <span className="text-xs text-muted-foreground mr-2">
              Saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button onClick={zoomOut} title="Zoom out" className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={zoomIn} title="Zoom in" className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={fitView} title="Fit to view" className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <Maximize2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={exportPDF} title="Download as PDF" className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <FileDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={containerRef} className="w-full h-full mindmap-container" />

        {contextMenu && (
          <div
            className="absolute z-30 min-w-44 rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
          >
            <button onClick={handleContextCreateTask} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors">
              Create Task
            </button>
            <button onClick={handleContextRename} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors">
              Rename Node
            </button>
            <button onClick={handleContextAddChild} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors">
              Add Child Node
            </button>
            <button onClick={handleContextAddSibling} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors">
              Add Sibling Node
            </button>
            <button onClick={handleContextDelete} className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors">
              Delete Node
            </button>
          </div>
        )}

        {/* Edge "+" buttons — positioned over the active node */}
        <div
          ref={nodeButtonsRef}
          style={{ display: 'none', position: 'absolute', zIndex: 20, pointerEvents: 'none' }}
        >
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleAddSiblingAbove(); }}
            title="Add peer node above"
            style={{
              position: 'absolute',
              left: '50%',
              top: '-10px',
              transform: 'translateX(-50%)',
              width: '20px',
              height: '20px',
              borderRadius: '9999px',
              border: '1.5px solid #000',
              background: '#f3f4f6',
              cursor: 'pointer',
              color: '#000',
              fontWeight: 700,
              fontSize: '14px',
              lineHeight: '18px',
              boxShadow: '0 1px 3px rgba(0,0,0,.15)',
              pointerEvents: 'auto',
            }}
          >+</button>
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleAddSibling(); }}
            title="Add peer node below"
            style={{
              position: 'absolute',
              left: '50%',
              bottom: '-10px',
              transform: 'translateX(-50%)',
              width: '20px',
              height: '20px',
              borderRadius: '9999px',
              border: '1.5px solid #000',
              background: '#f3f4f6',
              cursor: 'pointer',
              color: '#000',
              fontWeight: 700,
              fontSize: '14px',
              lineHeight: '18px',
              boxShadow: '0 1px 3px rgba(0,0,0,.15)',
              pointerEvents: 'auto',
            }}
          >+</button>
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleLeftEdgeAdd(); }}
            title="Add left node or peer below"
            style={{
              position: 'absolute',
              left: '-10px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '20px',
              height: '20px',
              borderRadius: '9999px',
              border: '1.5px solid #000',
              background: '#f3f4f6',
              cursor: 'pointer',
              color: '#000',
              fontWeight: 700,
              fontSize: '14px',
              lineHeight: '18px',
              boxShadow: '0 1px 3px rgba(0,0,0,.15)',
              pointerEvents: 'auto',
            }}
          >+</button>
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleRightEdgeAdd(); }}
            title="Add child node"
            style={{
              position: 'absolute',
              right: '-10px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '20px',
              height: '20px',
              borderRadius: '9999px',
              border: '1.5px solid #000',
              background: '#f3f4f6',
              cursor: 'pointer',
              color: '#000',
              fontWeight: 700,
              fontSize: '14px',
              lineHeight: '18px',
              boxShadow: '0 1px 3px rgba(0,0,0,.15)',
              pointerEvents: 'auto',
            }}
          >+</button>
        </div>
      </div>

      {/* ── Keyboard hint ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border flex-shrink-0 bg-card/50">
        <span className="text-[11px] text-muted-foreground/60">
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Enter</kbd> add sibling &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Ctrl+Enter</kbd> add child &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Del</kbd> remove node &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">F2</kbd> edit label &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Ctrl+Z</kbd> undo &nbsp;
          <span className="opacity-60">· Right-click a node → Create Task</span>
        </span>
      </div>

      {/* ── Create-task panel ────────────────────────────────────────────────── */}
      {taskPanelTopic !== null && (
        <TaskCreatePanel
          nodeTopic={taskPanelTopic}
          onClose={() => setTaskPanelTopic(null)}
          onCreated={(task) => {
            const me = meRef.current;
            const nodeId = taskPanelNodeIdRef.current;
            if (me && nodeId) {
              const data = me.getData();
              const node = findNodeById(data.nodeData, nodeId);
              if (node) {
                node.metadata = { ...(node.metadata ?? {}), taskId: task.id, taskStatus: task.status };
                decorateNodeTaskStatus(data.nodeData);
                me.refresh(data);
                triggerSave(me);
              }
            }
            taskPanelNodeIdRef.current = null;
            setTaskPanelTopic(null);
          }}
        />
      )}

      <style>{`
        .mindmap-container me-parent me-epd,
        .mindmap-container me-root > me-wrapper > me-parent > me-epd {
          opacity: 0.95 !important;
          z-index: 25 !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
        }

        .mindmap-container me-parent me-epd.minus {
          opacity: 0.95 !important;
        }
      `}</style>
    </div>
  );
}
