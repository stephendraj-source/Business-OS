import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = '/api';

function fetchHeaders(): Record<string, string> {
  const token = localStorage.getItem('nonprofit-os-auth-token');
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

// ── Types ──────────────────────────────────────────────────────────────────────

type CalView = 'work-week' | 'week' | 'month' | 'year';

interface CalEvent {
  id: string;
  title: string;
  date: Date;
  type: 'meeting' | 'task';
  color: string;
  time?: string;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
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
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

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
  return `${MONTHS[first.getMonth()]} ${first.getDate()} – ${MONTHS[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EventPill({ evt, compact = false }: { evt: CalEvent; compact?: boolean }) {
  return (
    <div
      title={evt.title}
      className={cn(
        'rounded font-medium truncate',
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

// ── Main Component ─────────────────────────────────────────────────────────────

export function CalendarView() {
  const [view, setView] = useState<CalView>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch meetings + tasks
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
            title: m.title || 'Meeting',
            date: d,
            type: 'meeting',
            color: '#3b82f6',
            time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
          });
        }
      }

      if (Array.isArray(tasks)) {
        for (const t of tasks) {
          const dateStr = t.endDate || t.end_date;
          if (!dateStr) continue;
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) continue;
          const color =
            t.priority === 'urgent' ? '#ef4444'
            : t.priority === 'high'   ? '#f59e0b'
            : '#8b5cf6';
          evts.push({
            id: `task-${t.id}`,
            title: t.name || 'Task',
            date: d,
            type: 'task',
            color,
          });
        }
      }

      setEvents(evts);
    }).finally(() => setLoading(false));
  }, []);

  // Navigation
  function navigate(dir: 1 | -1) {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (view === 'work-week' || view === 'week') d.setDate(d.getDate() + dir * 7);
      else if (view === 'month') d.setMonth(d.getMonth() + dir);
      else d.setFullYear(d.getFullYear() + dir);
      return d;
    });
  }

  // Day ranges for week views
  const weekStart = startOfWeekMon(currentDate);
  const workDays  = datesInRange(weekStart, 5);
  const fullWeek  = datesInRange(weekStart, 7);

  function headerLabel(): string {
    if (view === 'work-week') return formatDateRange(workDays);
    if (view === 'week')      return formatDateRange(fullWeek);
    if (view === 'month')     return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    return String(currentDate.getFullYear());
  }

  // ── Work Week / Week view ──────────────────────────────────────────────────

  function WeekView({ days }: { days: Date[] }) {
    return (
      <div className="flex-1 flex flex-col overflow-auto min-h-0">
        {/* Day header row */}
        <div
          className="grid flex-shrink-0 border-b border-white/10"
          style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
        >
          {days.map(day => (
            <div
              key={day.toISOString()}
              className={cn(
                'px-3 py-2 text-center border-r border-white/8 last:border-r-0',
                isToday(day) && 'bg-primary/8'
              )}
            >
              <p className="text-[11px] text-white/40 uppercase tracking-wide font-medium">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day.getDay()]}
              </p>
              <p className={cn(
                'text-xl font-semibold mt-0.5',
                isToday(day) ? 'text-primary' : 'text-white'
              )}>
                {day.getDate()}
              </p>
              <p className="text-[10px] text-white/30">
                {MONTHS[day.getMonth()].slice(0, 3)}
              </p>
            </div>
          ))}
        </div>

        {/* Events row */}
        <div
          className="flex-1 grid overflow-auto"
          style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
        >
          {days.map(day => {
            const dayEvts = eventsOnDay(events, day);
            const meetings = dayEvts.filter(e => e.type === 'meeting');
            const tasks    = dayEvts.filter(e => e.type === 'task');
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'p-2 border-r border-white/8 last:border-r-0 space-y-1 min-h-40',
                  isToday(day) && 'bg-primary/5'
                )}
              >
                {dayEvts.length === 0 && (
                  <p className="text-[11px] text-white/20 mt-2 text-center">—</p>
                )}
                {meetings.map(evt => <EventPill key={evt.id} evt={evt} />)}
                {tasks.length > 0 && meetings.length > 0 && (
                  <div className="h-px bg-white/8 my-1" />
                )}
                {tasks.map(evt => <EventPill key={evt.id} evt={evt} />)}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-5 py-2 border-t border-white/8 flex-shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Meetings
          </span>
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Tasks
          </span>
        </div>
      </div>
    );
  }

  // ── Month view ─────────────────────────────────────────────────────────────

  function MonthView() {
    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const gridStart = startOfWeekMon(firstDay);

    // Always show 6 rows × 7 = 42 cells
    const allDays = datesInRange(gridStart, 42);
    const rows = [0,1,2,3,4,5].map(r => allDays.slice(r * 7, r * 7 + 7));

    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-white/10 flex-shrink-0">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-white/40 uppercase tracking-wide border-r border-white/8 last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">
          {rows.map((week, ri) => {
            // Hide the row if all days are outside current month and it's the 6th row
            const hasCurrentMonth = week.some(d => d.getMonth() === month);
            if (!hasCurrentMonth && ri === 5) return null;
            return (
              <div key={ri} className="grid grid-cols-7 flex-1 border-b border-white/8 last:border-b-0" style={{ minHeight: 90 }}>
                {week.map(day => {
                  const inMonth = day.getMonth() === month;
                  const today   = isToday(day);
                  const dayEvts = eventsOnDay(events, day);
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        'p-1.5 border-r border-white/8 last:border-r-0',
                        !inMonth && 'opacity-30',
                        today && 'bg-primary/6'
                      )}
                    >
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1',
                        today ? 'bg-primary text-white' : 'text-white/70'
                      )}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvts.slice(0, 3).map(evt => (
                          <EventPill key={evt.id} evt={evt} compact />
                        ))}
                        {dayEvts.length > 3 && (
                          <p className="text-[9px] text-white/35 pl-1">+{dayEvts.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Year view ──────────────────────────────────────────────────────────────

  function YearView() {
    const year = currentDate.getFullYear();
    const today = new Date();

    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-4 gap-5">
          {Array.from({ length: 12 }, (_, mi) => {
            const firstDay  = new Date(year, mi, 1);
            const lastDay   = new Date(year, mi + 1, 0);
            const gridStart = startOfWeekMon(firstDay);
            const totalSlots = Math.ceil(
              (addDays(lastDay, 1).getTime() - gridStart.getTime()) / (86400000)
            );
            const days = datesInRange(gridStart, Math.max(totalSlots, 35));
            const isCurrentMonth = mi === today.getMonth() && year === today.getFullYear();

            return (
              <div
                key={mi}
                className={cn(
                  'bg-white/3 rounded-xl p-3 border',
                  isCurrentMonth ? 'border-primary/50' : 'border-white/8'
                )}
              >
                <h3 className={cn(
                  'text-xs font-semibold text-center mb-2 uppercase tracking-wide',
                  isCurrentMonth ? 'text-primary' : 'text-white/70'
                )}>
                  {MONTHS[mi]}
                </h3>

                {/* Mini day-of-week header */}
                <div className="grid grid-cols-7 mb-1">
                  {['M','T','W','T','F','S','S'].map((d, i) => (
                    <div key={i} className="text-[9px] text-center text-white/25 font-medium">{d}</div>
                  ))}
                </div>

                {/* Mini days */}
                <div className="grid grid-cols-7">
                  {days.slice(0, 42).map(day => {
                    const inMonth = day.getMonth() === mi;
                    const dayEvts = eventsOnDay(events, day);
                    const isT    = isToday(day);
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'flex flex-col items-center py-0.5',
                          !inMonth && 'opacity-20'
                        )}
                      >
                        <span className={cn(
                          'text-[9px] leading-none w-5 h-5 flex items-center justify-center rounded-full',
                          isT ? 'bg-primary text-white font-bold' : 'text-white/60'
                        )}>
                          {day.getDate()}
                        </span>
                        {dayEvts.length > 0 && inMonth && !isT && (
                          <div className="flex gap-0.5 mt-0.5">
                            {dayEvts.slice(0, 3).map(e => (
                              <span
                                key={e.id}
                                className="w-1 h-1 rounded-full"
                                style={{ backgroundColor: e.color }}
                              />
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

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4">
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Meetings
          </span>
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            <span className="w-2 h-2 rounded-full bg-violet-500" /> Tasks (normal)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            <span className="w-2 h-2 rounded-full bg-yellow-500" /> Tasks (high)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-white/40">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Tasks (urgent)
          </span>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[hsl(var(--background))]">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))] text-white overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-white/10 flex-shrink-0">

        {/* Title */}
        <div className="flex items-center gap-2.5">
          <Calendar className="w-4 h-4 text-blue-400" />
          <h1 className="text-sm font-semibold">Calendar</h1>
          <span className="text-xs text-white/30">
            {events.filter(e => e.type === 'meeting').length} meetings ·{' '}
            {events.filter(e => e.type === 'task').length} tasks with due dates
          </span>
        </div>

        {/* Nav controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-white/8 text-white/50 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 text-xs rounded-lg border border-white/15 text-white/60 hover:bg-white/5 hover:text-white transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-lg hover:bg-white/8 text-white/50 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-white ml-1 min-w-56 text-center">
            {headerLabel()}
          </span>
        </div>

        {/* View switcher */}
        <div className="flex items-center bg-white/5 rounded-lg p-0.5 gap-0.5">
          {([
            { key: 'work-week', label: 'Work Week' },
            { key: 'week',      label: 'Week' },
            { key: 'month',     label: 'Month' },
            { key: 'year',      label: 'Year' },
          ] as const).map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-colors font-medium whitespace-nowrap',
                view === v.key
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/45 hover:text-white/80'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Calendar body ─────────────────────────────────────────────── */}
      {view === 'work-week' && <WeekView days={workDays} />}
      {view === 'week'      && <WeekView days={fullWeek} />}
      {view === 'month'     && <MonthView />}
      {view === 'year'      && <YearView />}
    </div>
  );
}
