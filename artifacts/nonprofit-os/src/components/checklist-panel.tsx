import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, Check,
  Upload, Download, Link2, Loader2, Edit2, ClipboardList, FileText, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = '/api';

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

function EvidenceItemCard({ ev, onUpdate, onDelete, onAddUrl, onDeleteUrl, onUploadFile, onDeleteFile }: {
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
    <div className="border border-border/50 rounded-xl bg-background/50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <InlineEdit value={ev.name} onSave={name => onUpdate(ev.id, name, ev.description)}
            placeholder="Evidence name…" className="text-sm font-semibold" />
          <InlineEdit value={ev.description} onSave={desc => onUpdate(ev.id, ev.name, desc)}
            placeholder="Description…" className="text-xs text-muted-foreground" multiline />
        </div>
        <button onClick={() => onDelete(ev.id)} className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0 mt-0.5 p-1 rounded hover:bg-destructive/10">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {ev.urls.length > 0 && (
        <div className="space-y-1.5">
          {ev.urls.map(u => (
            <div key={u.id} className="flex items-center gap-2 text-xs group bg-secondary/30 rounded px-2 py-1.5">
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

      {ev.files.length > 0 && (
        <div className="space-y-1.5">
          {ev.files.map(f => (
            <div key={f.id} className="flex items-center gap-2 text-xs group bg-secondary/30 rounded px-2 py-1.5">
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

      {addingUrl && (
        <div className="space-y-1.5 bg-secondary/20 rounded-lg p-2">
          <input value={newUrlLabel} onChange={e => setNewUrlLabel(e.target.value)}
            placeholder="Label (optional)…" className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex gap-1">
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
              placeholder="https://…" type="url"
              onKeyDown={e => { if (e.key === 'Enter') submitUrl(); if (e.key === 'Escape') setAddingUrl(false); }}
              className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={submitUrl} className="px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded font-medium">Add</button>
            <button onClick={() => setAddingUrl(false)} className="px-2.5 py-1 text-muted-foreground text-xs rounded hover:bg-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-border/50">
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

function EvidenceDetailPanel({ item, checklistName, processName, onBack, onToggleMet, onUpdate,
  onAddEvidence, onUpdateEvidence, onDeleteEvidence, onAddUrl, onDeleteUrl, onUploadFile, onDeleteFile }: {
  item: ChecklistItem;
  checklistName: string;
  processName: string;
  onBack: () => void;
  onToggleMet: (id: number, met: boolean) => void;
  onUpdate: (id: number, name: string, desc: string) => void;
  onAddEvidence: (itemId: number) => void;
  onUpdateEvidence: (evId: number, name: string, desc: string) => void;
  onDeleteEvidence: (evId: number) => void;
  onAddUrl: (evId: number, url: string, label: string) => void;
  onDeleteUrl: (urlId: number) => void;
  onUploadFile: (evId: number, file: File) => void;
  onDeleteFile: (fileId: number) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/60 flex-none">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" />Back
        </button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1 truncate">
          <ClipboardList className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span className="truncate">{processName}</span>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="truncate">{checklistName}</span>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-border/60 bg-secondary/20 flex-none space-y-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => onToggleMet(item.id, !item.met)}
            className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all",
              item.met ? "bg-green-500 border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "border-muted-foreground hover:border-green-500"
            )}
            title="Toggle met status"
          >
            {item.met && <Check className="w-3.5 h-3.5 text-white" />}
          </button>
          <div className="flex-1 min-w-0">
            <InlineEdit value={item.name} onSave={name => onUpdate(item.id, name, item.description)}
              placeholder="Item name…" className="text-base font-semibold" />
            <InlineEdit value={item.description} onSave={desc => onUpdate(item.id, item.name, desc)}
              placeholder="Add a description…" className="text-sm text-muted-foreground mt-1" multiline />
          </div>
          <span className={cn(
            "text-xs font-semibold px-2 py-1 rounded-full shrink-0",
            item.met ? "bg-green-500/15 text-green-400" : "bg-secondary text-muted-foreground"
          )}>
            {item.met ? "Met" : "Not Met"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Evidence Items {item.evidenceItems.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium normal-case">{item.evidenceItems.length}</span>}
          </div>
          <button
            onClick={() => onAddEvidence(item.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />Add Evidence
          </button>
        </div>

        {item.evidenceItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3 border-2 border-dashed border-border/50 rounded-xl">
            <FileText className="w-8 h-8 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No evidence yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add URLs, files, or notes to support this checklist item.</p>
            </div>
            <button onClick={() => onAddEvidence(item.id)} className="text-xs text-primary hover:underline">Add first evidence item</button>
          </div>
        ) : (
          <div className="space-y-3">
            {item.evidenceItems.map(ev => (
              <EvidenceItemCard
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
          </div>
        )}
      </div>
    </>
  );
}

function ChecklistItemRow({ item, onDelete, onToggleMet, onDrillInto }: {
  item: ChecklistItem;
  onDelete: (id: number) => void;
  onToggleMet: (id: number, met: boolean) => void;
  onDrillInto: (itemId: number) => void;
}) {
  return (
    <div
      className={cn(
        "border rounded-xl transition-all cursor-pointer group hover:shadow-sm",
        item.met
          ? "border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-500/50"
          : "border-border bg-card/50 hover:bg-secondary/40 hover:border-primary/20"
      )}
      onClick={() => onDrillInto(item.id)}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          onClick={e => { e.stopPropagation(); onToggleMet(item.id, !item.met); }}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
            item.met ? "bg-green-500 border-green-500" : "border-muted-foreground hover:border-green-500"
          )}
          title="Toggle met"
        >
          {item.met && <Check className="w-3 h-3 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-medium truncate", !item.name && "italic text-muted-foreground/40")}>
            {item.name || "Untitled item"}
          </div>
          {item.description && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {item.evidenceItems.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
              {item.evidenceItems.length}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete(item.id); }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all p-1 rounded hover:bg-destructive/10"
            title="Delete item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </div>
      </div>
    </div>
  );
}

function ChecklistAccordion({ cl, onUpdate, onDelete, onAddItem, onDeleteItem, onToggleMet, onDrillInto }: {
  cl: Checklist;
  onUpdate: (id: number, name: string, desc: string) => void;
  onDelete: (id: number) => void;
  onAddItem: (clId: number) => void;
  onDeleteItem: (itemId: number) => void;
  onToggleMet: (itemId: number, met: boolean) => void;
  onDrillInto: (itemId: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const metCount = cl.items.filter(i => i.met).length;

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-card hover:bg-secondary/30 transition-colors">
        <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          <InlineEdit value={cl.name} onSave={name => onUpdate(cl.id, name, cl.description)}
            placeholder="Checklist name…" className="text-sm font-semibold flex-1 truncate" />
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
        <div className="border-t border-border p-4 space-y-2">
          {cl.description !== undefined && cl.description && (
            <InlineEdit value={cl.description} onSave={desc => onUpdate(cl.id, cl.name, desc)}
              placeholder="Checklist description…" className="text-xs text-muted-foreground" multiline />
          )}

          {cl.items.length === 0 ? (
            <div className="text-xs text-muted-foreground/50 text-center py-3 italic">No items yet — add one below.</div>
          ) : cl.items.map(item => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              onDelete={onDeleteItem}
              onToggleMet={onToggleMet}
              onDrillInto={onDrillInto}
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

export function ChecklistPanel({ process, onClose, fullPage = false }: {
  process: Process;
  onClose: () => void;
  fullPage?: boolean;
}) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedChecklistName, setSelectedChecklistName] = useState('');

  const currentItem = useMemo(
    () => selectedItemId ? checklists.flatMap(cl => cl.items).find(i => i.id === selectedItemId) ?? null : null,
    [checklists, selectedItemId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/checklists?processId=${process.id}`);
      if (r.ok) setChecklists(await r.json());
    } finally { setLoading(false); }
  }, [process.id]);

  useEffect(() => { load(); }, [load]);

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
        ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, name, description } : i),
      })));
    }
  };

  const deleteItem = async (itemId: number) => {
    await fetch(`${API}/checklist-items/${itemId}`, { method: "DELETE" });
    setChecklists(prev => prev.map(cl => ({ ...cl, items: cl.items.filter(i => i.id !== itemId) })));
    if (selectedItemId === itemId) setSelectedItemId(null);
  };

  const toggleMet = async (itemId: number, met: boolean) => {
    await fetch(`${API}/checklist-items/${itemId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ met }),
    });
    setChecklists(prev => prev.map(cl => ({
      ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, met } : i),
    })));
  };

  const addEvidence = async (checklistItemId: number) => {
    const r = await fetch(`${API}/evidence-items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistItemId, name: "New Evidence" }),
    });
    if (r.ok) {
      const ev = await r.json();
      setChecklists(prev => prev.map(cl => ({
        ...cl, items: cl.items.map(i => i.id === checklistItemId
          ? { ...i, evidenceItems: [...i.evidenceItems, ev] } : i),
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
        ...cl, items: cl.items.map(i => ({
          ...i, evidenceItems: i.evidenceItems.map(e => e.id === evId ? { ...e, name, description } : e),
        })),
      })));
    }
  };

  const deleteEvidence = async (evId: number) => {
    await fetch(`${API}/evidence-items/${evId}`, { method: "DELETE" });
    setChecklists(prev => prev.map(cl => ({
      ...cl, items: cl.items.map(i => ({ ...i, evidenceItems: i.evidenceItems.filter(e => e.id !== evId) })),
    })));
  };

  const addUrl = async (evId: number, url: string, label: string) => {
    const r = await fetch(`${API}/evidence-urls`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidenceItemId: evId, url, label }),
    });
    if (r.ok) {
      const u = await r.json();
      setChecklists(prev => prev.map(cl => ({
        ...cl, items: cl.items.map(i => ({
          ...i, evidenceItems: i.evidenceItems.map(e => e.id === evId ? { ...e, urls: [...e.urls, u] } : e),
        })),
      })));
    }
  };

  const deleteUrl = async (urlId: number) => {
    await fetch(`${API}/evidence-urls/${urlId}`, { method: "DELETE" });
    setChecklists(prev => prev.map(cl => ({
      ...cl, items: cl.items.map(i => ({
        ...i, evidenceItems: i.evidenceItems.map(e => ({ ...e, urls: e.urls.filter(u => u.id !== urlId) })),
      })),
    })));
  };

  const uploadFile = async (evId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API}/evidence-files/${evId}`, { method: "POST", body: fd });
    if (r.ok) {
      const f = await r.json();
      setChecklists(prev => prev.map(cl => ({
        ...cl, items: cl.items.map(i => ({
          ...i, evidenceItems: i.evidenceItems.map(e => e.id === evId ? { ...e, files: [...e.files, f] } : e),
        })),
      })));
    }
  };

  const deleteFile = async (fileId: number) => {
    await fetch(`${API}/evidence-files/${fileId}`, { method: "DELETE" });
    setChecklists(prev => prev.map(cl => ({
      ...cl, items: cl.items.map(i => ({
        ...i, evidenceItems: i.evidenceItems.map(e => ({ ...e, files: e.files.filter(f => f.id !== fileId) })),
      })),
    })));
  };

  const totalItems = checklists.reduce((n, cl) => n + cl.items.length, 0);
  const metItems = checklists.reduce((n, cl) => n + cl.items.filter(i => i.met).length, 0);

  const containerClass = fullPage
    ? "h-full flex flex-col bg-background"
    : "fixed right-0 top-0 h-full w-[540px] max-w-full z-50 bg-background border-l border-border shadow-2xl flex flex-col";

  return (
    <>
      {!fullPage && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { if (!currentItem) onClose(); }} />}
      <div className={containerClass}>
        {currentItem ? (
          <EvidenceDetailPanel
            item={currentItem}
            checklistName={selectedChecklistName}
            processName={process.processName}
            onBack={() => setSelectedItemId(null)}
            onToggleMet={toggleMet}
            onUpdate={updateItem}
            onAddEvidence={addEvidence}
            onUpdateEvidence={updateEvidence}
            onDeleteEvidence={deleteEvidence}
            onAddUrl={addUrl}
            onDeleteUrl={deleteUrl}
            onUploadFile={uploadFile}
            onDeleteFile={deleteFile}
          />
        ) : (
          <>
            <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-card/60 flex-none">
              <div className="flex-1 min-w-0">
                {fullPage && (
                  <button
                    onClick={onClose}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    <ArrowLeft className="w-4 h-4" />Back to Process
                  </button>
                )}
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
              <div className="flex items-center gap-2 flex-none ml-3">
                <button
                  onClick={addChecklist}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />Add Checklist
                </button>
                {!fullPage && (
                  <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

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
              ) : (
                checklists.map(cl => (
                  <ChecklistAccordion
                    key={cl.id}
                    cl={cl}
                    onUpdate={updateChecklist}
                    onDelete={deleteChecklist}
                    onAddItem={addItem}
                    onDeleteItem={deleteItem}
                    onToggleMet={toggleMet}
                    onDrillInto={(itemId) => {
                      setSelectedItemId(itemId);
                      setSelectedChecklistName(cl.name);
                    }}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
