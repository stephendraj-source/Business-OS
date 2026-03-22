import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, Loader2, Clock,
  X, MapPin, User, Flag, CheckCircle2, Circle, RefreshCw, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API = '/api';

function fetchHeaders(): Record<string, string> {
  const token = localStorage.getItem('nonprofit-os-auth-token');
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
  type: 'meeting' | 'task';
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
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const VISIBLE_HOURS = HOURS.slice(6, 22);
const ROW_H = 48;

function fmtHour(h: number) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

// ── Event Popover ─────────────────────────────────────────────────────────────

interface PopoverProps {
  event: CalEvent;
  anchorRect: DOMRect;
  onClose: () => void;
}

function EventPopover({ event, anchorRect, onClose }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position: try right of anchor, fall back to left if off-screen
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

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isMeeting = event.type === 'meeting';
  const dateStr = event.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const PRIORITY_LABEL: Record<string, string> = {
    low: 'Low', normal: 'Normal', medium: 'Medium', high: 'High', critical: 'Critical',
  };
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
              {isMeeting ? (event.meetingType ?? 'Meeting') : 'Task'}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug">{event.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors -mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
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

        {/* Meeting: location */}
        {isMeeting && event.location && (
          <div className="flex items-center gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{event.location}</span>
          </div>
        )}

        {/* Meeting: organiser */}
        {isMeeting && event.organizerName && (
          <div className="flex items-center gap-2 text-xs">
            <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{event.organizerName}</span>
          </div>
        )}

        {/* Task: priority */}
        {!isMeeting && event.priority && (
          <div className="flex items-center gap-2 text-xs">
            <Flag className={cn('w-3.5 h-3.5 flex-shrink-0', PRIORITY_COLOR[event.priority] ?? 'text-muted-foreground')} />
            <span className={PRIORITY_COLOR[event.priority] ?? 'text-foreground'}>
              {PRIORITY_LABEL[event.priority] ?? event.priority} priority
            </span>
          </div>
        )}

        {/* Task: status */}
        {!isMeeting && event.status && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex-shrink-0">{STATUS_ICON[event.status] ?? <Circle className="w-3 h-3" />}</span>
            <span className="capitalize text-foreground">{event.status.replace(/_/g, ' ')}</span>
          </div>
        )}

        {/* Task: assignee */}
        {!isMeeting && event.assignee && (
          <div className="flex items-center gap-2 text-xs">
            <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{event.assignee}</span>
          </div>
        )}

        {/* Description snippet */}
        {event.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 pt-1 border-t border-border">
            {event.description}
          </p>
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

  // Popover state
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  function handleEventClick(evt: CalEvent, e: React.MouseEvent) {
    e.stopPropagation();
    setAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setSelectedEvent(prev => prev?.id === evt.id ? null : evt);
  }

  // Close popover on background click
  useEffect(() => {
    if (!selectedEvent) return;
    function handler() { setSelectedEvent(null); }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [selectedEvent]);

  useEffect(() => {
    const h = fetchHeaders();
    Promise.all([
      fetch(`${API}/meetings`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/tasks`, { headers: h }).then(r => r.json()).catch(() => []),
    ]).then(([meetings, tasks]) => {
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

      setEvents(evts);
    }).finally(() => setLoading(false));
  }, []);

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

  // ── Week view with time grid ─────────────────────────────────────────────────
  function WeekView({ days }: { days: Date[] }) {
    const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
    const nowTop = (nowHour - 6) * ROW_H;

    return (
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Day header row */}
        <div className="flex flex-shrink-0 border-b border-border">
          <div className="w-14 flex-shrink-0" />
          <div className="flex flex-1">
            {days.map(day => (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex-1 py-2 text-center border-l border-border',
                  isToday(day) && 'bg-blue-500/5'
                )}
              >
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                  {DAYS_SHORT[day.getDay()]}
                </p>
                <div className={cn(
                  'w-8 h-8 mx-auto mt-1 flex items-center justify-center rounded-full text-sm font-semibold',
                  isToday(day)
                    ? 'bg-blue-500 text-white'
                    : 'text-foreground'
                )}>
                  {day.getDate()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Time grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex" style={{ height: VISIBLE_HOURS.length * ROW_H }}>
            {/* Hour labels */}
            <div className="w-14 flex-shrink-0 relative">
              {VISIBLE_HOURS.map(h => (
                <div
                  key={h}
                  className="absolute w-full pr-2 text-right"
                  style={{ top: (h - 6) * ROW_H - 7 }}
                >
                  <span className="text-[10px] text-muted-foreground leading-none">{fmtHour(h)}</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            <div className="flex flex-1 relative">
              {/* Horizontal hour lines */}
              <div className="absolute inset-0 pointer-events-none">
                {VISIBLE_HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-border/50"
                    style={{ top: (h - 6) * ROW_H }}
                  />
                ))}
                {VISIBLE_HOURS.map(h => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 border-t border-border/20"
                    style={{ top: (h - 6) * ROW_H + ROW_H / 2 }}
                  />
                ))}
              </div>

              {days.map((day) => {
                const dayEvts = eventsOnDay(events, day).filter(
                  e => e.hour !== undefined && e.hour >= 6 && e.hour < 22
                );
                const allDayEvts = eventsOnDay(events, day).filter(
                  e => e.hour === undefined || e.hour < 6 || e.hour >= 22
                );
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'flex-1 border-l border-border relative',
                      isToday(day) && 'bg-blue-500/3'
                    )}
                  >
                    {isToday(day) && nowTop >= 0 && nowTop <= VISIBLE_HOURS.length * ROW_H && (
                      <div
                        className="absolute left-0 right-0 z-20 flex items-center"
                        style={{ top: nowTop }}
                      >
                        <div className="w-2 h-2 rounded-full bg-red-400 -ml-1 flex-shrink-0" />
                        <div className="flex-1 h-px bg-red-400/70" />
                      </div>
                    )}
                    {dayEvts.map(evt => (
                      <EventBlock key={evt.id} evt={evt} onClick={handleEventClick} />
                    ))}
                    {allDayEvts.length > 0 && (
                      <div className="absolute top-1 left-1 right-1 space-y-0.5">
                        {allDayEvts.map(evt => (
                          <EventPill key={evt.id} evt={evt} compact onClick={handleEventClick} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-5 py-2 border-t border-border flex-shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Meetings
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-violet-500" /> Tasks
          </span>
        </div>
      </div>
    );
  }

  // ── Month view ───────────────────────────────────────────────────────────────
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
        {/* Day of week header */}
        <div className="grid grid-cols-7 flex-shrink-0 border-b border-border">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-r border-border last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar rows */}
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
                    className={cn(
                      'border-r border-border last:border-r-0 p-1.5 flex flex-col min-h-0',
                      !inMonth && 'opacity-30',
                      today && 'bg-blue-500/5'
                    )}
                  >
                    <div className={cn(
                      'w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 flex-shrink-0',
                      today ? 'bg-blue-500 text-white' : 'text-foreground'
                    )}>
                      {day.getDate()}
                    </div>

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

  // ── Year view ────────────────────────────────────────────────────────────────
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
            const totalSlots = Math.ceil(
              (addDays(lastDay, 1).getTime() - gridStart.getTime()) / 86400000
            );
            const days = datesInRange(gridStart, Math.max(totalSlots, 35));
            const isCurrentMonth = mi === today.getMonth() && year === today.getFullYear();

            return (
              <div
                key={mi}
                className={cn(
                  'rounded-xl p-3 border transition-colors',
                  isCurrentMonth
                    ? 'border-blue-500/40 bg-blue-500/5'
                    : 'border-border bg-card hover:bg-accent/30'
                )}
              >
                <h3 className={cn(
                  'text-xs font-semibold text-center mb-2.5 uppercase tracking-widest',
                  isCurrentMonth ? 'text-blue-500' : 'text-muted-foreground'
                )}>
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
                        <span className={cn(
                          'text-[9px] leading-none w-4 h-4 flex items-center justify-center rounded-full',
                          isT ? 'bg-blue-500 text-white font-bold' : 'text-foreground'
                        )}>
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
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('w-2 h-2 rounded-full', color)} /> {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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
            onClick={e => { e.stopPropagation(); setCurrentDate(new Date()); }}
            className="px-3 py-1 text-xs rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors font-medium"
          >
            Today
          </button>
          <button
            onClick={e => { e.stopPropagation(); navigate(1); }}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold ml-1 min-w-52 text-center">
            {headerLabel()}
          </span>
        </div>

        {/* Right: view switcher + stats */}
        <div className="flex items-center gap-3 w-auto flex-shrink-0">
          <span className="text-[11px] text-muted-foreground hidden xl:flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {events.filter(e => e.type === 'meeting').length}m · {events.filter(e => e.type === 'task').length}t
          </span>
          <div className="flex items-center bg-secondary rounded-lg p-0.5">
            {([
              { key: 'work-week', label: 'Work Week' },
              { key: 'week',      label: 'Week' },
              { key: 'month',     label: 'Month' },
              { key: 'year',      label: 'Year' },
            ] as const).map(v => (
              <button
                key={v.key}
                onClick={e => { e.stopPropagation(); setView(v.key); }}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors font-medium whitespace-nowrap',
                  view === v.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar body */}
      {view === 'work-week' && <WeekView days={workDays} />}
      {view === 'week'      && <WeekView days={fullWeek} />}
      {view === 'month'     && <MonthView />}
      {view === 'year'      && <YearView />}

      {/* Event detail popover */}
      {selectedEvent && anchorRect && (
        <EventPopover
          event={selectedEvent}
          anchorRect={anchorRect}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
