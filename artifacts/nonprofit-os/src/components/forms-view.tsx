import { useState, useEffect, useCallback, useRef } from "react";
import {
  ClipboardList, Plus, Trash2, Save, Edit2, Loader2, X, Check,
  GripVertical, Type, Hash, Mail, AlignLeft, ChevronDown, Calendar,
  CheckSquare, List, Eye, Code2, Copy,
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
  createdAt: string;
  updatedAt: string;
}

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

// ── Field Editor Row ──────────────────────────────────────────────────────────

function FieldRow({
  field, onUpdate, onDelete,
}: {
  field: FormField;
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
}) {
  const [optionInput, setOptionInput] = useState("");

  const addOption = () => {
    if (!optionInput.trim()) return;
    onUpdate({ options: [...field.options, optionInput.trim()] });
    setOptionInput("");
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2.5 group">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 cursor-grab flex-shrink-0" />

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

      {/* Placeholder (not for checkbox) */}
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

function FormPreview({ fields }: { fields: FormField[] }) {
  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No fields yet — add fields to preview the form</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-sm mx-auto py-4">
      {fields.map(field => (
        <div key={field.id}>
          <label className="block text-sm font-medium mb-1">
            {field.label || <span className="italic text-muted-foreground">Untitled field</span>}
            {field.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {field.type === 'text' && (
            <input readOnly placeholder={field.placeholder || "Enter text…"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          )}
          {field.type === 'textarea' && (
            <textarea readOnly placeholder={field.placeholder || "Enter text…"} rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none" />
          )}
          {field.type === 'number' && (
            <input readOnly type="number" placeholder={field.placeholder || "0"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          )}
          {field.type === 'email' && (
            <input readOnly type="email" placeholder={field.placeholder || "email@example.com"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          )}
          {field.type === 'date' && (
            <input readOnly type="date"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          )}
          {field.type === 'checkbox' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" readOnly className="w-4 h-4 rounded" />
              <span className="text-sm text-muted-foreground">{field.label}</span>
            </label>
          )}
          {field.type === 'select' && (
            <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm">
              <option value="">Select an option…</option>
              {field.options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
            </select>
          )}
        </div>
      ))}
    </div>
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
  const [tab, setTab] = useState<'build' | 'preview' | 'json'>('build');
  const [copied, setCopied] = useState(false);

  const selectedForm = forms.find(f => f.id === selectedId) ?? null;

  const fetchForms = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/forms`, { headers: fetchHeaders() });
      const data = await r.json();
      if (Array.isArray(data)) setForms(data);
    } catch {}
    finally { setLoading(false); }
  }, [fetchHeaders]);

  useEffect(() => { fetchForms(); }, [fetchForms]);

  const loadForm = useCallback(async (id: number) => {
    const r = await fetch(`${API}/forms/${id}`, { headers: fetchHeaders() });
    if (r.ok) {
      const form: FormSummary = await r.json();
      setEditName(form.name);
      setEditDesc(form.description);
      setEditNumber(form.formNumber);
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
      await fetch(`${API}/forms/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...fetchHeaders() },
        body: JSON.stringify({
          formNumber: editNumber,
          name: editName,
          description: editDesc,
          fields: JSON.stringify(fields),
        }),
      });
      await fetchForms();
      setDirty(false);
    } finally { setSaving(false); }
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

  const sampleJson = buildSampleJson(fields);

  const copyJson = () => {
    navigator.clipboard.writeText(sampleJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full bg-background">

      {/* Left panel — form list */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col bg-sidebar/40">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Forms</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{forms.length}</span>
          </div>
          <button
            onClick={createForm}
            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : forms.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <ClipboardList className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No forms yet.</p>
              <button onClick={createForm} className="mt-2 text-xs text-primary hover:underline">Create your first form</button>
            </div>
          ) : forms.map(form => {
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
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ClipboardList className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground font-mono">#{form.formNumber}</span>
                    <span className="text-sm font-medium truncate">{form.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{form.description || "No description"}</div>
                  {fieldCount > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
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
        </div>
      </div>

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
              { key: 'build',   label: 'Build',   icon: <List className="w-3.5 h-3.5" /> },
              { key: 'preview', label: 'Preview',  icon: <Eye className="w-3.5 h-3.5" /> },
              { key: 'json',    label: 'JSON Output', icon: <Code2 className="w-3.5 h-3.5" /> },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 min-h-0 overflow-auto">

            {tab === 'build' && (
              <div className="p-6 space-y-3 max-w-2xl mx-auto">

                {/* Field list */}
                {fields.map(field => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    onUpdate={updates => updateField(field.id, updates)}
                    onDelete={() => deleteField(field.id)}
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
              <div className="p-6">
                <div className="max-w-sm mx-auto bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-semibold mb-0.5">{editName || "Untitled Form"}</h3>
                  {editDesc && <p className="text-sm text-muted-foreground mb-4">{editDesc}</p>}
                  <FormPreview fields={fields} />
                  {fields.length > 0 && (
                    <button className="mt-4 w-full py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
                      Submit
                    </button>
                  )}
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
          </div>
        </div>
      )}
    </div>
  );
}
