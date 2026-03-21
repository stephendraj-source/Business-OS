import { useState, useEffect, useCallback, useRef } from "react";
import {
  ClipboardList, Plus, Trash2, Save, Edit2, Loader2, X, Check,
  GripVertical, Type, Hash, Mail, AlignLeft, ChevronDown, Calendar,
  CheckSquare, List, Eye, Code2, Copy, Globe, Link2, Bot,
  GitBranch, ExternalLink, Radio, AlertCircle,
  Folder, FolderOpen, FolderPlus, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'number' | 'email' | 'textarea' | 'select' | 'checkbox' | 'date';

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

interface FolderTreeNode extends FormFolder {
  children: FolderTreeNode[];
  forms: FormSummary[];
}

interface WorkflowItem { id: number; name: string; workflowNumber: number; }
interface AgentItem { id: number; name: string; agentNumber: number; }

const FIELD_TYPES: { value: FieldType; label: string; icon: React.ReactNode }[] = [
  { value: 'text',     label: 'Short Text',   icon: <Type className="w-3.5 h-3.5" /> },
  { value: 'textarea', label: 'Long Text',    icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { value: 'number',   label: 'Number',       icon: <Hash className="w-3.5 h-3.5" /> },
  { value: 'email',    label: 'Email',        icon: <Mail className="w-3.5 h-3.5" /> },
  { value: 'select',   label: 'Dropdown',     icon: <ChevronDown className="w-3.5 h-3.5" /> },
  { value: 'checkbox', label: 'Checkbox',     icon: <CheckSquare className="w-3.5 h-3.5" /> },
  { value: 'date',     label: 'Date',         icon: <Calendar className="w-3.5 h-3.5" /> },
];

function getFieldIcon(type: FieldType) {
  return FIELD_TYPES.find(f => f.value === type)?.icon ?? <Type className="w-3.5 h-3.5" />;
}

function uid() { return crypto.randomUUID().slice(0, 8); }

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
      default:        obj[key] = "";
    }
  }
  return JSON.stringify(obj, null, 2);
}

// ── Folder Helpers ────────────────────────────────────────────────────────────

