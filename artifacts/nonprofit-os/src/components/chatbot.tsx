import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageCircle, X, Send, Plus, Trash2, ChevronDown, Bot, Loader2, Sparkles } from 'lucide-react';
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

const SUGGESTIONS = [
  "What processes have no target KPI set?",
  "Recommend steps to meet the benchmark for Grant Assessment",
  "Which categories have the most processes?",
  "What are the KPIs for Fundraising processes?",
  "Suggest improvements to meet Finance benchmarks",
  "How can we improve Program Delivery performance?",
];

export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showConvList, setShowConvList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent]);

  useEffect(() => {
    if (open) {
      fetchConversations();
      inputRef.current?.focus();
    }
  }, [open]);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/anthropic/conversations');
      const data = await res.json();
      setConversations(data);
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
    return conv.id;
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/anthropic/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
  };

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingContent('');

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      let convId = activeConvId;
      if (!convId) {
        convId = await createConversation(content);
      }

      const res = await fetch(`/api/anthropic/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) throw new Error('Failed to send message');
      if (!res.body) throw new Error('No response body');

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
            if (parsed.content) {
              fullContent += parsed.content;
              setStreamingContent(fullContent);
            }
          } catch {}
        }
      }

      const aiMsg: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: fullContent,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setStreamingContent('');
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, streaming, activeConvId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setStreamingContent('');
    setShowConvList(false);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
          open ? "bg-card border border-border" : "bg-primary hover:bg-primary/90"
        )}
        title="AI Assistant"
      >
        {open ? <X className="w-5 h-5 text-foreground" /> : <Sparkles className="w-6 h-6 text-primary-foreground" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[420px] h-[600px] max-h-[80vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">AI Assistant</div>
                <div className="text-[10px] text-muted-foreground">Database-aware nonprofit advisor</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
            </div>
          </div>

          {/* Conversation list dropdown */}
          {showConvList && (
            <div className="border-b border-border bg-sidebar max-h-44 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">No conversations yet</p>
              ) : (
                conversations.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 cursor-pointer group hover:bg-secondary/50 transition-colors",
                      activeConvId === conv.id && "bg-primary/10"
                    )}
                  >
                    <span className={cn(
                      "text-xs truncate flex-1",
                      activeConvId === conv.id ? "text-primary font-medium" : "text-foreground/80"
                    )}>
                      {conv.title}
                    </span>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="shrink-0 ml-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !streaming && (
              <div className="space-y-4">
                <div className="text-center text-muted-foreground text-xs pt-4">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-primary/40" />
                  <p className="font-medium text-foreground text-sm">Ask me anything</p>
                  <p className="mt-1">I have full context on all 101 processes, KPIs, targets, and benchmarks.</p>
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

            {/* Streaming message */}
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
                placeholder="Ask about processes, KPIs, benchmarks..."
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
            <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">Powered by Claude · Press Enter to send, Shift+Enter for new line</p>
          </div>

        </div>
      )}
    </>
  );
}
