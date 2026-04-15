import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen, Plus, Trash2, Edit2, Loader2, X, Check,
  Folder, FolderOpen, FolderPlus, FilePlus, ChevronRight,
  Link2, FileText, Upload, Download, ExternalLink, Globe,
  Save, Eye, Pencil, FileUp, AlertCircle, File,
  BookMarked, Inbox,
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Code2,
  AlignLeft, AlignCenter, AlignRight,
  Highlighter, Undo2, Redo2, Unlink, Minus,
  Search, RefreshCw, Sparkles, FileDown,
} from "lucide-react";
import {
  Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, UnderlineType, convertInchesToTwip,
} from "docx";
import { saveAs } from "file-saver";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/app/providers/AuthContext";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import PlaceholderExtension from "@tiptap/extension-placeholder";
import UnderlineExtension from "@tiptap/extension-underline";
import TextAlignExtension from "@tiptap/extension-text-align";
import HighlightExtension from "@tiptap/extension-highlight";
import TypographyExtension from "@tiptap/extension-typography";

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

// ── Rich Text Toolbar ─────────────────────────────────────────────────────────

function TbBtn({ onClick, active, title, disabled, children }: {
  onClick: () => void; active?: boolean; title: string; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      disabled={disabled}
      className={cn(
        "p-1.5 rounded transition-colors shrink-0",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary",
        disabled && "opacity-30 cursor-not-allowed pointer-events-none"
      )}
    >
      {children}
    </button>
  );
}

function TbSep() {
  return <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />;
}

// ── Process type for slash picker ─────────────────────────────────────────────
interface ProcessMeta { id: number; processName: string; category: string; }

