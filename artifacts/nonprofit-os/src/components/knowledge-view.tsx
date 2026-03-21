import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen, Plus, Trash2, Edit2, Loader2, X, Check,
  Folder, FolderOpen, FolderPlus, FilePlus, ChevronRight,
  Link2, FileText, Upload, Download, ExternalLink, Globe,
  Save, Eye, Pencil, FileUp, AlertCircle, File,
  BookMarked, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const API = "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemType = "wiki" | "url" | "document";

interface KnowledgeFolder {
  id: number;
  name: string;
  parentId: number | null;
  tenantId: number | null;
  createdAt: string;
}

interface KnowledgeItem {
  id: number;
  tenantId: number | null;
  folderId: number | null;
  type: ItemType;
  title: string;
  content: string;
  url: string | null;
  fileName: string | null;
  filePath: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FolderTreeNode extends KnowledgeFolder {
  children: FolderTreeNode[];
  items: KnowledgeItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFolderTree(folders: KnowledgeFolder[], items: KnowledgeItem[]): { roots: FolderTreeNode[]; uncategorized: KnowledgeItem[] } {
  const nodeMap = new Map<number, FolderTreeNode>();
  for (const f of folders) nodeMap.set(f.id, { ...f, children: [], items: [] });
  for (const item of items) {
    if (item.folderId && nodeMap.has(item.folderId)) nodeMap.get(item.folderId)!.items.push(item);
  }
  const roots: FolderTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) nodeMap.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const uncategorized = items.filter(i => !i.folderId || !nodeMap.has(i.folderId));
  return { roots, uncategorized };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function itemIcon(type: ItemType, className = "w-3.5 h-3.5") {
  if (type === "wiki") return <BookMarked className={cn(className, "text-violet-400")} />;
  if (type === "url") return <Link2 className={cn(className, "text-blue-400")} />;
  return <FileText className={cn(className, "text-orange-400")} />;
}

function itemBg(type: ItemType) {
  if (type === "wiki") return "from-violet-500/30 to-violet-500/10";
  if (type === "url") return "from-blue-500/30 to-blue-500/10";
  return "from-orange-500/30 to-orange-500/10";
}

// ── Folder Node ───────────────────────────────────────────────────────────────

function FolderNode({
  node, depth, selectedItemId, expanded, onToggle, onSelectItem, onDeleteItem,
  onCreateSubfolder, onRenameFolder, onDeleteFolder, onCreateItem,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedItemId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelectItem: (id: number) => void;
  onDeleteItem: (id: number, e: React.MouseEvent) => void;
  onCreateSubfolder: (parentId: number) => void;
  onRenameFolder: (id: number, name: string) => void;
  onDeleteFolder: (id: number) => void;
  onCreateItem: (folderId: number, type: ItemType) => void;
}) {
  const isExpanded = expanded.has(node.id);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.name);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const indent = depth * 12;

  const commitRename = () => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== node.name) onRenameFolder(node.id, trimmed);
    else setRenameName(node.name);
    setRenaming(false);
  };

  const totalItems = (n: FolderTreeNode): number =>
    n.items.length + n.children.reduce((s, c) => s + totalItems(c), 0);

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-1 group hover:bg-secondary/50 cursor-pointer select-none relative"
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        <button onClick={() => onToggle(node.id)} className="p-0.5 rounded hover:bg-secondary transition-colors flex-shrink-0">
          <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
        </button>
        <button onClick={() => onToggle(node.id)} className="flex-shrink-0">
          {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> : <Folder className="w-3.5 h-3.5 text-amber-400" />}
        </button>
        {renaming ? (
          <input
            value={renameName}
            onChange={e => setRenameName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenameName(node.name); setRenaming(false); } }}
            autoFocus
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 text-xs bg-background border border-primary rounded px-1.5 py-0.5 focus:outline-none"
          />
        ) : (
          <span
            className="flex-1 min-w-0 text-xs font-medium truncate"
            onClick={() => onToggle(node.id)}
            onDoubleClick={() => { setRenameName(node.name); setRenaming(true); }}
          >
            {node.name}
            {totalItems(node) > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground font-normal">({totalItems(node)})</span>
            )}
          </span>
        )}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0 relative">
          <button
            onClick={e => { e.stopPropagation(); setShowTypePicker(v => !v); }}
            title="New item"
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
          >
            <FilePlus className="w-3 h-3" />
          </button>
          {showTypePicker && (
            <div className="absolute top-full left-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]"
              onMouseLeave={() => setShowTypePicker(false)}>
              {([["wiki", "Wiki page"], ["url", "URL / Link"], ["document", "Document"]] as [ItemType, string][]).map(([t, label]) => (
                <button
                  key={t}
                  onClick={e => { e.stopPropagation(); setShowTypePicker(false); onCreateItem(node.id, t); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-left"
                >
                  {itemIcon(t)} {label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); onCreateSubfolder(node.id); }}
            title="New subfolder"
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setRenameName(node.name); setRenaming(true); }}
            title="Rename folder"
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDeleteFolder(node.id); }}
            title="Delete folder"
            className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div>
          {node.children.map(child => (
            <FolderNode
              key={child.id} node={child} depth={depth + 1}
              selectedItemId={selectedItemId} expanded={expanded}
              onToggle={onToggle} onSelectItem={onSelectItem} onDeleteItem={onDeleteItem}
              onCreateSubfolder={onCreateSubfolder} onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder} onCreateItem={onCreateItem}
            />
          ))}
          {node.items.map(item => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelectItem(item.id)}
              style={{ paddingLeft: `${24 + (depth + 1) * 12}px` }}
              className={cn(
                "w-full flex items-center gap-2 pr-3 py-1.5 text-left transition-colors border-b border-border/30 group cursor-pointer",
                selectedItemId === item.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
              )}
            >
              <div className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-gradient-to-br", itemBg(item.type))}>
                {itemIcon(item.type, "w-3 h-3")}
              </div>
              <span className="flex-1 min-w-0 text-xs truncate">{item.title}</span>
              <button
                onClick={e => onDeleteItem(item.id, e)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {node.items.length === 0 && node.children.length === 0 && (
            <div style={{ paddingLeft: `${32 + (depth + 1) * 12}px` }} className="py-1 text-[10px] text-muted-foreground/50 italic">Empty</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Wiki Editor ───────────────────────────────────────────────────────────────

function WikiEditor({ item, onSave, saving }: { item: KnowledgeItem; onSave: (title: string, content: string) => Promise<void>; saving: boolean }) {
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [preview, setPreview] = useState(false);
  const dirty = title !== item.title || content !== item.content;

  useEffect(() => { setTitle(item.title); setContent(item.content); }, [item.id, item.title, item.content]);

  const renderMarkdown = (text: string) =>
    text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^#{3} (.+)/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>')
      .replace(/^#{2} (.+)/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
      .replace(/^# (.+)/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-secondary px-1 rounded text-xs font-mono">$1</code>')
      .replace(/^- (.+)/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^(\d+)\. (.+)/gm, '<li class="ml-4 list-decimal">$2</li>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" class="text-primary underline">$1</a>')
      .replace(/\n{2,}/g, '</p><p class="mb-2">')
      .replace(/\n/g, '<br/>');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-violet-500/10 flex items-center justify-center flex-shrink-0">
          <BookMarked className="w-4 h-4 text-violet-400" />
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground"
          placeholder="Page title..."
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview(v => !v)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors", preview ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary")}
          >
            {preview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {preview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={() => onSave(title, content)}
            disabled={!dirty || saving}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors", dirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-muted-foreground cursor-not-allowed")}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {preview ? (
          <div
            className="px-8 py-6 prose prose-sm max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${renderMarkdown(content || "*Nothing written yet*")}</p>` }}
          />
        ) : (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={"# Start writing...\n\nSupports basic Markdown: **bold**, *italic*, # headings, - lists, [links](url)\n"}
            className="w-full h-full resize-none bg-transparent px-8 py-6 text-sm font-mono leading-relaxed outline-none"
          />
        )}
      </div>
    </div>
  );
}

// ── URL Viewer ────────────────────────────────────────────────────────────────

function UrlEditor({ item, onSave, saving }: { item: KnowledgeItem; onSave: (title: string, url: string, content: string) => Promise<void>; saving: boolean }) {
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url || "");
  const [desc, setDesc] = useState(item.content);
  const dirty = title !== item.title || url !== (item.url || "") || desc !== item.content;

  useEffect(() => { setTitle(item.title); setUrl(item.url || ""); setDesc(item.content); }, [item.id]);

  const safeUrl = url.startsWith("http") ? url : `https://${url}`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/30 to-blue-500/10 flex items-center justify-center flex-shrink-0">
          <Link2 className="w-4 h-4 text-blue-400" />
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground"
          placeholder="Link title..."
        />
        <button
          onClick={() => onSave(title, url, desc)}
          disabled={!dirty || saving}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors", dirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-muted-foreground cursor-not-allowed")}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {dirty ? "Save" : "Saved"}
        </button>
      </div>
      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">URL</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-secondary/30">
              <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 text-sm bg-transparent outline-none"
              />
            </div>
            {url && (
              <a href={safeUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border hover:bg-secondary text-xs transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </a>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description (optional)</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="What is this link about?"
            rows={4}
            className="w-full resize-none border border-border rounded-md px-3 py-2 text-sm bg-secondary/30 outline-none focus:border-primary transition-colors"
          />
        </div>
        {url && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-secondary/40 text-xs text-muted-foreground flex items-center gap-2">
              <ExternalLink className="w-3 h-3" /> Preview
            </div>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{title || "Untitled Link"}</p>
                <p className="text-xs text-muted-foreground truncate max-w-xs">{url}</p>
              </div>
              <a href={safeUrl} target="_blank" rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors">
                Visit <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Document Editor ───────────────────────────────────────────────────────────

function DocumentEditor({ item, onSave, onUpload, saving }: {
  item: KnowledgeItem;
  onSave: (title: string, content: string) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  saving: boolean;
}) {
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.content);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirty = title !== item.title || desc !== item.content;

  useEffect(() => { setTitle(item.title); setDesc(item.content); }, [item.id]);

  const handleFile = async (file: File) => {
    setUploading(true);
    try { await onUpload(file); } finally { setUploading(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/30 to-orange-500/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-orange-400" />
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground"
          placeholder="Document title..."
        />
        <button
          onClick={() => onSave(title, desc)}
          disabled={!dirty || saving}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors", dirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-muted-foreground cursor-not-allowed")}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {dirty ? "Save" : "Saved"}
        </button>
      </div>
      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
        {/* Uploaded file card */}
        {item.fileName ? (
          <div className="border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-500/5 flex items-center justify-center flex-shrink-0">
              <File className="w-6 h-6 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {item.fileSize ? formatFileSize(item.fileSize) : "—"}
                {item.mimeType && <span className="ml-2 text-muted-foreground/70">{item.mimeType}</span>}
              </p>
            </div>
            <a
              href={`${API}/knowledge-items/${item.id}/download`}
              download={item.fileName}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border hover:bg-secondary text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border hover:bg-secondary text-xs transition-colors"
              title="Replace file"
            >
              <Upload className="w-3.5 h-3.5" /> Replace
            </button>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/30"
            )}
          >
            {uploading ? (
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            ) : (
              <FileUp className="w-8 h-8 text-muted-foreground" />
            )}
            <div className="text-center">
              <p className="text-sm font-medium">{uploading ? "Uploading..." : "Drop a file here or click to browse"}</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, images, and more — up to 100 MB</p>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes (optional)</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Add notes or a description for this document..."
            rows={4}
            className="w-full resize-none border border-border rounded-md px-3 py-2 text-sm bg-secondary/30 outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function KnowledgeView() {
  const { fetchHeaders } = useAuth();
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const selectedItem = items.find(i => i.id === selectedId) ?? null;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, iRes] = await Promise.all([
        fetch(`${API}/knowledge-folders`, { headers: fetchHeaders() }),
        fetch(`${API}/knowledge-items`, { headers: fetchHeaders() }),
      ]);
      if (fRes.ok) setFolders(await fRes.json());
      if (iRes.ok) setItems(await iRes.json());
    } finally {
      setLoading(false);
    }
  }, [fetchHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggle = (id: number) => setExpanded(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const createFolder = async (parentId: number | null = null) => {
    const name = prompt(parentId ? "Subfolder name:" : "Folder name:", parentId ? "New Subfolder" : "New Folder");
    if (!name?.trim()) return;
    const r = await fetch(`${API}/knowledge-folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({ name: name.trim(), parentId }),
    });
    if (r.ok) {
      const f: KnowledgeFolder = await r.json();
      setFolders(prev => [...prev, f]);
      setExpanded(prev => new Set([...prev, f.id]));
      if (parentId) setExpanded(prev => new Set([...prev, parentId]));
    }
  };

  const renameFolder = async (id: number, name: string) => {
    const r = await fetch(`${API}/knowledge-folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({ name }),
    });
    if (r.ok) setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  };

  const deleteFolder = async (id: number) => {
    if (!confirm("Delete this folder? Items inside will become uncategorized.")) return;
    const r = await fetch(`${API}/knowledge-folders/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (r.ok) {
      setFolders(prev => prev.filter(f => f.id !== id));
      setItems(prev => prev.map(i => i.folderId === id ? { ...i, folderId: null } : i));
    }
  };

  const createItem = async (folderId: number | null, type: ItemType) => {
    const titles: Record<ItemType, string> = { wiki: "New Wiki Page", url: "New Link", document: "New Document" };
    const r = await fetch(`${API}/knowledge-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({ type, title: titles[type], folderId }),
    });
    if (r.ok) {
      const item: KnowledgeItem = await r.json();
      setItems(prev => [...prev, item]);
      setSelectedId(item.id);
      if (folderId) setExpanded(prev => new Set([...prev, folderId]));
    }
  };

  const deleteItem = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this item?")) return;
    const r = await fetch(`${API}/knowledge-items/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (r.ok) {
      setItems(prev => prev.filter(i => i.id !== id));
      if (selectedId === id) setSelectedId(null);
    }
  };

  const saveItem = async (id: number, updates: Partial<KnowledgeItem>) => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/knowledge-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify(updates),
      });
      if (r.ok) {
        const updated: KnowledgeItem = await r.json();
        setItems(prev => prev.map(i => i.id === id ? updated : i));
      }
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (id: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const r = await fetch(`${API}/knowledge-items/${id}/upload`, {
      method: "POST",
      headers: fetchHeaders(),
      body: formData,
    });
    if (r.ok) {
      const updated: KnowledgeItem = await r.json();
      setItems(prev => prev.map(i => i.id === id ? updated : i));
    }
  };

  const { roots, uncategorized } = buildFolderTree(folders, items);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {/* ── Sidebar ── */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-card/50">
        <div className="flex items-center justify-between px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Knowledge Base</span>
          </div>
          <div className="flex items-center gap-1">
            {/* New item (uncategorized) */}
            <div className="relative group/new">
              <button
                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                title="New item"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <div className="hidden group-hover/new:block absolute top-full right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]">
                {([["wiki", "Wiki page"], ["url", "URL / Link"], ["document", "Document"]] as [ItemType, string][]).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => createItem(null, t)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-left"
                  >
                    {itemIcon(t)} {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => createFolder(null)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
              title="New folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {roots.map(node => (
            <FolderNode
              key={node.id} node={node} depth={0}
              selectedItemId={selectedId} expanded={expanded}
              onToggle={toggle} onSelectItem={setSelectedId} onDeleteItem={deleteItem}
              onCreateSubfolder={parentId => createFolder(parentId)}
              onRenameFolder={renameFolder} onDeleteFolder={deleteFolder}
              onCreateItem={createItem}
            />
          ))}

          {/* Uncategorized */}
          {uncategorized.length > 0 && (
            <div className="mt-1">
              <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Uncategorized</div>
              {uncategorized.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelectedId(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors group cursor-pointer",
                    selectedId === item.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
                  )}
                >
                  <div className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-gradient-to-br", itemBg(item.type))}>
                    {itemIcon(item.type, "w-3 h-3")}
                  </div>
                  <span className="flex-1 min-w-0 text-xs truncate">{item.title}</span>
                  <button onClick={e => deleteItem(item.id, e)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {roots.length === 0 && uncategorized.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 gap-2 text-center">
              <Inbox className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No items yet. Create a folder or add your first item.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Content Panel ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {selectedItem ? (
          selectedItem.type === "wiki" ? (
            <WikiEditor
              key={selectedItem.id}
              item={selectedItem}
              saving={saving}
              onSave={async (title, content) => saveItem(selectedItem.id, { title, content })}
            />
          ) : selectedItem.type === "url" ? (
            <UrlEditor
              key={selectedItem.id}
              item={selectedItem}
              saving={saving}
              onSave={async (title, url, content) => saveItem(selectedItem.id, { title, url, content })}
            />
          ) : (
            <DocumentEditor
              key={selectedItem.id}
              item={selectedItem}
              saving={saving}
              onSave={async (title, content) => saveItem(selectedItem.id, { title, content })}
              onUpload={async (file) => uploadFile(selectedItem.id, file)}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-primary/60" />
            </div>
            <div>
              <h3 className="text-base font-semibold mb-1">Your Knowledge Base</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Select an item from the sidebar to view or edit it, or create a new wiki page, URL bookmark, or document upload.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {([["wiki", "Wiki Page"], ["url", "URL Link"], ["document", "Document"]] as [ItemType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => createItem(null, type)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary transition-colors text-sm"
                >
                  {itemIcon(type)} {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
