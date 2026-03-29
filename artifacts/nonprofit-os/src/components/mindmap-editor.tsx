import React, { useState, useEffect, useRef, useCallback } from 'react';
import MindElixir, { type MindElixirInstance, type MindElixirData } from 'mind-elixir';
import { Loader2, Pencil, Check, X, ZoomIn, ZoomOut, Maximize2, FileDown } from 'lucide-react';
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
          contextMenu: true,
          toolBar: false,
          keypress: true,
          allowUndo: true,
          newTopicName: 'New node',
          theme: {
            name: 'BusinessOS',
            type: 'light',
            palette: [
              '#7dd3fc','#7dd3fc','#7dd3fc','#7dd3fc',
              '#7dd3fc','#7dd3fc','#7dd3fc','#7dd3fc',
            ],
            cssVar: {
              '--node-gap-x': '32px',
              '--node-gap-y': '12px',
              '--main-gap-x': '64px',
              '--main-gap-y': '16px',
              '--main-color': '#000000',
              '--main-bgcolor': '#9ca3af',
              '--main-bgcolor-transparent': '#9ca3af99',
              '--color': '#000000',
              '--bgcolor': '#9ca3af',
              '--selected': '#38bdf8',
              '--accent-color': '#7dd3fc',
              '--root-color': '#000000',
              '--root-bgcolor': '#9ca3af',
              '--root-border-color': '#7dd3fc',
              '--root-radius': '8px',
              '--main-radius': '6px',
              '--topic-padding': '4px 14px',
              '--panel-color': '#1e293b',
              '--panel-bgcolor': '#ffffff',
              '--panel-border-color': '#7dd3fc',
              '--map-padding': '20px',
            },
          },
        });

        me.init(data);
        meRef.current = me;

        me.bus.addListener('operation', () => {
          if (!cancelled) triggerSave(me);
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

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
      </div>

      {/* ── Keyboard hint ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border flex-shrink-0 bg-card/50">
        <span className="text-[11px] text-muted-foreground/60">
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Tab</kbd> add child &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Enter</kbd> add sibling &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Del</kbd> remove node &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">F2</kbd> edit label &nbsp;
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Ctrl+Z</kbd> undo
        </span>
      </div>
    </div>
  );
}
