import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Plus, Trash2, Upload, ExternalLink, Edit2, Check, X, Download, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = '/api';

type GovernanceDoc = {
  id: number;
  governanceId: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  uploadedAt: string;
};

type GovernanceStandard = {
  id: number;
  complianceName: string;
  complianceAuthority: string;
  referenceUrl: string;
  createdAt: string;
  documents: GovernanceDoc[];
};

type EditState = { complianceName: string; complianceAuthority: string; referenceUrl: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  return '📎';
}

export function GovernanceView() {
  const [standards, setStandards] = useState<GovernanceStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [editState, setEditState] = useState<EditState>({ complianceName: '', complianceAuthority: '', referenceUrl: '' });
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savingId, setSavingId] = useState<number | 'new' | null>(null);
  const [aiPopulating, setAiPopulating] = useState(false);
  const [aiPopulateError, setAiPopulateError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/governance`);
      const data = await res.json();
      setStandards(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function startEdit(s: GovernanceStandard) {
    setEditingId(s.id);
    setEditState({ complianceName: s.complianceName, complianceAuthority: s.complianceAuthority, referenceUrl: s.referenceUrl });
  }

  function startNew() {
    setEditingId('new');
    setEditState({ complianceName: '', complianceAuthority: '', referenceUrl: '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState({ complianceName: '', complianceAuthority: '', referenceUrl: '' });
    setAiPopulateError(null);
  }

  async function aiPopulate() {
    if (!editState.complianceName.trim()) return;
    setAiPopulating(true);
    setAiPopulateError(null);
    try {
      const res = await fetch(`${API}/governance/ai-populate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complianceName: editState.complianceName }),
      });
      if (!res.ok) throw new Error('AI request failed');
      const data = await res.json() as { complianceAuthority?: string; referenceUrl?: string };
      setEditState(prev => ({
        ...prev,
        complianceAuthority: prev.complianceAuthority.trim() ? prev.complianceAuthority : (data.complianceAuthority ?? prev.complianceAuthority),
        referenceUrl: prev.referenceUrl.trim() ? prev.referenceUrl : (data.referenceUrl ?? prev.referenceUrl),
      }));
    } catch {
      setAiPopulateError('AI could not populate fields. Please try again.');
    } finally {
      setAiPopulating(false);
    }
  }

  async function saveEdit() {
    if (!editState.complianceName.trim()) return;
    setSavingId(editingId);
    try {
      if (editingId === 'new') {
        await fetch(`${API}/governance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editState),
        });
      } else {
        await fetch(`${API}/governance/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editState),
        });
      }
      await load();
      cancelEdit();
    } finally {
      setSavingId(null);
    }
  }

  async function deleteStandard(id: number) {
    setDeletingId(id);
    try {
      await fetch(`${API}/governance/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleFileUpload(governanceId: number, files: FileList) {
    if (!files.length) return;
    setUploadingFor(governanceId);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    try {
      await fetch(`${API}/governance/${governanceId}/documents`, { method: 'POST', body: formData });
      await load();
    } finally {
      setUploadingFor(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function deleteDocument(docId: number) {
    await fetch(`${API}/governance/documents/${docId}`, { method: 'DELETE' });
    await load();
  }

  function viewDocument(docId: number, mime: string, name: string) {
    const url = `${API}/governance/documents/${docId}`;
    const isViewable = mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('text/');
    if (isViewable) {
      window.open(url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none p-5 border-b border-border bg-card flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Governance
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage compliance standards and upload supporting documents.
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Standard
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Add new row inline */}
        {editingId === 'new' && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">New Governance Standard</div>
            <EditForm
              state={editState}
              onChange={setEditState}
              onSave={saveEdit}
              onCancel={cancelEdit}
              saving={savingId === 'new'}
              onAiPopulate={aiPopulate}
              aiPopulating={aiPopulating}
              aiPopulateError={aiPopulateError}
            />
          </div>
        )}

        {/* Governance standards list */}
        {standards.length === 0 && editingId !== 'new' ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No governance standards yet.</p>
            <button onClick={startNew} className="mt-3 text-sm text-primary hover:underline">Add your first standard</button>
          </div>
        ) : (
          standards.map(s => (
            <GovernanceCard
              key={s.id}
              standard={s}
              isEditing={editingId === s.id}
              editState={editState}
              onEditStart={() => startEdit(s)}
              onEditChange={setEditState}
              onEditSave={saveEdit}
              onEditCancel={cancelEdit}
              onDelete={() => deleteStandard(s.id)}
              onUpload={(files) => handleFileUpload(s.id, files)}
              onDeleteDoc={deleteDocument}
              onViewDoc={viewDocument}
              uploadingFor={uploadingFor}
              deletingId={deletingId}
              savingId={savingId}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EditForm({
  state,
  onChange,
  onSave,
  onCancel,
  saving,
  onAiPopulate,
  aiPopulating,
  aiPopulateError,
}: {
  state: EditState;
  onChange: (s: EditState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  onAiPopulate?: () => Promise<void>;
  aiPopulating?: boolean;
  aiPopulateError?: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Compliance Name *</label>
          <input
            autoFocus
            type="text"
            value={state.complianceName}
            onChange={e => onChange({ ...state, complianceName: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && onSave()}
            placeholder="e.g. PDPA"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Compliance Authority</label>
          <input
            type="text"
            value={state.complianceAuthority}
            onChange={e => onChange({ ...state, complianceAuthority: e.target.value })}
            placeholder="e.g. PDPC Singapore"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reference URL</label>
          <input
            type="url"
            value={state.referenceUrl}
            onChange={e => onChange({ ...state, referenceUrl: e.target.value })}
            placeholder="https://..."
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* AI populate hint / error */}
      {onAiPopulate && (
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}
      {onAiPopulate && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onAiPopulate}
            disabled={aiPopulating || !state.complianceName.trim()}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2 text-xs rounded-lg font-medium border transition-all",
              "bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/50",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {aiPopulating
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up with AI...</>
              : <><Sparkles className="w-3.5 h-3.5" /> Auto-fill Authority &amp; URL with AI</>
            }
          </button>
          {aiPopulateError && (
            <p className="text-xs text-red-400 text-center">{aiPopulateError}</p>
          )}
          {!aiPopulateError && !aiPopulating && (
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Enter the compliance name above and AI will suggest the authority and reference URL.
              Existing values won't be overwritten.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving || !state.complianceName.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-all"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}

function GovernanceCardBody({ standard }: { standard: GovernanceStandard }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setExpanded(e => !e)}
          className="font-semibold text-foreground text-base hover:text-primary transition-colors text-left group flex items-center gap-1.5"
          title={expanded ? "Collapse details" : "Click to view details"}
        >
          {standard.complianceName}
          <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
            {expanded ? '▲' : '▼'}
          </span>
        </button>
        {standard.documents.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
            {standard.documents.length} doc{standard.documents.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {expanded && (
        <div className="space-y-1.5 pl-1">
          {standard.complianceAuthority && (
            <div className="text-sm text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Authority: </span>
              {standard.complianceAuthority}
            </div>
          )}
          {standard.referenceUrl && (
            <a
              href={standard.referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              {standard.referenceUrl}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function GovernanceCard({
  standard,
  isEditing,
  editState,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onUpload,
  onDeleteDoc,
  onViewDoc,
  uploadingFor,
  deletingId,
  savingId,
}: {
  standard: GovernanceStandard;
  isEditing: boolean;
  editState: EditState;
  onEditStart: () => void;
  onEditChange: (s: EditState) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
  onUpload: (files: FileList) => void;
  onDeleteDoc: (id: number) => void;
  onViewDoc: (id: number, mime: string, name: string) => void;
  uploadingFor: number | null;
  deletingId: number | null;
  savingId: number | 'new' | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border bg-card transition-all",
      isEditing ? "border-primary/40 shadow-md shadow-primary/10" : "border-border"
    )}>
      {/* Card header */}
      <div className="flex items-start justify-between p-4 gap-4">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <EditForm
              state={editState}
              onChange={onEditChange}
              onSave={onEditSave}
              onCancel={onEditCancel}
              saving={savingId === standard.id}
            />
          ) : (
            <GovernanceCardBody standard={standard} />
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onEditStart}
              title="Edit"
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setConfirmDelete(false); onDelete(); }}
                  disabled={deletingId === standard.id}
                  className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold"
                >
                  {deletingId === standard.id ? '...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-[10px] rounded bg-secondary text-muted-foreground hover:bg-secondary/80 font-semibold"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete"
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Documents section */}
      {!isEditing && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Documents
            </span>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingFor === standard.id}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
            >
              {uploadingFor === standard.id
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                : <><Upload className="w-3.5 h-3.5" /> Upload</>
              }
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => e.target.files && onUpload(e.target.files)}
            />
          </div>

          {standard.documents.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {standard.documents.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors group"
                >
                  <span className="text-base flex-shrink-0">{getFileIcon(doc.mimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onViewDoc(doc.id, doc.mimeType, doc.originalName)}
                      className="text-xs font-medium text-foreground hover:text-primary truncate block w-full text-left transition-colors"
                      title={doc.originalName}
                    >
                      {doc.originalName}
                    </button>
                    <div className="text-[10px] text-muted-foreground">{formatBytes(doc.fileSize)}</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onViewDoc(doc.id, doc.mimeType, doc.originalName)}
                      title="View / Download"
                      className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteDoc(doc.id)}
                      title="Delete document"
                      className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
