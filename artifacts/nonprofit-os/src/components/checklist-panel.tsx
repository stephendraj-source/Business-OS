import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, Check, ExternalLink,
  Upload, Download, Link2, Loader2, Edit2, Save, ClipboardList, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvidenceFile {
  id: number; evidenceItemId: number; originalName: string;
  storedName: string; mimeType: string; fileSize: number; filePath: string; uploadedAt: string;
}
interface EvidenceUrl {
  id: number; evidenceItemId: number; url: string; label: string; createdAt: string;
}
interface EvidenceItem {
  id: number; checklistItemId: number; name: string; description: string;
  createdAt: string; urls: EvidenceUrl[]; files: EvidenceFile[];
}
interface ChecklistItem {
  id: number; checklistId: number; name: string; description: string;
  met: boolean; sortOrder: number; createdAt: string; evidenceItems: EvidenceItem[];
}
interface Checklist {
  id: number; processId: number; name: string; description: string;
  createdAt: string; items: ChecklistItem[];
}

interface Process { id: number; processName: string; category?: string; }

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Inline text edit ──────────────────────────────────────────────────────────

function InlineEdit({ value, onSave, placeholder = "", className = "", multiline = false }: {
  value: string; onSave: (v: string) => void; placeholder?: string;
  className?: string; multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = () => { setEditing(false); if (draft !== value) onSave(draft); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        className={cn("text-left hover:underline decoration-dashed underline-offset-2 cursor-text group", className, !value && "italic text-muted-foreground")}>
        {value || placeholder}
        <Edit2 className="inline w-2.5 h-2.5 ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
      </button>
    );
  }

  if (multiline) {
    return (
      <textarea ref={ref as any} value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={save} onKeyDown={e => e.key === 'Escape' && cancel()}
        placeholder={placeholder} rows={2}
        className={cn("w-full bg-secondary/30 border border-primary/40 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none", className)} />
    );
  }
  return (
    <input ref={ref as any} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
      placeholder={placeholder}
      className={cn("w-full bg-secondary/30 border border-primary/40 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary", className)} />
  );
}

// ── Evidence Item ─────────────────────────────────────────────────────────────

