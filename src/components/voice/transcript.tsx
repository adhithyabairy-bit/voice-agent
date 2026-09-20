'use client';

import { useEffect, useRef } from 'react';
import { User, Bot } from 'lucide-react';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0 && !isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          Conversation will appear here
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-3 max-h-80 overflow-y-auto p-1 scroll-smooth"
      role="log"
      aria-label="Conversation transcript"
    >
      {messages.map((msg, index) => (
        <div
          key={index}
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
            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[var(--primary)] text-white rounded-br-md'
                : 'bg-[var(--muted)] text-[var(--foreground)] rounded-bl-md'
            }`}
          >
            <p className="m-0">{msg.content}</p>
            <p className={`text-[10px] mt-1 ${
              msg.role === 'user' ? 'text-white/60' : 'text-[var(--muted-foreground)]'
            }`}>
              {msg.role === 'user' ? 'You' : 'AI'} · {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}

      {/* Typing indicator */}
      {isProcessing && (
        <div className="flex gap-3 animate-fade-in">
          <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-violet-500/10 text-violet-600">
            <Bot size={14} />
          </div>
          <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-[var(--muted)]">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