// ── TipTap → docx conversion helpers ──────────────────────────────────────────
function ttAlignment(align?: string): AlignmentType {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "justify") return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}
function ttHeading(level?: number): HeadingLevel {
  if (level === 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  if (level === 3) return HeadingLevel.HEADING_3;
  return HeadingLevel.HEADING_4;
}
function ttInlines(content: any[]): TextRun[] {
  return (content || []).flatMap((n: any) => {
    if (n.type === "hardBreak") return [new TextRun({ break: 1 })];
    if (n.type !== "text") return [];
    const marks = new Set((n.marks || []).map((m: any) => m.type));
    return [new TextRun({
      text: n.text || "",
      bold: marks.has("bold"),
      italics: marks.has("italic"),
      underline: marks.has("underline") ? { type: UnderlineType.SINGLE } : undefined,
      strike: marks.has("strike"),
      font: marks.has("code") ? "Courier New" : undefined,
    })];
  });
}
function ttBlocks(nodes: any[]): Paragraph[] {
  return (nodes || []).flatMap((n: any) => {
    switch (n.type) {
      case "paragraph":
        return [new Paragraph({
          children: ttInlines(n.content || []),
          alignment: ttAlignment(n.attrs?.textAlign),
          spacing: { after: 120 },
        })];
      case "heading":
        return [new Paragraph({
          children: ttInlines(n.content || []),
          heading: ttHeading(n.attrs?.level),
          spacing: { before: 240, after: 120 },
        })];
      case "bulletList":
        return (n.content || []).flatMap((li: any) =>
          (li.content || []).flatMap((p: any) => [new Paragraph({
            children: [new TextRun("• "), ...ttInlines(p.content || [])],
            indent: { left: convertInchesToTwip(0.4) },
            spacing: { after: 60 },
          })])
        );
      case "orderedList":
        return (n.content || []).flatMap((li: any, i: number) =>
          (li.content || []).flatMap((p: any, j: number) => [new Paragraph({
            children: [new TextRun(j === 0 ? `${i + 1}. ` : "     "), ...ttInlines(p.content || [])],
            indent: { left: convertInchesToTwip(0.4) },
            spacing: { after: 60 },
          })])
        );
      case "blockquote":
        return ttBlocks(n.content || []).map(p => {
          (p as any).properties = (p as any).properties || {};
          return p;
        });
      case "codeBlock":
        return [new Paragraph({
          children: [(n.content || []).map((c: any) => c.text || "").join("")].map(
            text => new TextRun({ text, font: "Courier New" })
          ),
          spacing: { before: 120, after: 120 },
        })];
      case "horizontalRule":
        return [new Paragraph({ thematicBreak: true })];
      default:
        return [];
    }
  });
}
async function downloadAsDocx(title: string, editorJson: any) {
  const doc = new DocxDocument({
    sections: [{
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 320 } }),
        ...ttBlocks(editorJson?.content || []),
      ],
    }],
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${title || "wiki-page"}.docx`);
}
function downloadAsPDF(title: string, html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.7; color: #111; padding: 2cm; max-width: 18cm; margin: 0 auto; }
    h1 { font-size: 2em; margin: 0.6em 0 0.3em; border-bottom: 2px solid #333; padding-bottom: 0.2em; }
    h2 { font-size: 1.5em; margin: 0.8em 0 0.3em; }
    h3 { font-size: 1.2em; margin: 0.8em 0 0.3em; }
    p { margin: 0.5em 0; }
    ul, ol { margin: 0.5em 0 0.5em 1.5em; }
    li { margin: 0.2em 0; }
    blockquote { border-left: 4px solid #999; padding-left: 1em; color: #444; margin: 0.5em 0; }
    pre, code { font-family: "Courier New", monospace; background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; }
    pre { padding: 0.8em; display: block; white-space: pre-wrap; }
    hr { border: none; border-top: 1px solid #aaa; margin: 1em 0; }
    mark { background: #ff0; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    a { color: #2563eb; }
    .page-title { font-size: 2.4em; font-weight: bold; margin-bottom: 1em; border-bottom: 2px solid #333; padding-bottom: 0.4em; }
    @media print { body { padding: 0; } @page { margin: 2cm; } }
  </style>
</head>
<body>
  <div class="page-title">${title}</div>
  ${html}
  <script>window.onload = () => { window.print(); window.close(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Wiki Editor ───────────────────────────────────────────────────────────────

function WikiEditor({ item, onSave, saving }: { item: KnowledgeItem; onSave: (title: string, content: string) => Promise<void>; saving: boolean }) {
  const [title, setTitle] = useState(item.title);
  const [savedContent, setSavedContent] = useState(item.content);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Slash-command process picker state
  const [showSlashPicker, setShowSlashPicker] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashPickerPos, setSlashPickerPos] = useState({ top: 0, left: 0 });
  const [processList, setProcessList] = useState<ProcessMeta[]>([]);
  const slashActiveRef = useRef(false);
  const slashStartPosRef = useRef(0);
  const slashFilterRef = useRef("");
  const titleRef2 = useRef(title);
  const savedContentRef = useRef(savedContent);
  useEffect(() => { titleRef2.current = title; }, [title]);
  useEffect(() => { savedContentRef.current = savedContent; }, [savedContent]);

  const loadProcesses = useCallback(async () => {
    if (processList.length > 0) return;
    try {
      const r = await fetch(`${API}/processes`);
      if (r.ok) setProcessList(await r.json());
    } catch {}
  }, [processList.length]);

  const openSlashPicker = useCallback(() => {
    slashActiveRef.current = true;
    slashFilterRef.current = "";
    setSlashFilter("");
    setShowSlashPicker(true);
    loadProcesses();
    // Position after a tick so "/" is inserted and selection updated
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setSlashPickerPos({ top: rect.bottom + 6, left: rect.left });
      }
    }, 0);
  }, [loadProcesses]);

  const closeSlashPicker = useCallback(() => {
    slashActiveRef.current = false;
    setShowSlashPicker(false);
    setSlashFilter("");
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      UnderlineExtension,
      HighlightExtension.configure({ multicolor: false }),
      TextAlignExtension.configure({ types: ["heading", "paragraph"] }),
      LinkExtension.configure({ openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } }),
      PlaceholderExtension.configure({ placeholder: "Start writing your wiki page… (type / to insert a process)" }),
      TypographyExtension,
    ],
    content: item.content || "",
    editorProps: {
      handleKeyDown: (view, event) => {
        if (slashActiveRef.current && event.key === "Escape") {
          slashActiveRef.current = false;
          setShowSlashPicker(false);
          return true;
        }
        if (!slashActiveRef.current && event.key === "/") {
          // Capture position after "/" is inserted
          setTimeout(() => {
            slashStartPosRef.current = view.state.selection.anchor;
            openSlashPicker();
          }, 0);
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setDirty(titleRef2.current !== item.title || editor.getHTML() !== savedContentRef.current);
      if (!slashActiveRef.current) return;
      const state = editor.state;
      const anchor = state.selection.anchor;
      const start = slashStartPosRef.current;
      if (anchor < start - 1) {
        // Cursor went before the slash
        slashActiveRef.current = false;
        setShowSlashPicker(false);
        return;
      }
      const text = state.doc.textBetween(start, anchor, "");
      if (text.includes(" ") || text.includes("\n")) {
        slashActiveRef.current = false;
        setShowSlashPicker(false);
        return;
      }
      slashFilterRef.current = text.toLowerCase();
      setSlashFilter(text.toLowerCase());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(item.content || "");
    setTitle(item.title);
    setSavedContent(item.content);
    setDirty(false);
  }, [item.id]);

  useEffect(() => {
    if (!editor) return;
    setDirty(title !== item.title || editor.getHTML() !== savedContent);
  }, [title]);

  const handleSave = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    await onSave(title, html);
    setSavedContent(html);
    setDirty(false);
  };

  const insertProcess = useCallback((process: ProcessMeta) => {
    if (!editor) return;
    const state = editor.state;
    const anchor = state.selection.anchor;
    const slashPos = slashStartPosRef.current - 1; // position of the "/" char
    editor.chain().focus()
      .deleteRange({ from: slashPos, to: anchor })
      .insertContent(`<strong>${process.processName}</strong>`)
      .run();
    closeSlashPicker();
  }, [editor, closeSlashPicker]);

  const openLinkDialog = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href || "";
    setLinkUrl(prev);
    setLinkDialogOpen(true);
  };

  const applyLink = () => {
    if (!editor) return;
    if (!linkUrl.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDialogOpen(false);
    setLinkUrl("");
  };

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3.5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-violet-500/10 flex items-center justify-center flex-shrink-0">
          <BookMarked className="w-4 h-4 text-violet-400" />
        </div>
        <input
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground"
          placeholder="Page title…"
        />
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors shrink-0",
            dirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-muted-foreground cursor-not-allowed"
          )}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {dirty ? "Save" : "Saved"}
        </button>
        <button
          onClick={() => downloadAsPDF(title, editor.getHTML())}
          title="Download as PDF"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80 text-foreground transition-colors shrink-0"
        >
          <FileDown className="w-3.5 h-3.5" />PDF
        </button>
        <button
          onClick={() => downloadAsDocx(title, editor.getJSON())}
          title="Download as Word"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-secondary hover:bg-secondary/80 text-foreground transition-colors shrink-0"
        >
          <FileDown className="w-3.5 h-3.5" />Word
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border bg-secondary/20 flex-wrap">
        {/* History */}
        <TbBtn onClick={() => editor.chain().focus().undo().run()} title="Undo" disabled={!editor.can().undo()}>
          <Undo2 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().redo().run()} title="Redo" disabled={!editor.can().redo()}>
          <Redo2 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />

        {/* Headings */}
        <TbBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
          <Heading1 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />

        {/* Text style */}
        <TbBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline (Ctrl+U)">
          <Underline className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")} title="Highlight">
          <Highlighter className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />

        {/* Lists */}
        <TbBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
          <List className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
          <ListOrdered className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />

        {/* Blocks */}
        <TbBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
          <Quote className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code">
          <Code className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code block">
          <Code2 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />

        {/* Alignment */}
        <TbBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left">
          <AlignLeft className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center">
          <AlignCenter className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right">
          <AlignRight className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />

        {/* Link */}
        <TbBtn onClick={openLinkDialog} active={editor.isActive("link")} title="Insert / edit link">
          <Link2 className="w-3.5 h-3.5" />
        </TbBtn>
        {editor.isActive("link") && (
          <TbBtn onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
            <Unlink className="w-3.5 h-3.5" />
          </TbBtn>
        )}
      </div>

      {/* Link dialog */}
      {linkDialogOpen && (
        <div className="px-6 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") setLinkDialogOpen(false); }}
            placeholder="https://example.com"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
          />
          <button onClick={applyLink} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
            Apply
          </button>
          <button onClick={() => setLinkDialogOpen(false)} className="p-1 rounded hover:bg-secondary transition-colors">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Editor content */}
      <div className="flex-1 overflow-auto tiptap-editor relative">
        <EditorContent
          editor={editor}
          className="h-full px-8 py-6 cursor-text"
          onClick={() => editor.commands.focus()}
        />
      </div>

      {/* Slash-command process picker */}
      {showSlashPicker && (() => {
        const filtered = processList.filter(p =>
          !slashFilter ||
          (p.processName || "").toLowerCase().includes(slashFilter) ||
          (p.category || "").toLowerCase().includes(slashFilter)
        );
        const grouped: Record<string, ProcessMeta[]> = {};
        filtered.forEach(p => {
          const cat = p.category || "Uncategorised";
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(p);
        });
        return (
          <div
            className="fixed z-50 bg-popover border border-border rounded-xl shadow-xl w-72 max-h-72 overflow-y-auto py-1"
            style={{ top: slashPickerPos.top, left: slashPickerPos.left }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border mb-1">
              <span className="text-xs font-semibold text-muted-foreground">Processes</span>
              {slashFilter && (
                <span className="text-xs text-muted-foreground">"{slashFilter}"</span>
              )}
            </div>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No processes found
              </div>
            ) : (
              Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {cat}
                  </div>
                  {items.map(p => (
                    <button
                      key={p.id}
                      onMouseDown={e => { e.preventDefault(); insertProcess(p); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                      {p.processName}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        );
      })()}
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

interface SearchResult {
  id: number;
  title: string;
  content: string;
  type: ItemType;
  folder_id: number | null;
  file_name: string | null;
  mime_type: string | null;
  url: string | null;
  similarity: number;
}

export function KnowledgeView() {
  const { fetchHeaders } = useAuth();
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const r = await fetch(`${API}/knowledge/search?q=${encodeURIComponent(q)}&limit=15`, { headers: fetchHeaders() });
      if (r.ok) setSearchResults(await r.json());
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, [fetchHeaders]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!searchQ.trim()) { setSearchResults(null); return; }
    searchDebounce.current = setTimeout(() => doSearch(searchQ), 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQ, doSearch]);

  const reindex = async () => {
    setReindexing(true);
    setReindexMsg(null);
    try {
      const r = await fetch(`${API}/knowledge/reindex`, { method: "POST", headers: fetchHeaders() });
      if (r.ok) {
        const d = await r.json();
        setReindexMsg(`Indexing ${d.queued} document${d.queued !== 1 ? "s" : ""}…`);
        setTimeout(() => setReindexMsg(null), 5000);
      }
    } finally { setReindexing(false); }
  };

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
            <button
              onClick={reindex}
              disabled={reindexing}
              title="Re-index all documents for semantic search"
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-violet-400 transition-colors"
            >
              {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
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

        {/* Search bar */}
        <div className="px-2 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Semantic search…"
              className="w-full text-xs bg-secondary/50 border border-border rounded-md pl-7 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/60"
            />
            {searchQ && (
              <button
                onClick={() => { setSearchQ(""); setSearchResults(null); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {reindexMsg && (
            <p className="mt-1.5 text-[10px] text-violet-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> {reindexMsg}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {/* ── Search results ── */}
          {searchQ.trim() ? (
            searching ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Searching…</span>
              </div>
            ) : searchResults && searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 gap-2 text-center">
                <Search className="w-6 h-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No matching documents found</p>
              </div>
            ) : (searchResults ?? []).map(result => (
              <div
                key={result.id}
                onClick={() => { setSelectedId(result.id); setSearchQ(""); setSearchResults(null); }}
                role="button" tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setSelectedId(result.id)}
                className={cn(
                  "w-full flex flex-col gap-0.5 px-3 py-2 text-left transition-colors border-b border-border/30 cursor-pointer",
                  selectedId === result.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-gradient-to-br", itemBg(result.type))}>
                    {itemIcon(result.type, "w-2.5 h-2.5")}
                  </div>
                  <span className="flex-1 min-w-0 text-xs font-medium truncate">{result.title}</span>
                  <span className="text-[10px] text-violet-400 font-mono flex-shrink-0">{Math.round(result.similarity * 100)}%</span>
                </div>
                {result.content && (
                  <p className="text-[10px] text-muted-foreground line-clamp-2 pl-5 leading-relaxed">
                    {result.content.replace(/<[^>]+>/g, " ").slice(0, 100)}
                  </p>
                )}
              </div>
            ))
          ) : (
            <>
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
            </>
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
