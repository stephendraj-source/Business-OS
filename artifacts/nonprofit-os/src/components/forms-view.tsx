import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ClipboardList, Plus, Trash2, Save, Edit2, Loader2, X, Check,
  GripVertical, Type, Hash, Mail, AlignLeft, ChevronDown, Calendar,
  CheckSquare, List, Eye, Code2, Copy, Globe, Link2, Bot,
  GitBranch, ExternalLink, Radio, AlertCircle, Phone,
  Folder, FolderOpen, FolderPlus, FilePlus, ChevronRight,
  Database, RefreshCw, PenLine, Inbox, Settings2,
  BookMarked, FileText, Upload, Download, FileUp, File, Pencil,
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3,
  ListOrdered, Quote, Code, Minus,
  AlignCenter, AlignRight,
  Highlighter, Undo2, Redo2, Unlink,
  LayoutGrid, Search, Sparkles, Star,
} from "lucide-react";
import { useFavourites, OPEN_FAVOURITE_EVENT } from "@/contexts/FavouritesContext";
import { cn, copyToClipboard } from "@/lib/utils";
import { MindmapEditor } from "@/components/mindmap-editor";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, UnderlineType, ThematicBreak,
} from "docx";
import { useAuth } from "@/contexts/AuthContext";
import { PhoneInput } from "@/components/phone-input";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import PlaceholderExtension from "@tiptap/extension-placeholder";
import UnderlineExtension from "@tiptap/extension-underline";
import TextAlignExtension from "@tiptap/extension-text-align";
import HighlightExtension from "@tiptap/extension-highlight";
import TypographyExtension from "@tiptap/extension-typography";

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'number' | 'email' | 'textarea' | 'select' | 'checkbox' | 'date' | 'phone';

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder: string;
  required: boolean;
  options: string[]; // for select
}

interface FormSummary {
  id: number;
  formNumber: number;
  name: string;
  description: string;
  fields: string;
  publishSlug: string | null;
  isPublished: boolean;
  linkedWorkflowId: number | null;
  linkedAgentId: number | null;
  folderId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface FormFolder {
  id: number;
  name: string;
  parentId: number | null;
  tenantId: number | null;
  createdAt: string;
}

interface MindmapSummary {
  id: number;
  name: string;
  folderId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface FolderTreeNode extends FormFolder {
  children: FolderTreeNode[];
  forms: FormSummary[];
  knowledgeItems: KnowledgeItem[];
  mindmaps: MindmapSummary[];
}

type KnowledgeItemType = "wiki" | "url" | "document";

interface KnowledgeItem {
  id: number;
  tenantId: number | null;
  folderId: number | null;
  type: KnowledgeItemType;
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

interface WorkflowItem { id: number; name: string; workflowNumber: number; }
interface AgentItem { id: number; name: string; agentNumber: number; }
interface KnowledgeSearchResult {
  id: number; title: string; content: string; type: KnowledgeItemType;
  folder_id: number | null; file_name: string | null; url: string | null; similarity: number;
}

interface FormSubmission {
  id: number;
  formId: number;
  tenantId: number | null;
  submittedBy: number | null;
  submittedByName: string;
  submissionData: string;
  createdAt: string;
}

const FIELD_TYPES: { value: FieldType; label: string; icon: React.ReactNode }[] = [
  { value: 'text',     label: 'Short Text',   icon: <Type className="w-3.5 h-3.5" /> },
  { value: 'textarea', label: 'Long Text',    icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { value: 'number',   label: 'Number',       icon: <Hash className="w-3.5 h-3.5" /> },
  { value: 'email',    label: 'Email',        icon: <Mail className="w-3.5 h-3.5" /> },
  { value: 'phone',    label: 'Phone',        icon: <Phone className="w-3.5 h-3.5" /> },
  { value: 'select',   label: 'Dropdown',     icon: <ChevronDown className="w-3.5 h-3.5" /> },
  { value: 'checkbox', label: 'Checkbox',     icon: <CheckSquare className="w-3.5 h-3.5" /> },
  { value: 'date',     label: 'Date',         icon: <Calendar className="w-3.5 h-3.5" /> },
];

function getFieldIcon(type: FieldType) {
  return FIELD_TYPES.find(f => f.value === type)?.icon ?? <Type className="w-3.5 h-3.5" />;
}

function uid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {}
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── JSON Preview ──────────────────────────────────────────────────────────────

function buildSampleJson(fields: FormField[]): string {
  const obj: Record<string, any> = {};
  for (const f of fields) {
    const key = f.label.toLowerCase().replace(/\s+/g, '_') || f.id;
    switch (f.type) {
      case 'number':  obj[key] = 0; break;
      case 'checkbox': obj[key] = false; break;
      case 'select':  obj[key] = f.options[0] ?? ""; break;
      case 'date':    obj[key] = "2025-01-01"; break;
      case 'phone':   obj[key] = "+65 91234567"; break;
      default:        obj[key] = "";
    }
  }
  return JSON.stringify(obj, null, 2);
}

// ── Folder Helpers ────────────────────────────────────────────────────────────

function buildFolderTree(
  folders: FormFolder[],
  forms: FormSummary[],
  knowledgeItems: KnowledgeItem[] = [],
  mindmaps: MindmapSummary[] = [],
): { roots: FolderTreeNode[]; uncategorized: FormSummary[]; uncategorizedKnowledge: KnowledgeItem[]; uncategorizedMindmaps: MindmapSummary[] } {
  const nodeMap = new Map<number, FolderTreeNode>();
  for (const f of folders) nodeMap.set(f.id, { ...f, children: [], forms: [], knowledgeItems: [], mindmaps: [] });
  for (const form of forms) {
    if (form.folderId && nodeMap.has(form.folderId)) nodeMap.get(form.folderId)!.forms.push(form);
  }
  for (const item of knowledgeItems) {
    if (item.folderId && nodeMap.has(item.folderId)) nodeMap.get(item.folderId)!.knowledgeItems.push(item);
  }
  for (const mm of mindmaps) {
    if (mm.folderId && nodeMap.has(mm.folderId)) nodeMap.get(mm.folderId)!.mindmaps.push(mm);
  }
  const roots: FolderTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) nodeMap.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const uncategorized = forms.filter(f => !f.folderId || !nodeMap.has(f.folderId));
  const uncategorizedKnowledge = knowledgeItems.filter(i => !i.folderId || !nodeMap.has(i.folderId));
  const uncategorizedMindmaps = mindmaps.filter(m => !m.folderId || !nodeMap.has(m.folderId));
  return { roots, uncategorized, uncategorizedKnowledge, uncategorizedMindmaps };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function knowledgeItemIcon(type: KnowledgeItemType, className = "w-3.5 h-3.5") {
  if (type === "wiki") return <BookMarked className={cn(className, "text-violet-400")} />;
  if (type === "url") return <Link2 className={cn(className, "text-blue-400")} />;
  return <FileText className={cn(className, "text-orange-400")} />;
}

function knowledgeItemBg(type: KnowledgeItemType) {
  if (type === "wiki") return "from-violet-500/30 to-violet-500/10";
  if (type === "url") return "from-blue-500/30 to-blue-500/10";
  return "from-orange-500/30 to-orange-500/10";
}

function flattenFoldersForSelect(nodes: FolderTreeNode[], depth = 0): { id: number; name: string; depth: number }[] {
  const result: { id: number; name: string; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    result.push(...flattenFoldersForSelect(node.children, depth + 1));
  }
  return result;
}

// ── Folder Tree Node ──────────────────────────────────────────────────────────

function FolderNode({
  node, depth, selectedId, selectedKnowledgeId, selectedMindmapId, expanded, onToggle,
  onSelectForm, onDeleteForm, onSelectKnowledge, onDeleteKnowledge,
  onSelectMindmap, onDeleteMindmap,
  onCreateSubfolder, onRenameFolder, onDeleteFolder,
  onCreateFormInFolder, onCreateKnowledgeItem, onCreateMindmap,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedId: number | null;
  selectedKnowledgeId: number | null;
  selectedMindmapId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelectForm: (id: number) => void;
  onDeleteForm: (id: number, e: React.MouseEvent) => void;
  onSelectKnowledge: (id: number) => void;
  onDeleteKnowledge: (id: number, e: React.MouseEvent) => void;
  onSelectMindmap: (id: number) => void;
  onDeleteMindmap: (id: number, e: React.MouseEvent) => void;
  onCreateSubfolder: (parentId: number) => void;
  onRenameFolder: (id: number, name: string) => void;
  onDeleteFolder: (id: number) => void;
  onCreateFormInFolder: (folderId: number) => void;
  onCreateKnowledgeItem: (folderId: number, type: KnowledgeItemType) => void;
  onCreateMindmap: (folderId: number) => void;
}) {
  const { isFavourite, toggleFavourite } = useFavourites();
  const isExpanded = expanded.has(node.id);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.name);
  const [showNewPicker, setShowNewPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);
  const indent = depth * 12;

  const commitRename = () => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== node.name) onRenameFolder(node.id, trimmed);
    else setRenameName(node.name);
    setRenaming(false);
  };

  const totalItems = (n: FolderTreeNode): number =>
    n.forms.length + n.knowledgeItems.length + n.mindmaps.length + n.children.reduce((s, c) => s + totalItems(c), 0);

