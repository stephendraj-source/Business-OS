import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, Loader2, Clock,
  X, MapPin, User, Flag, CheckCircle2, Circle, RefreshCw,
  Plus, Pencil, Trash2, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUSINESS_OS_TOKEN_KEY, LEGACY_NONPROFIT_OS_TOKEN_KEY, getStoredValue } from '@/lib/storage';

const API = '/api';

function fetchHeaders(): Record<string, string> {
  const token = getStoredValue(BUSINESS_OS_TOKEN_KEY, LEGACY_NONPROFIT_OS_TOKEN_KEY);
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

type CalView = 'work-week' | 'week' | 'month' | 'year';

interface CalEvent {
  id: string;
  originalId: number;
  title: string;
  date: Date;
  type: 'meeting' | 'task' | 'calendar';
  color: string;
  time?: string;
  hour?: number;
  // meeting extras
  location?: string;
  meetingType?: string;
  organizerName?: string;
  // task extras
  status?: string;
  priority?: string;
  assignee?: string;
  description?: string;
  // calendar event extras
  endTime?: Date;
  allDay?: boolean;
}

// ── DB calendar event shape ────────────────────────────────────────────────────
interface DbCalendarEvent {
  id: number;
  tenant_id: number | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
  color: string;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const EVENT_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

function startOfWeekMon(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isToday(d: Date): boolean { return isSameDay(d, new Date()); }

function datesInRange(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

function eventsOnDay(events: CalEvent[], day: Date): CalEvent[] {
  return events.filter(e => isSameDay(e.date, day));
}

function formatDateRange(days: Date[]): string {
  if (!days.length) return '';
  const first = days[0];
  const last = days[days.length - 1];
  if (first.getMonth() === last.getMonth()) {
    return `${MONTHS[first.getMonth()]} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
  }
  return `${MONTHS[first.getMonth()]} ${first.getDate()} – ${MONTHS[last.getMonth()]} ${last.getDate()}, ${first.getFullYear()}`;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDateValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const VISIBLE_HOURS = HOURS.slice(6, 22);
const ROW_H = 48;

function fmtHour(h: number) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

// ── Event Modal ────────────────────────────────────────────────────────────────

interface ModalState {
  mode: 'create' | 'edit';
  id?: number; // DB id for edit mode
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
  color: string;
}

interface EventModalProps {
  state: ModalState;
  onClose: () => void;
  onSave: (state: ModalState) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function EventModal({ state: initial, onClose, onSave, onDelete }: EventModalProps) {
  const [form, setForm] = useState<ModalState>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  function set<K extends keyof ModalState>(key: K, value: ModalState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            {form.mode === 'create' ? 'New Event' : 'Edit Event'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title *</label>
            <input
              autoFocus
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Event title"
              className="w-full text-sm bg-secondary/50 border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* All-day toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => set('allDay', !form.allDay)}
              className={cn(
                'w-9 h-5 rounded-full transition-colors relative',
                form.allDay ? 'bg-emerald-500' : 'bg-secondary'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                form.allDay ? 'translate-x-4' : 'translate-x-0.5'
              )} />
            </div>
            <span className="text-xs text-muted-foreground">All day</span>
          </label>

          {/* Date / time */}
          {form.allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Start date *</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  className="w-full text-sm bg-secondary/50 border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">End date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => set('endDate', e.target.value)}
                  className="w-full text-sm bg-secondary/50 border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Start *</label>
                <input
                  type="datetime-local"
                  value={`${form.startDate}T${form.startTime}`}
                  onChange={e => {
                    const [d, t] = e.target.value.split('T');
                    set('startDate', d ?? form.startDate);
                    set('startTime', t ?? form.startTime);
                  }}
                  className="w-full text-sm bg-secondary/50 border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">End</label>
                <input
                  type="datetime-local"
                  value={form.endDate && form.endTime ? `${form.endDate}T${form.endTime}` : ''}
                  onChange={e => {
                    const [d, t] = e.target.value.split('T');
                    set('endDate', d ?? '');
                    set('endTime', t ?? '');
                  }}
                  className="w-full text-sm bg-secondary/50 border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="Add a location"
              className="w-full text-sm bg-secondary/50 border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Add a description"
              className="w-full text-sm bg-secondary/50 border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? 'white' : 'transparent',
                    outline: form.color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '1px',
                  }}
                >
                  {form.color === c && <Check className="w-3 h-3 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <div>
            {form.mode === 'edit' && onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Delete this event?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving…' : form.mode === 'create' ? 'Create' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Event Popover ─────────────────────────────────────────────────────────────

interface PopoverProps {
  event: CalEvent;
  anchorRect: DOMRect;
  onClose: () => void;
  onEdit: (event: CalEvent) => void;
  onDelete: (event: CalEvent) => void;
}

function EventPopover({ event, anchorRect, onClose, onEdit, onDelete }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pw = el.offsetWidth || 280;
    const ph = el.offsetHeight || 220;
    let left = anchorRect.right + 8;
    let top = anchorRect.top;
    if (left + pw > W - 12) left = anchorRect.left - pw - 8;
    if (left < 12) left = 12;
    if (top + ph > H - 12) top = H - ph - 12;
    if (top < 12) top = 12;
    setPos({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isMeeting = event.type === 'meeting';
  const isCalendar = event.type === 'calendar';
  const dateStr = event.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const PRIORITY_COLOR: Record<string, string> = {
    low: 'text-slate-400', normal: 'text-blue-400', medium: 'text-blue-400',
    high: 'text-orange-400', critical: 'text-red-400',
  };
  const STATUS_ICON: Record<string, React.ReactNode> = {
    pending:     <Circle className="w-3 h-3" />,
    in_progress: <RefreshCw className="w-3 h-3" />,
    completed:   <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  };

  return (
    <div
      ref={ref}
      className="fixed z-[9999] w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Header bar */}
      <div className="flex items-start gap-2 p-4 pb-3" style={{ borderBottom: `2px solid ${event.color}30` }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
              style={{ backgroundColor: event.color + '20', color: event.color }}
            >
              {isMeeting ? (event.meetingType ?? 'Meeting') : isCalendar ? 'Event' : 'Task'}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug">{event.title}</h3>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 -mt-0.5">
          {isCalendar && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(event); onClose(); }}
              className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Edit event"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-2.5">
        {/* Date / time */}
        <div className="flex items-start gap-2 text-sm">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-foreground text-xs">{dateStr}</p>
            {event.time && <p className="text-muted-foreground text-[11px] mt-0.5">{event.time}</p>}
          </div>
        </div>

        {event.location && (
          <div className="flex items-center gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{event.location}</span>
          </div>
        )}

        {isMeeting && event.organizerName && (
          <div className="flex items-center gap-2 text-xs">
            <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{event.organizerName}</span>
          </div>
        )}

        {!isMeeting && !isCalendar && event.priority && (
          <div className="flex items-center gap-2 text-xs">
            <Flag className={cn('w-3.5 h-3.5 flex-shrink-0', PRIORITY_COLOR[event.priority] ?? 'text-muted-foreground')} />
            <span className={PRIORITY_COLOR[event.priority] ?? 'text-foreground'}>
              {event.priority} priority
            </span>
          </div>
        )}

        {!isMeeting && !isCalendar && event.status && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex-shrink-0">{STATUS_ICON[event.status] ?? <Circle className="w-3 h-3" />}</span>
            <span className="capitalize text-foreground">{event.status.replace(/_/g, ' ')}</span>
          </div>
        )}

        {!isMeeting && !isCalendar && event.assignee && (
          <div className="flex items-center gap-2 text-xs">
            <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{event.assignee}</span>
          </div>
        )}

        {event.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 pt-1 border-t border-border">
            {event.description}
          </p>
        )}

        {isCalendar && (
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <button
              onClick={e => { e.stopPropagation(); onEdit(event); onClose(); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <span className="text-border">·</span>
            <button
              onClick={e => { e.stopPropagation(); onDelete(event); onClose(); }}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Event Pills / Blocks ──────────────────────────────────────────────────────

function EventPill({
  evt, compact = false, onClick,
}: {
  evt: CalEvent;
  compact?: boolean;
  onClick: (evt: CalEvent, e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={evt.title}
      onClick={e => onClick(evt, e)}
      onKeyDown={e => e.key === 'Enter' && onClick(evt, e as any)}
      className={cn(
        'rounded font-medium truncate leading-tight cursor-pointer transition-opacity hover:opacity-80 select-none',
        compact ? 'text-[10px] px-1 py-0.5' : 'text-xs px-1.5 py-0.5'
      )}
      style={{ backgroundColor: evt.color + '22', color: evt.color, borderLeft: `2px solid ${evt.color}` }}
    >
      {evt.title}
      {!compact && evt.time && (
        <span className="ml-1 text-[10px] opacity-60">{evt.time}</span>
      )}
    </div>
  );
}

function EventBlock({
  evt, onClick,
}: {
  evt: CalEvent;
  onClick: (evt: CalEvent, e: React.MouseEvent) => void;
}) {
  const top = ((evt.hour ?? 0) - 6) * ROW_H;
  return (
    <div
      role="button"
      tabIndex={0}
      className="absolute left-1 right-1 rounded px-1.5 py-0.5 text-[11px] font-medium truncate z-10 shadow-sm cursor-pointer hover:opacity-80 transition-opacity select-none"
      style={{
        top,
        height: ROW_H - 2,
        backgroundColor: evt.color + '28',
        color: evt.color,
        borderLeft: `3px solid ${evt.color}`,
      }}
      title={evt.title}
      onClick={e => onClick(evt, e)}
      onKeyDown={e => e.key === 'Enter' && onClick(evt, e as any)}
    >
      {evt.title}
      {evt.time && <span className="ml-1 opacity-60">{evt.time}</span>}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultModalState(date?: Date): ModalState {
  const d = date ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const startHour = now.getHours();
  const endHour = Math.min(startHour + 1, 23);
  return {
    mode: 'create',
    title: '',
    description: '',
    startDate: dateStr,
    startTime: `${pad(startHour)}:00`,
    endDate: dateStr,
    endTime: `${pad(endHour)}:00`,
    allDay: false,
    location: '',
    color: '#10b981',
  };
}

function calEventToModalState(evt: CalEvent): ModalState {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = evt.date;
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeStr = evt.hour !== undefined ? `${pad(evt.hour)}:00` : '09:00';
  let endDate = dateStr;
  let endTime = '';
  if (evt.endTime) {
    const ed = new Date(evt.endTime);
    endDate = `${ed.getFullYear()}-${pad(ed.getMonth() + 1)}-${pad(ed.getDate())}`;
    endTime = `${pad(ed.getHours())}:${pad(ed.getMinutes())}`;
  }
  return {
    mode: 'edit',
    id: evt.originalId,
    title: evt.title,
    description: evt.description ?? '',
    startDate: dateStr,
    startTime: timeStr,
    endDate,
    endTime,
    allDay: evt.allDay ?? false,
    location: evt.location ?? '',
    color: evt.color,
  };
}

// ── CalendarView ──────────────────────────────────────────────────────────────

export function CalendarView() {
  const [view, setView] = useState<CalView>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Popover
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Modal
  const [modal, setModal] = useState<ModalState | null>(null);

  function openCreateModal(date?: Date) {
    setSelectedEvent(null);
    setModal(defaultModalState(date));
  }

  function openEditModal(evt: CalEvent) {
    setModal(calEventToModalState(evt));
  }

  function handleEventClick(evt: CalEvent, e: React.MouseEvent) {
    e.stopPropagation();
    setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setSelectedEvent(prev => prev?.id === evt.id ? null : evt);
  }

  useEffect(() => {
    if (!selectedEvent) return;
    function handler() { setSelectedEvent(null); }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [selectedEvent]);

  // ── Fetch all events ─────────────────────────────────────────────────────────
  const loadEvents = useCallback(() => {
    const h = fetchHeaders();
    Promise.all([
      fetch(`${API}/meetings`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/tasks`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/calendar-events`, { headers: h }).then(r => r.json()).catch(() => []),
    ]).then(([meetings, tasks, calEvents]) => {
      const evts: CalEvent[] = [];

      if (Array.isArray(meetings)) {
        for (const m of meetings) {
          if (!m.meeting_date) continue;
          const d = new Date(m.meeting_date);
          if (isNaN(d.getTime())) continue;
          evts.push({
            id: `meeting-${m.id}`,
            originalId: m.id,
            title: m.title || 'Meeting',
            date: d,
            type: 'meeting',
            color: '#3b82f6',
            time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
            hour: d.getHours(),
            location: m.location || undefined,
            meetingType: m.meeting_type || undefined,
            organizerName: m.organizer_name || m.organizer_user_name || undefined,
          });
        }
      }

      if (Array.isArray(tasks)) {
        for (const t of tasks) {
          const dateStr = t.endDate || t.end_date;
          if (!dateStr) continue;
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) continue;
          const priority = t.priority ?? 'normal';
          const color = priority === 'critical' ? '#ef4444'
            : priority === 'high' ? '#f59e0b'
            : priority === 'urgent' ? '#ef4444'
            : '#8b5cf6';
          evts.push({
            id: `task-${t.id}`,
            originalId: t.id,
            title: t.name || 'Task',
            date: d,
            type: 'task',
            color,
            hour: 9,
            status: t.status || undefined,
            priority,
            assignee: t.assigned_to_name || undefined,
            description: t.description || undefined,
          });
        }
      }

      if (Array.isArray(calEvents)) {
        for (const ce of calEvents as DbCalendarEvent[]) {
          if (!ce.start_time) continue;
          const d = new Date(ce.start_time);
          if (isNaN(d.getTime())) continue;
          const endTime = ce.end_time ? new Date(ce.end_time) : undefined;
          evts.push({
            id: `calendar-${ce.id}`,
            originalId: ce.id,
            title: ce.title || 'Event',
            date: d,
            type: 'calendar',
            color: ce.color || '#10b981',
            time: ce.all_day ? undefined : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
            hour: ce.all_day ? undefined : d.getHours(),
            location: ce.location || undefined,
            description: ce.description || undefined,
            allDay: ce.all_day,
            endTime,
          });
        }
      }

      setEvents(evts);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Modal save / delete ───────────────────────────────────────────────────────
  async function handleModalSave(form: ModalState) {
    const h = fetchHeaders();
    const startIso = form.allDay
      ? new Date(form.startDate + 'T00:00:00').toISOString()
      : new Date(`${form.startDate}T${form.startTime}`).toISOString();
    const endIso = form.allDay
      ? (form.endDate ? new Date(form.endDate + 'T23:59:59').toISOString() : null)
      : (form.endDate && form.endTime ? new Date(`${form.endDate}T${form.endTime}`).toISOString() : null);

    const body = {
      title: form.title.trim(),
      description: form.description || null,
      start_time: startIso,
      end_time: endIso,
      all_day: form.allDay,
      location: form.location || null,
      color: form.color,
    };

    if (form.mode === 'create') {
      await fetch(`${API}/calendar-events`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(body),
      });
    } else {
      await fetch(`${API}/calendar-events/${form.id}`, {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify(body),
      });
    }

    setModal(null);
    setLoading(true);
    loadEvents();
  }

  async function handleModalDelete(evt: CalEvent) {
    const h = fetchHeaders();
    await fetch(`${API}/calendar-events/${evt.originalId}`, { method: 'DELETE', headers: h });
    setModal(null);
    setLoading(true);
    loadEvents();
  }

  async function handlePopoverDelete(evt: CalEvent) {
    if (!window.confirm(`Delete "${evt.title}"?`)) return;
    const h = fetchHeaders();
    await fetch(`${API}/calendar-events/${evt.originalId}`, { method: 'DELETE', headers: h });
    setLoading(true);
    loadEvents();
  }

  function navigate(dir: 1 | -1) {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (view === 'work-week' || view === 'week') d.setDate(d.getDate() + dir * 7);
      else if (view === 'month') d.setMonth(d.getMonth() + dir);
      else d.setFullYear(d.getFullYear() + dir);
      return d;
    });
  }

  const weekStart = startOfWeekMon(currentDate);
  const workDays = datesInRange(weekStart, 5);
  const fullWeek = datesInRange(weekStart, 7);

  function headerLabel(): string {
    if (view === 'work-week') return formatDateRange(workDays);
    if (view === 'week') return formatDateRange(fullWeek);
    if (view === 'month') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    return String(currentDate.getFullYear());
  }

  // ── Week view ─────────────────────────────────────────────────────────────────
  function WeekView({ days }: { days: Date[] }) {
    const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
    const nowTop = (nowHour - 6) * ROW_H;

    return (
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex flex-shrink-0 border-b border-border">
          <div className="w-14 flex-shrink-0" />
          <div className="flex flex-1">
            {days.map(day => (
              <div
                key={day.toISOString()}
                className={cn('flex-1 py-2 text-center border-l border-border', isToday(day) && 'bg-blue-500/5')}
              >
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                  {DAYS_SHORT[day.getDay()]}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); openCreateModal(day); }}
                  className={cn(
                    'w-8 h-8 mx-auto mt-1 flex items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    isToday(day) ? 'bg-blue-500 text-white' : 'text-foreground hover:bg-secondary'
                  )}
                  title={`New event on ${day.toDateString()}`}
                >
                  {day.getDate()}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex" style={{ height: VISIBLE_HOURS.length * ROW_H }}>
            <div className="w-14 flex-shrink-0 relative">
              {VISIBLE_HOURS.map(h => (
                <div key={h} className="absolute w-full pr-2 text-right" style={{ top: (h - 6) * ROW_H - 7 }}>
                  <span className="text-[10px] text-muted-foreground leading-none">{fmtHour(h)}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-1 relative">
              <div className="absolute inset-0 pointer-events-none">
                {VISIBLE_HOURS.map(h => (
                  <div key={h} className="absolute left-0 right-0 border-t border-border/50" style={{ top: (h - 6) * ROW_H }} />
                ))}
                {VISIBLE_HOURS.map(h => (
                  <div key={`half-${h}`} className="absolute left-0 right-0 border-t border-border/20" style={{ top: (h - 6) * ROW_H + ROW_H / 2 }} />
                ))}
              </div>
              {days.map(day => {
                const dayEvts = eventsOnDay(events, day).filter(e => e.hour !== undefined && e.hour >= 6 && e.hour < 22);
                const allDayEvts = eventsOnDay(events, day).filter(e => e.hour === undefined || e.hour < 6 || e.hour >= 22);
                return (
                  <div key={day.toISOString()} className={cn('flex-1 border-l border-border relative', isToday(day) && 'bg-blue-500/3')}>
                    {isToday(day) && nowTop >= 0 && nowTop <= VISIBLE_HOURS.length * ROW_H && (
                      <div className="absolute left-0 right-0 z-20 flex items-center" style={{ top: nowTop }}>
                        <div className="w-2 h-2 rounded-full bg-red-400 -ml-1 flex-shrink-0" />
                        <div className="flex-1 h-px bg-red-400/70" />
                      </div>
                    )}
                    {dayEvts.map(evt => <EventBlock key={evt.id} evt={evt} onClick={handleEventClick} />)}
                    {allDayEvts.length > 0 && (
                      <div className="absolute top-1 left-1 right-1 space-y-0.5">
                        {allDayEvts.map(evt => <EventPill key={evt.id} evt={evt} compact onClick={handleEventClick} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 px-5 py-2 border-t border-border flex-shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-blue-500" /> Meetings</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-violet-500" /> Tasks</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Events</span>
        </div>
      </div>
    );
  }

  // ── Month view ────────────────────────────────────────────────────────────────
  function MonthView() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const gridStart = startOfWeekMon(firstDay);
    const allDays = datesInRange(gridStart, 42);
    const rows = [0,1,2,3,4,5].map(r => allDays.slice(r * 7, r * 7 + 7));
    const filteredRows = rows.filter(week => week.some(d => d.getMonth() === month));

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="grid grid-cols-7 flex-shrink-0 border-b border-border">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-r border-border last:border-r-0">
              {d}
            </div>
          ))}
        </div>
        <div className="flex-1 grid overflow-hidden" style={{ gridTemplateRows: `repeat(${filteredRows.length}, 1fr)` }}>
          {filteredRows.map((week, ri) => (
            <div key={ri} className="grid grid-cols-7 border-b border-border last:border-b-0">
              {week.map(day => {
                const inMonth = day.getMonth() === month;
                const today = isToday(day);
                const dayEvts = eventsOnDay(events, day);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn('border-r border-border last:border-r-0 p-1.5 flex flex-col min-h-0', !inMonth && 'opacity-30', today && 'bg-blue-500/5')}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); openCreateModal(day); }}
                      className={cn(
                        'w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 flex-shrink-0 transition-colors',
                        today ? 'bg-blue-500 text-white' : 'text-foreground hover:bg-secondary'
                      )}
                      title={`New event on ${day.toDateString()}`}
                    >
                      {day.getDate()}
                    </button>
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                      {dayEvts.slice(0, 3).map(evt => (
                        <EventPill key={evt.id} evt={evt} compact onClick={handleEventClick} />
                      ))}
                      {dayEvts.length > 3 && (
                        <p className="text-[9px] text-muted-foreground pl-1">+{dayEvts.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Year view ─────────────────────────────────────────────────────────────────
  function YearView() {
    const year = currentDate.getFullYear();
    const today = new Date();

    return (
      <div className="flex-1 overflow-auto p-5">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, mi) => {
            const firstDay = new Date(year, mi, 1);
            const lastDay = new Date(year, mi + 1, 0);
            const gridStart = startOfWeekMon(firstDay);
            const totalSlots = Math.ceil((addDays(lastDay, 1).getTime() - gridStart.getTime()) / 86400000);
            const days = datesInRange(gridStart, Math.max(totalSlots, 35));
            const isCurrentMonth = mi === today.getMonth() && year === today.getFullYear();

            return (
              <div
                key={mi}
                className={cn('rounded-xl p-3 border transition-colors', isCurrentMonth ? 'border-blue-500/40 bg-blue-500/5' : 'border-border bg-card hover:bg-accent/30')}
              >
                <h3 className={cn('text-xs font-semibold text-center mb-2.5 uppercase tracking-widest', isCurrentMonth ? 'text-blue-500' : 'text-muted-foreground')}>
                  {MONTHS[mi].slice(0, 3)}
                </h3>
                <div className="grid grid-cols-7 mb-1">
                  {['M','T','W','T','F','S','S'].map((d, i) => (
                    <div key={i} className="text-[8px] text-center text-muted-foreground/50 font-medium">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.slice(0, 42).map(day => {
                    const inMonth = day.getMonth() === mi;
                    const dayEvts = eventsOnDay(events, day);
                    const isT = isToday(day);
                    return (
                      <div key={day.toISOString()} className={cn('flex flex-col items-center py-0.5', !inMonth && 'opacity-20')}>
                        <span className={cn('text-[9px] leading-none w-4 h-4 flex items-center justify-center rounded-full', isT ? 'bg-blue-500 text-white font-bold' : 'text-foreground')}>
                          {day.getDate()}
                        </span>
                        {dayEvts.length > 0 && inMonth && !isT && (
                          <div className="flex gap-[2px] mt-[2px]">
                            {dayEvts.slice(0, 3).map(e => (
                              <span key={e.id} className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: e.color }} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-5 mt-5">
          {[
            { color: 'bg-blue-500', label: 'Meetings' },
            { color: 'bg-violet-500', label: 'Tasks (normal)' },
            { color: 'bg-yellow-500', label: 'Tasks (high)' },
            { color: 'bg-red-500', label: 'Tasks (urgent)' },
            { color: 'bg-emerald-500', label: 'Events' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('w-2 h-2 rounded-full', color)} /> {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-background text-foreground overflow-hidden"
      onClick={() => setSelectedEvent(null)}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">

        {/* Left: title */}
        <div className="flex items-center gap-2 w-40 flex-shrink-0">
          <Calendar className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-semibold">Calendar</span>
        </div>

        {/* Center: nav + date label */}
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); navigate(-1); }}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setCurrentDate(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }); }}
            className="px-3 py-1 text-xs font-medium rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            Today
          </button>
          <button
            onClick={e => { e.stopPropagation(); navigate(1); }}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[180px] text-center">
            {headerLabel()}
          </span>
        </div>

        {/* Right: view toggle + new event */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
            {(['work-week', 'week', 'month', 'year'] as CalView[]).map(v => (
              <button
                key={v}
                onClick={e => { e.stopPropagation(); setView(v); }}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize',
                  view === v
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v === 'work-week' ? 'Work Week' : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={e => { e.stopPropagation(); openCreateModal(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            New Event
          </button>
        </div>
      </div>

      {/* Calendar body */}
      {(view === 'work-week') && <WeekView days={workDays} />}
      {(view === 'week') && <WeekView days={fullWeek} />}
      {(view === 'month') && <MonthView />}
      {(view === 'year') && <YearView />}

      {/* Popover */}
      {selectedEvent && anchorRect && (
        <EventPopover
          event={selectedEvent}
          anchorRect={anchorRect}
          onClose={() => setSelectedEvent(null)}
          onEdit={openEditModal}
          onDelete={handlePopoverDelete}
        />
      )}

      {/* Modal */}
      {modal && (
        <EventModal
          state={modal}
          onClose={() => setModal(null)}
          onSave={handleModalSave}
          onDelete={modal.mode === 'edit' ? async () => {
            const evt = events.find(e => e.originalId === modal.id && e.type === 'calendar');
            if (evt) await handleModalDelete(evt);
          } : undefined}
        />
      )}
    </div>
  );
}
