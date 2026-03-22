import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import {
  Plus, Trash2, Save, ZoomIn, ZoomOut, Maximize2,
  GitBranch, CheckSquare, Loader2, X, Check, Link, Unlink,
  AlignLeft, ChevronDown, Calendar, FileDown, Pencil, Copy,
  GitFork, Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskData {
  name: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  assignedTo: number | null;
  queueId: number | null;
  endDate: string | null;
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';
  source: string;
  aiInstructions: string;
}

interface MapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  type: 'normal' | 'task';
  taskId: number | null;
  taskData: TaskData | null;
}

interface MapEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

interface MapData {
  nodes: MapNode[];
  edges: MapEdge[];
}

interface Transform { x: number; y: number; scale: number; }

const NODE_W = 180;
const NODE_H = 54;
const TASK_NODE_H = 72;
const NODE_RX = 10;

const DEFAULT_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#334155',
];

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

function defaultTaskData(): TaskData {
  return {
    name: '', description: '', priority: 'normal', status: 'open',
    assignedTo: null, queueId: null, endDate: null,
    approvalStatus: 'none', source: 'Mind Map', aiInstructions: '',
  };
}

function nodeHeight(node: MapNode) {
  return node.type === 'task' ? TASK_NODE_H : NODE_H;
}

// ── Edge path helper ──────────────────────────────────────────────────────────

function edgePath(src: MapNode, dst: MapNode): string {
  const sh = nodeHeight(src);
  const dh = nodeHeight(dst);
  const srcCx = src.x + NODE_W / 2;
  const srcCy = src.y + sh / 2;
  const dstCx = dst.x + NODE_W / 2;
  const dstCy = dst.y + dh / 2;
  const diffX = dstCx - srcCx;
  const diffY = dstCy - srcCy;

  let sx: number, sy: number, ex: number, ey: number;
  let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

  if (Math.abs(diffX) >= Math.abs(diffY)) {
    // Primarily horizontal — connect right→left or left→right edge
    if (diffX >= 0) {
      sx = src.x + NODE_W; sy = srcCy;
      ex = dst.x;          ey = dstCy;
    } else {
      sx = src.x;          sy = srcCy;
      ex = dst.x + NODE_W; ey = dstCy;
    }
    const bend = Math.abs(ex - sx) * 0.45;
    cp1x = sx + (diffX >= 0 ? bend : -bend); cp1y = sy;
    cp2x = ex + (diffX >= 0 ? -bend : bend); cp2y = ey;
  } else {
    // Primarily vertical — connect bottom→top or top→bottom edge
    if (diffY >= 0) {
      sx = srcCx; sy = src.y + sh;
      ex = dstCx; ey = dst.y;
    } else {
      sx = srcCx; sy = src.y;
      ex = dstCx; ey = dst.y + dh;
    }
    const bend = Math.abs(ey - sy) * 0.45;
    cp1x = sx; cp1y = sy + (diffY >= 0 ? bend : -bend);
    cp2x = ex; cp2y = ey + (diffY >= 0 ? -bend : bend);
  }

  return `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`;
}

// ── Context Menu Component ────────────────────────────────────────────────────

interface CtxMenuProps {
  node: MapNode;
  x: number;
  y: number;
  colorOpen: boolean;
  onToggleColor: () => void;
  onClose: () => void;
  onRename: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDuplicate: () => void;
  onChangeColor: (c: string) => void;
  onCreateTask: () => void;
  onUnlinkTask: () => void;
  onDelete: () => void;
}

