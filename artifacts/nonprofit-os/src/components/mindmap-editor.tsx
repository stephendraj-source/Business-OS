import React, { useState, useEffect, useRef, useCallback } from 'react';
import MindElixir, { type MindElixirInstance, type MindElixirData } from 'mind-elixir';
import { Loader2, Pencil, Check, X, ZoomIn, ZoomOut, Maximize2, FileDown, ListTodo } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

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

  // ── Create-task modal state ───────────────────────────────────────────────────
  const [taskModal, setTaskModal] = useState<{ topic: string } | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  // Ref so the non-React mind-elixir onclick can open the modal
  const openTaskModalRef = useRef<((topic: string) => void) | null>(null);
  openTaskModalRef.current = (topic: string) => {
    setTaskName(topic);
    setTaskDone(false);
    setTaskModal({ topic });
  };
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

    fetch(`${API}/mindmaps/${mindmapId}`, { headers: fetchHeaders() })
      .then(r => r.json())
      .then(record => {
        if (cancelled || !containerRef.current) return;

        let raw: unknown;
        try { raw = JSON.parse(record.data); } catch { raw = null; }
        const data = convertLegacyData(raw);

        const me = new MindElixir({
          el: containerRef.current,
          direction: MindElixir.SIDE,
          data,
          editable: true,
          contextMenu: {
            extend: [
              {
                name: 'Create Task from node',
                onclick: () => {
                  openTaskModalRef.current?.(pendingTopicRef.current);
                },
              },
            ],
          },
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

        me.bus.addListener('showContextMenu', () => {
          pendingTopicRef.current = me.currentNode?.nodeObj?.topic ?? '';
        });

        me.bus.addListener('operation', () => {
          if (!cancelled) triggerSave(me);
        });

        // ── Hover "+" buttons ───────────────────────────────────────────────
        const wrapper = containerRef.current!.parentElement!;
        let leaveTimer: ReturnType<typeof setTimeout> | null = null;

        function showButtons(tpc: HTMLElement) {
          if (!nodeButtonsRef.current) return;
          activeTopicRef.current = tpc;
          const wRect = wrapper.getBoundingClientRect();
          const tRect = tpc.getBoundingClientRect();
          const btn = nodeButtonsRef.current;
          btn.style.top  = `${tRect.top  - wRect.top  + tRect.height + 4}px`;
          btn.style.left = `${tRect.left - wRect.left}px`;
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
        };

        const onContainerLeave = () => {
          leaveTimer = setTimeout(hideButtons, 120);
        };

        containerRef.current!.addEventListener('mouseover', onContainerOver);
        containerRef.current!.addEventListener('mouseleave', onContainerLeave);

        // Keep buttons visible when the mouse moves into them
        nodeButtonsRef.current?.addEventListener('mouseenter', () => {
          if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
        });
        nodeButtonsRef.current?.addEventListener('mouseleave', () => {
          leaveTimer = setTimeout(hideButtons, 80);
        });

        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (containerRef.current) containerRef.current.innerHTML = '';
      meRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindmapId]);

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

  const handleAddChild = useCallback(async () => {
    const me = meRef.current;
    const tpc = activeTopicRef.current;
    if (!me || !tpc) return;
    me.selectNode(tpc);
    await me.addChild(tpc);
    if (nodeButtonsRef.current) nodeButtonsRef.current.style.display = 'none';
    activeTopicRef.current = null;
  }, []);

  const handleAddSibling = useCallback(async () => {
    const me = meRef.current;
    const tpc = activeTopicRef.current;
    if (!me || !tpc) return;
    me.selectNode(tpc);
    await me.insertSibling('after', tpc);
    if (nodeButtonsRef.current) nodeButtonsRef.current.style.display = 'none';
    activeTopicRef.current = null;
  }, []);

  // ── Create task from node ─────────────────────────────────────────────────────

  const createTask = useCallback(async () => {
    const name = taskName.trim();
    if (!name) return;
    setTaskSaving(true);
    try {
      await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ name }),
      });
      setTaskDone(true);
      setTimeout(() => setTaskModal(null), 1200);
    } catch {
      // leave modal open so user can retry
    } finally {
      setTaskSaving(false);
    }
  }, [taskName, fetchHeaders]);

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

        {/* Hover "+" buttons — positioned via JS, hidden by default */}
        <div
          ref={nodeButtonsRef}
          style={{ display: 'none', position: 'absolute', zIndex: 20, gap: '4px', pointerEvents: 'auto' }}
        >
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleAddChild(); }}
            title="Add child node"
            style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '5px',
              border: '1.5px solid #000', background: '#f3f4f6', cursor: 'pointer',
              color: '#000', fontWeight: 600, lineHeight: '18px', boxShadow: '0 1px 3px rgba(0,0,0,.15)',
            }}
          >+ child</button>
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleAddSibling(); }}
            title="Add sibling node"
            style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '5px',
              border: '1.5px solid #000', background: '#f3f4f6', cursor: 'pointer',
              color: '#000', fontWeight: 600, lineHeight: '18px', boxShadow: '0 1px 3px rgba(0,0,0,.15)',
            }}
          >+ sibling</button>
        </div>
      </div>

      {/* ── Keyboard hint ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border flex-shrink-0 bg-card/50">
        <span className="text-[11px] text-muted-foreground/60">
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Tab</kbd> add child &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Enter</kbd> add sibling &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Del</kbd> remove node &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">F2</kbd> edit label &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Ctrl+Z</kbd> undo &nbsp;
          <span className="opacity-60">· Right-click a node → Create Task</span>
        </span>
      </div>

      {/* ── Create-task modal ────────────────────────────────────────────────── */}
      {taskModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setTaskModal(null); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="create-task-title" className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center gap-2 mb-4">
              <ListTodo className="w-5 h-5 text-primary" />
              <h3 id="create-task-title" className="font-semibold text-base">Create Task</h3>
            </div>

            {taskDone ? (
              <div className="flex items-center gap-2 text-green-500 py-2">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Task created successfully</span>
              </div>
            ) : (
              <>
                <label className="block text-sm text-muted-foreground mb-1">Task name</label>
                <input
                  autoFocus
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') createTask();
                    if (e.key === 'Escape') setTaskModal(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 mb-4"
                  placeholder="Task name…"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setTaskModal(null)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createTask}
                    disabled={taskSaving || !taskName.trim()}
                    className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {taskSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Create Task
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