  return (
    <div>
      {/* Folder header row */}
      <div
        className="flex items-center gap-1 px-2 py-1 group hover:bg-secondary/50 cursor-pointer select-none relative"
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        <button
          onClick={() => onToggle(node.id)}
          className="p-0.5 rounded hover:bg-secondary transition-colors flex-shrink-0"
        >
          <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
        </button>
        <button onClick={() => onToggle(node.id)} className="flex-shrink-0">
          {isExpanded
            ? <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            : <Folder className="w-3.5 h-3.5 text-amber-400" />}
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
        {/* Hover actions */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
          <button
            ref={pickerBtnRef}
            onClick={e => {
              e.stopPropagation();
              if (!showNewPicker) {
                const rect = pickerBtnRef.current?.getBoundingClientRect();
                if (rect) setPickerPos({ top: rect.bottom + 4, left: rect.left });
              }
              setShowNewPicker(v => !v);
            }}
            title="New item"
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
          >
            <FilePlus className="w-3 h-3" />
          </button>
          {showNewPicker && pickerPos && createPortal(
            <div
              style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}
              className="bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]"
              onMouseLeave={() => setShowNewPicker(false)}
            >
              <button
                onClick={e => { e.stopPropagation(); setShowNewPicker(false); onCreateFormInFolder(node.id); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-left"
              >
                <ClipboardList className="w-3.5 h-3.5 text-primary" /> Form
              </button>
              <button
                onClick={e => { e.stopPropagation(); setShowNewPicker(false); onCreateMindmap(node.id); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-left"
              >
                <GitBranch className="w-3.5 h-3.5 text-violet-400" /> Mind Map
              </button>
              {(["wiki", "url", "document"] as KnowledgeItemType[]).map(t => (
                <button
                  key={t}
                  onClick={e => { e.stopPropagation(); setShowNewPicker(false); onCreateKnowledgeItem(node.id, t); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-left"
                >
                  {knowledgeItemIcon(t)} {t === "wiki" ? "Wiki page" : t === "url" ? "URL / Link" : "Document"}
                </button>
              ))}
            </div>,
            document.body
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

      {/* Expanded contents */}
      {isExpanded && (
        <div>
          {/* Subfolders */}
          {node.children.map(child => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              selectedKnowledgeId={selectedKnowledgeId}
              selectedMindmapId={selectedMindmapId}
              expanded={expanded}
              onToggle={onToggle}
              onSelectForm={onSelectForm}
              onDeleteForm={onDeleteForm}
              onSelectKnowledge={onSelectKnowledge}
              onDeleteKnowledge={onDeleteKnowledge}
              onSelectMindmap={onSelectMindmap}
              onDeleteMindmap={onDeleteMindmap}
              onCreateSubfolder={onCreateSubfolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onCreateFormInFolder={onCreateFormInFolder}
              onCreateKnowledgeItem={onCreateKnowledgeItem}
              onCreateMindmap={onCreateMindmap}
            />
          ))}
          {/* Forms inside folder */}
          {node.forms.map(form => {
            let fieldCount = 0;
            try { fieldCount = JSON.parse(form.fields).length; } catch {}
            return (
              <div
                key={`form-${form.id}`}
                onClick={() => onSelectForm(form.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onSelectForm(form.id)}
                style={{ paddingLeft: `${24 + (depth + 1) * 12}px` }}
                className={cn(
                  "w-full flex items-start gap-2 pr-3 py-2 text-left transition-colors border-b border-border/30 group cursor-pointer",
                  selectedId === form.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
                )}
              >
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ClipboardList className="w-2.5 h-2.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-mono">#{form.formNumber}</span>
                    <span className="text-xs font-medium truncate">{form.name}</span>
                    {form.isPublished && <Globe className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />}
                  </div>
                  {fieldCount > 0 && <div className="text-[10px] text-muted-foreground"><List className="inline w-2.5 h-2.5 mr-0.5" />{fieldCount} field{fieldCount !== 1 ? 's' : ''}</div>}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavourite('form', form.id, form.name); }}
                    className={cn("p-0.5 rounded text-muted-foreground hover:text-amber-400 transition-colors flex-shrink-0", isFavourite('form', form.id) && "opacity-100 text-amber-400")}
                    title={isFavourite('form', form.id) ? "Remove from favourites" : "Add to favourites"}
                  >
                    <Star className={cn("w-3 h-3", isFavourite('form', form.id) && "fill-amber-400")} />
                  </button>
                  <button
                    onClick={e => onDeleteForm(form.id, e)}
                    className="p-0.5 rounded text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {/* Knowledge items inside folder */}
          {node.knowledgeItems.map(item => (
            <div
              key={`ki-${item.id}`}
              onClick={() => onSelectKnowledge(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelectKnowledge(item.id)}
              style={{ paddingLeft: `${24 + (depth + 1) * 12}px` }}
              className={cn(
                "w-full flex items-center gap-2 pr-3 py-1.5 text-left transition-colors border-b border-border/30 group cursor-pointer",
                selectedKnowledgeId === item.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
              )}
            >
              <div className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-gradient-to-br", knowledgeItemBg(item.type))}>
                {knowledgeItemIcon(item.type, "w-2.5 h-2.5")}
              </div>
              <span className="flex-1 min-w-0 text-xs truncate">{item.title}</span>
              <button
                onClick={e => onDeleteKnowledge(item.id, e)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* Mind maps inside folder */}
          {node.mindmaps.map(mm => (
            <div
              key={`mm-${mm.id}`}
              onClick={() => onSelectMindmap(mm.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelectMindmap(mm.id)}
              style={{ paddingLeft: `${24 + (depth + 1) * 12}px` }}
              className={cn(
                "w-full flex items-center gap-2 pr-3 py-1.5 text-left transition-colors border-b border-border/30 group cursor-pointer",
                selectedMindmapId === mm.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
              )}
            >
              <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-violet-500/30 to-violet-500/10">
                <GitBranch className="w-2.5 h-2.5 text-violet-400" />
              </div>
              <span className="flex-1 min-w-0 text-xs truncate">{mm.name}</span>
              <button
                onClick={e => onDeleteMindmap(mm.id, e)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* Empty folder hint */}
          {node.forms.length === 0 && node.knowledgeItems.length === 0 && node.mindmaps.length === 0 && node.children.length === 0 && (
            <div style={{ paddingLeft: `${24 + (depth + 1) * 12}px` }} className="py-1.5 pr-3 text-[10px] text-muted-foreground italic">
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Field Editor Row ──────────────────────────────────────────────────────────

function FieldRow({
  field, onUpdate, onDelete,
  isDragging, isDragOver, dragPosition,
  onDragStart, onDragEnd, onDragOver, onDrop,
}: {
  field: FormField;
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
  isDragging: boolean;
  isDragOver: boolean;
  dragPosition: 'top' | 'bottom' | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [optionInput, setOptionInput] = useState("");

  const addOption = () => {
    if (!optionInput.trim()) return;
    onUpdate({ options: [...field.options, optionInput.trim()] });
    setOptionInput("");
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "relative rounded-xl border bg-card p-3 space-y-2.5 group transition-all duration-150",
        isDragging ? "opacity-40 border-dashed border-primary/40 scale-[0.98]" : "border-border",
        isDragOver && !isDragging ? "border-primary/60 bg-primary/5" : "",
      )}
    >
      {/* Drop indicator — top */}
      {isDragOver && dragPosition === 'top' && !isDragging && (
        <div className="absolute -top-0.5 left-0 right-0 h-0.5 rounded-full bg-primary shadow-[0_0_6px_1px] shadow-primary/60 z-10" />
      )}
      {/* Drop indicator — bottom */}
      {isDragOver && dragPosition === 'bottom' && !isDragging && (
        <div className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-primary shadow-[0_0_6px_1px] shadow-primary/60 z-10" />
      )}

      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <div
          className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-secondary transition-colors flex-shrink-0"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
        </div>

        {/* Type selector */}
        <select
          value={field.type}
          onChange={e => onUpdate({ type: e.target.value as FieldType, options: [] })}
          className="bg-background border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary flex-shrink-0"
        >
          {FIELD_TYPES.map(ft => (
            <option key={ft.value} value={ft.value}>{ft.label}</option>
          ))}
        </select>

        {/* Label */}
        <input
          value={field.label}
          onChange={e => onUpdate({ label: e.target.value })}
          placeholder="Field label…"
          className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Required toggle */}
        <button
          onClick={() => onUpdate({ required: !field.required })}
          className={cn(
            "text-xs px-2 py-1 rounded-lg border transition-colors flex-shrink-0",
            field.required
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          )}
          title="Toggle required"
        >
          {field.required ? "Required" : "Optional"}
        </button>

        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Placeholder (not for checkbox / select) */}
      {field.type !== 'checkbox' && field.type !== 'select' && (
        <div className="pl-6">
          <input
            value={field.placeholder}
            onChange={e => onUpdate({ placeholder: e.target.value })}
            placeholder="Placeholder text…"
            className="w-full bg-background border border-border rounded-lg px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {/* Options for select */}
      {field.type === 'select' && (
        <div className="pl-6 space-y-1.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Options</div>
          <div className="flex flex-wrap gap-1.5">
            {field.options.map((opt, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary rounded-md text-xs">
                {opt}
                <button onClick={() => onUpdate({ options: field.options.filter((_, j) => j !== i) })}>
                  <X className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={optionInput}
              onChange={e => setOptionInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="Add option…"
              className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addOption}
              className="px-2 py-1 bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Form Preview ──────────────────────────────────────────────────────────────

function FormPreview({ fields, formName }: { fields: FormField[]; formName: string }) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const f of fields) {
      init[f.id] = f.type === 'checkbox' ? false : f.type === 'select' ? '' : '';
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-initialise values when fields change
  useEffect(() => {
    setValues(prev => {
      const next: Record<string, any> = {};
      for (const f of fields) {
        next[f.id] = prev[f.id] ?? (f.type === 'checkbox' ? false : '');
      }
      return next;
    });
    setSubmitted(false);
    setErrors({});
  }, [fields]);

  const set = (id: string, val: any) => {
    setValues(prev => ({ ...prev, [id]: val }));
    if (errors[id]) setErrors(prev => { const e = { ...prev }; delete e[id]; return e; });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    for (const f of fields) {
      if (f.required) {
        const v = values[f.id];
        if (f.type === 'checkbox' && !v) newErrors[f.id] = 'This field is required';
        else if (f.type !== 'checkbox' && !String(v ?? '').trim()) newErrors[f.id] = 'This field is required';
      }
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setSubmitted(true);
  };

  const reset = () => {
    const init: Record<string, any> = {};
    for (const f of fields) init[f.id] = f.type === 'checkbox' ? false : '';
    setValues(init);
    setSubmitted(false);
    setErrors({});
  };

  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No fields yet — add fields to preview the form</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
        <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
          <Check className="w-7 h-7 text-green-500" />
        </div>
        <h3 className="text-base font-semibold mb-1">Submission received</h3>
        <p className="text-sm text-muted-foreground mb-6">Your response has been recorded. Thank you!</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Submit another response
        </button>
      </div>
    );
  }

  const inputCls = (id: string) => cn(
    "w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors",
    errors[id] ? "border-red-400" : "border-border hover:border-primary/40"
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 max-w-sm mx-auto py-4">
      {formName && <h2 className="text-base font-semibold text-foreground">{formName}</h2>}
      {fields.map(field => (
        <div key={field.id}>
          {field.type !== 'checkbox' && (
            <label className="block text-sm font-medium mb-1.5">
              {field.label || <span className="italic text-muted-foreground">Untitled field</span>}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
          )}
          {field.type === 'text' && (
            <input
              type="text"
              value={values[field.id] ?? ''}
              onChange={e => set(field.id, e.target.value)}
              placeholder={field.placeholder || 'Enter text…'}
              className={inputCls(field.id)}
            />
          )}
          {field.type === 'textarea' && (
            <textarea
              value={values[field.id] ?? ''}
              onChange={e => set(field.id, e.target.value)}
              placeholder={field.placeholder || 'Enter text…'}
              rows={3}
              className={cn(inputCls(field.id), 'resize-none')}
            />
          )}
          {field.type === 'number' && (
            <input
              type="number"
              value={values[field.id] ?? ''}
              onChange={e => set(field.id, e.target.value)}
              placeholder={field.placeholder || '0'}
              className={inputCls(field.id)}
            />
          )}
          {field.type === 'email' && (
            <input
              type="email"
              value={values[field.id] ?? ''}
              onChange={e => set(field.id, e.target.value)}
              placeholder={field.placeholder || 'email@example.com'}
              className={inputCls(field.id)}
            />
          )}
          {field.type === 'phone' && (
            <PhoneInput
              value={values[field.id] ?? ''}
              onChange={val => set(field.id, val)}
              placeholder={field.placeholder || 'Phone number'}
              error={!!errors[field.id]}
            />
          )}
          {field.type === 'date' && (
            <input
              type="date"
              value={values[field.id] ?? ''}
              onChange={e => set(field.id, e.target.value)}
              className={inputCls(field.id)}
            />
          )}
          {field.type === 'checkbox' && (
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={!!values[field.id]}
                onChange={e => set(field.id, e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded accent-primary flex-shrink-0"
              />
              <span className="text-sm">
                {field.label || <span className="italic text-muted-foreground">Untitled field</span>}
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
              </span>
            </label>
          )}
          {field.type === 'select' && (
            <select
              value={values[field.id] ?? ''}
              onChange={e => set(field.id, e.target.value)}
              className={inputCls(field.id)}
            >
              <option value="">Select an option…</option>
              {field.options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
            </select>
          )}
          {errors[field.id] && (
            <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {errors[field.id]}
            </p>
          )}
        </div>
      ))}
      <button
        type="submit"
        className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors mt-2"
      >
        Submit
      </button>
    </form>
  );
}

// ── Submissions Tab ───────────────────────────────────────────────────────────

function SubmissionsTab({ formId, fields, getFetchHeaders }: {
  formId: number;
  fields: FormField[];
  getFetchHeaders: () => Record<string, string>;
}) {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/forms/${formId}/submissions`, { headers: getFetchHeaders() });
      if (r.ok) { const d = await r.json(); setSubmissions(Array.isArray(d) ? d : []); }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [formId]);

  const del = async (id: number) => {
    if (!confirm("Delete this submission? This cannot be undone.")) return;
    setDeleting(id);
    await fetch(`${API}/forms/${formId}/submissions/${id}`, { method: "DELETE", headers: getFetchHeaders() });
    setSubmissions(prev => prev.filter(s => s.id !== id));
    setDeleting(null);
  };

  const toggle = (id: number) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-3 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground font-medium">
          {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
        </p>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-secondary">
          <RefreshCw className="w-3 h-3" />Refresh
        </button>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No submissions yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Submissions appear here when users fill out this form in Data Entry mode
          </p>
        </div>
      ) : (
        submissions.map((sub, i) => {
          let data: Record<string, any> = {};
          try { data = typeof sub.submissionData === 'string' ? JSON.parse(sub.submissionData) : sub.submissionData; } catch {}
          const isOpen = expanded.has(sub.id);
          return (
            <div key={sub.id} className="border border-border rounded-xl overflow-hidden bg-card">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => toggle(sub.id)}
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                  {submissions.length - i}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{sub.submittedByName || "Anonymous"}</div>
                  <div className="text-xs text-muted-foreground">{new Date(sub.createdAt).toLocaleString()}</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); del(sub.id); }}
                  disabled={deleting === sub.id}
                  className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0"
                >
                  {deleting === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform flex-shrink-0", isOpen && "rotate-180")} />
              </div>
              {isOpen && (
                <div className="px-4 py-3 border-t border-border bg-background/50 space-y-2">
                  {fields.length > 0 ? fields.map(field => {
                    const key = (field.label || field.id).toLowerCase().replace(/\s+/g, '_');
                    const val = data[key];
                    return (
                      <div key={field.id} className="grid grid-cols-2 gap-3">
                        <span className="text-xs font-medium text-muted-foreground truncate">{field.label || field.id}</span>
                        <span className="text-xs">
                          {val !== undefined && val !== '' && val !== null
                            ? String(val)
                            : <span className="text-muted-foreground/40 italic">—</span>}
                        </span>
                      </div>
                    );
                  }) : (
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{JSON.stringify(data, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Data Entry Fill Panel ─────────────────────────────────────────────────────

function DataEntryFillPanel({ form, fields, getFetchHeaders, currentUserName, agents = [] }: {
  form: FormSummary;
  fields: FormField[];
  getFetchHeaders: () => Record<string, string>;
  currentUserName: string;
  agents?: AgentItem[];
}) {
  const initValues = () => {
    const init: Record<string, any> = {};
    for (const f of fields) { init[f.id] = f.type === 'checkbox' ? false : ''; }
    return init;
  };

  const [values, setValues] = useState<Record<string, any>>(initValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<number | null>(null);

  const set = (id: string, val: any) => {
    setValues(prev => ({ ...prev, [id]: val }));
    setErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const r = await fetch(`${API}/forms/${form.id}/submissions`, { headers: getFetchHeaders() });
      if (r.ok) { const d = await r.json(); setSubmissions(Array.isArray(d) ? d : []); }
    } finally { setLoadingHistory(false); }
  };

  useEffect(() => {
    setValues(initValues());
    setErrors({});
    setSubmitSuccess(false);
    loadHistory();
  }, [form.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const field of fields) {
      if (field.required) {
        const val = values[field.id];
        if (val === '' || val === undefined || val === null || (field.type === 'checkbox' && !val)) {
          errs[field.id] = `${field.label || 'This field'} is required`;
        }
      }
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const data: Record<string, any> = {};
    for (const f of fields) {
      const key = (f.label || f.id).toLowerCase().replace(/\s+/g, '_');
      data[key] = values[f.id];
    }

    setSubmitting(true);
    try {
      const r = await fetch(`${API}/forms/${form.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getFetchHeaders() },
        body: JSON.stringify({ submissionData: JSON.stringify(data), submittedByName: currentUserName }),
      });
      if (r.ok) {
        setSubmitSuccess(true);
        setTimeout(() => {
          setSubmitSuccess(false);
          setValues(initValues());
          setErrors({});
          loadHistory();
        }, 2000);
      }
    } finally { setSubmitting(false); }
  };

  const delSub = async (id: number) => {
    if (!confirm("Delete this submission?")) return;
    setDeleting(id);
    await fetch(`${API}/forms/${form.id}/submissions/${id}`, { method: "DELETE", headers: getFetchHeaders() });
    setSubmissions(prev => prev.filter(s => s.id !== id));
    setDeleting(null);
  };

  const toggleHistory = (id: number) => setHistoryExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const inputCls = (id: string) => cn(
    "w-full bg-background border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors",
    errors[id] ? "border-red-400" : "border-border hover:border-primary/40"
  );

  return (
    <div className="flex h-full">
      {/* Form fill area */}
      <div className="flex-1 min-w-0 overflow-auto p-6">
        <div className="max-w-xl mx-auto">
          <div className="mb-6">
            <div className="text-xs text-muted-foreground font-mono mb-1">#{form.formNumber}</div>
            <h2 className="text-xl font-bold">{form.name}</h2>
            {form.description && <p className="text-sm text-muted-foreground mt-1">{form.description}</p>}
            {form.linkedAgentId && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                <Bot className="w-3.5 h-3.5" />
                AI Agent: {agents.find(a => a.id === form.linkedAgentId)?.name ?? `Agent #${form.linkedAgentId}`} will process your submission
              </div>
            )}
          </div>

          {submitSuccess ? (
            <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-10 text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-green-500" />
              </div>
              <p className="font-semibold text-green-700 dark:text-green-400">Submitted successfully!</p>
              <p className="text-sm text-muted-foreground mt-1">The form will reset shortly.</p>
            </div>
          ) : fields.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">This template has no fields yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Switch to Documents mode to add fields.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {fields.map(field => (
                <div key={field.id} className="space-y-1.5">
                  <label className="text-sm font-medium block">
                    {field.label || <span className="italic text-muted-foreground">Untitled field</span>}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {field.type === 'text' && (
                    <input type="text" value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      placeholder={field.placeholder} className={inputCls(field.id)} />
                  )}
                  {field.type === 'textarea' && (
                    <textarea rows={3} value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      placeholder={field.placeholder} className={cn(inputCls(field.id), "resize-y")} />
                  )}
                  {field.type === 'number' && (
                    <input type="number" value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      placeholder={field.placeholder || '0'} className={inputCls(field.id)} />
                  )}
                  {field.type === 'email' && (
                    <input type="email" value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      placeholder={field.placeholder || 'email@example.com'} className={inputCls(field.id)} />
                  )}
                  {field.type === 'phone' && (
                    <PhoneInput value={values[field.id] ?? ''} onChange={val => set(field.id, val)}
                      placeholder={field.placeholder || 'Phone number'} error={!!errors[field.id]} />
                  )}
                  {field.type === 'date' && (
                    <input type="date" value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      className={inputCls(field.id)} />
                  )}
                  {field.type === 'checkbox' && (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={!!values[field.id]} onChange={e => set(field.id, e.target.checked)}
                        className="w-4 h-4 rounded accent-primary flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{field.placeholder || 'Check this box'}</span>
                    </label>
                  )}
                  {field.type === 'select' && (
                    <select value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      className={inputCls(field.id)}>
                      <option value="">Select an option…</option>
                      {field.options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                    </select>
                  )}
                  {errors[field.id] && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{errors[field.id]}
                    </p>
                  )}
                </div>
              ))}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 mt-4"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Submit
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Submission history sidebar */}
      <div className="w-72 flex-shrink-0 border-l border-border flex flex-col bg-sidebar/30">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-semibold">Submissions</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{submissions.length}</span>
          </div>
          <button onClick={loadHistory} title="Refresh" className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingHistory ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : submissions.length === 0 ? (
            <div className="text-center px-4 py-12">
              <Database className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No submissions yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {submissions.map((sub, i) => {
                let data: Record<string, any> = {};
                try { data = typeof sub.submissionData === 'string' ? JSON.parse(sub.submissionData) : sub.submissionData; } catch {}
                const isOpen = historyExpanded.has(sub.id);
                return (
                  <div key={sub.id}>
                    <div
                      className="flex items-start gap-2.5 px-4 py-3 hover:bg-secondary/30 cursor-pointer transition-colors"
                      onClick={() => toggleHistory(sub.id)}
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 mt-0.5">
                        {submissions.length - i}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{sub.submittedByName || "Anonymous"}</div>
                        <div className="text-xs text-muted-foreground">{new Date(sub.createdAt).toLocaleString()}</div>
                        {Object.entries(data).slice(0, 2).map(([key, val]) => (
                          <div key={key} className="text-xs text-muted-foreground truncate mt-0.5">
                            <span className="font-medium">{key}:</span> {String(val)}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); delSub(sub.id); }}
                          disabled={deleting === sub.id}
                          className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          {deleting === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-4 pb-3 pt-2 border-t border-border/50 bg-background/40 space-y-1.5">
                        {Object.entries(data).map(([key, val]) => (
                          <div key={key} className="text-xs">
                            <span className="font-medium text-muted-foreground">{key}: </span>
                            <span>{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Knowledge Item Editors ────────────────────────────────────────────────────

function TbBtn({ onClick, active, title, disabled, children }: {
  onClick: () => void; active?: boolean; title?: string; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      disabled={disabled}
      className={cn(
        "w-7 h-7 flex items-center justify-center rounded text-xs transition-colors shrink-0",
        active ? "bg-primary/20 text-primary" : "hover:bg-secondary text-muted-foreground hover:text-foreground",
        disabled && "opacity-30 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

function TbSep() {
  return <div className="w-px h-4 bg-border mx-0.5 shrink-0" />;
}

// ── Wiki export helpers ────────────────────────────────────────────────────────

interface RunFmt { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; code?: boolean; }

function extractRuns(node: Node, fmt: RunFmt = {}): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (!text) return [];
    return [new TextRun({
      text,
      bold: fmt.bold,
      italics: fmt.italics,
      underline: fmt.underline ? { type: UnderlineType.SINGLE } : undefined,
      strike: fmt.strike,
      font: fmt.code ? { name: "Courier New" } : undefined,
      size: fmt.code ? 18 : undefined,
    })];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const nf: RunFmt = { ...fmt };
  if (tag === "strong" || tag === "b") nf.bold = true;
  if (tag === "em" || tag === "i") nf.italics = true;
  if (tag === "u") nf.underline = true;
  if (tag === "s" || tag === "del") nf.strike = true;
  if (tag === "code") nf.code = true;
  return Array.from(el.childNodes).flatMap(c => extractRuns(c, nf));
}

function htmlBlockToParagraphs(el: Element): Paragraph[] {
  const tag = el.tagName.toLowerCase();
  if (tag === "hr") return [new Paragraph({ children: [new ThematicBreak()] })];
  if (tag === "ul" || tag === "ol") {
    const items: Paragraph[] = [];
    el.querySelectorAll("li").forEach((li, i) => {
      const runs = extractRuns(li);
      const prefix = tag === "ol" ? new TextRun({ text: `${i + 1}. ` }) : new TextRun({ text: "• " });
      items.push(new Paragraph({
        children: [prefix, ...(runs.length ? runs : [new TextRun({ text: li.textContent || "" })])],
        indent: { left: 360 },
      }));
    });
    return items;
  }
  const runs = extractRuns(el);
  if (!runs.length && el.textContent?.trim()) runs.push(new TextRun({ text: el.textContent.trim() }));
  const styleAttr = el.getAttribute("style") || "";
  const textAlign = styleAttr.match(/text-align:\s*(\w+)/)?.[1];
  const alignment = textAlign === "center" ? AlignmentType.CENTER : textAlign === "right" ? AlignmentType.RIGHT : textAlign === "justify" ? AlignmentType.BOTH : undefined;
  if (tag === "h1") return [new Paragraph({ children: runs, heading: HeadingLevel.HEADING_1, alignment })];
  if (tag === "h2") return [new Paragraph({ children: runs, heading: HeadingLevel.HEADING_2, alignment })];
  if (tag === "h3") return [new Paragraph({ children: runs, heading: HeadingLevel.HEADING_3, alignment })];
  if (tag === "blockquote") return [new Paragraph({ children: runs, indent: { left: 720 }, alignment })];
  if (tag === "pre" || tag === "code") {
    return [new Paragraph({ children: [new TextRun({ text: el.textContent || "", font: { name: "Courier New" }, size: 18 })], alignment })];
  }
  return [new Paragraph({ children: runs, alignment })];
}

async function exportWikiAsDocx(title: string, html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const paragraphs: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 48 })], heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [] }),
  ];
  doc.body.childNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      paragraphs.push(...htmlBlockToParagraphs(node as Element));
    }
  });
  const wordDoc = new Document({
    sections: [{ children: paragraphs }],
  });
  const blob = await Packer.toBlob(wordDoc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_")}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportWikiAsPdf(title: string, html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>
    @page { size: A4; margin: 2cm; }
    body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.7; color: #111; max-width: 100%; }
    h1 { font-size: 22pt; margin: 0 0 6pt; } h2 { font-size: 17pt; margin: 18pt 0 4pt; }
    h3 { font-size: 14pt; margin: 14pt 0 4pt; }
    p { margin: 0 0 8pt; } ul, ol { margin: 0 0 8pt 20pt; }
    blockquote { border-left: 3px solid #ccc; margin: 8pt 0 8pt 16pt; padding-left: 12pt; color: #444; }
    hr { border: none; border-top: 1px solid #ccc; margin: 14pt 0; }
    code, pre { font-family: "Courier New", monospace; font-size: 10pt; background: #f4f4f4; padding: 2pt 4pt; border-radius: 3pt; }
    pre { display: block; padding: 10pt; white-space: pre-wrap; }
    strong { font-weight: bold; } em { font-style: italic; }
    .title-block { border-bottom: 2px solid #333; padding-bottom: 8pt; margin-bottom: 18pt; }
    .title-block h1 { font-size: 26pt; margin-bottom: 0; }
  </style></head><body>
  <div class="title-block"><h1>${title}</h1></div>
  ${html}
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

function WikiEditor({ item, onSave, saving }: {
  item: KnowledgeItem;
  onSave: (title: string, content: string) => Promise<void>;
  saving: boolean;
}) {
  const [title, setTitle] = useState(item.title);
  const [savedContent, setSavedContent] = useState(item.content);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => { if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      UnderlineExtension,
      HighlightExtension.configure({ multicolor: false }),
      TextAlignExtension.configure({ types: ["heading", "paragraph"] }),
      LinkExtension.configure({ openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } }),
      PlaceholderExtension.configure({ placeholder: "Start writing your wiki page…" }),
      TypographyExtension,
    ],
    content: item.content || "",
    onUpdate: ({ editor }) => {
      setDirty(title !== item.title || editor.getHTML() !== savedContent);
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
        {/* Export dropdown */}
        <div ref={exportRef} className="relative">
          <button
            onClick={() => setExportOpen(v => !v)}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors shrink-0"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export<ChevronDown className="w-3 h-3" />
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
              <button
                onClick={async () => {
                  setExportOpen(false); setExporting(true);
                  try { await exportWikiAsDocx(title, editor?.getHTML() || ""); }
                  finally { setExporting(false); }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-blue-400" />Word (.docx)
              </button>
              <button
                onClick={() => {
                  setExportOpen(false);
                  exportWikiAsPdf(title, editor?.getHTML() || "");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
              >
                <File className="w-3.5 h-3.5 text-red-400" />PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border bg-secondary/20 flex-wrap">
        <TbBtn onClick={() => editor.chain().focus().undo().run()} title="Undo" disabled={!editor.can().undo()}>
          <Undo2 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().redo().run()} title="Redo" disabled={!editor.can().redo()}>
          <Redo2 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />
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
        <TbBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
          <List className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered List">
          <ListOrdered className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
          <Quote className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline Code">
          <Code className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code Block">
          <Code2 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />
        <TbBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align Left">
          <AlignLeft className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align Center">
          <AlignCenter className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align Right">
          <AlignRight className="w-3.5 h-3.5" />
        </TbBtn>
        <TbSep />
        <TbBtn onClick={openLinkDialog} active={editor.isActive("link")} title="Insert Link">
          <Link2 className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().unsetLink().run()} disabled={!editor.isActive("link")} title="Remove Link">
          <Unlink className="w-3.5 h-3.5" />
        </TbBtn>
        <TbBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
          <Minus className="w-3.5 h-3.5" />
        </TbBtn>
      </div>

      {/* Link Dialog */}
      {linkDialogOpen && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-secondary/30">
          <input
            autoFocus
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") setLinkDialogOpen(false); }}
            placeholder="https://example.com"
            className="flex-1 text-sm border border-border rounded px-2 py-1 bg-background outline-none focus:border-primary"
          />
          <button onClick={applyLink} className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded">Apply</button>
          <button onClick={() => setLinkDialogOpen(false)} className="px-2 py-1 text-xs border border-border rounded hover:bg-secondary">Cancel</button>
        </div>
      )}

      {/* Editor body */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <EditorContent editor={editor} className="tiptap-editor min-h-[300px] outline-none" />
      </div>
    </div>
  );
}

function UrlItemEditor({ item, onSave, saving }: {
  item: KnowledgeItem;
  onSave: (title: string, url: string, content: string) => Promise<void>;
  saving: boolean;
}) {
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

function DocumentItemEditor({ item, onSave, onUpload, saving }: {
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
            {uploading ? <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" /> : <FileUp className="w-8 h-8 text-muted-foreground" />}
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
            placeholder="Add notes about this document..."
            rows={4}
            className="w-full resize-none border border-border rounded-md px-3 py-2 text-sm bg-secondary/30 outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Forms View ───────────────────────────────────────────────────────────

interface FormsViewProps {
  openKnowledgeId?: number | null;
  onKnowledgeOpened?: () => void;
}

export function FormsView({ openKnowledgeId, onKnowledgeOpened }: FormsViewProps = {}) {
  const { fetchHeaders, currentUser } = useAuth();
  const currentUserName = (currentUser as any)?.name || (currentUser as any)?.email || "User";
  const [mode, setMode] = useState<'templates' | 'entry'>('templates');
  const [showAllForms, setShowAllForms] = useState(false);
  const [allFormsSearch, setAllFormsSearch] = useState("");
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNumber, setEditNumber] = useState(0);
  const [editingNumber, setEditingNumber] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'build' | 'preview' | 'json' | 'publish' | 'submissions'>('build');
  const [copied, setCopied] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom'>('bottom');

  // Folder state
  const [folders, setFolders] = useState<FormFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [editFolderId, setEditFolderId] = useState<number | null>(null);

  // Knowledge items state
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<number | null>(null);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);

  // Mind map state
  const [mindmapList, setMindmapList] = useState<MindmapSummary[]>([]);
  const [selectedMindmapId, setSelectedMindmapId] = useState<number | null>(null);

  useEffect(() => {
    if (!openKnowledgeId) return;
    setSelectedId(null);
    setSelectedKnowledgeId(openKnowledgeId);
    onKnowledgeOpened?.();
  }, [openKnowledgeId]);

  const [knowledgeSearchQ, setKnowledgeSearchQ] = useState("");
  const [knowledgeSearchResults, setKnowledgeSearchResults] = useState<KnowledgeSearchResult[] | null>(null);
  const [knowledgeSearching, setKnowledgeSearching] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Publish / linking state
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [linkedWorkflowId, setLinkedWorkflowId] = useState<number | null>(null);
  const [linkedAgentId, setLinkedAgentId] = useState<number | null>(null);
  const [linkDirty, setLinkDirty] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const selectedForm = forms.find(f => f.id === selectedId) ?? null;
  const selectedKnowledgeItem = knowledgeItems.find(i => i.id === selectedKnowledgeId) ?? null;

  const fetchFolders = useCallback(async () => {
    try {
      const r = await fetch(`${API}/form-folders`, { headers: fetchHeaders() });
      const data = await r.json();
      if (Array.isArray(data)) setFolders(data);
    } catch {}
  }, [fetchHeaders]);

  const fetchForms = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/forms`, { headers: fetchHeaders() });
      const data = await r.json();
      if (Array.isArray(data)) setForms(data);
    } catch {}
    finally { setLoading(false); }
  }, [fetchHeaders]);

  const fetchKnowledgeItems = useCallback(async () => {
    try {
      const r = await fetch(`${API}/knowledge-items`, { headers: fetchHeaders() });
      const data = await r.json();
      if (Array.isArray(data)) setKnowledgeItems(data);
    } catch {}
  }, [fetchHeaders]);

  const fetchMindmaps = useCallback(async () => {
    try {
      const r = await fetch(`${API}/mindmaps`, { headers: fetchHeaders() });
      const data = await r.json();
      if (Array.isArray(data)) setMindmapList(data.map((m: any) => ({
        id: m.id, name: m.name, folderId: m.folder_id,
        createdAt: m.created_at, updatedAt: m.updated_at,
      })));
    } catch {}
  }, [fetchHeaders]);

  const doKnowledgeSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setKnowledgeSearchResults(null); return; }
    setKnowledgeSearching(true);
    try {
      const r = await fetch(`${API}/knowledge/search?q=${encodeURIComponent(q)}&limit=15`, { headers: fetchHeaders() });
      if (r.ok) setKnowledgeSearchResults(await r.json());
    } catch { setKnowledgeSearchResults([]); }
    finally { setKnowledgeSearching(false); }
  }, [fetchHeaders]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!knowledgeSearchQ.trim()) { setKnowledgeSearchResults(null); return; }
    searchDebounceRef.current = setTimeout(() => doKnowledgeSearch(knowledgeSearchQ), 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [knowledgeSearchQ, doKnowledgeSearch]);

  const reindexKnowledge = async () => {
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

  useEffect(() => { fetchForms(); fetchFolders(); fetchKnowledgeItems(); fetchMindmaps(); }, [fetchForms, fetchFolders, fetchKnowledgeItems, fetchMindmaps]);

  useEffect(() => {
    function handleOpen(e: Event) {
      const d = (e as CustomEvent).detail;
      if (d?.type === 'form') setSelectedId(d.id);
    }
    window.addEventListener(OPEN_FAVOURITE_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_FAVOURITE_EVENT, handleOpen);
  }, []);

  const createFolder = async (parentId: number | null = null) => {
    const name = prompt("Folder name:", parentId ? "New Subfolder" : "New Folder");
    if (!name?.trim()) return;
    const r = await fetch(`${API}/form-folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({ name: name.trim(), parentId }),
    });
    if (r.ok) {
      const folder: FormFolder = await r.json();
      setFolders(prev => [...prev, folder]);
      setExpandedFolders(prev => new Set([...prev, folder.id]));
      if (parentId) setExpandedFolders(prev => new Set([...prev, parentId]));
    }
  };

  const renameFolder = async (id: number, name: string) => {
    const r = await fetch(`${API}/form-folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      const updated: FormFolder = await r.json();
      setFolders(prev => prev.map(f => f.id === id ? updated : f));
    }
  };

  const deleteFolder = async (id: number) => {
    if (!confirm("Delete this folder? Forms inside will become uncategorized.")) return;
    const r = await fetch(`${API}/form-folders/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (r.ok) {
      setFolders(prev => prev.filter(f => f.id !== id && f.parentId !== id));
      setForms(prev => prev.map(f => f.folderId === id ? { ...f, folderId: null } : f));
    }
  };

  const saveFormFolder = async (formId: number, folderId: number | null) => {
    const r = await fetch(`${API}/forms/${formId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({ folderId }),
    });
    if (r.ok) {
      const updated: FormSummary = await r.json();
      setForms(prev => prev.map(f => f.id === formId ? { ...f, ...updated } : f));
      setEditFolderId(folderId);
    }
  };

  // Fetch workflows + agents whenever the Publish tab is opened (or on mount)
  const fetchWorkflowsAndAgents = useCallback(async () => {
    const headers = fetchHeaders();
    const [wRes, aRes] = await Promise.allSettled([
      fetch(`${API}/workflows`, { headers }),
      fetch(`${API}/ai-agents`, { headers }),
    ]);
    if (wRes.status === 'fulfilled' && wRes.value.ok) {
      try { const d = await wRes.value.json(); if (Array.isArray(d)) setWorkflows(d); } catch {}
    }
    if (aRes.status === 'fulfilled' && aRes.value.ok) {
      try { const d = await aRes.value.json(); if (Array.isArray(d)) setAgents(d); } catch {}
    }
  }, [fetchHeaders]);

  useEffect(() => { fetchWorkflowsAndAgents(); }, [fetchWorkflowsAndAgents]);

  // Re-fetch when the user switches to the Publish tab
  useEffect(() => {
    if (tab === 'publish') fetchWorkflowsAndAgents();
  }, [tab, fetchWorkflowsAndAgents]);

  const loadForm = useCallback(async (id: number) => {
    const r = await fetch(`${API}/forms/${id}`, { headers: fetchHeaders() });
    if (r.ok) {
      const form: FormSummary = await r.json();
      setEditName(form.name);
      setEditDesc(form.description);
      setEditNumber(form.formNumber);
      setLinkedWorkflowId(form.linkedWorkflowId ?? null);
      setLinkedAgentId(form.linkedAgentId ?? null);
      setEditFolderId(form.folderId ?? null);
      setLinkDirty(false);
      try { setFields(JSON.parse(form.fields)); } catch { setFields([]); }
      setDirty(false);
    }
  }, [fetchHeaders]);

  useEffect(() => {
    if (selectedId) loadForm(selectedId);
  }, [selectedId, loadForm]);

  const createForm = async () => {
    const r = await fetch(`${API}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({}),
    });
    if (r.ok) {
      const form: FormSummary = await r.json();
      await fetchForms();
      setSelectedId(form.id);
      setMode('templates');
    }
  };

  const createFormInFolder = async (folderId: number) => {
    const r = await fetch(`${API}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({}),
    });
    if (r.ok) {
      const form: FormSummary = await r.json();
      // Immediately assign to the target folder
      await fetch(`${API}/forms/${form.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify({ folderId }),
      });
      await fetchForms();
      setSelectedId(form.id);
      setEditFolderId(folderId);
      setMode('templates');
      // Ensure the folder is expanded so the new form is visible
      setExpandedFolders(prev => new Set([...prev, folderId]));
    }
  };

  const deleteForm = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this form? This cannot be undone.")) return;
    await fetch(`${API}/forms/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (selectedId === id) { setSelectedId(null); setFields([]); }
    fetchForms();
  };

  // ── Knowledge item handlers ────────────────────────────────────────────────

  const createKnowledgeItem = async (folderId: number, type: KnowledgeItemType) => {
    const defaults: Record<KnowledgeItemType, string> = {
      wiki: "New Wiki Page", url: "New Link", document: "New Document",
    };
    const r = await fetch(`${API}/knowledge-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({ type, title: defaults[type], folderId }),
    });
    if (r.ok) {
      const item: KnowledgeItem = await r.json();
      setKnowledgeItems(prev => [...prev, item]);
      setSelectedKnowledgeId(item.id);
      setSelectedId(null);
      setExpandedFolders(prev => new Set([...prev, folderId]));
    }
  };

  const deleteKnowledgeItem = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this item? This cannot be undone.")) return;
    await fetch(`${API}/knowledge-items/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (selectedKnowledgeId === id) setSelectedKnowledgeId(null);
    setKnowledgeItems(prev => prev.filter(i => i.id !== id));
  };

  const saveKnowledgeItem = async (updates: Partial<Pick<KnowledgeItem, 'title' | 'content' | 'url'>>) => {
    if (!selectedKnowledgeId) return;
    setKnowledgeSaving(true);
    try {
      const r = await fetch(`${API}/knowledge-items/${selectedKnowledgeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify(updates),
      });
      if (r.ok) {
        const updated: KnowledgeItem = await r.json();
        setKnowledgeItems(prev => prev.map(i => i.id === selectedKnowledgeId ? updated : i));
      }
    } finally { setKnowledgeSaving(false); }
  };

  const uploadKnowledgeDocument = async (file: File) => {
    if (!selectedKnowledgeId) return;
    const formData = new FormData();
    formData.append("file", file);
    const { 'Content-Type': _ct, ...uploadHeaders } = fetchHeaders();
    const r = await fetch(`${API}/knowledge-items/${selectedKnowledgeId}/upload`, {
      method: "POST",
      headers: uploadHeaders,
      body: formData,
    });
    if (r.ok) {
      const updated: KnowledgeItem = await r.json();
      setKnowledgeItems(prev => prev.map(i => i.id === selectedKnowledgeId ? updated : i));
    }
  };

  // ── Mind map handlers ────────────────────────────────────────────────────

  const createMindmapInFolder = async (folderId: number) => {
    const r = await fetch(`${API}/mindmaps`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fetchHeaders() },
      body: JSON.stringify({ name: "New Mind Map", folderId }),
    });
    if (r.ok) {
      const mm = await r.json();
      const summary: MindmapSummary = {
        id: mm.id, name: mm.name, folderId: mm.folder_id,
        createdAt: mm.created_at, updatedAt: mm.updated_at,
      };
      setMindmapList(prev => [...prev, summary]);
      setSelectedMindmapId(mm.id);
      setSelectedId(null);
      setSelectedKnowledgeId(null);
      setExpandedFolders(prev => new Set([...prev, folderId]));
    }
  };

  const deleteMindmap = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this mind map? This cannot be undone.")) return;
    await fetch(`${API}/mindmaps/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (selectedMindmapId === id) setSelectedMindmapId(null);
    setMindmapList(prev => prev.filter(m => m.id !== id));
  };

  const renameMindmapInList = (id: number, name: string) => {
    setMindmapList(prev => prev.map(m => m.id === id ? { ...m, name } : m));
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/forms/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify({
          formNumber: editNumber,
          name: editName,
          description: editDesc,
          fields: JSON.stringify(fields),
        }),
      });
      if (r.ok) {
        const updated: FormSummary = await r.json();
        setForms(prev => prev.map(f => f.id === selectedId ? { ...f, ...updated } : f));
      }
      setDirty(false);
    } finally { setSaving(false); }
  };

  const saveLinks = async () => {
    if (!selectedId) return;
    setLinkSaving(true);
    try {
      const r = await fetch(`${API}/forms/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify({ linkedWorkflowId, linkedAgentId }),
      });
      if (r.ok) {
        const updated: FormSummary = await r.json();
        setForms(prev => prev.map(f => f.id === selectedId ? { ...f, ...updated } : f));
        setLinkDirty(false);
      }
    } finally { setLinkSaving(false); }
  };

  const publishForm = async () => {
    if (!selectedId) return;
    setPublishing(true);
    try {
      const r = await fetch(`${API}/forms/${selectedId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
      });
      if (r.ok) {
        const updated: FormSummary = await r.json();
        setForms(prev => prev.map(f => f.id === selectedId ? { ...f, ...updated } : f));
      }
    } finally { setPublishing(false); }
  };

  const unpublishForm = async () => {
    if (!selectedId) return;
    setPublishing(true);
    try {
      const r = await fetch(`${API}/forms/${selectedId}/publish`, {
        method: "DELETE",
        headers: fetchHeaders(),
      });
      if (r.ok) {
        const updated: FormSummary = await r.json();
        setForms(prev => prev.map(f => f.id === selectedId ? { ...f, ...updated } : f));
      }
    } finally { setPublishing(false); }
  };

  const markDirty = () => setDirty(true);

  const addField = (type: FieldType) => {
    const newField: FormField = {
      id: uid(),
      type,
      label: '',
      placeholder: '',
      required: false,
      options: [],
    };
    setFields(prev => [...prev, newField]);
    markDirty();
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    markDirty();
  };

  const deleteField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    markDirty();
  };

  const reorderFields = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setFields(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    markDirty();
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    dragIndex.current = index;
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOverPosition(e.clientY < midY ? 'top' : 'bottom');
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex.current === null) return;
    const from = dragIndex.current;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const isTopHalf = e.clientY < midY;
    // Calculate the insertion index in the array after removal
    let insertAt = isTopHalf ? index : index + 1;
    // After removing `from`, indices >= from shift down by 1
    if (from < insertAt) insertAt -= 1;
    reorderFields(from, Math.max(0, insertAt));
    dragIndex.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const sampleJson = buildSampleJson(fields);

  const copyJson = () => {
    copyToClipboard(sampleJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Mode toggle bar */}
      <div className="flex-none px-5 py-2 border-b border-border bg-card/60 flex items-center gap-2">
        <button
          onClick={() => { setMode('templates'); setShowAllForms(false); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            !showAllForms
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <ClipboardList className="w-3.5 h-3.5" />Documents
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button
          onClick={() => { setShowAllForms(v => !v); setAllFormsSearch(""); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            showAllForms
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <LayoutGrid className="w-3.5 h-3.5" />Show All Documents
        </button>
      </div>

      {/* Main content — left panel + right panel */}
      <div className="flex-1 min-h-0 flex">

      {/* ── Show All Documents (by type) ── */}
      {showAllForms && (() => {
        const q = allFormsSearch.trim().toLowerCase();
        const matchName = (name: string, desc?: string | null) =>
          !q || name.toLowerCase().includes(q) || (desc ?? "").toLowerCase().includes(q);

        // --- Forms grouped by folder ---
        const cats = folders.filter(f => f.parentId === null);
        type FolderGroup = { id: number | null; name: string; forms: FormSummary[] };
        const formGroups: FolderGroup[] = cats.map(cat => {
          const subIds = folders.filter(f => f.parentId === cat.id).map(f => f.id);
          const allIds = new Set([cat.id, ...subIds]);
          const catForms = forms.filter(f => f.folderId != null && allIds.has(f.folderId) && matchName(f.name, f.description));
          return { id: cat.id, name: cat.name, forms: catForms };
        });
        const assignedFormIds = new Set(forms.filter(f => f.folderId != null && cats.some(c => {
          const subIds = folders.filter(s => s.parentId === c.id).map(s => s.id);
          return [c.id, ...subIds].includes(f.folderId!);
        })).map(f => f.id));
        const uncatForms = forms.filter(f => !assignedFormIds.has(f.id) && matchName(f.name, f.description));
        const visibleFormGroups = [...formGroups.filter(g => g.forms.length > 0), ...(uncatForms.length > 0 ? [{ id: null, name: "Uncategorized", forms: uncatForms }] : [])];
        const totalForms = visibleFormGroups.reduce((s, g) => s + g.forms.length, 0);

        // --- Wiki articles ---
        const visibleKnowledge = knowledgeItems.filter(k => matchName(k.title, k.content?.slice(0, 200)));

        // --- Mind maps ---
        const visibleMindmaps = mindmapList.filter(m => matchName(m.name));

        const totalAll = totalForms + visibleKnowledge.length + visibleMindmaps.length;

        const catColor = (name: string) => {
          const n = name.toLowerCase();
          if (n.includes("finance") || n.includes("compliance")) return "text-cyan-400 bg-cyan-500/10";
          if (n.includes("fundraising") || n.includes("donor")) return "text-emerald-400 bg-emerald-500/10";
          if (n.includes("grant")) return "text-violet-400 bg-violet-500/10";
          if (n.includes("hr") || n.includes("volunteer") || n.includes("talent")) return "text-fuchsia-400 bg-fuchsia-500/10";
          if (n.includes("marketing") || n.includes("brand")) return "text-amber-400 bg-amber-500/10";
          if (n.includes("program") || n.includes("delivery")) return "text-rose-400 bg-rose-500/10";
          if (n.includes("strategy") || n.includes("governance")) return "text-blue-400 bg-blue-500/10";
          if (n.includes("technology") || n.includes("tech") || n.includes("data")) return "text-indigo-400 bg-indigo-500/10";
          return "text-primary bg-primary/10";
        };

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Search + stats bar */}
            <div className="flex-none flex items-center gap-3 px-5 py-3 border-b border-border bg-card/40">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={allFormsSearch}
                  onChange={e => setAllFormsSearch(e.target.value)}
                  placeholder="Search documents…"
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background outline-none focus:border-primary transition-colors"
                />
                {allFormsSearch && (
                  <button onClick={() => setAllFormsSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {totalAll} document{totalAll !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-10">
              {totalAll === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <LayoutGrid className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">{q ? "No documents match your search." : "No documents yet."}</p>
                </div>
              ) : (
                <>
                  {/* ── Forms ── */}
                  {totalForms > 0 && (
                    <section>
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary">
                          <ClipboardList className="w-4 h-4" />
                          <span className="text-sm font-semibold">Forms</span>
                        </div>
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground">{totalForms} form{totalForms !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="space-y-6">
                        {visibleFormGroups.map(group => (
                          <div key={group.id ?? "uncat"}>
                            {visibleFormGroups.length > 1 && (
                              <div className="flex items-center gap-2 mb-2.5">
                                <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", catColor(group.name))}>
                                  <Folder className="w-3 h-3" />{group.name}
                                </div>
                                <div className="flex-1 h-px bg-border/60" />
                                <span className="text-[11px] text-muted-foreground">{group.forms.length}</span>
                              </div>
                            )}
                            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                              {group.forms.map(form => {
                                let fieldCount = 0;
                                try { fieldCount = JSON.parse(form.fields).length; } catch {}
                                return (
                                  <button
                                    key={form.id}
                                    onClick={() => { setSelectedId(form.id); setSelectedKnowledgeId(null); setMode('templates'); setShowAllForms(false); }}
                                    className={cn(
                                      "group text-left flex flex-col gap-2 p-4 rounded-xl border transition-all hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5",
                                      selectedId === form.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-card/80"
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
                                        <ClipboardList className="w-4 h-4 text-primary" />
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {form.isPublished && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-medium">
                                            <Globe className="w-2.5 h-2.5" />Live
                                          </span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground font-mono">#{form.formNumber}</span>
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">{form.name}</p>
                                      {form.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{form.description}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-auto pt-1">
                                      {fieldCount > 0 && (
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                          <List className="w-2.5 h-2.5" />{fieldCount} field{fieldCount !== 1 ? "s" : ""}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* ── Wiki Articles ── */}
                  {visibleKnowledge.length > 0 && (
                    <section>
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400">
                          <BookMarked className="w-4 h-4" />
                          <span className="text-sm font-semibold">Wiki Articles</span>
                        </div>
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground">{visibleKnowledge.length} article{visibleKnowledge.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                        {visibleKnowledge.map(item => (
                          <button
                            key={item.id}
                            onClick={() => { setSelectedKnowledgeId(item.id); setSelectedId(null); setMode('templates'); setShowAllForms(false); }}
                            className={cn(
                              "group text-left flex flex-col gap-2 p-4 rounded-xl border transition-all hover:shadow-md hover:border-violet-400/40 hover:-translate-y-0.5",
                              selectedKnowledgeId === item.id ? "border-violet-400 bg-violet-500/5 shadow-sm" : "border-border bg-card hover:bg-card/80"
                            )}
                          >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-violet-500/10 flex items-center justify-center flex-shrink-0">
                              <BookMarked className="w-4 h-4 text-violet-400" />
                            </div>
                            <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-violet-400 transition-colors">{item.title}</p>
                            {item.content && (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.content.replace(/<[^>]+>/g, "").slice(0, 120)}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* ── Mind Maps ── */}
                  {visibleMindmaps.length > 0 && (
                    <section>
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                          <GitBranch className="w-4 h-4" />
                          <span className="text-sm font-semibold">Mind Maps</span>
                        </div>
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground">{visibleMindmaps.length} map{visibleMindmaps.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                        {visibleMindmaps.map(mm => (
                          <button
                            key={mm.id}
                            onClick={() => { setSelectedMindmapId(mm.id); setSelectedId(null); setSelectedKnowledgeId(null); setMode('templates'); setShowAllForms(false); }}
                            className="group text-left flex flex-col gap-2 p-4 rounded-xl border border-border bg-card hover:bg-card/80 hover:border-emerald-400/40 hover:shadow-md hover:-translate-y-0.5 transition-all"
                          >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/30 to-emerald-500/10 flex items-center justify-center flex-shrink-0">
                              <GitBranch className="w-4 h-4 text-emerald-400" />
                            </div>
                            <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-emerald-400 transition-colors">{mm.name}</p>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Left panel — form list with folder tree */}
      {!showAllForms && (() => {
        const { roots: folderTree, uncategorized, uncategorizedKnowledge, uncategorizedMindmaps } = buildFolderTree(folders, forms, knowledgeItems, mindmapList);
        const flatFolders = flattenFoldersForSelect(folderTree);
        const toggleFolder = (id: number) => setExpandedFolders(prev => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        });
        return (
          <div className="w-72 flex-shrink-0 border-r border-border flex flex-col bg-sidebar/40">
            {/* Header */}
            <div className="px-3 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold">Library</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{forms.length + knowledgeItems.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={reindexKnowledge}
                  disabled={reindexing}
                  title="Re-index all documents for semantic search"
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-violet-400 transition-colors"
                >
                  {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                </button>
                {mode === 'templates' && (
                <>
                  <button
                    onClick={() => createFolder(null)}
                    title="New folder"
                    className="flex items-center gap-1 px-2 py-1 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={createForm}
                    className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />New
                  </button>
                </>
                )}
              </div>
            </div>
            {/* Semantic search bar */}
            <div className="px-2 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={knowledgeSearchQ}
                  onChange={e => setKnowledgeSearchQ(e.target.value)}
                  placeholder="Semantic search…"
                  className="w-full text-xs bg-secondary/50 border border-border rounded-md pl-7 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/60"
                />
                {knowledgeSearchQ && (
                  <button
                    onClick={() => { setKnowledgeSearchQ(""); setKnowledgeSearchResults(null); }}
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
              {/* ── Semantic search results ── */}
              {knowledgeSearchQ.trim() ? (
                knowledgeSearching ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Searching…</span>
                  </div>
                ) : knowledgeSearchResults && knowledgeSearchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 gap-2 text-center">
                    <Search className="w-6 h-6 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">No matching documents found</p>
                  </div>
                ) : (knowledgeSearchResults ?? []).map(result => (
                  <div
                    key={result.id}
                    onClick={() => {
                      setSelectedKnowledgeId(result.id);
                      setSelectedId(null);
                      setKnowledgeSearchQ("");
                      setKnowledgeSearchResults(null);
                    }}
                    role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setSelectedKnowledgeId(result.id)}
                    className={cn(
                      "w-full flex flex-col gap-0.5 px-3 py-2 text-left transition-colors border-b border-border/30 cursor-pointer",
                      selectedKnowledgeId === result.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-gradient-to-br",
                        result.type === "wiki" ? "from-violet-500/30 to-violet-500/10" :
                        result.type === "url" ? "from-blue-500/30 to-blue-500/10" : "from-orange-500/30 to-orange-500/10"
                      )}>
                        {result.type === "wiki" ? <BookMarked className="w-2.5 h-2.5 text-violet-400" /> :
                         result.type === "url" ? <Link2 className="w-2.5 h-2.5 text-blue-400" /> :
                         <FileText className="w-2.5 h-2.5 text-orange-400" />}
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
              ) : loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : forms.length === 0 && folders.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <ClipboardList className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No forms yet.</p>
                  <button onClick={createForm} className="mt-2 text-xs text-primary hover:underline">Create your first form</button>
                </div>
              ) : (
                <>
                  {/* Folder tree */}
                  {folderTree.map(node => (
                    <FolderNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedId={selectedId}
                      selectedKnowledgeId={selectedKnowledgeId}
                      selectedMindmapId={selectedMindmapId}
                      expanded={expandedFolders}
                      onToggle={toggleFolder}
                      onSelectForm={(id) => { setSelectedId(id); setSelectedKnowledgeId(null); setSelectedMindmapId(null); setMode('entry'); }}
                      onDeleteForm={deleteForm}
                      onSelectKnowledge={(id) => { setSelectedKnowledgeId(id); setSelectedId(null); setSelectedMindmapId(null); }}
                      onDeleteKnowledge={deleteKnowledgeItem}
                      onSelectMindmap={(id) => { setSelectedMindmapId(id); setSelectedId(null); setSelectedKnowledgeId(null); }}
                      onDeleteMindmap={deleteMindmap}
                      onCreateSubfolder={createFolder}
                      onRenameFolder={renameFolder}
                      onDeleteFolder={deleteFolder}
                      onCreateFormInFolder={createFormInFolder}
                      onCreateKnowledgeItem={createKnowledgeItem}
                      onCreateMindmap={createMindmapInFolder}
                    />
                  ))}

                  {/* Uncategorized items */}
                  {(uncategorized.length > 0 || uncategorizedKnowledge.length > 0 || uncategorizedMindmaps.length > 0) && (
                    <>
                      {folderTree.length > 0 && (
                        <div className="px-3 pt-3 pb-1 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                          Uncategorized
                        </div>
                      )}
                      {uncategorized.map(form => {
                        let fieldCount = 0;
                        try { fieldCount = JSON.parse(form.fields).length; } catch {}
                        return (
                          <div
                            key={`form-${form.id}`}
                            onClick={() => { setSelectedId(form.id); setSelectedKnowledgeId(null); setMode('entry'); }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && (setSelectedId(form.id), setMode('entry'))}
                            className={cn(
                              "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 group cursor-pointer",
                              selectedId === form.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
                            )}
                          >
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <ClipboardList className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground font-mono">#{form.formNumber}</span>
                                <span className="text-sm font-medium truncate">{form.name}</span>
                                {form.isPublished && <Globe className="w-3 h-3 text-green-500 flex-shrink-0" />}
                              </div>
                              <div className="text-xs text-muted-foreground truncate mt-0.5">{form.description || "No description"}</div>
                              {fieldCount > 0 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  <List className="inline w-3 h-3 mr-0.5" />{fieldCount} field{fieldCount !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={e => deleteForm(form.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                      {uncategorizedKnowledge.map(item => (
                        <div
                          key={`ki-${item.id}`}
                          onClick={() => { setSelectedKnowledgeId(item.id); setSelectedId(null); }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === 'Enter' && setSelectedKnowledgeId(item.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-border/50 group cursor-pointer",
                            selectedKnowledgeId === item.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
                          )}
                        >
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br", knowledgeItemBg(item.type))}>
                            {knowledgeItemIcon(item.type, "w-3.5 h-3.5")}
                          </div>
                          <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.title}</span>
                          <button
                            onClick={e => deleteKnowledgeItem(item.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {uncategorizedMindmaps.map(mm => (
                        <div
                          key={`mm-${mm.id}`}
                          onClick={() => { setSelectedMindmapId(mm.id); setSelectedId(null); setSelectedKnowledgeId(null); }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === 'Enter' && setSelectedMindmapId(mm.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-border/50 group cursor-pointer",
                            selectedMindmapId === mm.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/50"
                          )}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-violet-500/30 to-violet-500/10">
                            <GitBranch className="w-3.5 h-3.5 text-violet-400" />
                          </div>
                          <span className="flex-1 min-w-0 text-sm font-medium truncate">{mm.name}</span>
                          <button
                            onClick={e => deleteMindmap(mm.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Folder selector hint: assign form to folder inline */}
            {selectedId && mode === 'templates' && (
              <div className="border-t border-border px-3 py-2 bg-card/40">
                <div className="flex items-center gap-2">
                  <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <select
                    value={editFolderId ?? ''}
                    onChange={e => saveFormFolder(selectedId, e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 text-xs bg-background border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">No folder</option>
                    {flatFolders.map(f => (
                      <option key={f.id} value={f.id}>
                        {'\u00A0'.repeat(f.depth * 3)}{f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Right panel */}
      {!showAllForms && (selectedMindmapId ? (
        <div className="flex-1 min-w-0 flex flex-col">
          <MindmapEditor
            mindmapId={selectedMindmapId}
            mindmapName={mindmapList.find(m => m.id === selectedMindmapId)?.name ?? "Mind Map"}
            onRename={(name) => renameMindmapInList(selectedMindmapId, name)}
          />
        </div>
      ) : selectedKnowledgeItem ? (
        <div className="flex-1 min-w-0">
          {selectedKnowledgeItem.type === "wiki" && (
            <WikiEditor
              item={selectedKnowledgeItem}
              saving={knowledgeSaving}
              onSave={async (title, content) => { await saveKnowledgeItem({ title, content }); }}
            />
          )}
          {selectedKnowledgeItem.type === "url" && (
            <UrlItemEditor
              item={selectedKnowledgeItem}
              saving={knowledgeSaving}
              onSave={async (title, url, content) => { await saveKnowledgeItem({ title, url, content }); }}
            />
          )}
          {selectedKnowledgeItem.type === "document" && (
            <DocumentItemEditor
              item={selectedKnowledgeItem}
              saving={knowledgeSaving}
              onSave={async (title, content) => { await saveKnowledgeItem({ title, content }); }}
              onUpload={uploadKnowledgeDocument}
            />
          )}
        </div>
      ) : !selectedForm ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            {mode === 'entry' ? <PenLine className="w-8 h-8 text-primary/60" /> : <ClipboardList className="w-8 h-8 text-primary/60" />}
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-1">
              {mode === 'entry' ? 'Select a Template' : 'Forms & Knowledge Library'}
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {mode === 'entry'
                ? 'Choose a report template from the left to fill in data. All submissions are stored and can be viewed by administrators.'
                : 'Create forms, wiki pages, URL bookmarks, and documents — all organized in one shared folder structure.'}
            </p>
          </div>
          {mode === 'templates' && (
            <button
              onClick={createForm}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />Create First Template
            </button>
          )}
        </div>
      ) : mode === 'entry' ? (
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-none px-6 py-3 border-b border-border bg-card/60 flex items-center gap-3">
            <PenLine className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold truncate">{selectedForm.name}</span>
            <div className="ml-auto flex-shrink-0">
              <button
                onClick={() => setMode('templates')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-secondary transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Edit template
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <DataEntryFillPanel
              form={selectedForm}
              fields={fields}
              getFetchHeaders={fetchHeaders}
              currentUserName={currentUserName}
              agents={agents}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="flex-none px-6 py-3 border-b border-border bg-card/60 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 flex items-center gap-3">
              {editingNumber ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground font-mono">#</span>
                  <input
                    type="number"
                    value={editNumber}
                    onChange={e => { setEditNumber(Number(e.target.value)); markDirty(); }}
                    onBlur={() => setEditingNumber(false)}
                    autoFocus
                    className="w-14 text-xs font-mono bg-background border border-primary rounded px-1.5 py-0.5 focus:outline-none"
                  />
                </div>
              ) : (
                <button onClick={() => setEditingNumber(true)} className="flex items-center gap-0.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors group" title="Edit ID">
                  <span>#{editNumber}</span>
                  <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              <input
                value={editName}
                onChange={e => { setEditName(e.target.value); markDirty(); }}
                className="text-base font-bold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors flex-1 min-w-0"
                placeholder="Form name…"
              />
              <input
                value={editDesc}
                onChange={e => { setEditDesc(e.target.value); markDirty(); }}
                className="text-sm text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-64 flex-shrink-0 hidden lg:block"
                placeholder="Description…"
              />
            </div>
            {dirty && (
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm flex-shrink-0"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex-none flex items-center gap-1 px-6 py-2 border-b border-border bg-card/40">
            {[
              { key: 'build',       label: 'Build',       icon: <List className="w-3.5 h-3.5" /> },
              { key: 'preview',     label: 'Preview',     icon: <Eye className="w-3.5 h-3.5" /> },
              { key: 'json',        label: 'JSON Output', icon: <Code2 className="w-3.5 h-3.5" /> },
              { key: 'publish',     label: 'Publish',     icon: <Globe className="w-3.5 h-3.5" /> },
              { key: 'submissions', label: 'Submissions', icon: <Database className="w-3.5 h-3.5" /> },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  t.key === 'publish' && selectedForm?.isPublished && tab !== 'publish'
                    ? "text-green-500"
                    : ""
                )}
              >
                {t.icon}{t.label}
                {t.key === 'publish' && selectedForm?.isPublished && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-0.5" />
                )}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 min-h-0 overflow-auto">

            {tab === 'build' && (
              <div className="p-6 space-y-3 max-w-2xl mx-auto">

                {/* Field list */}
                {fields.map((field, index) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    onUpdate={updates => updateField(field.id, updates)}
                    onDelete={() => deleteField(field.id)}
                    isDragging={draggingIndex === index}
                    isDragOver={dragOverIndex === index}
                    dragPosition={dragOverIndex === index ? dragOverPosition : null}
                    onDragStart={handleDragStart(index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver(index)}
                    onDrop={handleDrop(index)}
                  />
                ))}

                {fields.length === 0 && (
                  <div className="text-center py-8">
                    <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No fields yet. Add your first field below.</p>
                  </div>
                )}

                {/* Add field buttons */}
                <div className="pt-2 border-t border-border">
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Add field</div>
                  <div className="flex flex-wrap gap-2">
                    {FIELD_TYPES.map(ft => (
                      <button
                        key={ft.value}
                        onClick={() => addField(ft.value)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        {ft.icon}{ft.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'preview' && (
              <div className="p-6 overflow-y-auto">
                <div className="max-w-sm mx-auto bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-semibold mb-0.5">{editName || "Untitled Form"}</h3>
                  {editDesc && <p className="text-sm text-muted-foreground mb-4">{editDesc}</p>}
                  <FormPreview fields={fields} formName="" />
                </div>
              </div>
            )}

            {tab === 'json' && (
              <div className="p-6 max-w-2xl mx-auto">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-1">JSON Output Schema</h3>
                  <p className="text-xs text-muted-foreground">
                    When a workflow step invokes this form, the submitted data is sent as JSON in this structure. Reference these fields in subsequent workflow steps.
                  </p>
                </div>
                <div className="relative rounded-xl border border-border bg-card/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
                    <span className="text-xs font-mono text-muted-foreground">form_data.json</span>
                    <button
                      onClick={copyJson}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-foreground overflow-auto whitespace-pre">{sampleJson}</pre>
                </div>

                <div className="mt-4 rounded-xl border border-border bg-card/40 p-4">
                  <div className="text-xs font-semibold mb-2">Form fields summary</div>
                  {fields.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No fields defined yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {fields.map(f => {
                        const key = f.label.toLowerCase().replace(/\s+/g, '_') || f.id;
                        return (
                          <div key={f.id} className="flex items-center gap-3 text-xs">
                            <span className="font-mono text-primary">{key}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground capitalize">{f.type}</span>
                            {f.required && <span className="text-xs px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">required</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'publish' && (
              <div className="p-6 max-w-2xl mx-auto space-y-5">

                {dirty && (
                  <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p className="text-xs">You have unsaved changes. Save the form before publishing.</p>
                  </div>
                )}

                {/* Link to Workflow */}
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <GitBranch className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Link to Workflow</p>
                      <p className="text-xs text-muted-foreground">Trigger a workflow when this form is submitted.</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Workflow</label>
                    <select
                      value={linkedWorkflowId ?? ''}
                      onChange={e => { setLinkedWorkflowId(e.target.value ? Number(e.target.value) : null); setLinkDirty(true); }}
                      className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">— None —</option>
                      {workflows.map(w => (
                        <option key={w.id} value={w.id}>#{w.workflowNumber} · {w.name}</option>
                      ))}
                    </select>
                    {workflows.length === 0 && <p className="text-xs text-muted-foreground italic">No workflows created yet.</p>}
                    {linkedWorkflowId && !linkDirty && (
                      <p className="text-xs text-blue-500 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Linked to <span className="font-medium">{workflows.find(w => w.id === linkedWorkflowId)?.name ?? `Workflow #${linkedWorkflowId}`}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Link to Agent */}
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-violet-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Link to AI Agent</p>
                      <p className="text-xs text-muted-foreground">Route submissions to an AI Agent for processing.</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Agent</label>
                    <select
                      value={linkedAgentId ?? ''}
                      onChange={e => { setLinkedAgentId(e.target.value ? Number(e.target.value) : null); setLinkDirty(true); }}
                      className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">— None —</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>#{a.agentNumber} · {a.name}</option>
                      ))}
                    </select>
                    {agents.length === 0 && <p className="text-xs text-muted-foreground italic">No AI agents created yet.</p>}
                    {linkedAgentId && !linkDirty && (
                      <p className="text-xs text-violet-500 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Linked to <span className="font-medium">{agents.find(a => a.id === linkedAgentId)?.name ?? `Agent #${linkedAgentId}`}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Save links */}
                {linkDirty && (
                  <button
                    onClick={saveLinks}
                    disabled={linkSaving}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-60"
                  >
                    {linkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    {linkSaving ? 'Saving…' : 'Save Link Settings'}
                  </button>
                )}

                {/* Publish panel */}
                <div className={cn(
                  "bg-card border rounded-2xl p-5 space-y-4",
                  selectedForm?.isPublished ? "border-green-500/30" : "border-border"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0",
                      selectedForm?.isPublished ? "bg-green-500/10" : "bg-muted"
                    )}>
                      <Radio className={cn("w-4 h-4", selectedForm?.isPublished ? "text-green-500" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Publish Form</p>
                      <p className="text-xs text-muted-foreground">Generate a unique public URL for this form.</p>
                    </div>
                    {selectedForm?.isPublished && (
                      <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>

                  {selectedForm?.isPublished && selectedForm.publishSlug ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-green-500/30 bg-green-500/5 font-mono text-xs text-green-700 dark:text-green-400 overflow-hidden min-w-0">
                          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{window.location.origin}{import.meta.env.BASE_URL}f/{selectedForm.publishSlug}</span>
                        </div>
                        <button
                          onClick={() => {
                            copyToClipboard(`${window.location.origin}${import.meta.env.BASE_URL}f/${selectedForm!.publishSlug}`);
                            setUrlCopied(true);
                            setTimeout(() => setUrlCopied(false), 2000);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-medium hover:bg-secondary transition-colors flex-shrink-0"
                        >
                          {urlCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          {urlCopied ? 'Copied' : 'Copy'}
                        </button>
                        <a
                          href={`${import.meta.env.BASE_URL}f/${selectedForm.publishSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-medium hover:bg-secondary transition-colors flex-shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open
                        </a>
                      </div>
                      <button
                        onClick={unpublishForm}
                        disabled={publishing}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-red-500 text-sm font-medium hover:bg-red-500/5 transition-colors disabled:opacity-60"
                      >
                        {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        {publishing ? 'Unpublishing…' : 'Unpublish Form'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Optionally link to a workflow or agent above first, then publish.
                        A unique shareable URL will be generated for this form.
                      </p>
                      <button
                        onClick={publishForm}
                        disabled={publishing || dirty || linkDirty}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
                      >
                        {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                        {publishing ? 'Publishing…' : 'Publish Form'}
                      </button>
                      {(dirty || linkDirty) && (
                        <p className="text-xs text-amber-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Save all changes before publishing.
                        </p>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}

            {tab === 'submissions' && selectedForm && (
              <SubmissionsTab
                formId={selectedForm.id}
                fields={fields}
                getFetchHeaders={fetchHeaders}
              />
            )}

          </div>
        </div>
      ))}
      </div>{/* /flex-1 min-h-0 flex */}
    </div>
  );
}