function EvidenceItemRow({ ev, onUpdate, onDelete, onAddUrl, onDeleteUrl, onUploadFile, onDeleteFile }: {
  ev: EvidenceItem;
  onUpdate: (id: number, name: string, description: string) => void;
  onDelete: (id: number) => void;
  onAddUrl: (evId: number, url: string, label: string) => void;
  onDeleteUrl: (urlId: number) => void;
  onUploadFile: (evId: number, file: File) => void;
  onDeleteFile: (fileId: number) => void;
}) {
  const [addingUrl, setAddingUrl] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newUrlLabel, setNewUrlLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await onUploadFile(ev.id, file);
    setUploading(false);
    e.target.value = "";
  };

  const submitUrl = () => {
    if (!newUrl.trim()) return;
    onAddUrl(ev.id, newUrl.trim(), newUrlLabel.trim());
    setNewUrl(""); setNewUrlLabel(""); setAddingUrl(false);
  };

  return (
    <div className="border border-border/50 rounded-lg bg-background/50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <InlineEdit value={ev.name} onSave={name => onUpdate(ev.id, name, ev.description)}
            placeholder="Evidence name…" className="text-sm font-medium" />
          <InlineEdit value={ev.description} onSave={desc => onUpdate(ev.id, ev.name, desc)}
            placeholder="Description…" className="text-xs text-muted-foreground" multiline />
        </div>
        <button onClick={() => onDelete(ev.id)} className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0 mt-0.5">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* URLs */}
      {ev.urls.length > 0 && (
        <div className="space-y-1">
          {ev.urls.map(u => (
            <div key={u.id} className="flex items-center gap-2 text-xs group">
              <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
              <a href={u.url} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:underline truncate flex-1">
                {u.label || u.url}
              </a>
              <button onClick={() => onDeleteUrl(u.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Files */}
      {ev.files.length > 0 && (
        <div className="space-y-1">
          {ev.files.map(f => (
            <div key={f.id} className="flex items-center gap-2 text-xs group">
              <FileText className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="flex-1 truncate">{f.originalName}</span>
              <span className="text-muted-foreground flex-shrink-0">{formatBytes(f.fileSize)}</span>
              <a href={`${API}/evidence-files/${f.id}/download`} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all flex-shrink-0">
                <Download className="w-3 h-3" />
              </a>
              <button onClick={() => onDeleteFile(f.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add URL form */}
      {addingUrl ? (
        <div className="space-y-1">
          <input value={newUrlLabel} onChange={e => setNewUrlLabel(e.target.value)}
            placeholder="Label (optional)…" className="w-full text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex gap-1">
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
              placeholder="https://…" type="url"
              onKeyDown={e => { if (e.key === 'Enter') submitUrl(); if (e.key === 'Escape') setAddingUrl(false); }}
              className="flex-1 text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={submitUrl} className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded">Add</button>
            <button onClick={() => setAddingUrl(false)} className="px-2 py-1 text-muted-foreground text-xs rounded hover:bg-secondary">Cancel</button>
          </div>
        </div>
      ) : null}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setAddingUrl(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
          <Link2 className="w-3 h-3" />Add URL
        </button>
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          Upload file
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  );
}

// ── Checklist Item Row ────────────────────────────────────────────────────────

function ChecklistItemRow({ item, onUpdate, onDelete, onToggleMet, onAddEvidence, onUpdateEvidence, onDeleteEvidence, onAddUrl, onDeleteUrl, onUploadFile, onDeleteFile }: {
  item: ChecklistItem;
  onUpdate: (id: number, name: string, description: string) => void;
  onDelete: (id: number) => void;
  onToggleMet: (id: number, met: boolean) => void;
  onAddEvidence: (itemId: number) => void;
  onUpdateEvidence: (evId: number, name: string, desc: string) => void;
  onDeleteEvidence: (evId: number) => void;
  onAddUrl: (evId: number, url: string, label: string) => void;
  onDeleteUrl: (urlId: number) => void;
  onUploadFile: (evId: number, file: File) => void;
  onDeleteFile: (fileId: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("border rounded-lg transition-colors", item.met ? "border-green-500/30 bg-green-500/5" : "border-border bg-card/50")}>
      {/* Item header */}
      <div className="flex items-start gap-2 p-3">
        {/* Met checkbox */}
        <button
          onClick={() => onToggleMet(item.id, !item.met)}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all",
            item.met ? "bg-green-500 border-green-500" : "border-muted-foreground hover:border-green-500"
          )}
          title="Mark as met"
        >
          {item.met && <Check className="w-3 h-3 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Met</span>
          </div>
          <InlineEdit value={item.name} onSave={name => onUpdate(item.id, name, item.description)}
            placeholder="Item name…" className="text-sm font-medium mt-1" />
          <InlineEdit value={item.description} onSave={desc => onUpdate(item.id, item.name, desc)}
            placeholder="Description…" className="text-xs text-muted-foreground mt-0.5" multiline />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-1.5 py-1 rounded hover:bg-secondary">
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {item.evidenceItems.length > 0 && <span className="text-xs">{item.evidenceItems.length}</span>}
            Evidence
          </button>
          <button onClick={() => onDelete(item.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded hover:bg-destructive/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Evidence section */}
      {open && (
        <div className="border-t border-border/50 p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Evidence</div>
          {item.evidenceItems.map(ev => (
            <EvidenceItemRow
              key={ev.id}
              ev={ev}
              onUpdate={onUpdateEvidence}
              onDelete={onDeleteEvidence}
              onAddUrl={onAddUrl}
              onDeleteUrl={onDeleteUrl}
              onUploadFile={onUploadFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
          <button
            onClick={() => onAddEvidence(item.id)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded hover:bg-secondary"
          >
            <Plus className="w-3 h-3" />Add Evidence Item
          </button>
        </div>
      )}
    </div>
  );
}

// ── Checklist Accordion ───────────────────────────────────────────────────────

function ChecklistAccordion({ cl, onUpdate, onDelete, onAddItem, onUpdateItem, onDeleteItem, onToggleMet,
  onAddEvidence, onUpdateEvidence, onDeleteEvidence, onAddUrl, onDeleteUrl, onUploadFile, onDeleteFile }: {
  cl: Checklist;
  onUpdate: (id: number, name: string, desc: string) => void;
  onDelete: (id: number) => void;
  onAddItem: (clId: number) => void;
  onUpdateItem: (itemId: number, name: string, desc: string) => void;
  onDeleteItem: (itemId: number) => void;
  onToggleMet: (itemId: number, met: boolean) => void;
  onAddEvidence: (itemId: number) => void;
  onUpdateEvidence: (evId: number, name: string, desc: string) => void;
  onDeleteEvidence: (evId: number) => void;
  onAddUrl: (evId: number, url: string, label: string) => void;
  onDeleteUrl: (urlId: number) => void;
  onUploadFile: (evId: number, file: File) => void;
  onDeleteFile: (fileId: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const metCount = cl.items.filter(i => i.met).length;

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      {/* Checklist header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-card hover:bg-secondary/30 transition-colors">
        <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center gap-2 text-left">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          <InlineEdit value={cl.name} onSave={name => onUpdate(cl.id, name, cl.description)}
            placeholder="Checklist name…" className="text-sm font-semibold flex-1" />
          {cl.items.length > 0 && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
              metCount === cl.items.length ? "bg-green-500/15 text-green-400" : "bg-secondary text-muted-foreground")}>
              {metCount}/{cl.items.length} met
            </span>
          )}
        </button>
        <button onClick={() => onDelete(cl.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded hover:bg-destructive/10 flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="border-t border-border p-4 space-y-3">
          {cl.description !== undefined && (
            <InlineEdit value={cl.description} onSave={desc => onUpdate(cl.id, cl.name, desc)}
              placeholder="Checklist description…" className="text-xs text-muted-foreground" multiline />
          )}

          {cl.items.map(item => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              onUpdate={onUpdateItem}
              onDelete={onDeleteItem}
              onToggleMet={onToggleMet}
              onAddEvidence={onAddEvidence}
              onUpdateEvidence={onUpdateEvidence}
              onDeleteEvidence={onDeleteEvidence}
              onAddUrl={onAddUrl}
              onDeleteUrl={onDeleteUrl}
              onUploadFile={onUploadFile}
              onDeleteFile={onDeleteFile}
            />
          ))}

          <button
            onClick={() => onAddItem(cl.id)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-secondary w-full"
          >
            <Plus className="w-3.5 h-3.5" />Add Checklist Item
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function ChecklistPanel({ process, onClose }: { process: Process; onClose: () => void }) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/checklists?processId=${process.id}`);
      if (r.ok) setChecklists(await r.json());
    } finally { setLoading(false); }
  }, [process.id]);

  useEffect(() => { load(); }, [load]);

  // ── Checklist operations ──

  const addChecklist = async () => {
    const r = await fetch(`${API}/checklists`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: process.id, name: "New Checklist" }),
    });
    if (r.ok) { const cl = await r.json(); setChecklists(prev => [...prev, cl]); }
  };

  const updateChecklist = async (id: number, name: string, description: string) => {
    const r = await fetch(`${API}/checklists/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (r.ok) { const cl = await r.json(); setChecklists(prev => prev.map(c => c.id === id ? { ...c, ...cl } : c)); }
  };

  const deleteChecklist = async (id: number) => {
    if (!confirm("Delete this checklist and all its items?")) return;
    await fetch(`${API}/checklists/${id}`, { method: "DELETE" });
    setChecklists(prev => prev.filter(c => c.id !== id));
  };

  // ── Checklist item operations ──

  const addItem = async (checklistId: number) => {
    const r = await fetch(`${API}/checklist-items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistId, name: "New Item" }),
    });
    if (r.ok) {
      const item = await r.json();
      setChecklists(prev => prev.map(cl => cl.id === checklistId
        ? { ...cl, items: [...cl.items, item] }
        : cl));
    }
  };

  const updateItem = async (itemId: number, name: string, description: string) => {
    const r = await fetch(`${API}/checklist-items/${itemId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (r.ok) {
      setChecklists(prev => prev.map(cl => ({
        ...cl,
        items: cl.items.map(i => i.id === itemId ? { ...i, name, description } : i),
      })));
    }
  };

  const deleteItem = async (itemId: number) => {
    await fetch(`${API}/checklist-items/${itemId}`, { method: "DELETE" });
    setChecklists(prev => prev.map(cl => ({ ...cl, items: cl.items.filter(i => i.id !== itemId) })));
  };

  const toggleMet = async (itemId: number, met: boolean) => {
    await fetch(`${API}/checklist-items/${itemId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ met }),
    });
    setChecklists(prev => prev.map(cl => ({
      ...cl,
      items: cl.items.map(i => i.id === itemId ? { ...i, met } : i),
    })));
  };

  // ── Evidence item operations ──

  const addEvidence = async (checklistItemId: number) => {
    const r = await fetch(`${API}/evidence-items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistItemId, name: "New Evidence" }),
    });
    if (r.ok) {
      const ev = await r.json();
      setChecklists(prev => prev.map(cl => ({
        ...cl,
        items: cl.items.map(i => i.id === checklistItemId
          ? { ...i, evidenceItems: [...i.evidenceItems, ev] }
          : i),
      })));
    }
  };

  const updateEvidence = async (evId: number, name: string, description: string) => {
    const r = await fetch(`${API}/evidence-items/${evId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (r.ok) {
      setChecklists(prev => prev.map(cl => ({
        ...cl,
        items: cl.items.map(i => ({
          ...i,
          evidenceItems: i.evidenceItems.map(e => e.id === evId ? { ...e, name, description } : e),
        })),
      })));
    }
  };

  const deleteEvidence = async (evId: number) => {
    await fetch(`${API}/evidence-items/${evId}`, { method: "DELETE" });
    setChecklists(prev => prev.map(cl => ({
      ...cl,
      items: cl.items.map(i => ({ ...i, evidenceItems: i.evidenceItems.filter(e => e.id !== evId) })),
    })));
  };

  // ── URL operations ──

  const addUrl = async (evId: number, url: string, label: string) => {
    const r = await fetch(`${API}/evidence-urls`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceItemId: evId, url, label }),
    });
    if (r.ok) {
      const u = await r.json();
      setChecklists(prev => prev.map(cl => ({
        ...cl,
        items: cl.items.map(i => ({
          ...i,
          evidenceItems: i.evidenceItems.map(e => e.id === evId ? { ...e, urls: [...e.urls, u] } : e),
        })),
      })));
    }
  };

  const deleteUrl = async (urlId: number) => {
    await fetch(`${API}/evidence-urls/${urlId}`, { method: "DELETE" });
    setChecklists(prev => prev.map(cl => ({
      ...cl,
      items: cl.items.map(i => ({
        ...i,
        evidenceItems: i.evidenceItems.map(e => ({ ...e, urls: e.urls.filter(u => u.id !== urlId) })),
      })),
    })));
  };

  // ── File operations ──

  const uploadFile = async (evId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API}/evidence-files/${evId}`, { method: "POST", body: fd });
    if (r.ok) {
      const f = await r.json();
      setChecklists(prev => prev.map(cl => ({
        ...cl,
        items: cl.items.map(i => ({
          ...i,
          evidenceItems: i.evidenceItems.map(e => e.id === evId ? { ...e, files: [...e.files, f] } : e),
        })),
      })));
    }
  };

  const deleteFile = async (fileId: number) => {
    await fetch(`${API}/evidence-files/${fileId}`, { method: "DELETE" });
    setChecklists(prev => prev.map(cl => ({
      ...cl,
      items: cl.items.map(i => ({
        ...i,
        evidenceItems: i.evidenceItems.map(e => ({ ...e, files: e.files.filter(f => f.id !== fileId) })),
      })),
    })));
  };

  const totalItems = checklists.reduce((n, cl) => n + cl.items.length, 0);
  const metItems = checklists.reduce((n, cl) => n + cl.items.filter(i => i.met).length, 0);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[520px] max-w-full z-50 bg-background border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-card/60 flex-none">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary flex-shrink-0" />
              <h2 className="text-base font-bold truncate">{process.processName}</h2>
            </div>
            {process.category && (
              <div className="text-xs text-muted-foreground mt-0.5">{process.category}</div>
            )}
            {totalItems > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                <span className={cn("font-semibold", metItems === totalItems ? "text-green-400" : "text-foreground")}>
                  {metItems}/{totalItems}
                </span> items met across {checklists.length} checklist{checklists.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-none">
            <button
              onClick={addChecklist}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />Add Checklist
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : checklists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <ClipboardList className="w-10 h-10 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium">No checklists yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create a checklist to track compliance items and evidence.</p>
              </div>
              <button onClick={addChecklist} className="text-xs text-primary hover:underline">Create first checklist</button>
            </div>
          ) : checklists.map(cl => (
            <ChecklistAccordion
              key={cl.id}
              cl={cl}
              onUpdate={updateChecklist}
              onDelete={deleteChecklist}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onDeleteItem={deleteItem}
              onToggleMet={toggleMet}
              onAddEvidence={addEvidence}
              onUpdateEvidence={updateEvidence}
              onDeleteEvidence={deleteEvidence}
              onAddUrl={addUrl}
              onDeleteUrl={deleteUrl}
              onUploadFile={uploadFile}
              onDeleteFile={deleteFile}
            />
          ))}
        </div>
      </div>
    </>
  );
}
