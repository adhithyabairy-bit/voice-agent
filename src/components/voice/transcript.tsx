'use client';

import { useEffect, useRef, useState } from 'react';
import { User, Bot, ArrowDown } from 'lucide-react';

interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface TranscriptProps {
  messages: TranscriptMessage[];
  isProcessing?: boolean;
}

export function Transcript({ messages, isProcessing }: TranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Monitor user scroll position: detect if user manually scrolled up
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Consider at bottom if within 60px of the bottom edge
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  // Auto-scroll when messages update or processing changes
  useEffect(() => {
    // If the user hasn't scrolled up to read old history, auto-scroll to latest
    if (isAtBottom) {
      // Use 'auto' behavior during streaming updates to prevent smooth scroll interruption/stuck states
      scrollToBottom('auto');
    }
  }, [messages, isProcessing, isAtBottom]);

  if (messages.length === 0 && !isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          Conversation transcript will appear here in real time
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex flex-col gap-3 max-h-96 overflow-y-auto p-2 pr-3 scrollbar-thin"
        role="log"
        aria-label="Conversation transcript"
      >
        {messages.map((msg, index) => (
          <div
            key={`${msg.timestamp}-${index}`}
            className={`flex gap-3 animate-fade-in ${
              msg.role === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            {/* Avatar */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                msg.role === 'user'
                  ? 'bg-blue-500/10 text-blue-600'
                  : 'bg-violet-500/10 text-violet-600'
              }`}
            >
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>

            {/* Message bubble */}
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-[var(--primary)] text-white rounded-br-md'
                  : 'bg-[var(--muted)] text-[var(--foreground)] rounded-bl-md border border-[var(--border)]'
              }`}
            >
              <p className="m-0 whitespace-pre-wrap">{msg.content || '...'}</p>
              <p
                className={`text-[10px] mt-1 ${
                  msg.role === 'user' ? 'text-white/70' : 'text-[var(--muted-foreground)]'
                }`}
              >
                {msg.role === 'user' ? 'You' : 'AI'} ·{' '}
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}

        {/* Typing / Generating indicator */}
        {isProcessing && (
          <div className="flex gap-3 animate-fade-in">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-violet-500/10 text-violet-600">
              <Bot size={14} />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-[var(--muted)] border border-[var(--border)]">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full bg-[var(--primary)] animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
                <span className="text-[11px] text-[var(--muted-foreground)] ml-1">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {/* Auto-scroll anchor point */}
        <div ref={bottomRef} className="h-1 w-full" />
      </div>

      {/* Floating 'Scroll to latest' button if user scrolled up */}
      {!isAtBottom && messages.length > 2 && (
        <button
          onClick={() => {
            setIsAtBottom(true);
            scrollToBottom('smooth');
          }}
          className="absolute bottom-3 right-4 flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-full shadow-md hover:bg-[var(--muted)] transition-all animate-fade-in"
          aria-label="Scroll to newest messages"
        >
          <ArrowDown size={12} />
          <span>Latest</span>
        </button>
      )}
    </div>
  );
}