function CtxMenu({
  node, x, y, colorOpen,
  onToggleColor, onClose, onRename, onAddChild, onAddSibling,
  onDuplicate, onChangeColor, onCreateTask, onUnlinkTask, onDelete,
}: CtxMenuProps) {
  const isTask = node.type === 'task';
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // After each render (including when colorOpen changes) clamp to viewport
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const PAD = 8;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const { width, height } = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + width + PAD > W)  left = Math.max(PAD, W - width - PAD);
    if (top  + height + PAD > H) top  = Math.max(PAD, H - height - PAD);
    setPos({ left, top });
  }, [x, y, colorOpen]);

  const Item = ({
    onClick, icon, label, cls = 'text-foreground hover:bg-secondary/70',
  }: { onClick: () => void; icon: React.ReactNode; label: string; cls?: string }) => (
    <button
      onPointerDown={e => e.nativeEvent.stopImmediatePropagation()}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors text-left ${cls}`}
    >
      <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">{icon}</span>
      {label}
    </button>
  );

  const Sep = () => <div className="my-1 border-t border-border/60" />;

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-popover border border-border rounded-xl shadow-2xl py-1.5 min-w-[200px] text-sm"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={e => e.nativeEvent.stopImmediatePropagation()}
    >
      <Item onClick={onRename} icon={<Pencil className="w-3.5 h-3.5" />} label="Rename" />

      <Sep />

      <Item onClick={onAddChild}   icon={<GitFork className="w-3.5 h-3.5" />} label="Add child node"   cls="text-primary hover:bg-primary/10" />
      <Item onClick={onAddSibling} icon={<Plus    className="w-3.5 h-3.5" />} label="Add sibling node" cls="text-primary hover:bg-primary/10" />
      <Item onClick={onDuplicate}  icon={<Copy    className="w-3.5 h-3.5" />} label="Duplicate" />

      <Sep />

      {/* Change colour row */}
      <button
        onPointerDown={e => e.nativeEvent.stopImmediatePropagation()}
        onClick={onToggleColor}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-secondary/70 transition-colors text-left"
      >
        <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
          <Palette className="w-3.5 h-3.5" />
        </span>
        Change colour
        <span
          className="ml-auto w-3.5 h-3.5 rounded-full border border-white/30 flex-shrink-0"
          style={{ background: node.color }}
        />
      </button>
      {colorOpen && (
        <div className="px-3 pb-2 pt-1 grid grid-cols-5 gap-1.5">
          {DEFAULT_COLORS.map(c => (
            <button
              key={c}
              onPointerDown={e => e.nativeEvent.stopImmediatePropagation()}
              onClick={() => onChangeColor(c)}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{ background: c, borderColor: node.color === c ? '#fff' : 'transparent' }}
            />
          ))}
        </div>
      )}

      <Sep />

      {!isTask && (
        <Item onClick={onCreateTask} icon={<CheckSquare className="w-3.5 h-3.5" />} label="Create task" cls="text-emerald-400 hover:bg-emerald-500/10" />
      )}
      {isTask && (
        <Item onClick={onUnlinkTask} icon={<Unlink className="w-3.5 h-3.5" />} label="Unlink task" cls="text-amber-400 hover:bg-amber-500/10" />
      )}

      <Sep />

      <Item onClick={onDelete} icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" cls="text-red-400 hover:bg-red-500/10" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface MindmapEditorProps {
  mindmapId: number;
  mindmapName: string;
  onRename: (name: string) => void;
}

export function MindmapEditor({ mindmapId, mindmapName, onRename }: MindmapEditorProps) {
  const { fetchHeaders } = useAuth();

  const [mapData, setMapData] = useState<MapData>({ nodes: [], edges: [] });
  const [transform, setTransform] = useState<Transform>({ x: 60, y: 60, scale: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<{ nodeId: string; value: string } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(mindmapName);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [queues, setQueues] = useState<{ id: number; name: string }[]>([]);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [contextMenuColorOpen, setContextMenuColorOpen] = useState(false);
  const [taskModal, setTaskModal] = useState<{ nodeId: string } | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskData>(defaultTaskData());

  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ startX: number; startY: number; origTx: number; origTy: number } | null>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapDataRef = useRef(mapData);
  const inlineEditRef = useRef<HTMLInputElement>(null);

  useEffect(() => { mapDataRef.current = mapData; }, [mapData]);
  useEffect(() => { setNameValue(mindmapName); }, [mindmapName]);

  // Focus the inline edit input via ref when editing starts (more reliable than autoFocus in SVG foreignObject)
  useEffect(() => {
    if (editingLabel) {
      requestAnimationFrame(() => { inlineEditRef.current?.focus(); });
    }
  }, [editingLabel?.nodeId]);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/mindmaps/${mindmapId}`, { headers: fetchHeaders() })
      .then(r => r.json())
      .then(async (mm) => {
        let data: MapData = { nodes: [], edges: [] };
        try { data = JSON.parse(mm.data); } catch {}
        // Re-sync task nodes with live task records
        const synced = await syncTaskNodes(data, fetchHeaders());
        setMapData(synced);
        fitView(synced);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mindmapId]);

  useEffect(() => {
    fetch(`${API}/users`, { headers: fetchHeaders() })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d.map((u: any) => ({ id: u.id, name: u.name || u.email }))); }).catch(() => {});
    fetch(`${API}/org/task-queues`, { headers: fetchHeaders() })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setQueues(d); }).catch(() => {});
  }, []);

  // ── Sync task nodes ───────────────────────────────────────────────────────

  async function syncTaskNodes(data: MapData, headers: HeadersInit): Promise<MapData> {
    const taskNodes = data.nodes.filter(n => n.type === 'task' && n.taskId);
    if (!taskNodes.length) return data;
    const updated = await Promise.all(
      taskNodes.map(async (n) => {
        try {
          const r = await fetch(`${API}/tasks/${n.taskId}`, { headers });
          if (!r.ok) return n;
          const t = await r.json();
          return { ...n, label: t.name || n.label, taskData: taskToData(t) };
        } catch { return n; }
      })
    );
    const map = new Map(updated.map(n => [n.id, n]));
    return { ...data, nodes: data.nodes.map(n => map.get(n.id) ?? n) };
  }

  function taskToData(t: any): TaskData {
    return {
      name: t.name ?? '',
      description: t.description ?? '',
      priority: t.priority ?? 'normal',
      status: t.status ?? 'open',
      assignedTo: t.assigned_to ?? null,
      queueId: t.queue_id ?? null,
      endDate: t.end_date ? t.end_date.slice(0, 10) : null,
      approvalStatus: t.approval_status ?? 'none',
      source: t.source ?? 'Mind Map',
      aiInstructions: t.ai_instructions ?? '',
    };
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────

  const scheduleSave = useCallback((data: MapData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`${API}/mindmaps/${mindmapId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
          body: JSON.stringify({ data: JSON.stringify(data) }),
        });
        setSavedAt(new Date());
      } catch {}
      setSaving(false);
    }, 1000);
  }, [mindmapId, fetchHeaders]);

  const updateMapData = useCallback((fn: (prev: MapData) => MapData) => {
    setMapData(prev => {
      const next = fn(prev);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // ── Fit view ──────────────────────────────────────────────────────────────

  const fitView = (data?: MapData) => {
    const d = data ?? mapDataRef.current;
    if (!d.nodes.length) { setTransform({ x: 60, y: 60, scale: 1 }); return; }
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const { width, height } = svgEl.getBoundingClientRect();
    const minX = Math.min(...d.nodes.map(n => n.x));
    const minY = Math.min(...d.nodes.map(n => n.y));
    const maxX = Math.max(...d.nodes.map(n => n.x + NODE_W));
    const maxY = Math.max(...d.nodes.map(n => n.y + nodeHeight(n)));
    const pad = 80;
    const scaleX = (width - pad * 2) / (maxX - minX || 1);
    const scaleY = (height - pad * 2) / (maxY - minY || 1);
    const scale = Math.min(1.2, Math.max(0.2, Math.min(scaleX, scaleY)));
    setTransform({
      x: (width - (maxX - minX) * scale) / 2 - minX * scale,
      y: (height - (maxY - minY) * scale) / 2 - minY * scale,
      scale,
    });
  };

  // ── Auto Arrange ──────────────────────────────────────────────────────────

  const autoArrange = () => {
    const { nodes, edges } = mapDataRef.current;
    if (nodes.length === 0) return;

    const H_GAP = 60;   // horizontal gap between levels
    const SIBLING_GAP = 8;   // compact gap between sibling node tops
    const SUBTREE_GAP = 12;  // minimum gap between sibling subtree extents

    // Build child map
    const childMap = new Map<string, string[]>();
    const targetIdSet = new Set(edges.map(e => e.targetId));
    nodes.forEach(n => childMap.set(n.id, []));
    edges.forEach(e => {
      const list = childMap.get(e.sourceId);
      if (list) list.push(e.targetId);
    });

    // Root = node with no incoming edges; fall back to first node
    const rootNode = nodes.find(n => !targetIdSet.has(n.id)) ?? nodes[0];

    const positions = new Map<string, { x: number; y: number }>();
    const visited = new Set<string>();

    /**
     * Lay out the subtree rooted at `id`, centred on `yMid`.
     * Returns { top, bottom } — the full pixel extent of the subtree after layout.
     *
     * Algorithm:
     *  1. Place sibling nodes compactly (by their own height + SIBLING_GAP).
     *  2. Recursively lay out each child's subtree.
     *  3. After each child is placed, check if the next sibling would
     *     overlap the previous child's subtree; if so, push it down only
     *     as much as needed (SUBTREE_GAP clearance).
     */
    function layoutSubtree(
      id: string, x: number, yMid: number, xDir: 1 | -1,
    ): { top: number; bottom: number } {
      visited.add(id);
      const node = nodes.find(n => n.id === id)!;
      const selfH = nodeHeight(node);
      const nodeTop = yMid - selfH / 2;
      positions.set(id, { x, y: nodeTop });

      const children = childMap.get(id) ?? [];
      if (children.length === 0) return { top: nodeTop, bottom: nodeTop + selfH };

      const nextX = x + xDir * (NODE_W + H_GAP);

      // Step 1 – ideal compact positions (sibling nodes close together)
      const childSelfHs = children.map(cid => nodeHeight(nodes.find(n => n.id === cid)!));
      const totalNodeH = childSelfHs.reduce((s, h) => s + h, 0)
        + (children.length - 1) * SIBLING_GAP;
      const childYMids: number[] = [];
      let cursor = yMid - totalNodeH / 2;
      for (let i = 0; i < children.length; i++) {
        childYMids[i] = cursor + childSelfHs[i] / 2;
        cursor += childSelfHs[i] + SIBLING_GAP;
      }

      // Step 2 – layout children and resolve subtree overlaps on the fly
      const extents: Array<{ top: number; bottom: number }> = [];
      for (let i = 0; i < children.length; i++) {
        if (i > 0) {
          // ensure this child doesn't collide with previous sibling's subtree
          const prevBottom = extents[i - 1].bottom;
          const desiredTop = childYMids[i] - childSelfHs[i] / 2;
          if (desiredTop < prevBottom + SUBTREE_GAP) {
            const shift = prevBottom + SUBTREE_GAP - desiredTop;
            for (let j = i; j < children.length; j++) childYMids[j] += shift;
          }
        }
        extents.push(layoutSubtree(children[i], nextX, childYMids[i], xDir));
      }

      const subtreeTop    = Math.min(nodeTop, ...extents.map(e => e.top));
      const subtreeBottom = Math.max(nodeTop + selfH, ...extents.map(e => e.bottom));
      return { top: subtreeTop, bottom: subtreeBottom };
    }

    // Keep root in place
    visited.add(rootNode.id);
    const rootSelfH = nodeHeight(rootNode);
    const rootYMid = rootNode.y + rootSelfH / 2;
    positions.set(rootNode.id, { x: rootNode.x, y: rootNode.y });

    const directChildren = childMap.get(rootNode.id) ?? [];

    // Split root's direct children into right-side and left-side
    const rightChildren = directChildren.filter(cid => {
      const c = nodes.find(n => n.id === cid);
      return c && c.x >= rootNode.x;
    });
    const leftChildren = directChildren.filter(cid => {
      const c = nodes.find(n => n.id === cid);
      return c && c.x < rootNode.x;
    });

    // Helper: layout a group of root-level children on one side
    function layoutRootSide(children: string[], xStart: number, xDir: 1 | -1) {
      const childSelfHs = children.map(cid => nodeHeight(nodes.find(n => n.id === cid)!));
      const totalNodeH = childSelfHs.reduce((s, h) => s + h, 0)
        + (children.length - 1) * SIBLING_GAP;
      const yMids: number[] = [];
      let cursor = rootYMid - totalNodeH / 2;
      for (let i = 0; i < children.length; i++) {
        yMids[i] = cursor + childSelfHs[i] / 2;
        cursor += childSelfHs[i] + SIBLING_GAP;
      }
      const extents: Array<{ top: number; bottom: number }> = [];
      for (let i = 0; i < children.length; i++) {
        if (i > 0) {
          const prevBottom = extents[i - 1].bottom;
          const desiredTop = yMids[i] - childSelfHs[i] / 2;
          if (desiredTop < prevBottom + SUBTREE_GAP) {
            const shift = prevBottom + SUBTREE_GAP - desiredTop;
            for (let j = i; j < children.length; j++) yMids[j] += shift;
          }
        }
        extents.push(layoutSubtree(children[i], xStart, yMids[i], xDir));
      }
    }

    layoutRootSide(rightChildren, rootNode.x + NODE_W + H_GAP,  1);
    layoutRootSide(leftChildren,  rootNode.x - H_GAP - NODE_W, -1);

    // Handle orphan nodes (unreachable from root)
    const orphans = nodes.filter(n => !visited.has(n.id));
    if (orphans.length > 0) {
      let maxY = rootNode.y + rootSelfH;
      positions.forEach(p => { maxY = Math.max(maxY, p.y + NODE_H); });
      let ox = rootNode.x;
      let oy = maxY + 80;
      let rowH = 0;
      orphans.forEach((n, i) => {
        const nh = nodeHeight(n);
        positions.set(n.id, { x: ox, y: oy });
        ox += NODE_W + H_GAP;
        rowH = Math.max(rowH, nh);
        if ((i + 1) % 5 === 0) { ox = rootNode.x; oy += rowH + SIBLING_GAP; rowH = 0; }
      });
    }

    // Apply all new positions and then fit the view
    updateMapData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => {
        const p = positions.get(n.id);
        return p ? { ...n, x: p.x, y: p.y } : n;
      }),
    }));

    // Fit view after a short tick to let state settle
    setTimeout(() => fitView(), 50);
  };

  // ── Export PDF ───────────────────────────────────────────────────────────

  const exportAsPdf = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const nodes = mapDataRef.current.nodes;
    const pad = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + nodeHeight(n));
    }
    if (!nodes.length) { minX = 0; minY = 0; maxX = 800; maxY = 600; }

    const vx = minX - pad, vy = minY - pad;
    const vw = (maxX - minX) + pad * 2;
    const vh = (maxY - minY) + pad * 2;

    // Clone SVG and fix it up for export
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
    clone.setAttribute("width", String(vw));
    clone.setAttribute("height", String(vh));
    // Reset the transform group to identity so content aligns with viewBox
    const gEl = clone.querySelector("g");
    if (gEl) gEl.setAttribute("transform", "translate(0,0) scale(1)");
    // Remove foreignObject (inline editor inputs)
    clone.querySelectorAll("foreignObject").forEach(fo => fo.remove());
    // Add white background
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", String(vx)); bg.setAttribute("y", String(vy));
    bg.setAttribute("width", String(vw)); bg.setAttribute("height", String(vh));
    bg.setAttribute("fill", "white");
    clone.insertBefore(bg, clone.firstChild);

    const svgStr = new XMLSerializer().serializeToString(clone);
    const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>${mindmapName}</title>
    <style>
      @page { size: A4 landscape; margin: 1cm; }
      @media print { body { margin: 0; } }
      body { margin: 0; padding: 0; background: white; display: flex; flex-direction: column; align-items: center; font-family: sans-serif; }
      h2 { font-size: 14pt; color: #333; margin: 8pt 0 4pt; }
      img { max-width: 100%; max-height: calc(100vh - 40pt); object-fit: contain; }
    </style></head><body>
    <h2>${mindmapName}</h2>
    <img src="${svgDataUrl}" alt="${mindmapName}" />
    </body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  }, [mindmapName]);

  // ── Rename mindmap ────────────────────────────────────────────────────────

  const commitRename = async () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== mindmapName) {
      await fetch(`${API}/mindmaps/${mindmapId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ name: trimmed }),
      });
      onRename(trimmed);
    } else setNameValue(mindmapName);
    setEditingName(false);
  };

  // ── Add node ──────────────────────────────────────────────────────────────

  const addNode = () => {
    const svgEl = svgRef.current;
    const { x, y, scale } = transform;
    const cx = svgEl ? (svgEl.clientWidth / 2 - x) / scale : 200;
    const cy = svgEl ? (svgEl.clientHeight / 2 - y) / scale : 200;
    const node: MapNode = {
      id: uid(), label: 'New node',
      x: cx - NODE_W / 2 + (Math.random() * 40 - 20),
      y: cy - NODE_H / 2 + (Math.random() * 40 - 20),
      color: DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
      type: 'normal', taskId: null, taskData: null,
    };
    updateMapData(prev => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setTimeout(() => autoArrange(), 80);
  };

  // ── Add child node ────────────────────────────────────────────────────────

  const addChildNode = (parentId: string) => {
    const parent = mapDataRef.current.nodes.find(n => n.id === parentId);
    if (!parent) return;
    const childId = uid();
    const child: MapNode = {
      id: childId,
      label: 'New node',
      x: parent.x + NODE_W + 60,
      y: parent.y + (Math.random() * 60 - 30),
      color: parent.color,
      type: 'normal',
      taskId: null,
      taskData: null,
    };
    const edge = { id: uid(), sourceId: parentId, targetId: childId };
    updateMapData(prev => ({
      nodes: [...prev.nodes, child],
      edges: [...prev.edges, edge],
    }));
    setSelectedNodeId(childId);
    setEditingLabel({ nodeId: childId, value: 'New node' });
    setTimeout(() => autoArrange(), 80);
  };

  // ── Add peer (sibling) node ───────────────────────────────────────────────

  const addPeerNode = (siblingId: string) => {
    const sibling = mapDataRef.current.nodes.find(n => n.id === siblingId);
    if (!sibling) return;
    // Find this node's parent edge (if any)
    const parentEdge = mapDataRef.current.edges.find(e => e.targetId === siblingId);
    const peerId = uid();
    const peer: MapNode = {
      id: peerId,
      label: 'New node',
      x: sibling.x,
      y: sibling.y + nodeHeight(sibling) + 36,
      color: sibling.color,
      type: 'normal',
      taskId: null,
      taskData: null,
    };
    const newEdges = parentEdge
      ? [{ id: uid(), sourceId: parentEdge.sourceId, targetId: peerId }]
      : [];
    updateMapData(prev => ({
      nodes: [...prev.nodes, peer],
      edges: [...prev.edges, ...newEdges],
    }));
    setSelectedNodeId(peerId);
    setEditingLabel({ nodeId: peerId, value: 'New node' });
    setTimeout(() => autoArrange(), 80);
  };

  // ── Delete selected ───────────────────────────────────────────────────────

  const deleteSelected = () => {
    if (selectedNodeId) {
      updateMapData(prev => ({
        nodes: prev.nodes.filter(n => n.id !== selectedNodeId),
        edges: prev.edges.filter(e => e.sourceId !== selectedNodeId && e.targetId !== selectedNodeId),
      }));
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      updateMapData(prev => ({ ...prev, edges: prev.edges.filter(e => e.id !== selectedEdgeId) }));
      setSelectedEdgeId(null);
    }
  };

  // ── Delete a specific node by id ─────────────────────────────────────────

  const deleteNode = (nodeId: string) => {
    updateMapData(prev => ({
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.sourceId !== nodeId && e.targetId !== nodeId),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  // ── Duplicate a node ─────────────────────────────────────────────────────

  const duplicateNode = (nodeId: string) => {
    const node = mapDataRef.current.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newId = uid();
    const copy: MapNode = {
      ...node,
      id: newId,
      x: node.x + 30,
      y: node.y + nodeHeight(node) + 20,
      type: 'normal',
      taskId: null,
      taskData: null,
    };
    updateMapData(prev => ({ ...prev, nodes: [...prev.nodes, copy] }));
    setSelectedNodeId(newId);
  };

  // ── Open the "Create Task" modal pre-filled from node label ───────────────

  const openTaskModal = (nodeId: string) => {
    const node = mapDataRef.current.nodes.find(n => n.id === nodeId);
    const draft = defaultTaskData();
    draft.name = node?.label ?? '';
    setTaskDraft(draft);
    setTaskModal({ nodeId });
  };

  // ── Submit the task creation modal ────────────────────────────────────────

  const submitTaskFromModal = async () => {
    if (!taskModal) return;
    setTaskLoading(true);
    try {
      const r = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({
          name: taskDraft.name,
          description: taskDraft.description,
          priority: taskDraft.priority,
          status: taskDraft.status,
          assignedTo: taskDraft.assignedTo,
          queueId: taskDraft.queueId,
          endDate: taskDraft.endDate || null,
          approvalStatus: taskDraft.approvalStatus,
          source: taskDraft.source,
          aiInstructions: taskDraft.aiInstructions,
        }),
      });
      const task = await r.json();
      updateMapData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n =>
          n.id === taskModal.nodeId
            ? { ...n, type: 'task', taskId: task.id, taskData: taskToData(task), label: task.name || n.label }
            : n
        ),
      }));
      setTaskModal(null);
    } catch {}
    setTaskLoading(false);
  };

  // ── Convert node to/from task ─────────────────────────────────────────────

  const convertToTask = async (nodeId: string) => {
    const node = mapDataRef.current.nodes.find(n => n.id === nodeId);
    if (!node || node.type === 'task') return;
    setTaskLoading(true);
    try {
      const r = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ name: node.label, source: 'Mind Map', priority: 'normal', approvalStatus: 'none' }),
      });
      const task = await r.json();
      updateMapData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId
          ? { ...n, type: 'task', taskId: task.id, taskData: taskToData(task), label: task.name || n.label }
          : n
        ),
      }));
    } catch {}
    setTaskLoading(false);
  };

  const unlinkTask = (nodeId: string) => {
    updateMapData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId
        ? { ...n, type: 'normal', taskId: null, taskData: null }
        : n
      ),
    }));
  };

  // ── Update task field ─────────────────────────────────────────────────────

  const updateTaskField = async (nodeId: string, field: keyof TaskData, value: any) => {
    const node = mapDataRef.current.nodes.find(n => n.id === nodeId);
    if (!node || !node.taskId) return;

    const newTaskData = { ...node.taskData!, [field]: value };
    if (field === 'name') {
      updateMapData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, label: value, taskData: newTaskData } : n),
      }));
    } else {
      updateMapData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, taskData: newTaskData } : n),
      }));
    }

    const apiField: Record<string, string> = {
      name: 'name', description: 'description', priority: 'priority',
      status: 'status', assignedTo: 'assignedTo', queueId: 'queueId',
      endDate: 'endDate', approvalStatus: 'approvalStatus',
      source: 'source', aiInstructions: 'aiInstructions',
    };
    await fetch(`${API}/tasks/${node.taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
      body: JSON.stringify({ [apiField[field] ?? field]: value }),
    }).catch(() => {});
  };

  // ── Interaction: Pointer events ───────────────────────────────────────────

  const svgToCanvas = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { cx: 0, cy: 0 };
    return {
      cx: (clientX - rect.left - transform.x) / transform.scale,
      cy: (clientY - rect.top - transform.y) / transform.scale,
    };
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest('.mm-node')) return;
    if ((e.target as SVGElement).closest('.mm-edge')) return;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    if (connectMode) { setConnectSource(null); setConnectMode(false); return; }
    const rect = svgRef.current!.getBoundingClientRect();
    panRef.current = { startX: e.clientX, startY: e.clientY, origTx: transform.x, origTy: transform.y };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setTransform(t => ({ ...t, x: panRef.current!.origTx + dx, y: panRef.current!.origTy + dy }));
    }
    if (dragRef.current) {
      const rect = svgRef.current!.getBoundingClientRect();
      const dx = (e.clientX - dragRef.current.startX) / transform.scale;
      const dy = (e.clientY - dragRef.current.startY) / transform.scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
      if (dragRef.current.moved) {
        const newX = dragRef.current.origX + dx;
        const newY = dragRef.current.origY + dy;
        updateMapData(prev => ({
          ...prev,
          nodes: prev.nodes.map(n => n.id === dragRef.current!.nodeId ? { ...n, x: newX, y: newY } : n),
        }));
      }
    }
  };

  const handleSvgPointerUp = () => {
    panRef.current = null;
    const wasDragged = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (wasDragged) setTimeout(() => autoArrange(), 80);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(t => {
      const newScale = Math.min(3, Math.max(0.15, t.scale * delta));
      const ratio = newScale / t.scale;
      return { scale: newScale, x: mouseX - (mouseX - t.x) * ratio, y: mouseY - (mouseY - t.y) * ratio };
    });
  };

  const handleNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    if (e.button === 2) return; // let right-click pass through to onContextMenu
    e.stopPropagation();
    // In connect mode: handle the click here (before pointer capture is set) and bail out
    if (connectMode) {
      if (!connectSource) {
        setConnectSource(nodeId);
      } else if (connectSource !== nodeId) {
        const alreadyExists = mapDataRef.current.edges.some(
          ed => (ed.sourceId === connectSource && ed.targetId === nodeId) ||
                (ed.sourceId === nodeId && ed.targetId === connectSource)
        );
        if (!alreadyExists) {
          updateMapData(prev => ({
            ...prev,
            edges: [...prev.edges, { id: uid(), sourceId: connectSource!, targetId: nodeId }],
          }));
        }
        setConnectSource(null);
        setConnectMode(false);
      }
      return;
    }
    if (editingLabel?.nodeId === nodeId) return;
    const node = mapData.nodes.find(n => n.id === nodeId)!;
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y, moved: false };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const handleNodePointerUp = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectMode) return; // already handled in pointerdown
    if (dragRef.current?.moved) { dragRef.current = null; return; }
    dragRef.current = null;
    // Single click → select and immediately enter edit mode
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    const node = mapData.nodes.find(n => n.id === nodeId);
    if (node) setEditingLabel({ nodeId, value: node.label });
  };

  const handleNodeDoubleClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = mapData.nodes.find(n => n.id === nodeId);
    if (!node) return;
    setEditingLabel({ nodeId, value: node.label });
  };

  const commitLabelEdit = () => {
    if (!editingLabel) return;
    const { nodeId, value } = editingLabel;
    updateMapData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, label: value } : n),
    }));
    // Sync name to task if task node
    const node = mapDataRef.current.nodes.find(n => n.id === nodeId);
    if (node?.type === 'task' && node.taskId) {
      fetch(`${API}/tasks/${node.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
        body: JSON.stringify({ name: value }),
      }).catch(() => {});
    }
    setEditingLabel(null);
  };

  const handleEdgeClick = (e: React.MouseEvent, edgeId: string) => {
    e.stopPropagation();
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'Escape') { setSelectedNodeId(null); setSelectedEdgeId(null); setConnectMode(false); setConnectSource(null); }
      if (e.key === 'Enter' && selectedNodeId) { e.preventDefault(); addPeerNode(selectedNodeId); }
      if (e.key === 'Insert' && selectedNodeId) { e.preventDefault(); addChildNode(selectedNodeId); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, selectedEdgeId]);

  // ── Close context menu on outside click ──────────────────────────────────

  useEffect(() => {
    if (!contextMenu) { setContextMenuColorOpen(false); return; }
    const handler = () => setContextMenu(null);
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [contextMenu]);

  // ── Orphan detection ──────────────────────────────────────────────────────

  function isOrphan(nodeId: string): boolean {
    return !mapData.edges.some(e => e.sourceId === nodeId || e.targetId === nodeId);
  }

  // Start link-to-node mode: pre-arm connect mode with this node as the source
  const startLinkOrphan = (nodeId: string) => {
    setConnectMode(true);
    setConnectSource(nodeId);
  };

  // ── Selected node ─────────────────────────────────────────────────────────

  const selectedNode = mapData.nodes.find(n => n.id === selectedNodeId) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <GitBranch className="w-4 h-4 text-violet-400 flex-shrink-0" />
        {editingName ? (
          <input
            autoFocus
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameValue(mindmapName); setEditingName(false); } }}
            className="flex-1 text-sm font-semibold bg-transparent border-b border-primary focus:outline-none"
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold cursor-pointer hover:text-primary transition-colors"
            onDoubleClick={() => setEditingName(true)}
            title="Double-click to rename"
          >
            {mindmapName}
          </span>
        )}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {saving
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
            : savedAt
              ? <><Check className="w-3 h-3 text-green-500" /> Saved</>
              : null
          }
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/80 flex-shrink-0 flex-wrap">
        <button onClick={addNode}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Node
        </button>
        <button
          onClick={() => { setConnectMode(v => !v); setConnectSource(null); }}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors",
            connectMode
              ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
              : "bg-secondary border-border text-muted-foreground hover:text-foreground"
          )}
          title="Click two nodes to connect them with an edge"
        >
          <Link className="w-3.5 h-3.5" />
          {connectMode
            ? connectSource ? "Click target node…" : "Click source node…"
            : "Connect"}
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button onClick={() => {
          const el = svgRef.current;
          if (!el) return;
          const { width, height } = el.getBoundingClientRect();
          setTransform(t => {
            const newScale = Math.min(3, t.scale * 1.2);
            const ratio = newScale / t.scale;
            const cx = width / 2; const cy = height / 2;
            return { scale: newScale, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
          });
        }} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Zoom in">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => {
          const el = svgRef.current;
          if (!el) return;
          const { width, height } = el.getBoundingClientRect();
          setTransform(t => {
            const newScale = Math.max(0.15, t.scale * 0.8);
            const ratio = newScale / t.scale;
            const cx = width / 2; const cy = height / 2;
            return { scale: newScale, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
          });
        }} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Zoom out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => fitView()}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Fit all nodes">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <div className="text-[10px] text-muted-foreground ml-1">{Math.round(transform.scale * 100)}%</div>
        <div className="flex-1" />
        <button
          onClick={exportAsPdf}
          title="Export as PDF"
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        >
          <FileDown className="w-3.5 h-3.5" /> Export PDF
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        {(selectedNodeId || selectedEdgeId) && (
          <button onClick={deleteSelected}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        )}
      </div>

      {/* Canvas + Panel */}
      <div className="flex flex-1 min-h-0">
        {/* SVG Canvas */}
        <div className="flex-1 relative overflow-hidden bg-white"
          style={{ backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
          <svg
            ref={svgRef}
            className="w-full h-full"
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onWheel={handleWheel}
            style={{ cursor: connectMode ? 'crosshair' : 'default' }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
              </marker>
            </defs>
            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
              {/* Edges */}
              {mapData.edges.map(edge => {
                const src = mapData.nodes.find(n => n.id === edge.sourceId);
                const dst = mapData.nodes.find(n => n.id === edge.targetId);
                if (!src || !dst) return null;
                const isSelected = selectedEdgeId === edge.id;
                return (
                  <path
                    key={edge.id}
                    className="mm-edge"
                    d={edgePath(src, dst)}
                    fill="none"
                    stroke={isSelected ? '#6366f1' : '#94a3b8'}
                    strokeWidth={isSelected ? 2 : 1.5}
                    strokeDasharray={isSelected ? '6 3' : undefined}
                    markerEnd="url(#arrowhead)"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleEdgeClick(e, edge.id)}
                  />
                );
              })}

              {/* Nodes */}
              {mapData.nodes.map(node => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isTaskNode = node.type === 'task';
                const isConnectSrc = connectSource === node.id;
                const orphaned = isOrphan(node.id);
                const h = nodeHeight(node);
                const showPlus = (isSelected || isHovered) && !connectMode && !editingLabel;

                return (
                  <g
                    key={node.id}
                    className="mm-node"
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: connectMode ? 'pointer' : 'grab' }}
                    onPointerDown={e => handleNodePointerDown(e, node.id)}
                    onPointerUp={e => handleNodePointerUp(e, node.id)}
                    onDoubleClick={e => handleNodeDoubleClick(e, node.id)}
                    onPointerEnter={() => setHoveredNodeId(node.id)}
                    onPointerLeave={() => setHoveredNodeId(id => id === node.id ? null : id)}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSelectedNodeId(node.id); setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY }); }}
                  >
                    {/* Transparent hit-area covering node + both button zones to keep hover active */}
                    <rect
                      x={-4} y={-4}
                      width={NODE_W + 54}
                      height={h + 54}
                      fill="rgba(0,0,0,0)"
                      stroke="none"
                      style={{ pointerEvents: 'fill' }}
                    />
                    {/* Orphan indicator — dashed amber ring when no connections */}
                    {orphaned && !isSelected && !isConnectSrc && (
                      <rect x={-3} y={-3} width={NODE_W + 6} height={h + 6} rx={NODE_RX + 2}
                        fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
                    )}
                    {/* Selection ring */}
                    {(isSelected || isConnectSrc) && (
                      <rect x={-3} y={-3} width={NODE_W + 6} height={h + 6} rx={NODE_RX + 2}
                        fill="none" stroke={isConnectSrc ? '#a855f7' : '#6366f1'} strokeWidth={2} opacity={0.7} />
                    )}
                    {/* Node body */}
                    <rect
                      x={0} y={0} width={NODE_W} height={h} rx={NODE_RX}
                      fill={isTaskNode ? '#f0fdf4' : '#ffffff'}
                      stroke={isTaskNode ? '#10b981' : node.color}
                      strokeWidth={isTaskNode ? 2 : 1.5}
                    />
                    {/* Left color bar (normal nodes) */}
                    {!isTaskNode && (
                      <rect x={0} y={0} width={5} height={h} rx={NODE_RX}
                        fill={node.color} />
                    )}
                    {/* Task badge */}
                    {isTaskNode && (
                      <g transform={`translate(${NODE_W - 20}, 8)`}>
                        <circle r={8} fill="#10b981" opacity={0.15} />
                        <CheckSquare width={10} height={10} x={-5} y={-5}
                          stroke="#059669" strokeWidth={1.5} fill="none" />
                      </g>
                    )}
                    {/* Label */}
                    {editingLabel?.nodeId === node.id ? (
                      <foreignObject
                        x={isTaskNode ? 8 : 12} y={8} width={NODE_W - 24} height={h - 12}
                        onPointerDown={e => e.stopPropagation()}
                      >
                        <input
                          ref={inlineEditRef}
                          value={editingLabel.value}
                          onChange={e => setEditingLabel(l => l ? { ...l, value: e.target.value } : null)}
                          onBlur={commitLabelEdit}
                          onKeyDown={e => { if (e.key === 'Enter') commitLabelEdit(); if (e.key === 'Escape') setEditingLabel(null); }}
                          style={{
                            width: '100%', height: '100%', background: 'transparent', border: 'none',
                            outline: 'none', color: '#1e293b', fontSize: 12, fontWeight: 600,
                            cursor: 'text',
                          }}
                        />
                      </foreignObject>
                    ) : (
                      <>
                        <text
                          x={isTaskNode ? 10 : 14} y={isTaskNode ? 22 : h / 2 + 4}
                          fill={isTaskNode ? '#065f46' : '#1e293b'}
                          fontSize={12} fontWeight={600}
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label}
                        </text>
                        {isTaskNode && node.taskData && (
                          <text x={10} y={40} fill="#64748b" fontSize={10} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                            {node.taskData.priority} · {node.taskData.status.replace('_', ' ')}
                          </text>
                        )}
                        {isTaskNode && node.taskData && node.taskData.endDate && (
                          <text x={10} y={56} fill="#94a3b8" fontSize={9} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                            Due: {node.taskData.endDate}
                          </text>
                        )}
                      </>
                    )}
                    {/* + Add Child button (right side → subordinate) */}
                    {showPlus && (
                      <g
                        transform={`translate(${NODE_W + 18}, ${h / 2 - 11})`}
                        style={{ cursor: 'pointer' }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); addChildNode(node.id); }}
                      >
                        <rect x={0} y={0} width={22} height={22} rx={11} fill="#6366f1" />
                        <text x={11} y={15.5} textAnchor="middle" fill="#ffffff" fontSize={15} fontWeight={700}
                          style={{ userSelect: 'none', pointerEvents: 'none' }}>+</text>
                        {/* Tooltip */}
                        <title>Add child node</title>
                      </g>
                    )}
                    {/* + Add Peer button (bottom → sibling at same level) */}
                    {showPlus && (
                      <g
                        transform={`translate(${NODE_W / 2 - 11}, ${h + 18})`}
                        style={{ cursor: 'pointer' }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); addPeerNode(node.id); }}
                      >
                        <rect x={0} y={0} width={22} height={22} rx={11} fill="none" stroke="#6366f1" strokeWidth={1.5} />
                        <rect x={1.5} y={1.5} width={19} height={19} rx={9.5} fill="#eef2ff" />
                        <text x={11} y={15.5} textAnchor="middle" fill="#6366f1" fontSize={15} fontWeight={700}
                          style={{ userSelect: 'none', pointerEvents: 'none' }}>+</text>
                        <title>Add peer node</title>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Empty state */}
          {!mapData.nodes.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <GitBranch className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-400">Click "Add Node" to start mapping</p>
              <p className="text-xs text-slate-300 mt-1">Drag to pan · Scroll to zoom · Click node to select · Click again to rename</p>
            </div>
          )}
        </div>

        {/* Right Panel — only for task nodes */}
        {selectedNode && selectedNode.type === 'task' && (
          <div className="w-72 border-l border-border bg-card flex flex-col overflow-y-auto flex-shrink-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {selectedNode.type === 'task' ? 'Task' : 'Node Properties'}
              </span>
              <button onClick={() => setSelectedNodeId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {selectedNode.type === 'task' && selectedNode.taskData ? (
                <>
                  {/* Task fields shown immediately */}
                  <div className="space-y-3">
                    {/* Task Name */}
                    <Field label="Task Name">
                      <input className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={selectedNode.taskData.name}
                        onChange={e => updateTaskField(selectedNode.id, 'name', e.target.value)} />
                    </Field>

                    {/* Description */}
                    <Field label="Description">
                      <textarea
                        className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                        rows={3} value={selectedNode.taskData.description}
                        onChange={e => updateTaskField(selectedNode.id, 'description', e.target.value)} />
                    </Field>

                    {/* Priority + Status */}
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Priority">
                        <select className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                          value={selectedNode.taskData.priority}
                          onChange={e => updateTaskField(selectedNode.id, 'priority', e.target.value)}>
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </Field>
                      <Field label="Status">
                        <select className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                          value={selectedNode.taskData.status}
                          onChange={e => updateTaskField(selectedNode.id, 'status', e.target.value)}>
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </Field>
                    </div>

                    {/* Assigned To */}
                    <Field label="Assigned To">
                      <select className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                        value={selectedNode.taskData.assignedTo ?? ''}
                        onChange={e => updateTaskField(selectedNode.id, 'assignedTo', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Unassigned</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </Field>

                    {/* Queue */}
                    <Field label="Queue">
                      <select className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                        value={selectedNode.taskData.queueId ?? ''}
                        onChange={e => updateTaskField(selectedNode.id, 'queueId', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">No Queue</option>
                        {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                      </select>
                    </Field>

                    {/* Due Date */}
                    <Field label="Due Date">
                      <input type="date"
                        className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                        value={selectedNode.taskData.endDate ?? ''}
                        onChange={e => updateTaskField(selectedNode.id, 'endDate', e.target.value || null)} />
                    </Field>

                    {/* Approval Status */}
                    <Field label="Approval Status">
                      <select className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                        value={selectedNode.taskData.approvalStatus}
                        onChange={e => updateTaskField(selectedNode.id, 'approvalStatus', e.target.value)}>
                        <option value="none">None</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </Field>

                    {/* Source */}
                    <Field label="Source">
                      <input className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                        value={selectedNode.taskData.source}
                        onChange={e => updateTaskField(selectedNode.id, 'source', e.target.value)} />
                    </Field>

                    {/* AI Instructions */}
                    <Field label="AI Instructions">
                      <textarea
                        className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none resize-none"
                        rows={2} placeholder="Optional instructions for AI agent…"
                        value={selectedNode.taskData.aiInstructions}
                        onChange={e => updateTaskField(selectedNode.id, 'aiInstructions', e.target.value)} />
                    </Field>
                  </div>

                  {/* Unlink from task at bottom */}
                  <div className="border-t border-border pt-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Task #{selectedNode.taskId}</span>
                    </div>
                    <button
                      onClick={() => unlinkTask(selectedNode.id)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs text-muted-foreground border border-border hover:bg-secondary transition-colors"
                    >
                      <Unlink className="w-3 h-3" /> Unlink from task system
                    </button>
                  </div>

                  {/* Link orphaned node */}
                  {isOrphan(selectedNode.id) && (
                    <div className="border-t border-amber-500/20 pt-3">
                      <p className="text-[10px] text-amber-400/80 mb-2 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full border border-amber-400 border-dashed" />
                        This node has no connections
                      </p>
                      <button
                        onClick={() => startLinkOrphan(selectedNode.id)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs text-amber-300 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                      >
                        <Link className="w-3 h-3" /> Link to existing node
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Normal node: Label */}
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Label</label>
                    <input
                      className="w-full text-sm bg-secondary border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                      value={selectedNode.label}
                      onChange={e => {
                        const val = e.target.value;
                        updateMapData(prev => ({
                          ...prev,
                          nodes: prev.nodes.map(n => n.id === selectedNode.id ? { ...n, label: val } : n),
                        }));
                      }}
                    />
                  </div>

                  {/* Color */}
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Color</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_COLORS.map(c => (
                        <button key={c}
                          onClick={() => updateMapData(prev => ({
                            ...prev, nodes: prev.nodes.map(n => n.id === selectedNode.id ? { ...n, color: c } : n),
                          }))}
                          className="w-6 h-6 rounded-full border-2 transition-all"
                          style={{ background: c, borderColor: selectedNode.color === c ? '#fff' : 'transparent' }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Convert to Task */}
                  <button
                    onClick={() => convertToTask(selectedNode.id)}
                    disabled={taskLoading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {taskLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                    Convert to Task
                  </button>

                  {/* Link orphaned node */}
                  {isOrphan(selectedNode.id) && (
                    <div className="border-t border-amber-500/20 pt-3">
                      <p className="text-[10px] text-amber-400/80 mb-2 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full border border-amber-400 border-dashed" />
                        This node has no connections
                      </p>
                      <button
                        onClick={() => startLinkOrphan(selectedNode.id)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs text-amber-300 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                      >
                        <Link className="w-3 h-3" /> Link to existing node
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Connect mode hint */}
      {connectMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-violet-900/90 border border-violet-500/50 rounded-full px-4 py-1.5 text-xs text-violet-200 pointer-events-none shadow-lg">
          {connectSource ? 'Now click the target node to connect' : 'Click a source node to start an edge'}
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && mapData.nodes.find(n => n.id === contextMenu.nodeId) && (
        <CtxMenu
          node={mapData.nodes.find(n => n.id === contextMenu.nodeId)!}
          x={contextMenu.x}
          y={contextMenu.y}
          colorOpen={contextMenuColorOpen}
          onToggleColor={() => setContextMenuColorOpen(v => !v)}
          onClose={() => setContextMenu(null)}
          onRename={() => {
            const n = mapData.nodes.find(nd => nd.id === contextMenu.nodeId)!;
            setEditingLabel({ nodeId: n.id, value: n.label });
            setContextMenu(null);
          }}
          onAddChild={() => { addChildNode(contextMenu.nodeId); setContextMenu(null); }}
          onAddSibling={() => { addPeerNode(contextMenu.nodeId); setContextMenu(null); }}
          onDuplicate={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); }}
          onChangeColor={(c) => {
            updateMapData(prev => ({
              ...prev,
              nodes: prev.nodes.map(n => n.id === contextMenu.nodeId ? { ...n, color: c } : n),
            }));
            setContextMenu(null);
          }}
          onCreateTask={() => { openTaskModal(contextMenu.nodeId); setContextMenu(null); }}
          onUnlinkTask={() => { unlinkTask(contextMenu.nodeId); setContextMenu(null); }}
          onDelete={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); }}
        />
      )}

      {/* Create Task modal */}
      {taskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <h3 className="text-sm font-semibold">Create Task from Node</h3>
              <button onClick={() => setTaskModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3 flex-1">
              <Field label="Task Name">
                <input
                  autoFocus
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                  value={taskDraft.name}
                  onChange={e => setTaskDraft(d => ({ ...d, name: e.target.value }))}
                />
              </Field>
              <Field label="Description">
                <textarea
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={3}
                  value={taskDraft.description}
                  onChange={e => setTaskDraft(d => ({ ...d, description: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Priority">
                  <select
                    className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                    value={taskDraft.priority}
                    onChange={e => setTaskDraft(d => ({ ...d, priority: e.target.value as TaskData['priority'] }))}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                    value={taskDraft.status}
                    onChange={e => setTaskDraft(d => ({ ...d, status: e.target.value as TaskData['status'] }))}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
              </div>
              <Field label="Assigned To">
                <select
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                  value={taskDraft.assignedTo ?? ''}
                  onChange={e => setTaskDraft(d => ({ ...d, assignedTo: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Queue">
                <select
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                  value={taskDraft.queueId ?? ''}
                  onChange={e => setTaskDraft(d => ({ ...d, queueId: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">No Queue</option>
                  {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </Field>
              <Field label="Due Date">
                <input
                  type="date"
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                  value={taskDraft.endDate ?? ''}
                  onChange={e => setTaskDraft(d => ({ ...d, endDate: e.target.value || null }))}
                />
              </Field>
              <Field label="Approval Status">
                <select
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                  value={taskDraft.approvalStatus}
                  onChange={e => setTaskDraft(d => ({ ...d, approvalStatus: e.target.value as TaskData['approvalStatus'] }))}
                >
                  <option value="none">None</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </Field>
              <Field label="Source">
                <input
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none"
                  value={taskDraft.source}
                  onChange={e => setTaskDraft(d => ({ ...d, source: e.target.value }))}
                />
              </Field>
              <Field label="AI Instructions">
                <textarea
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 focus:outline-none resize-none"
                  rows={2}
                  placeholder="Optional instructions for AI agent…"
                  value={taskDraft.aiInstructions}
                  onChange={e => setTaskDraft(d => ({ ...d, aiInstructions: e.target.value }))}
                />
              </Field>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-border flex-shrink-0">
              <button
                onClick={() => setTaskModal(null)}
                className="flex-1 px-3 py-2 rounded-lg text-xs border border-border text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitTaskFromModal}
                disabled={taskLoading || !taskDraft.name.trim()}
                className="flex-1 px-3 py-2 rounded-lg text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {taskLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckSquare className="w-3 h-3" />}
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small helper ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">{label}</label>
      {children}
    </div>
  );
}
