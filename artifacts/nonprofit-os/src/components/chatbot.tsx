import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Send, Plus, Trash2, ChevronDown, Bot, Loader2, Sparkles, GripHorizontal, MessageSquare, Minus, ExternalLink, Wrench, CheckCircle2, XCircle, Layers, ArrowRight, Hash, GitBranch, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dispatchCreditsRefresh } from '@/hooks/use-credits';
import { useAuth } from '@/contexts/AuthContext';

const API = '/api';

export const NAVIGATE_KNOWLEDGE_EVENT = 'navigate-knowledge-item';

function dispatchNavigateKnowledge(itemId: number) {
  window.dispatchEvent(new CustomEvent(NAVIGATE_KNOWLEDGE_EVENT, { detail: { itemId } }));
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
const mdComponents = {
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) => {
    if (href?.startsWith('knowledge://item-')) {
      const itemId = parseInt(href.replace('knowledge://item-', ''), 10);
      if (!isNaN(itemId)) {
        return (
          <button
            onClick={() => dispatchNavigateKnowledge(itemId)}
            className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer font-medium"
          >
            {children}
            <ExternalLink className="w-3 h-3 inline flex-shrink-0" />
          </button>
        );
      }
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message { id: number; role: 'user' | 'assistant'; content: string; createdAt: string }
interface Conversation { id: number; title: string; createdAt: string }
interface Position { x: number; y: number }
interface Queue { id: number; name: string; color: string }

interface PendingTask {
  task_id: number;
  task_number: number;
  task_name: string;
  agent_name: string;
}

interface MentionUser { id: number; name: string; email: string; role?: string }
interface MentionProcess { id: number; processName: string; category?: string }
interface MentionField { key: string; label: string; hasSublist?: boolean }
interface MentionWorkflow { id: number; workflowNumber: number; name: string; description: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
const PANEL_W = 440;
const PANEL_H = 560;
const MARGIN = 24;
// The sidebar in layout.tsx is w-64 = 256px. We open the chat panel just to the
// right of the sidebar so it NEVER covers the right-side action buttons (Add, Edit, etc.)
// that live at the far right of every view header.
const SIDEBAR_W = 256;

function defaultPosition(): Position {
  return { x: SIDEBAR_W + 8, y: window.innerHeight - PANEL_H - 96 };
}

const SUGGESTIONS = [
  "What processes have no target KPI set?",
  "Show me all activities this month",
  "What are the KPIs for Fundraising processes?",
  "Which categories have the most processes?",
  "How can we improve Program Delivery performance?",
  "List processes with a red traffic light",
];

/** Extract the "Final action taken:" line (if any) from an AI response, returns [bodyText, finalAction] */
function parseFinalAction(content: string): [string, string | null] {
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim();
    if (line.startsWith('**Final action taken:**')) {
      const action = line.replace('**Final action taken:**', '').trim();
      const body = lines.slice(0, i).join('\n').trim();
      return [body, action];
    }
  }
  return [content, null];
}

// ── Queue picker widget ───────────────────────────────────────────────────────
function QueuePicker({
  task,
  queues,
  onSelect,
  onDismiss,
}: {
  task: PendingTask;
  queues: Queue[];
  onSelect: (queueId: number, queueName: string) => void;
  onDismiss: () => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  async function pick(q: Queue) {
    setSelecting(true);
    setSelected(q.name);
    try {
      await onSelect(q.id, q.name);
    } finally {
      setSelecting(false);
    }
  }

  if (selected) {
    return (
      <div className="mt-2 px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-xs text-green-400 flex items-center gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        Task #{task.task_number} routed to <strong>{selected}</strong> queue.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-50/10 dark:bg-amber-900/10 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <p className="text-xs font-semibold text-amber-300">Route task to a queue</p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Task #{task.task_number} <em>"{task.task_name}"</em> was created by <strong>{task.agent_name}</strong>.
        Select a queue to route it to:
      </p>
      <div className="flex flex-wrap gap-2">
        {queues.map(q => (
          <button
            key={q.id}
            onClick={() => pick(q)}
            disabled={selecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary border border-border text-xs font-medium text-foreground transition-colors disabled:opacity-50"
          >
            <ArrowRight className="w-3 h-3" />
            {q.name}
          </button>
        ))}
      </div>
      <button onClick={onDismiss} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors underline">
        Skip (no queue)
      </button>
    </div>
  );
}

// ── Main chatbot component ────────────────────────────────────────────────────
export function Chatbot() {
  const { fetchHeaders } = useAuth();
  const [open, setOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [pos, setPos] = useState<Position>(() => defaultPosition());
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; panelX: number; panelY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingPrompt, setStreamingPrompt] = useState('');
  const [toolEvents, setToolEvents] = useState<Array<{ type: 'call' | 'result'; name: string; success?: boolean; message?: string }>>([]);
  const [showConvList, setShowConvList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Queue picker state
  const [queues, setQueues] = useState<Queue[]>([]);
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
  const [queueDismissed, setQueueDismissed] = useState(false);

  // Slash-mention picker state
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionProcesses, setMentionProcesses] = useState<MentionProcess[]>([]);
  const [mentionFields, setMentionFields] = useState<MentionField[]>([]);
  const [mentionWorkflows, setMentionWorkflows] = useState<MentionWorkflow[]>([]);
  const [mentionLoaded, setMentionLoaded] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const slashIdxRef = useRef<number>(-1);

  // ── Drag handling ───────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panelX: pos.x, panelY: pos.y };
    setIsDragging(true);
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(0, Math.min(window.innerWidth - PANEL_W, dragStartRef.current.panelX + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - PANEL_H, dragStartRef.current.panelY + dy));
      setPos({ x: newX, y: newY });
    };
    const onUp = () => { setIsDragging(false); dragStartRef.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  useEffect(() => {
    const onResize = () => setPos(prev => ({
      x: Math.max(0, Math.min(window.innerWidth - PANEL_W, prev.x)),
      y: Math.max(0, Math.min(window.innerHeight - PANEL_H, prev.y)),
    }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages, streamingContent]);

  useEffect(() => {
    if (open) {
      fetchConversations();
      loadQueues();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const loadQueues = async () => {
    try {
      const r = await fetch(`${API}/org/task-queues`, { headers: fetchHeaders() });
      if (r.ok) setQueues(await r.json());
    } catch {}
  };

  // ── Slash-mention helpers ────────────────────────────────────────────────────
  const loadMentionData = async () => {
    if (mentionLoaded) return;
    try {
      const [ur, pr, fr, wr] = await Promise.all([
        fetch(`${API}/users`, { headers: fetchHeaders() }),
        fetch(`${API}/processes`, { headers: fetchHeaders() }),
        fetch(`${API}/ai-agents/meta/process-fields`, { headers: fetchHeaders() }),
        fetch(`${API}/workflows`, { headers: fetchHeaders() }),
      ]);
      if (ur.ok) setMentionUsers(await ur.json());
      if (pr.ok) setMentionProcesses(await pr.json());
      if (fr.ok) setMentionFields(await fr.json());
      if (wr.ok) setMentionWorkflows(await wr.json());
      setMentionLoaded(true);
    } catch {}
  };

  const openMentionPicker = (ta: HTMLTextAreaElement) => {
    slashIdxRef.current = ta.selectionStart;
    setMentionQuery('');
    setMentionHighlight(0);
    setShowMention(true);
    loadMentionData();
  };

  const closeMentionPicker = () => { setShowMention(false); setMentionQuery(''); };

  const insertMention = (text: string) => {
    const ta = inputRef.current;
    if (!ta) return;
    const before = input.slice(0, slashIdxRef.current);
    const after = input.slice(ta.selectionStart);
    setInput(`${before}${text} ${after}`);
    closeMentionPicker();
    setTimeout(() => ta.focus(), 0);
  };

  const mentionQ = mentionQuery.toLowerCase();
  const filteredMentionFields = mentionFields.filter(f =>
    f.key.toLowerCase().includes(mentionQ) || f.label.toLowerCase().includes(mentionQ)
  );
  const filteredMentionWorkflows = mentionWorkflows.filter(w =>
    w.name.toLowerCase().includes(mentionQ)
  );
  const filteredMentionUsers = mentionUsers.filter(u =>
    u.name.toLowerCase().includes(mentionQ) || u.email.toLowerCase().includes(mentionQ)
  );
  const filteredMentionProcesses = mentionProcesses.filter(p =>
    (p.processName || '').toLowerCase().includes(mentionQ) ||
    (p.category || '').toLowerCase().includes(mentionQ)
  );
  const allMentionItems: Array<{ label: string; sub: string; text: string }> = [
    ...filteredMentionFields.map(f => ({ label: f.label, sub: `{{${f.key}}}`, text: `{{${f.key}}}` })),
    ...filteredMentionWorkflows.map(w => ({ label: w.name, sub: `{{workflow:${w.name}}}`, text: `{{workflow:${w.name}}}` })),
    ...filteredMentionUsers.map(u => ({ label: u.name, sub: u.role ?? u.email, text: `@${u.name}` })),
    ...filteredMentionProcesses.map(p => ({ label: p.processName, sub: p.category ?? 'Process', text: `[${p.processName}]` })),
  ];

  // ── Conversation management ─────────────────────────────────────────────────
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API}/anthropic/conversations`, { headers: fetchHeaders() });
      setConversations(await res.json());
    } catch {}
  };

  const loadConversation = async (id: number) => {
    try {
      const res = await fetch(`${API}/anthropic/conversations/${id}`, { headers: fetchHeaders() });
      const data = await res.json();
      setActiveConvId(id); setMessages(data.messages ?? []);
      setShowConvList(false); setPendingTask(null); setQueueDismissed(false);
    } catch {}
  };

  const createConversation = async (firstMessage: string) => {
    const title = firstMessage.length > 50 ? firstMessage.slice(0, 47) + '...' : firstMessage;
    const res = await fetch(`${API}/anthropic/conversations`, {
      method: 'POST',
      headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const conv = await res.json();
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id); setMessages([]);
    return conv.id as number;
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API}/anthropic/conversations/${id}`, { method: 'DELETE', headers: fetchHeaders() });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  };

  // ── Queue assignment ────────────────────────────────────────────────────────
  const assignQueue = async (taskId: number, queueId: number, _queueName: string) => {
    await fetch(`${API}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...fetchHeaders() },
      body: JSON.stringify({ queueId }),
    });
    setPendingTask(null);
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setStreamingPrompt(content);
    setToolEvents([]);
    setPendingTask(null);
    setQueueDismissed(false);
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content, createdAt: new Date().toISOString() }]);

    try {
      let convId = activeConvId;
      if (!convId) convId = await createConversation(content);

      const res = await fetch(`${API}/anthropic/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { ...fetchHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.done) break;
            if (parsed.content) { fullContent += parsed.content; setStreamingContent(fullContent); }
            if (parsed.tool_call) {
              setToolEvents(prev => [...prev, { type: 'call', name: parsed.tool_call.name }]);
            }
            if (parsed.tool_result) {
              setToolEvents(prev => [
                ...prev.filter(e => !(e.type === 'call' && e.name === parsed.tool_result.name)),
                { type: 'result', name: parsed.tool_result.name, success: parsed.tool_result.success, message: parsed.tool_result.message },
              ]);
              // Capture pending task for queue picker
              if (parsed.tool_result.name === 'create_task' && parsed.tool_result.success && parsed.tool_result.data) {
                setPendingTask(parsed.tool_result.data as PendingTask);
              }
            }
          } catch {}
        }
      }

      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: fullContent, createdAt: new Date().toISOString() }]);
      setStreamingContent('');
      setStreamingPrompt('');
      setToolEvents([]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', createdAt: new Date().toISOString() }]);
      setStreamingPrompt('');
    } finally {
      setStreaming(false);
      dispatchCreditsRefresh();
      inputRef.current?.focus();
    }
  }, [input, streaming, activeConvId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMention) {
      if (e.key === 'Escape') { e.preventDefault(); closeMentionPicker(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight(h => Math.min(h + 1, allMentionItems.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight(h => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = allMentionItems[mentionHighlight];
        if (item) insertMention(item.text);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setInput(val);
    if (showMention) {
      const afterSlash = val.slice(slashIdxRef.current + 1, cursor);
      if (afterSlash.includes(' ') || afterSlash.includes('\n') || cursor <= slashIdxRef.current) {
        closeMentionPicker();
      } else {
        setMentionQuery(afterSlash);
        setMentionHighlight(0);
      }
    } else {
      if (e.nativeEvent instanceof InputEvent && e.nativeEvent.data === '/' && inputRef.current) {
        openMentionPicker(inputRef.current);
      }
    }
  };

  const startNewChat = () => {
    setActiveConvId(null); setMessages([]); setStreamingContent(''); setStreamingPrompt('');
    setShowConvList(false); setInput(''); setPendingTask(null); setQueueDismissed(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Group messages into exchanges ────────────────────────────────────────────
  const exchanges = useMemo(() => {
    const result: Array<{ user: Message; assistant?: Message }> = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        const next = messages[i + 1];
        result.push({ user: messages[i], assistant: next?.role === 'assistant' ? next : undefined });
        if (next?.role === 'assistant') i++;
      }
    }
    return result;
  }, [messages]);

  const isLastExchange = (idx: number) => idx === exchanges.length - 1;

  return (
    <>
      {/* Floating trigger button — sits just right of the sidebar so it never covers content */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "fixed z-[60] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
          open ? "bg-destructive/90 hover:bg-destructive" : "bg-primary hover:bg-primary/90"
        )}
        style={{ bottom: 24, left: SIDEBAR_W + 8 }}
        title={open ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {open ? <X className="w-6 h-6 text-white" /> : <Sparkles className="w-6 h-6 text-primary-foreground" />}
      </button>

      {/* Draggable chat panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            width: PANEL_W,
            height: isMinimized ? 'auto' : PANEL_H,
            zIndex: 50,
            userSelect: isDragging ? 'none' : undefined,
            transition: 'height 0.2s ease',
          }}
          className="bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Drag handle header */}
          <div
            onMouseDown={onHeaderMouseDown}
            className={cn(
              "flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-none",
              isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">AI Assistant Agent</div>
                <div className="text-[10px] text-muted-foreground">Advisor · task creation with human approval</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <GripHorizontal className="w-4 h-4 text-muted-foreground/30 mr-1 pointer-events-none" />
              <button
                onClick={() => setShowConvList(v => !v)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title={showConvList ? "Hide conversation history" : "Show conversation history"}
              >
                <ChevronDown className={cn("w-4 h-4 transition-transform", showConvList && "rotate-180")} />
              </button>
              <button
                onClick={startNewChat}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="New conversation"
              >
                <Plus className="w-4 h-4" />
              </button>
              {/* ── Minimize toggle: shows + when minimized, - when open ── */}
              <button
                onClick={() => setIsMinimized(v => !v)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title={isMinimized ? "Restore" : "Minimize"}
              >
                {isMinimized ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { setOpen(false); setIsMinimized(false); }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body — hidden when minimized */}
          <div className={cn("flex flex-col flex-1 overflow-hidden", isMinimized && "hidden")}>

            {/* Conversation history */}
            {showConvList && (
              <div className="border-b border-border bg-sidebar flex-none">
                <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-muted-foreground/60 tracking-wider">CONVERSATION HISTORY</p>
                  <span className="text-[10px] text-muted-foreground/40">{conversations.length} chat{conversations.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: '120px' }}>
                  {conversations.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center italic">No previous conversations</p>
                  ) : conversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 cursor-pointer group hover:bg-secondary/50 transition-colors",
                        activeConvId === conv.id && "bg-primary/10"
                      )}
                    >
                      <span className={cn("text-xs truncate flex-1", activeConvId === conv.id ? "text-primary font-medium" : "text-foreground/80")}>
                        {conv.title}
                      </span>
                      <button
                        onClick={(e) => deleteConversation(conv.id, e)}
                        className="shrink-0 ml-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">

              {/* Empty state */}
              {exchanges.length === 0 && !streaming && (
                <div className="space-y-4">
                  <div className="text-center text-muted-foreground text-xs pt-2">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-primary/40" />
                    <p className="font-medium text-foreground text-sm">Ask me anything</p>
                    <p className="mt-1">I have context on all processes, KPIs, targets, and benchmarks. I can propose database changes as tasks for human approval.</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Suggestions</p>
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="w-full text-left text-xs px-3 py-2 bg-secondary/50 hover:bg-secondary rounded-lg text-foreground/80 hover:text-foreground transition-colors border border-transparent hover:border-border"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Render each prompt → response exchange */}
              {exchanges.map(({ user, assistant }, idx) => {
                const isCurrentlyStreaming = streaming && idx === exchanges.length - 1 && !assistant;
                const isLast = isLastExchange(idx);

                // For assistant content: parse out final action line
                const [bodyContent, finalAction] = assistant ? parseFinalAction(assistant.content) : [null, null];
                const [streamBody, streamFinalAction] = isCurrentlyStreaming ? parseFinalAction(streamingContent) : [streamingContent, null];

                return (
                  <div key={user.id} className="space-y-2">
                    {/* User prompt */}
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold text-muted-foreground/60 tracking-wider mb-0.5">YOUR PROMPT</div>
                        <div className="text-xs text-foreground/80 bg-secondary/40 rounded-lg px-3 py-2 border border-border/40 whitespace-pre-wrap break-words">
                          {user.content}
                        </div>
                      </div>
                    </div>

                    {/* AI response */}
                    {(assistant || isCurrentlyStreaming) && (
                      <div className="flex items-start gap-2 pl-2">
                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className={cn("w-3.5 h-3.5 text-primary", isCurrentlyStreaming && "animate-pulse")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-primary/60 tracking-wider mb-0.5">AI RESPONSE</div>
                          <div className="bg-secondary text-foreground rounded-xl px-3 py-2.5 text-sm space-y-2">
                            {/* Tool events during streaming */}
                            {isCurrentlyStreaming && toolEvents.length > 0 && (
                              <div className="space-y-1 pb-1 border-b border-border/40">
                                {toolEvents.map((ev, i) => (
                                  <div key={i} className={cn(
                                    "flex items-center gap-1.5 text-[10px] font-medium rounded-lg px-2 py-1",
                                    ev.type === 'call' ? "bg-amber-500/10 text-amber-400" :
                                    ev.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                  )}>
                                    {ev.type === 'call' ? (
                                      <Wrench className="w-3 h-3 animate-spin flex-shrink-0" />
                                    ) : ev.success ? (
                                      <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                                    ) : (
                                      <XCircle className="w-3 h-3 flex-shrink-0" />
                                    )}
                                    <span className="truncate">
                                      {ev.type === 'call'
                                        ? `Calling ${ev.name.replace(/_/g, ' ')}…`
                                        : ev.message}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Main response body */}
                            {assistant ? (
                              bodyContent ? (
                                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-1 prose-blockquote:my-1">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{bodyContent}</ReactMarkdown>
                                </div>
                              ) : null
                            ) : streamBody ? (
                              <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{streamBody}</ReactMarkdown>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 py-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                              </div>
                            )}

                            {/* Final action taken — highlighted box */}
                            {(finalAction ?? streamFinalAction) && (
                              <div className="flex items-start gap-2 mt-1.5 px-2.5 py-2 rounded-lg bg-primary/10 border border-primary/20 text-[11px] text-primary/80">
                                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary" />
                                <div>
                                  <span className="font-semibold text-primary">Final action taken: </span>
                                  {finalAction ?? streamFinalAction}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Queue picker — shown after last assistant response that created a task */}
                          {isLast && !streaming && pendingTask && !queueDismissed && (
                            <QueuePicker
                              task={pendingTask}
                              queues={queues}
                              onSelect={(queueId, queueName) => assignQueue(pendingTask.task_id, queueId, queueName)}
                              onDismiss={() => setQueueDismissed(true)}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3 bg-card flex-none">
              {/* Slash-mention picker */}
              {showMention && (
                <div className="mb-2 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
                  <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Insert reference</span>
                    {mentionQuery && <span className="text-[10px] text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded">/{mentionQuery}</span>}
                  </div>
                  {allMentionItems.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground italic">{mentionLoaded ? 'No matches' : 'Loading…'}</div>
                  ) : (
                    <>
                      {filteredMentionFields.length > 0 && (
                        <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/20">Fields</div>
                      )}
                      {filteredMentionFields.map((f, i) => (
                        <button
                          key={`f-${f.key}`}
                          onMouseDown={e => { e.preventDefault(); insertMention(`{{${f.key}}}`); }}
                          className={cn("w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary/60 transition-colors", mentionHighlight === i && "bg-secondary/60")}
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Hash className="w-3 h-3 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-foreground truncate">{f.label}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{`{{${f.key}}}`}</div>
                          </div>
                        </button>
                      ))}
                      {filteredMentionWorkflows.length > 0 && (
                        <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/20">Workflows</div>
                      )}
                      {filteredMentionWorkflows.map((w, i) => {
                        const globalIdx = filteredMentionFields.length + i;
                        return (
                          <button
                            key={`w-${w.id}`}
                            onMouseDown={e => { e.preventDefault(); insertMention(`{{workflow:${w.name}}}`); }}
                            className={cn("w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary/60 transition-colors", mentionHighlight === globalIdx && "bg-secondary/60")}
                          >
                            <div className="w-6 h-6 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                              <GitBranch className="w-3 h-3 text-orange-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground truncate">{w.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate">{`{{workflow:${w.name}}}`}</div>
                            </div>
                          </button>
                        );
                      })}
                      {filteredMentionUsers.length > 0 && (
                        <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/20">Users</div>
                      )}
                      {filteredMentionUsers.map((u, i) => {
                        const globalIdx = filteredMentionFields.length + filteredMentionWorkflows.length + i;
                        return (
                          <button
                            key={`u-${u.id}`}
                            onMouseDown={e => { e.preventDefault(); insertMention(`@${u.name}`); }}
                            className={cn("w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary/60 transition-colors", mentionHighlight === globalIdx && "bg-secondary/60")}
                          >
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                              <User className="w-3 h-3" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground truncate">{u.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{u.role ?? u.email}</div>
                            </div>
                            <span className="ml-auto text-[10px] font-mono text-muted-foreground/50 flex-shrink-0">@{u.name}</span>
                          </button>
                        );
                      })}
                      {filteredMentionProcesses.length > 0 && (
                        <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider bg-secondary/20">Processes</div>
                      )}
                      {filteredMentionProcesses.map((p, i) => {
                        const globalIdx = filteredMentionFields.length + filteredMentionWorkflows.length + filteredMentionUsers.length + i;
                        return (
                          <button
                            key={`p-${p.id}`}
                            onMouseDown={e => { e.preventDefault(); insertMention(`[${p.processName}]`); }}
                            className={cn("w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary/60 transition-colors", mentionHighlight === globalIdx && "bg-secondary/60")}
                          >
                            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                              <Layers className="w-3 h-3 text-blue-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground truncate">{p.processName}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{p.category ?? 'Process'}</div>
                            </div>
                            <span className="ml-auto text-[10px] font-mono text-muted-foreground/50 flex-shrink-0">[process]</span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything… type / to insert a field, workflow, user, or process reference"
                  rows={2}
                  disabled={streaming}
                  className="flex-1 resize-none bg-secondary/50 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 transition-all"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || streaming}
                  className="p-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded-xl transition-all"
                >
                  {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
                Database changes go through human approval · Enter to send · Shift+Enter for new line
              </p>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
