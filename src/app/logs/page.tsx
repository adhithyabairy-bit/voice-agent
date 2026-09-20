'use client';

// ============================================================
// Conversation Logs Page — List all past conversations
// ============================================================

import { useState, useEffect } from 'react';
import { MessageSquare, Clock, Globe, User, ChevronDown, ChevronUp } from 'lucide-react';
import type { Conversation } from '@/types';

export default function LogsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch('/api/conversations');
        if (resp.ok) {
          const data = await resp.json();
          setConversations(data.conversations || []);
        }
      } catch {
        // Use empty list
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getLanguageName = (code: string) => {
    const map: Record<string, string> = { 'te-IN': 'Telugu', 'hi-IN': 'Hindi', 'en-IN': 'English' };
    return map[code] || code;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Review past conversations, summaries, and leads
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin-slow w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <MessageSquare size={40} className="mx-auto text-[var(--muted-foreground)] mb-4" />
          <p className="font-medium">No conversations yet</p>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Start a voice call from the AI Agent page to see conversations here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <div key={conv.id} className="glass-card overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-[var(--muted)]/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--muted)] flex items-center justify-center">
                    <MessageSquare size={18} className="text-[var(--muted-foreground)]" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {conv.customer_name || 'Anonymous'} · {conv.intent || 'General'}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted-foreground)]">
                      <span className="flex items-center gap-1">
                        <Globe size={10} />
                        {getLanguageName(conv.language)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDuration(conv.duration)}
                      </span>
                      <span>{formatDate(conv.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${
                    conv.lead_status === 'interested'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : conv.lead_status === 'converted'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                    {conv.lead_status || 'none'}
                  </span>
                  {expandedId === conv.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {/* Expanded detail */}
              {expandedId === conv.id && (
                <div className="border-t border-[var(--border)] p-5 space-y-3 animate-fade-in">
                  {conv.summary && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-[var(--muted-foreground)]">Summary</p>
                      <p className="text-sm">{conv.summary}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <p className="text-[var(--muted-foreground)]">Language</p>
                      <p className="font-medium mt-0.5">{getLanguageName(conv.language)}</p>
                    </div>
                    <div>
                      <p className="text-[var(--muted-foreground)]">Duration</p>
                      <p className="font-medium mt-0.5">{formatDuration(conv.duration)}</p>
                    </div>
                    <div>
                      <p className="text-[var(--muted-foreground)]">Intent</p>
                      <p className="font-medium mt-0.5">{conv.intent || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[var(--muted-foreground)]">Customer</p>
                      <p className="font-medium mt-0.5">{conv.customer_name || 'Anonymous'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
