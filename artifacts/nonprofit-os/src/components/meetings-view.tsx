import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, Trash2, Calendar, MapPin, Users, Video, Building2, Merge,
  Check, Clock, X, User, ListChecks, MessageSquare, Link2, Cpu, GitBranch,
  ArrowRight, FileText, Loader2, Circle, CheckCircle2, ClipboardList, Upload,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const API = '/api';

function fetchHeaders(): Record<string, string> {
  const token = localStorage.getItem('nonprofit-os-auth-token');
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
}

type MeetingType = 'physical' | 'virtual' | 'hybrid';
type Tab = 'overview' | 'agenda' | 'attendees' | 'discussions' | 'actions' | 'links';

interface AgendaItem { id: string; text: string; }
interface Attendee { id: string; userId?: number; name: string; email?: string; role?: string; }
interface ActionItem {
  id: string; text: string; assigneeName?: string; assigneeId?: number;
  dueDate?: string; priority?: 'low' | 'medium' | 'high'; status: 'open' | 'done'; taskId?: number | null;
}
interface LinkedWorkflow { workflow_id: number; workflow_name: string; }
interface LinkedAgent { agent_id: number; agent_name: string; }
interface Meeting {
  id: number; title: string; meeting_type: MeetingType; meeting_date: string | null;
  location: string; organizer_id: number | null; organizer_name: string; agenda: string;
  attendees: string; discussions: string; actions: string; process_id: number | null;
  process_name?: string; organizer_user_name?: string; created_by_name?: string;
  linked_workflows?: LinkedWorkflow[]; linked_agents?: LinkedAgent[];
}
interface Process { id: number; name: string; category?: string; }
interface Workflow { id: number; name: string; }
interface AiAgent { id: number; name: string; }
interface User { id: number; name: string; email: string; }

function uid() { return Math.random().toString(36).slice(2, 9); }
function parseSafe<T>(str: string, fallback: T): T {
  try { return JSON.parse(str); } catch { return fallback; }
}