function buildFolderTree(folders: FormFolder[], forms: FormSummary[]): { roots: FolderTreeNode[]; uncategorized: FormSummary[] } {
  const nodeMap = new Map<number, FolderTreeNode>();
  for (const f of folders) nodeMap.set(f.id, { ...f, children: [], forms: [] });
  for (const form of forms) {
    if (form.folderId && nodeMap.has(form.folderId)) nodeMap.get(form.folderId)!.forms.push(form);
  }
  const roots: FolderTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) nodeMap.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const uncategorized = forms.filter(f => !f.folderId || !nodeMap.has(f.folderId));
  return { roots, uncategorized };
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
  node, depth, selectedId, expanded, onToggle, onSelectForm, onDeleteForm,
  onCreateSubfolder, onRenameFolder, onDeleteFolder,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelectForm: (id: number) => void;
  onDeleteForm: (id: number, e: React.MouseEvent) => void;
  onCreateSubfolder: (parentId: number) => void;
  onRenameFolder: (id: number, name: string) => void;
  onDeleteFolder: (id: number) => void;
}) {
  const isExpanded = expanded.has(node.id);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.name);
  const indent = depth * 12;

  const commitRename = () => {
    const trimmed = renameName.trim();
    if (trimmed && trimmed !== node.name) onRenameFolder(node.id, trimmed);
    else setRenameName(node.name);
    setRenaming(false);
  };

  return (
    <div>
      {/* Folder header row */}
      <div
        className="flex items-center gap-1 px-2 py-1 group hover:bg-secondary/50 cursor-pointer select-none"
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
            {(node.forms.length > 0 || node.children.length > 0) && (
              <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                ({node.forms.length + node.children.reduce((acc, c) => acc + c.forms.length, 0)})
              </span>
            )}
          </span>
        )}
        {/* Hover actions */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
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
              expanded={expanded}
              onToggle={onToggle}
              onSelectForm={onSelectForm}
              onDeleteForm={onDeleteForm}
              onCreateSubfolder={onCreateSubfolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
          {/* Forms inside folder */}
          {node.forms.map(form => {
            let fieldCount = 0;
            try { fieldCount = JSON.parse(form.fields).length; } catch {}
            return (
              <div
                key={form.id}
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
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ClipboardList className="w-3 h-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-mono">#{form.formNumber}</span>
                    <span className="text-xs font-medium truncate">{form.name}</span>
                    {form.isPublished && <Globe className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />}
                  </div>
                  {fieldCount > 0 && <div className="text-[10px] text-muted-foreground"><List className="inline w-2.5 h-2.5 mr-0.5" />{fieldCount} field{fieldCount !== 1 ? 's' : ''}</div>}
                </div>
                <button
                  onClick={e => onDeleteForm(form.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0 mt-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {/* Empty folder hint */}
          {node.forms.length === 0 && node.children.length === 0 && (
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

// ── Main Forms View ───────────────────────────────────────────────────────────

export function FormsView() {
  const { fetchHeaders } = useAuth();
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
  const [tab, setTab] = useState<'build' | 'preview' | 'json' | 'publish'>('build');
  const [copied, setCopied] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom'>('bottom');

  // Folder state
  const [folders, setFolders] = useState<FormFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [editFolderId, setEditFolderId] = useState<number | null>(null);

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

  useEffect(() => { fetchForms(); fetchFolders(); }, [fetchForms, fetchFolders]);

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
    }
  };

  const deleteForm = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this form? This cannot be undone.")) return;
    await fetch(`${API}/forms/${id}`, { method: "DELETE", headers: fetchHeaders() });
    if (selectedId === id) { setSelectedId(null); setFields([]); }
    fetchForms();
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
    navigator.clipboard.writeText(sampleJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full bg-background">

      {/* Left panel — form list with folder tree */}
      {(() => {
        const { roots: folderTree, uncategorized } = buildFolderTree(folders, forms);
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
                <span className="text-sm font-semibold">Forms</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{forms.length}</span>
              </div>
              <div className="flex items-center gap-1">
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
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {loading ? (
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
                      expanded={expandedFolders}
                      onToggle={toggleFolder}
                      onSelectForm={setSelectedId}
                      onDeleteForm={deleteForm}
                      onCreateSubfolder={createFolder}
                      onRenameFolder={renameFolder}
                      onDeleteFolder={deleteFolder}
                    />
                  ))}

                  {/* Uncategorized forms */}
                  {uncategorized.length > 0 && (
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
                            key={form.id}
                            onClick={() => setSelectedId(form.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && setSelectedId(form.id)}
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
                    </>
                  )}

                  {/* Empty state when all forms are in folders */}
                  {forms.length === 0 && folders.length > 0 && (
                    <div className="px-4 py-4 text-center">
                      <button onClick={createForm} className="text-xs text-primary hover:underline">+ New Form</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Folder selector hint: assign form to folder inline */}
            {selectedId && (
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
      {!selectedForm ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <ClipboardList className="w-8 h-8 text-primary/60" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-1">Form Builder</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create forms to collect structured data. Each form sends its responses as JSON to workflow steps, enabling seamless data handoff between processes.
            </p>
          </div>
          <button
            onClick={createForm}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />Create First Form
          </button>
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
              { key: 'build',   label: 'Build',       icon: <List className="w-3.5 h-3.5" /> },
              { key: 'preview', label: 'Preview',     icon: <Eye className="w-3.5 h-3.5" /> },
              { key: 'json',    label: 'JSON Output', icon: <Code2 className="w-3.5 h-3.5" /> },
              { key: 'publish', label: 'Publish',     icon: <Globe className="w-3.5 h-3.5" /> },
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
                          <span className="truncate">{window.location.origin}/f/{selectedForm.publishSlug}</span>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/f/${selectedForm!.publishSlug}`);
                            setUrlCopied(true);
                            setTimeout(() => setUrlCopied(false), 2000);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-medium hover:bg-secondary transition-colors flex-shrink-0"
                        >
                          {urlCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          {urlCopied ? 'Copied' : 'Copy'}
                        </button>
                        <a
                          href={`/f/${selectedForm.publishSlug}`}
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

          </div>
        </div>
      )}
    </div>
  );
}
