'use client';

// ============================================================
// Dashboard Page — Live Metrics & Multi-Business Overview
// ============================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Phone,
  MessageSquare,
  Clock,
  Users,
  TrendingUp,
  ArrowRight,
  Globe,
  Sparkles,
  Building2,
  Database,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { authFetch } from '@/lib/api/auth-fetch';

export default function DashboardPage() {
  const { user, business } = useAuth();
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<any[]>([]);
  const [bData, setBData] = useState<any>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const [bizRes, callsRes] = await Promise.all([
          authFetch('/api/business'),
          authFetch('/api/calls'),
        ]);

        if (bizRes.ok) {
          const b = await bizRes.json();
          setBData(b);
        }
        if (callsRes.ok) {
          const c = await callsRes.json();
          setCalls(c.calls || []);
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const totalCalls = calls.length;
  const totalSeconds = calls.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0);
  const avgDurationSeconds = totalCalls > 0 ? Math.round(totalSeconds / totalCalls) : 0;
  const avgMins = Math.floor(avgDurationSeconds / 60);
  const avgSecs = avgDurationSeconds % 60;

  const leads = calls.filter((c) => {
    const s = Array.isArray(c.call_summaries) && c.call_summaries[0];
    return s && (s.lead_status === 'interested' || s.lead_status === 'converted');
  });

  const successRate = totalCalls > 0 ? Math.round((leads.length / totalCalls) * 100) : 100;

  const bName = bData?.business?.business_name || bData?.business?.name || business?.business_name || 'Your Business';
  const bType = bData?.business?.business_type || business?.business_type || 'service';

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-12">
      {/* Welcome & Action Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{bName}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 capitalize">
              {bType.replace('_', ' ')}
            </span>
          </div>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">
            Real-time analytics and live AI call operations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/onboarding"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)] transition"
          >
            <Sparkles size={15} /> + New Business
          </Link>
          <Link
            href="/agent"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 shadow-lg shadow-emerald-500/20"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Phone size={15} />
            Launch Live Call
          </Link>
        </div>
      </div>

      {/* Quick Setup Notice if empty */}
      {!loading && (!bData?.services || bData.services.length === 0) && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-400" /> Complete your business catalog
            </h3>
            <p className="text-xs text-slate-300">
              Add services, pricing, and FAQs so your AI receptionist can provide instant, accurate answers to callers.
            </p>
          </div>
          <Link
            href="/business"
            className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition shrink-0"
          >
            Configure Services & FAQs →
          </Link>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/15 text-blue-500">
              <MessageSquare size={18} />
            </div>
            <span className="text-xs font-semibold text-emerald-500">Live</span>
          </div>
          <div>
            <p className="text-2xl font-bold">{loading ? '...' : totalCalls}</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Total Voice Calls</p>
          </div>
        </div>

        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/15 text-indigo-500">
              <Clock size={18} />
            </div>
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Real-time</span>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {loading ? '...' : `${avgMins}:${String(avgSecs).padStart(2, '0')}`}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Avg Call Duration</p>
          </div>
        </div>

        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/15 text-emerald-500">
              <Users size={18} />
            </div>
            <span className="text-xs font-semibold text-emerald-500">
              {loading ? '' : `${leads.length} captured`}
            </span>
          </div>
          <div>
            <p className="text-2xl font-bold">{loading ? '...' : leads.length}</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Qualified Leads</p>
          </div>
        </div>

        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/15 text-amber-500">
              <TrendingUp size={18} />
            </div>
            <span className="text-xs font-semibold text-amber-500">{successRate}%</span>
          </div>
          <div>
            <p className="text-2xl font-bold">{loading ? '...' : `${successRate}%`}</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Lead Conversion Rate</p>
          </div>
        </div>
      </div>

      {/* Recent Calls Table */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm">Recent Caller Interactions</h2>
          <Link
            href="/logs"
            className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
          >
            View all logs <ArrowRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/30">
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Caller</th>
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Language</th>
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Duration</th>
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Intent</th>
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--primary)]" />
                  </td>
                </tr>
              ) : calls.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-[var(--muted-foreground)]">
                    No calls recorded yet. Open the AI Agent page to initiate your first test call.
                  </td>
                </tr>
              ) : (
                calls.slice(0, 5).map((call) => {
                  const summary = Array.isArray(call.call_summaries) && call.call_summaries[0] ? call.call_summaries[0] : {};
                  const callerName = summary.extracted_data?.name || call.caller_number || 'Caller';
                  const durMins = Math.floor((call.duration_seconds || 0) / 60);
                  const durSecs = (call.duration_seconds || 0) % 60;
                  const leadStatus = summary.lead_status || 'none';

                  return (
                    <tr key={call.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/40 transition-colors">
                      <td className="p-4 font-medium">
                        {callerName}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <Globe size={13} className="text-[var(--muted-foreground)]" />
                          {call.language === 'te-IN' ? 'Telugu' : call.language === 'hi-IN' ? 'Hindi' : 'English'}
                        </div>
                      </td>
                      <td className="p-4 text-[var(--muted-foreground)] font-mono text-xs">
                        {durMins}:{String(durSecs).padStart(2, '0')}
                      </td>
                      <td className="p-4">{summary.customer_intent || 'General inquiry'}</td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            leadStatus === 'converted'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : leadStatus === 'interested'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                          }`}
                        >
                          {leadStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