const TYPE_CONFIG: Record<MeetingType, { label: string; color: string; dot: string; icon: React.ReactNode }> = {
  physical: { label: 'Physical', color: 'bg-blue-500/15 text-blue-400 border-blue-500/25', dot: 'bg-blue-400', icon: <Building2 className="w-3 h-3" /> },
  virtual:  { label: 'Virtual',  color: 'bg-violet-500/15 text-violet-400 border-violet-500/25', dot: 'bg-violet-400', icon: <Video className="w-3 h-3" /> },
  hybrid:   { label: 'Hybrid',   color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400', icon: <Merge className="w-3 h-3" /> },
};

function TypeBadge({ type }: { type: MeetingType }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.physical;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium', cfg.color)}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return dateStr; }
}

function formatDateShort(dateStr: string | null) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

// ── MeetingsView ──────────────────────────────────────────────────────────────

export function MeetingsView() {
  const { toast } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MeetingType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const h = fetchHeaders();
    Promise.all([
      fetch(`${API}/meetings`, { headers: h }).then(r => r.json()),
      fetch(`${API}/processes`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/workflows`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/ai-agents`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/users`, { headers: h }).then(r => r.json()).catch(() => []),
    ]).then(([mtgs, procs, wfs, ags, usrs]) => {
      setMeetings(Array.isArray(mtgs) ? mtgs : []);
      setProcesses(Array.isArray(procs) ? procs : []);
      setWorkflows(Array.isArray(wfs) ? wfs : []);
      setAgents(Array.isArray(ags) ? ags : []);
      setUsers(Array.isArray(usrs) ? usrs : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const createMeeting = async () => {
    setCreating(true);
    try {
      const r = await fetch(`${API}/meetings`, {
        method: 'POST', headers: fetchHeaders(),
        body: JSON.stringify({ title: 'New Meeting', meeting_type: 'physical' }),
      });
      const m = await r.json();
      setMeetings(prev => [m, ...prev]);
      setSelectedId(m.id);
    } catch {
      toast({ title: 'Error', description: 'Could not create meeting', variant: 'destructive' });
    } finally { setCreating(false); }
  };

  const deleteMeeting = async (id: number) => {
    await fetch(`${API}/meetings/${id}`, { method: 'DELETE', headers: fetchHeaders() });
    setMeetings(prev => prev.filter(m => m.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateMeetingInList = (updated: Meeting) => {
    setMeetings(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
  };

  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const parseRes = await fetch(`${API}/meetings/parse-file`, {
        method: 'POST',
        headers: (() => { const t = localStorage.getItem('nonprofit-os-auth-token'); return t ? { Authorization: `Bearer ${t}` } : {}; })(),
        body: formData,
      });
      if (!parseRes.ok) { const e = await parseRes.json().catch(() => ({})); throw new Error((e as any).error || 'Failed to parse file'); }
      const parsed = await parseRes.json();
      const createRes = await fetch(`${API}/meetings`, {
        method: 'POST', headers: fetchHeaders(),
        body: JSON.stringify({ title: parsed.title || 'Imported Meeting', meeting_type: parsed.meetingType || 'physical' }),
      });
      const newMeeting: Meeting = await createRes.json();
      const patch: Record<string, any> = {};
      if (parsed.meetingDate) patch.meeting_date = parsed.meetingDate;
      if (parsed.location) patch.location = parsed.location;
      if (parsed.organizer) patch.organizer_name = parsed.organizer;
      if (parsed.attendees?.length) patch.attendees = JSON.stringify(parsed.attendees);
      if (parsed.agenda?.length) patch.agenda = JSON.stringify(parsed.agenda);
      if (parsed.discussions) patch.discussions = parsed.discussions;
      if (parsed.actions?.length) patch.actions = JSON.stringify(parsed.actions);
      if (Object.keys(patch).length > 0) {
        const patchRes = await fetch(`${API}/meetings/${newMeeting.id}`, { method: 'PATCH', headers: fetchHeaders(), body: JSON.stringify(patch) });
        const updated: Meeting = await patchRes.json();
        setMeetings(prev => [updated, ...prev]);
        setSelectedId(updated.id);
      } else {
        setMeetings(prev => [newMeeting, ...prev]);
        setSelectedId(newMeeting.id);
      }
      toast({ title: 'Meeting imported', description: `Fields pre-populated from "${file.name}"` });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message || 'Could not read file', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const filtered = meetings.filter(m => {
    if (typeFilter !== 'all' && m.meeting_type !== typeFilter) return false;
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const selected = meetings.find(m => m.id === selectedId) ?? null;

  // Group filtered meetings by month
  const grouped: { label: string; items: Meeting[] }[] = [];
  for (const m of filtered) {
    const label = m.meeting_date
      ? new Date(m.meeting_date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : 'No Date';
    const g = grouped.find(x => x.label === label);
    if (g) g.items.push(m); else grouped.push({ label, items: [m] });
  }

  return (
    <div className="flex h-full bg-[hsl(var(--background))] text-white overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-white/10">

        {/* Sidebar header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold">Meetings</span>
              <span className="text-[11px] text-white/40 bg-white/8 px-1.5 py-0.5 rounded-full tabular-nums">{meetings.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                ref={importInputRef} type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); }}
              />
              <button
                onClick={() => importInputRef.current?.click()} disabled={importing || creating}
                title="Import from PDF or Word"
                className="flex items-center gap-1 text-[11px] bg-white/6 hover:bg-white/10 border border-white/12 text-white/60 hover:text-white px-2 py-1 rounded-md transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Import
              </button>
              <button
                onClick={createMeeting} disabled={creating || importing}
                className="flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 font-medium"
              >
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                New
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search meetings…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>

          {/* Type filter pills */}
          <div className="flex gap-1 mt-2 flex-wrap">
            {(['all', 'physical', 'virtual', 'hybrid'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'text-[11px] px-2.5 py-0.5 rounded-full border transition-colors',
                  typeFilter === t
                    ? 'bg-blue-600/25 border-blue-500/40 text-blue-300'
                    : 'border-white/10 text-white/45 hover:border-white/20 hover:text-white/65'
                )}
              >
                {t === 'all' ? 'All' : TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>
        </div>

        {/* Meeting list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-4 h-4 animate-spin text-white/30" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-white/15" />
              <p className="text-xs text-white/35">
                {search || typeFilter !== 'all' ? 'No matches found' : 'No meetings yet'}
              </p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.label}>
                <div className="px-4 py-2 text-[10px] font-semibold text-white/30 uppercase tracking-widest sticky top-0 bg-[hsl(var(--background))] z-10">
                  {group.label}
                </div>
                {group.items.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 transition-colors group relative',
                      selectedId === m.id
                        ? 'bg-blue-500/10 border-l-2 border-l-blue-500'
                        : 'border-l-2 border-l-transparent hover:bg-white/4'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Type dot */}
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1.5', TYPE_CONFIG[m.meeting_type]?.dot ?? 'bg-blue-400')} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium truncate', selectedId === m.id ? 'text-white' : 'text-white/85')}>
                          {m.title}
                        </p>
                        {m.meeting_date && (
                          <p className="text-[11px] text-white/40 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            {formatDateShort(m.meeting_date)}
                          </p>
                        )}
                        {m.location && (
                          <p className="text-[11px] text-white/35 truncate mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />{m.location}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteMeeting(m.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/35 hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-3">
            <Calendar className="w-14 h-14 opacity-15" />
            <div className="text-center">
              <p className="text-sm font-medium text-white/40">No meeting selected</p>
              <p className="text-xs mt-1">Choose one from the list or create a new meeting</p>
            </div>
          </div>
        ) : (
          <MeetingDetail
            key={selected.id}
            meeting={selected}
            processes={processes}
            workflows={workflows}
            agents={agents}
            users={users}
            onUpdate={updateMeetingInList}
          />
        )}
      </div>
    </div>
  );
}

// ── MeetingDetail ─────────────────────────────────────────────────────────────

interface DetailProps {
  meeting: Meeting; processes: Process[]; workflows: Workflow[];
  agents: AiAgent[]; users: User[]; onUpdate: (m: Meeting) => void;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',    icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'agenda',      label: 'Agenda',      icon: <ListChecks className="w-3.5 h-3.5" /> },
  { id: 'attendees',   label: 'Attendees',   icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'discussions', label: 'Discussions', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { id: 'actions',     label: 'Actions',     icon: <ClipboardList className="w-3.5 h-3.5" /> },
  { id: 'links',       label: 'Links',       icon: <Link2 className="w-3.5 h-3.5" /> },
];

function MeetingDetail({ meeting, processes, workflows, agents, users, onUpdate }: DetailProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title, setTitle] = useState(meeting.title);
  const [meetingType, setMeetingType] = useState<MeetingType>(meeting.meeting_type);
  const [meetingDate, setMeetingDate] = useState(meeting.meeting_date ? meeting.meeting_date.slice(0, 16) : '');
  const [location, setLocation] = useState(meeting.location);
  const [organizerName, setOrganizerName] = useState(meeting.organizer_name || meeting.organizer_user_name || '');
  const [organizerId, setOrganizerId] = useState<number | null>(meeting.organizer_id);
  const [processId, setProcessId] = useState<number | null>(meeting.process_id);
  const [discussions, setDiscussions] = useState(meeting.discussions);
  const [agenda, setAgenda] = useState<AgendaItem[]>(parseSafe(meeting.agenda, []));
  const [attendees, setAttendees] = useState<Attendee[]>(parseSafe(meeting.attendees, []));
  const [actions, setActions] = useState<ActionItem[]>(parseSafe(meeting.actions, []));
  const [linkedWfIds, setLinkedWfIds] = useState<number[]>((meeting.linked_workflows ?? []).map(w => w.workflow_id));
  const [linkedAgentIds, setLinkedAgentIds] = useState<number[]>((meeting.linked_agents ?? []).map(a => a.agent_id));

  const save = useCallback(async (patch: Partial<{
    title: string; meeting_type: MeetingType; meeting_date: string | null;
    location: string; organizer_id: number | null; organizer_name: string;
    agenda: string; attendees: string; discussions: string; actions: string;
    process_id: number | null; workflow_ids: number[]; agent_ids: number[];
  }>) => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/meetings/${meeting.id}`, {
        method: 'PATCH', headers: fetchHeaders(), body: JSON.stringify(patch),
      });
      const updated = await r.json();
      onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally { setSaving(false); }
  }, [meeting.id, onUpdate, toast]);

  function scheduleSave(patch: Parameters<typeof save>[0]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(patch), 800);
  }

  useEffect(() => {
    if (title !== meeting.title) scheduleSave({ title });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  const typeCfg = TYPE_CONFIG[meetingType];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-white/10 flex-shrink-0">
        {/* Title row */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-transparent text-xl font-semibold text-white border-none outline-none placeholder-white/25 leading-tight"
              placeholder="Meeting title…"
            />
            <div className="flex items-center gap-2.5 mt-2 flex-wrap">
              <TypeBadge type={meetingType} />
              {meetingDate && (
                <span className="text-xs text-white/45 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{formatDate(meetingDate)}
                </span>
              )}
              {location && (
                <span className="text-xs text-white/45 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{location}
                </span>
              )}
              {organizerName && (
                <span className="text-xs text-white/45 flex items-center gap-1">
                  <User className="w-3 h-3" />{organizerName}
                </span>
              )}
            </div>
          </div>
          {/* Save indicator */}
          <div className="flex items-center gap-2 pt-1 flex-shrink-0">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30" />}
            {saved && !saving && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />Saved
              </span>
            )}
          </div>
        </div>

        {/* Tab bar — scrollable to prevent overflow */}
        <div className="flex overflow-x-auto scrollbar-none -mx-1 px-1">
          {TABS.map(t => {
            const badge = t.id === 'actions' && actions.length > 0 ? actions.length
              : t.id === 'attendees' && attendees.length > 0 ? attendees.length
              : t.id === 'agenda' && agenda.length > 0 ? agenda.length
              : null;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap flex-shrink-0 -mb-px',
                  tab === t.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-white/40 hover:text-white/65'
                )}
              >
                {t.icon}
                {t.label}
                {badge !== null && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-px rounded-full font-medium',
                    tab === t.id ? 'bg-blue-500/20 text-blue-400' : 'bg-white/8 text-white/40'
                  )}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <OverviewTab
            meetingType={meetingType}
            setMeetingType={v => { setMeetingType(v); save({ meeting_type: v }); }}
            meetingDate={meetingDate}
            setMeetingDate={v => { setMeetingDate(v); scheduleSave({ meeting_date: v || null }); }}
            location={location}
            setLocation={v => { setLocation(v); scheduleSave({ location: v }); }}
            organizerName={organizerName}
            setOrganizerName={v => { setOrganizerName(v); scheduleSave({ organizer_name: v }); }}
            organizerId={organizerId}
            setOrganizerId={v => { setOrganizerId(v); save({ organizer_id: v, organizer_name: organizerName }); }}
            users={users}
            processId={processId}
            setProcessId={v => { setProcessId(v); save({ process_id: v }); }}
            processes={processes}
          />
        )}
        {tab === 'agenda' && (
          <AgendaTab items={agenda} onChange={items => { setAgenda(items); scheduleSave({ agenda: JSON.stringify(items) }); }} />
        )}
        {tab === 'attendees' && (
          <AttendeesTab attendees={attendees} users={users} onChange={items => { setAttendees(items); scheduleSave({ attendees: JSON.stringify(items) }); }} />
        )}
        {tab === 'discussions' && (
          <DiscussionsTab value={discussions} onChange={v => { setDiscussions(v); scheduleSave({ discussions: v }); }} />
        )}
        {tab === 'actions' && (
          <ActionsTab meetingId={meeting.id} actions={actions} users={users} onChange={items => { setActions(items); scheduleSave({ actions: JSON.stringify(items) }); }} />
        )}
        {tab === 'links' && (
          <LinksTab
            workflows={workflows} agents={agents}
            linkedWfIds={linkedWfIds} linkedAgentIds={linkedAgentIds}
            onWfChange={ids => { setLinkedWfIds(ids); save({ workflow_ids: ids, agent_ids: linkedAgentIds }); }}
            onAgentChange={ids => { setLinkedAgentIds(ids); save({ workflow_ids: linkedWfIds, agent_ids: ids }); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-white/25';
const selectCls = 'w-full bg-[hsl(var(--background))] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50';

// ── Overview Tab ──────────────────────────────────────────────────────────────

interface OverviewTabProps {
  meetingType: MeetingType; setMeetingType: (v: MeetingType) => void;
  meetingDate: string; setMeetingDate: (v: string) => void;
  location: string; setLocation: (v: string) => void;
  organizerName: string; setOrganizerName: (v: string) => void;
  organizerId: number | null; setOrganizerId: (v: number | null) => void;
  users: User[];
  processId: number | null; setProcessId: (v: number | null) => void;
  processes: Process[];
}

function OverviewTab({ meetingType, setMeetingType, meetingDate, setMeetingDate, location, setLocation, organizerName, setOrganizerName, organizerId, setOrganizerId, users, processId, setProcessId, processes }: OverviewTabProps) {
  return (
    <div className="p-6 max-w-2xl space-y-6">
      <Field label="Meeting Type">
        <div className="flex gap-2">
          {(['physical', 'virtual', 'hybrid'] as MeetingType[]).map(t => {
            const cfg = TYPE_CONFIG[t];
            return (
              <button
                key={t}
                onClick={() => setMeetingType(t)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
                  meetingType === t ? cn(cfg.color, 'shadow-sm') : 'border-white/12 text-white/45 hover:border-white/20 hover:text-white/65'
                )}
              >
                {cfg.icon}{cfg.label}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Date & Time">
          <input
            type="datetime-local" value={meetingDate}
            onChange={e => setMeetingDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={meetingType === 'virtual' ? 'Meeting Link / Platform' : meetingType === 'hybrid' ? 'Location & Link' : 'Location'}>
          <input
            value={location} onChange={e => setLocation(e.target.value)}
            placeholder={meetingType === 'virtual' ? 'e.g. https://zoom.us/j/…' : meetingType === 'hybrid' ? 'Board Room + Zoom' : 'e.g. Board Room, Level 3'}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Organiser">
        <div className="flex gap-2 items-center">
          <select
            value={organizerId ?? ''}
            onChange={e => {
              const v = e.target.value ? Number(e.target.value) : null;
              setOrganizerId(v);
              if (v) { const u = users.find(u => u.id === v); if (u) setOrganizerName(u.name); }
            }}
            className={cn(selectCls, 'flex-1')}
          >
            <option value="">— Select a user —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <span className="text-xs text-white/30 flex-shrink-0">or</span>
          <input
            value={organizerName}
            onChange={e => { setOrganizerName(e.target.value); setOrganizerId(null); }}
            placeholder="Type a name…"
            className={cn(inputCls, 'flex-1')}
          />
        </div>
        <p className="text-[11px] text-white/30 mt-1">Organiser may differ from the meeting creator.</p>
      </Field>

      <Field label="Linked Process">
        <select
          value={processId ?? ''}
          onChange={e => setProcessId(e.target.value ? Number(e.target.value) : null)}
          className={selectCls}
        >
          <option value="">— None —</option>
          {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
    </div>
  );
}

// ── Agenda Tab ────────────────────────────────────────────────────────────────

function AgendaTab({ items, onChange }: { items: AgendaItem[]; onChange: (v: AgendaItem[]) => void }) {
  const [newText, setNewText] = useState('');

  function add() {
    if (!newText.trim()) return;
    onChange([...items, { id: uid(), text: newText.trim() }]);
    setNewText('');
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <ListChecks className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold">Agenda Items</h3>
        <span className="text-[11px] text-white/40 bg-white/8 px-1.5 py-0.5 rounded-full">{items.length}</span>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-white/35 italic mb-4">No agenda items yet — add one below.</p>
      )}

      <div className="space-y-2 mb-4">
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2.5 group">
            <span className="text-xs text-white/30 w-5 text-right flex-shrink-0 font-mono">{i + 1}</span>
            <input
              value={item.text}
              onChange={e => onChange(items.map(it => it.id === item.id ? { ...it, text: e.target.value } : it))}
              className="flex-1 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
            <button
              onClick={() => onChange(items.filter(it => it.id !== item.id))}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-white/35 hover:text-red-400 hover:bg-red-400/10 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-3 border-t border-white/8">
        <input
          value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add agenda item… (Enter to add)"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-white/25"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 bg-blue-600/20 border border-blue-500/30 text-blue-400 px-3 py-2 rounded-lg text-xs hover:bg-blue-600/30 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />Add
        </button>
      </div>
    </div>
  );
}

// ── Attendees Tab ─────────────────────────────────────────────────────────────

function AttendeesTab({ attendees, users, onChange }: { attendees: Attendee[]; users: User[]; onChange: (v: Attendee[]) => void }) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [role, setRole] = useState('');

  function addUser() {
    if (!selectedUserId) return;
    const u = users.find(u => u.id === Number(selectedUserId));
    if (!u || attendees.some(a => a.userId === u.id)) return;
    onChange([...attendees, { id: uid(), userId: u.id, name: u.name, email: u.email, role }]);
    setSelectedUserId(''); setRole('');
  }

  function addManual() {
    if (!manualName.trim()) return;
    onChange([...attendees, { id: uid(), name: manualName.trim(), email: manualEmail.trim(), role }]);
    setManualName(''); setManualEmail(''); setRole('');
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <Users className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold">Attendees</h3>
        <span className="text-[11px] text-white/40 bg-white/8 px-1.5 py-0.5 rounded-full">{attendees.length}</span>
      </div>

      {attendees.length === 0 && (
        <p className="text-xs text-white/35 italic mb-4">No attendees added yet.</p>
      )}

      {attendees.length > 0 && (
        <div className="space-y-1.5 mb-5">
          {attendees.map(a => (
            <div key={a.id} className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 group">
              <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-blue-400">{a.name[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{a.name}</p>
                {a.email && <p className="text-[11px] text-white/40 truncate">{a.email}</p>}
              </div>
              {a.role && <span className="text-[11px] bg-white/8 text-white/50 px-2 py-0.5 rounded-full flex-shrink-0">{a.role}</span>}
              <button
                onClick={() => onChange(attendees.filter(at => at.id !== a.id))}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/35 hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {/* Add from users */}
        <div className="border border-white/8 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">Add from Users</p>
          <div className="flex gap-2">
            <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className={cn(selectCls, 'flex-1')}>
              <option value="">— Select user —</option>
              {users.filter(u => !attendees.some(a => a.userId === u.id)).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role" className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-white/25" />
            <button onClick={addUser} className="flex items-center gap-1 bg-blue-600/20 border border-blue-500/30 text-blue-400 px-3 py-2 rounded-lg text-xs hover:bg-blue-600/30 transition-colors">
              <Plus className="w-3.5 h-3.5" />Add
            </button>
          </div>
        </div>

        {/* Add external */}
        <div className="border border-white/8 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">Add External Attendee</p>
          <div className="flex gap-2 flex-wrap">
            <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Name *" className={cn(inputCls, 'flex-1 min-w-28')} />
            <input value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="Email" className={cn(inputCls, 'flex-1 min-w-28')} />
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role" className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-white/25" />
            <button onClick={addManual} className="flex items-center gap-1 bg-blue-600/20 border border-blue-500/30 text-blue-400 px-3 py-2 rounded-lg text-xs hover:bg-blue-600/30 transition-colors">
              <Plus className="w-3.5 h-3.5" />Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Discussions Tab ───────────────────────────────────────────────────────────

function DiscussionsTab({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <MessageSquare className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold">Key Discussions</h3>
      </div>
      <textarea
        value={value} onChange={e => onChange(e.target.value)}
        placeholder="Record the key discussions, decisions made, and important points raised during the meeting…"
        rows={16}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none leading-relaxed placeholder-white/25"
      />
      <p className="text-[11px] text-white/30 mt-1.5">{value.length.toLocaleString()} characters · auto-saved</p>
    </div>
  );
}

// ── Actions Tab ───────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = { low: 'text-white/45', medium: 'text-yellow-400', high: 'text-red-400' };

function ActionsTab({ meetingId, actions, users, onChange }: { meetingId: number; actions: ActionItem[]; users: User[]; onChange: (v: ActionItem[]) => void }) {
  const { toast } = useToast();
  const [newText, setNewText] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newPriority, setNewPriority] = useState<ActionItem['priority']>('medium');
  const [converting, setConverting] = useState<string | null>(null);

  function addAction() {
    if (!newText.trim()) return;
    onChange([...actions, { id: uid(), text: newText.trim(), assigneeName: newAssignee, dueDate: newDue, priority: newPriority, status: 'open', taskId: null }]);
    setNewText(''); setNewAssignee(''); setNewDue(''); setNewPriority('medium');
  }

  async function convertToTask(action: ActionItem) {
    if (action.taskId) { toast({ title: 'Already linked to a task', description: `Task #${action.taskId}` }); return; }
    setConverting(action.id);
    try {
      const r = await fetch(`${API}/meetings/${meetingId}/actions/${action.id}/create-task`, {
        method: 'POST', headers: fetchHeaders(),
        body: JSON.stringify({ name: action.text, priority: action.priority ?? 'medium' }),
      });
      if (!r.ok) throw new Error();
      const { task, actions: updatedActions } = await r.json();
      onChange(updatedActions);
      toast({ title: 'Task created', description: `"${task.name}" added · #${task.id}` });
    } catch {
      toast({ title: 'Error creating task', variant: 'destructive' });
    } finally { setConverting(null); }
  }

  const open = actions.filter(a => a.status === 'open');
  const done = actions.filter(a => a.status === 'done');

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <ClipboardList className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold">Action Items</h3>
        <span className="text-[11px] text-white/40 bg-white/8 px-1.5 py-0.5 rounded-full">{actions.length}</span>
        {actions.filter(a => a.taskId).length > 0 && (
          <span className="text-[11px] text-emerald-400">{actions.filter(a => a.taskId).length} linked to tasks</span>
        )}
      </div>

      {actions.length === 0 && (
        <p className="text-xs text-white/35 italic mb-4">No action items recorded yet.</p>
      )}

      <div className="space-y-2 mb-4">
        {[...open, ...done].map(action => (
          <div
            key={action.id}
            className={cn(
              'flex items-start gap-3 border rounded-xl px-4 py-3 group transition-colors',
              action.status === 'done' ? 'border-white/6 bg-white/2 opacity-60' : 'border-white/10 bg-white/4'
            )}
          >
            <button
              onClick={() => onChange(actions.map(a => a.id === action.id ? { ...a, status: a.status === 'done' ? 'open' : 'done' } : a))}
              className="mt-0.5 flex-shrink-0"
            >
              {action.status === 'done'
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : <Circle className="w-4 h-4 text-white/35 hover:text-blue-400 transition-colors" />
              }
            </button>
            <div className="flex-1 min-w-0">
              <input
                value={action.text}
                onChange={e => onChange(actions.map(a => a.id === action.id ? { ...a, text: e.target.value } : a))}
                className={cn('w-full bg-transparent text-sm focus:outline-none', action.status === 'done' ? 'line-through text-white/40' : 'text-white')}
              />
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {action.assigneeName && (
                  <span className="text-[11px] text-white/45 flex items-center gap-1"><User className="w-3 h-3" />{action.assigneeName}</span>
                )}
                {action.dueDate && (
                  <span className="text-[11px] text-white/45 flex items-center gap-1"><Calendar className="w-3 h-3" />{action.dueDate}</span>
                )}
                {action.priority && (
                  <span className={cn('text-[11px] font-medium capitalize', PRIORITY_COLORS[action.priority])}>{action.priority}</span>
                )}
                {action.taskId && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Task #{action.taskId}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!action.taskId && (
                <button
                  onClick={() => convertToTask(action)} disabled={converting === action.id}
                  title="Convert to Task"
                  className="flex items-center gap-1 text-[11px] bg-violet-600/15 border border-violet-500/25 text-violet-400 px-2 py-1 rounded-lg hover:bg-violet-600/25 transition-colors disabled:opacity-50"
                >
                  {converting === action.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                  Task
                </button>
              )}
              <button
                onClick={() => onChange(actions.filter(a => a.id !== action.id))}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-white/35 hover:text-red-400 hover:bg-red-400/10 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div className="border border-white/8 rounded-xl p-4 space-y-3">
        <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Add Action Item</p>
        <input
          value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addAction()}
          placeholder="Describe the action item… (Enter to add)"
          className={inputCls}
        />
        <div className="flex gap-2 flex-wrap">
          <input value={newAssignee} onChange={e => setNewAssignee(e.target.value)} placeholder="Assignee" className="flex-1 min-w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-white/25" />
          <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} className="flex-1 min-w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
          <select value={newPriority} onChange={e => setNewPriority(e.target.value as ActionItem['priority'])} className="bg-[hsl(var(--background))] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button onClick={addAction} className="flex items-center gap-1 bg-blue-600/20 border border-blue-500/30 text-blue-400 px-3 py-2 rounded-lg text-xs hover:bg-blue-600/30 transition-colors">
            <Plus className="w-3.5 h-3.5" />Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Links Tab ─────────────────────────────────────────────────────────────────

function LinksTab({ workflows, agents, linkedWfIds, linkedAgentIds, onWfChange, onAgentChange }: {
  workflows: Workflow[]; agents: AiAgent[]; linkedWfIds: number[]; linkedAgentIds: number[];
  onWfChange: (ids: number[]) => void; onAgentChange: (ids: number[]) => void;
}) {
  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold">Linked Workflows</h3>
          {linkedWfIds.length > 0 && <span className="text-[11px] text-white/40 bg-white/8 px-1.5 py-0.5 rounded-full">{linkedWfIds.length}</span>}
        </div>
        <p className="text-xs text-white/35 mb-3">Workflows relevant to or triggered by this meeting.</p>
        {workflows.length === 0 ? (
          <p className="text-xs text-white/35 italic">No workflows available.</p>
        ) : (
          <div className="space-y-1.5">
            {workflows.map(wf => {
              const linked = linkedWfIds.includes(wf.id);
              return (
                <button
                  key={wf.id}
                  onClick={() => onWfChange(linked ? linkedWfIds.filter(id => id !== wf.id) : [...linkedWfIds, wf.id])}
                  className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                    linked ? 'bg-violet-500/10 border-violet-500/25 text-violet-300' : 'border-white/8 text-white/50 hover:border-white/18 hover:text-white/70'
                  )}
                >
                  <div className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', linked ? 'bg-violet-500 border-violet-500' : 'border-white/20')}>
                    {linked && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-sm flex-1 text-left">{wf.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold">Linked AI Agents</h3>
          {linkedAgentIds.length > 0 && <span className="text-[11px] text-white/40 bg-white/8 px-1.5 py-0.5 rounded-full">{linkedAgentIds.length}</span>}
        </div>
        <p className="text-xs text-white/35 mb-3">AI Agents to run in relation to this meeting's outcomes.</p>
        {agents.length === 0 ? (
          <p className="text-xs text-white/35 italic">No AI agents available.</p>
        ) : (
          <div className="space-y-1.5">
            {agents.map(ag => {
              const linked = linkedAgentIds.includes(ag.id);
              return (
                <button
                  key={ag.id}
                  onClick={() => onAgentChange(linked ? linkedAgentIds.filter(id => id !== ag.id) : [...linkedAgentIds, ag.id])}
                  className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                    linked ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'border-white/8 text-white/50 hover:border-white/18 hover:text-white/70'
                  )}
                >
                  <div className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', linked ? 'bg-emerald-500 border-emerald-500' : 'border-white/20')}>
                    {linked && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-sm flex-1 text-left">{ag.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
