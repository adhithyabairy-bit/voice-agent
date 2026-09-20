'use client';

// ============================================================
// Conversation & Call Logs Page
// Multi-Business Tenant Architecture with AI Summary & Result
// ============================================================

import { useState, useEffect } from 'react';
import {
  Clock,
  Globe,
  User,
  ChevronDown,
  ChevronUp,
  PhoneCall,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Bot,
  UserCheck,
  Search,
  Filter,
} from 'lucide-react';
import { authFetch } from '@/lib/api/auth-fetch';

interface DisplayCall {
  id: string;
  caller: string;
  intent: string;
  summary: string;
  lead_status: string;
  follow_up_required: boolean;
  extracted_data?: Record<string, any>;
  language: string;
  duration: number;
  created_at: string;
  messages?: Array<{ speaker: string; message: string; timestamp: string }>;
}

export default function LogsPage() {
  const [calls, setCalls] = useState<DisplayCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        // Try /api/calls first (multi-tenant)
        const resp = await authFetch('/api/calls');
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.calls) && data.calls.length > 0) {
            const mapped: DisplayCall[] = data.calls.map((c: any) => {
              const summaryObj = Array.isArray(c.call_summaries) && c.call_summaries[0] ? c.call_summaries[0] : {};
              return {
                id: c.id,
                caller: summaryObj.extracted_data?.name || c.caller_number || 'Web Caller',
                intent: summaryObj.customer_intent || 'General Inquiry',
                summary: summaryObj.summary || 'Call recorded successfully. No detailed summary generated.',
                lead_status: summaryObj.lead_status || 'none',
                follow_up_required: !!summaryObj.follow_up_required,
                extracted_data: summaryObj.extracted_data || {},
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

        // Fallback to /api/conversations (legacy)
        const legacyResp = await fetch('/api/conversations');
        if (legacyResp.ok) {
          const legacyData = await legacyResp.json();
          if (Array.isArray(legacyData.conversations)) {
            setCalls(
              legacyData.conversations.map((c: any) => ({
                id: c.id,
                caller: c.customer_name || 'Web Caller',
                intent: c.intent || 'General Inquiry',
                summary: c.summary || 'Call recorded successfully.',
                lead_status: c.lead_status || 'none',
                follow_up_required: false,
                extracted_data: { name: c.customer_name },
                language: c.language || 'te-IN',
                duration: c.duration || 0,
                created_at: c.created_at || c.started_at,
                messages: [],
              }))
            );
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
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
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

  const getStatusBadge = (status: string, followUp: boolean) => {
    if (status === 'converted') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 size={13} /> Converted Lead
        </span>
      );
    }
    if (status === 'interested') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
          <Sparkles size={13} /> High Interest
        </span>
      );
    }
    if (followUp) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <AlertCircle size={13} /> Follow-Up Required
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30">
        <HelpCircle size={13} /> Inquiry
      </span>
    );
  };

  const filteredCalls = calls.filter((call) => {
    const matchesSearch =
      call.caller.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.intent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.summary.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'interested') return matchesSearch && call.lead_status === 'interested';
    if (statusFilter === 'converted') return matchesSearch && call.lead_status === 'converted';
    if (statusFilter === 'follow_up') return matchesSearch && call.follow_up_required;
    return matchesSearch;
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[var(--foreground)] to-[var(--muted-foreground)] bg-clip-text text-transparent">
            Call History & AI Insights
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Review live call summaries, customer intents, and actionable conversation outcomes.
          </p>
        </div>

        {/* Quick summary stats */}
        <div className="flex items-center gap-3">
          <div className="glass-card px-4 py-2 text-center rounded-xl border border-[var(--border)]">
            <span className="text-xs text-[var(--muted-foreground)] block">Total Calls</span>
            <span className="text-lg font-bold text-[var(--primary)]">{calls.length}</span>
          </div>
          <div className="glass-card px-4 py-2 text-center rounded-xl border border-[var(--border)]">
            <span className="text-xs text-[var(--muted-foreground)] block">Leads</span>
            <span className="text-lg font-bold text-emerald-400">
              {calls.filter((c) => c.lead_status === 'interested' || c.lead_status === 'converted').length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Search by caller, intent, or keyword in summary..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-[var(--card)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] transition"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter size={15} className="text-[var(--muted-foreground)] shrink-0 hidden sm:block" />
          {[
            { id: 'all', label: 'All' },
            { id: 'interested', label: 'Interested' },
            { id: 'converted', label: 'Converted' },
            { id: 'follow_up', label: 'Needs Follow-Up' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? 'bg-[var(--primary)] text-black shadow-md shadow-[var(--primary)]/20'
                  : 'bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="animate-spin-slow w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
          <p className="text-xs text-[var(--muted-foreground)]">Loading conversation logs & AI summaries...</p>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3 rounded-2xl border border-[var(--border)]">
          <PhoneCall size={44} className="mx-auto text-[var(--muted-foreground)] mb-2 opacity-40" />
          <p className="font-semibold text-base">No calls found</p>
          <p className="text-sm text-[var(--muted-foreground)] max-w-md mx-auto">
            {calls.length === 0
              ? 'Test a voice call from the AI Agent page to start logging conversations and automated AI summaries here.'
              : 'No calls match your active filter or search query.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCalls.map((call) => {
            const isExpanded = expandedId === call.id;
            return (
              <div
                key={call.id}
                className="glass-card rounded-2xl overflow-hidden border border-[var(--border)] transition-all hover:border-[var(--primary)]/40 shadow-sm"
              >
                {/* Card Header & Metadata */}
                <div className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                        <PhoneCall size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-semibold text-base text-[var(--foreground)]">{call.caller}</h2>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--muted)] text-[var(--primary)] font-medium">
                            {call.intent}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted-foreground)] flex-wrap">
                          <span className="flex items-center gap-1">
                            <Globe size={12} />
                            {getLanguageName(call.language)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {formatDuration(call.duration)}
                          </span>
                          <span>{formatDate(call.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Result Status Badge */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {getStatusBadge(call.lead_status, call.follow_up_required)}
                    </div>
                  </div>

                  {/* AI Summary & Conversation Result Box - PROMINENTLY DISPLAYED ON CARD */}
                  <div className="rounded-xl p-4 bg-gradient-to-r from-[var(--primary)]/5 via-[var(--card)] to-transparent border border-[var(--border)] space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] uppercase tracking-wider">
                        <Sparkles size={14} className="text-[var(--primary)] animate-pulse" />
                        <span>AI Conversation Summary & Outcome</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--muted-foreground)]">Result:</span>
                        <span className="font-medium text-[var(--foreground)] capitalize">
                          {call.lead_status !== 'none' ? `${call.lead_status} Lead` : call.intent}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-[var(--foreground)] leading-relaxed">{call.summary}</p>

                    {/* Key Extracted Details (if present) */}
                    {call.extracted_data && Object.keys(call.extracted_data).length > 0 && (
                      <div className="pt-2 border-t border-[var(--border)]/60 flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-[var(--muted-foreground)] font-medium">Extracted Data:</span>
                        {Object.entries(call.extracted_data).map(([k, v]) => {
                          if (!v) return null;
                          return (
                            <span
                              key={k}
                              className="px-2 py-0.5 rounded-md bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--foreground)]"
                            >
                              <span className="text-[var(--muted-foreground)] capitalize">{k}:</span> {String(v)}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Expand/Collapse Transcript Toggle */}
                  <div className="pt-1 flex items-center justify-between">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : call.id)}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors py-1 px-2 rounded-lg hover:bg-[var(--muted)]"
                    >
                      <MessageSquare size={14} />
                      <span>
                        {isExpanded ? 'Hide Transcript' : `View Full Transcript (${call.messages?.length || 0} messages)`}
                      </span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Transcript Section */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-5 space-y-3 bg-[var(--card)]/60 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                        Full Conversation Transcript
                      </p>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {call.messages?.length || 0} exchanges
                      </span>
                    </div>

                    {call.messages && call.messages.length > 0 ? (
                      <div className="space-y-3 max-h-96 overflow-y-auto pr-2 pt-2">
                        {call.messages.map((m, idx) => {
                          const isAgent = m.speaker?.toLowerCase() === 'agent' || m.speaker?.toLowerCase() === 'ai';
                          return (
                            <div
                              key={idx}
                              className={`flex gap-3 text-xs ${isAgent ? 'justify-start' : 'justify-end'}`}
                            >
                              {isAgent && (
                                <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center shrink-0 mt-0.5">
                                  <Bot size={15} />
                                </div>
                              )}
                              <div
                                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3 space-y-1 ${
                                  isAgent
                                    ? 'bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--foreground)] rounded-tl-sm'
                                    : 'bg-[var(--primary)] text-black font-medium rounded-tr-sm'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-4 text-[10px] opacity-75">
                                  <span className="font-semibold uppercase tracking-wider">
                                    {isAgent ? 'AI Agent' : 'Caller'}
                                  </span>
                                  {m.timestamp && (
                                    <span>
                                      {new Date(m.timestamp).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                      })}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.message}</p>
                              </div>
                              {!isAgent && (
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                                  <UserCheck size={15} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-[var(--muted)]/20 text-center text-xs text-[var(--muted-foreground)]">
                        No verbatim message log saved for this call session.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
