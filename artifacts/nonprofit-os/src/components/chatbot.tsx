import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Send, Plus, Trash2, ChevronDown, Bot, Loader2, Sparkles, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

interface Position { x: number; y: number }

const PANEL_W = 420;
const PANEL_H = 600;
const MARGIN = 24;

function defaultPosition(): Position {
  return {
    x: window.innerWidth - PANEL_W - MARGIN,
    y: window.innerHeight - PANEL_H - 96,
  };
}

const SUGGESTIONS = [
  "What processes have no target KPI set?",
  "Show me all Salesforce Contact records",
  "What are the KPIs for Fundraising processes?",
  "Query Salesforce opportunities by stage",
  "Which categories have the most processes?",
  "How can we improve Program Delivery performance?",
];

export function Chatbot() {
  const [open, setOpen] = useState(false);
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
  const [showConvList, setShowConvList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Drag handling
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

    const onUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  // Keep panel on screen when window resizes
  useEffect(() => {
    const onResize = () => {
      setPos(prev => ({
        x: Math.max(0, Math.min(window.innerWidth - PANEL_W, prev.x)),
        y: Math.max(0, Math.min(window.innerHeight - PANEL_H, prev.y)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages, streamingContent]);

  useEffect(() => {
    if (open) {
      fetchConversations();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/anthropic/conversations');
      setConversations(await res.json());
    } catch {}
  };

  const loadConversation = async (id: number) => {
    try {
      const res = await fetch(`/api/anthropic/conversations/${id}`);
      const data = await res.json();
      setActiveConvId(id);
      setMessages(data.messages ?? []);
      setShowConvList(false);
    } catch {}
  };

  const createConversation = async (firstMessage: string) => {
    const title = firstMessage.length > 50 ? firstMessage.slice(0, 47) + '...' : firstMessage;
    const res = await fetch('/api/anthropic/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const conv = await res.json();
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
    setMessages([]);
    return conv.id as number;
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/anthropic/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  };

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content, createdAt: new Date().toISOString() }]);

    try {
      let convId = activeConvId;
      if (!convId) convId = await createConversation(content);

      const res = await fetch(`/api/anthropic/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          } catch {}
        }
      }

      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: fullContent, createdAt: new Date().toISOString() }]);
      setStreamingContent('');
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', createdAt: new Date().toISOString() }]);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, streaming, activeConvId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startNewChat = () => {
    setActiveConvId(null); setMessages([]); setStreamingContent('');
    setShowConvList(false); setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Floating trigger button — always anchored bottom-right
  const btnRight = window.innerWidth - pos.x - PANEL_W;
  const btnBottom = window.innerHeight - pos.y - PANEL_H;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "fixed z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
          open ? "bg-card border border-border" : "bg-primary hover:bg-primary/90"
        )}
        style={{ bottom: 24, right: 24 }}
        title="AI Assistant"
      >
        {open ? <X className="w-5 h-5 text-foreground" /> : <Sparkles className="w-6 h-6 text-primary-foreground" />}
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
            height: PANEL_H,
            zIndex: 50,
            userSelect: isDragging ? 'none' : undefined,
          }}
          className="bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Drag handle header */}
          <div
            onMouseDown={onHeaderMouseDown}
            className={cn(
              "flex items-center justify-between px-4 py-3 border-b border-border bg-card",
              isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">AI Assistant</div>
                <div className="text-[10px] text-muted-foreground">Database & Salesforce advisor (read-only)</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <GripHorizontal className="w-4 h-4 text-muted-foreground/30 mr-1 pointer-events-none" />
              <button
                onClick={() => setShowConvList(v => !v)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Conversation history"
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
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Conversation list */}
          {showConvList && (
            <div className="border-b border-border bg-sidebar max-h-44 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">No conversations yet</p>
              ) : conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 cursor-pointer group hover:bg-secondary/50 transition-colors",
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
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !streaming && (
              <div className="space-y-4">
                <div className="text-center text-muted-foreground text-xs pt-4">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-primary/40" />
                  <p className="font-medium text-foreground text-sm">Ask me anything</p>
                  <p className="mt-1">I have context on all 101 processes, KPIs, targets, benchmarks, and can query Salesforce data (read-only).</p>
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

            {messages.map(msg => (
              <div key={msg.id} className={cn("flex gap-2", msg.role === 'user' ? "justify-end" : "justify-start")}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                  msg.role === 'user'
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-foreground rounded-bl-sm"
                )}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-1 prose-blockquote:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {streaming && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="max-w-[85%] bg-secondary rounded-xl rounded-bl-sm px-3 py-2 text-sm">
                  {streamingContent ? (
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 py-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 bg-card">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about processes, KPIs, or Salesforce data..."
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
              Salesforce queries are read-only · Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
}
