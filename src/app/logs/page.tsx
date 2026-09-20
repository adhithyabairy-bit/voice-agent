'use client';

// ============================================================
// Conversation & Call Logs Page
// Multi-Business Tenant Architecture
// ============================================================

import { useState, useEffect } from 'react';
import { MessageSquare, Clock, Globe, User, ChevronDown, ChevronUp, PhoneCall, Sparkles } from 'lucide-react';

interface DisplayCall {
  id: string;
  caller: string;
  intent: string;
  summary: string;
  lead_status: string;
  language: string;
  duration: number;
  created_at: string;
  messages?: Array<{ speaker: string; message: string; timestamp: string }>;
}

export default function LogsPage() {
  const [calls, setCalls] = useState<DisplayCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Try /api/calls first
        const resp = await fetch('/api/calls');
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.calls) && data.calls.length > 0) {
            const mapped: DisplayCall[] = data.calls.map((c: any) => {
              const summaryObj = Array.isArray(c.call_summaries) && c.call_summaries[0] ? c.call_summaries[0] : {};
              return {
                id: c.id,
                caller: summaryObj.extracted_data?.name || c.caller_number || 'Caller',
                intent: summaryObj.customer_intent || 'Inquiry',
                summary: summaryObj.summary || 'No summary available.',
                lead_status: summaryObj.lead_status || 'none',
                language: c.language || 'te-IN',
                duration: c.duration_seconds || 0,
                created_at: c.started_at || c.created_at,
                messages: c.call_messages || [],
              };
            });
            setCalls(mapped);
            return;
          }
        }

        // Fallback to /api/conversations
        const legacyResp = await fetch('/api/conversations');
        if (legacyResp.ok) {
          const legacyData = await legacyResp.json();
          if (Array.isArray(legacyData.conversations)) {
            setCalls(legacyData.conversations.map((c: any) => ({
              id: c.id,
              caller: c.customer_name || 'Caller',
              intent: c.intent || 'General inquiry',
              summary: c.summary || 'No summary available.',
              lead_status: c.lead_status || 'none',
              language: c.language || 'te-IN',
              duration: c.duration || 0,
              created_at: c.created_at || c.started_at,
            })));
          }
        }
      } catch (err) {
        console.error('Error loading logs:', err);
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
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold">Call History & AI Insights</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Review past customer calls, AI-generated conversation summaries, and lead classifications.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin-slow w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
        </div>
      ) : calls.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3">
          <PhoneCall size={40} className="mx-auto text-[var(--muted-foreground)] mb-2 opacity-50" />
          <p className="font-semibold text-base">No calls recorded yet</p>
          <p className="text-sm text-[var(--muted-foreground)] max-w-md mx-auto">
            Test a voice call from the AI Agent page. Your conversation transcripts and AI summaries will be logged here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map((call) => (
            <div key={call.id} className="glass-card overflow-hidden transition hover:border-[var(--primary)]/40">
              <button
                onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-[var(--muted)]/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <PhoneCall size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[var(--foreground)]">
                      {call.caller} · <span className="text-[var(--primary)]">{call.intent}</span>
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted-foreground)]">
                      <span className="flex items-center gap-1">
                        <Globe size={11} />
                        {getLanguageName(call.language)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatDuration(call.duration)}
                      </span>
                      <span>{formatDate(call.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    call.lead_status === 'interested'
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      : call.lead_status === 'converted'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                  }`}>
                    {call.lead_status}
                  </span>
                  {expandedId === call.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {/* Expanded detail */}
              {expandedId === call.id && (
                <div className="border-t border-[var(--border)] p-5 space-y-4 animate-fade-in bg-[var(--card)]/40">
                  {call.summary && (
                    <div className="space-y-1 bg-[var(--muted)]/30 p-3.5 rounded-xl border border-[var(--border)]">
                      <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles size={12} /> AI Call Summary
                      </p>
                      <p className="text-sm text-[var(--foreground)] leading-relaxed mt-1">{call.summary}</p>
                    </div>
                  )}

                  {call.messages && call.messages.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">Transcript</p>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {call.messages.map((m, idx) => (
                          <div key={idx} className="text-xs flex gap-2">
                            <span className="font-semibold text-slate-400 capitalize w-16 shrink-0">{m.speaker}:</span>
                            <span className="text-[var(--foreground)]">{m.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
