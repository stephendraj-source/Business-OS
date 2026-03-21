import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { AlertCircle, Check, ClipboardList, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const API = '/api';

type FieldType = 'text' | 'number' | 'email' | 'textarea' | 'select' | 'checkbox' | 'date';

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder: string;
  required: boolean;
  options: string[];
}

interface PublicFormData {
  id: number;
  name: string;
  description: string;
  fields: string;
}

export function PublicFormPage() {
  const [, params] = useRoute("/f/:slug");
  const slug = params?.slug ?? "";

  const [form, setForm] = useState<PublicFormData | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${API}/forms/public/${slug}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data: PublicFormData | null) => {
        if (!data) return;
        setForm(data);
        let parsed: FormField[] = [];
        try { parsed = JSON.parse(data.fields); } catch {}
        setFields(parsed);
        const init: Record<string, any> = {};
        for (const f of parsed) init[f.id] = f.type === 'checkbox' ? false : '';
        setValues(init);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

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
    setErrors({});
    setSubmitted(false);
  };

  const inputCls = (id: string) => cn(
    "w-full bg-white border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors",
    errors[id] ? "border-red-400" : "border-gray-200 hover:border-gray-300"
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (notFound || !form) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center">
          <ClipboardList className="w-8 h-8 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-700">Form not found</h1>
        <p className="text-sm text-slate-500 max-w-sm">This form link is invalid or the form has been unpublished.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center gap-5 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800 mb-1">Thank you!</h1>
          <p className="text-sm text-slate-500">Your response has been recorded.</p>
        </div>
        <button
          onClick={reset}
          className="mt-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Submit another response
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Form header */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-100">
            <h1 className="text-xl font-bold text-slate-900">{form.name}</h1>
            {form.description && (
              <p className="mt-1.5 text-sm text-slate-500">{form.description}</p>
            )}
          </div>

          {/* Form body */}
          {fields.length === 0 ? (
            <div className="px-8 py-12 text-center text-slate-400 text-sm">This form has no fields.</div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="px-8 py-6 space-y-5">
              {fields.map(field => (
                <div key={field.id}>
                  {field.type !== 'checkbox' && (
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {field.label || <span className="italic text-slate-400">Untitled field</span>}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                  )}

                  {field.type === 'text' && (
                    <input type="text" value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      placeholder={field.placeholder || 'Enter text…'} className={inputCls(field.id)} />
                  )}
                  {field.type === 'textarea' && (
                    <textarea value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      placeholder={field.placeholder || 'Enter text…'} rows={4}
                      className={cn(inputCls(field.id), 'resize-none')} />
                  )}
                  {field.type === 'number' && (
                    <input type="number" value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      placeholder={field.placeholder || '0'} className={inputCls(field.id)} />
                  )}
                  {field.type === 'email' && (
                    <input type="email" value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      placeholder={field.placeholder || 'email@example.com'} className={inputCls(field.id)} />
                  )}
                  {field.type === 'date' && (
                    <input type="date" value={values[field.id] ?? ''} onChange={e => set(field.id, e.target.value)}
                      className={inputCls(field.id)} />
                  )}
                  {field.type === 'checkbox' && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!values[field.id]}
                        onChange={e => set(field.id, e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded accent-primary flex-shrink-0" />
                      <span className="text-sm text-slate-700">
                        {field.label || <span className="italic text-slate-400">Untitled field</span>}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
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
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      {errors[field.id]}
                    </p>
                  )}
                </div>
              ))}

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Submit
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">Powered by BusinessOS</p>
      </div>
    </div>
  );
}
