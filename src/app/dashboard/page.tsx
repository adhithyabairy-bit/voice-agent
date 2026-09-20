import Link from 'next/link';
import {
  Phone,
  MessageSquare,
  Clock,
  Users,
  TrendingUp,
  ArrowRight,
  Globe,
} from 'lucide-react';

// ============================================================
// Dashboard Page — Metrics + Recent Conversations
// ============================================================

const metrics = [
  {
    label: 'Total Conversations',
    value: '1,247',
    change: '+12%',
    icon: MessageSquare,
    color: '#2563eb',
  },
  {
    label: 'Avg Duration',
    value: '2:34',
    change: '-8%',
    icon: Clock,
    color: '#6366f1',
  },
  {
    label: 'Leads Collected',
    value: '183',
    change: '+24%',
    icon: Users,
    color: '#10b981',
  },
  {
    label: 'Success Rate',
    value: '94%',
    change: '+3%',
    icon: TrendingUp,
    color: '#f59e0b',
  },
];

const recentConversations = [
  { id: '#1024', language: 'Telugu', duration: '02:34', intent: 'Appointment inquiry', status: 'Completed', customer: 'Rahul' },
  { id: '#1023', language: 'Hindi', duration: '01:45', intent: 'Pricing question', status: 'Completed', customer: 'Priya' },
  { id: '#1022', language: 'English', duration: '03:12', intent: 'General information', status: 'Completed', customer: 'Anonymous' },
  { id: '#1021', language: 'Telugu', duration: '01:20', intent: 'Treatment inquiry', status: 'Lead', customer: 'Venkat' },
  { id: '#1020', language: 'Hindi', duration: '02:50', intent: 'Appointment booking', status: 'Converted', customer: 'Anjali' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">
            Welcome back. Your AI agent is online and handling calls.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-700">Agent Online</span>
          </div>
          <Link
            href="/agent"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 no-underline"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Phone size={14} />
            Open Agent
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="glass-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${metric.color}15` }}
              >
                <metric.icon size={18} style={{ color: metric.color }} />
              </div>
              <span className={`text-xs font-medium ${
                metric.change.startsWith('+') ? 'text-green-600' : 'text-red-500'
              }`}>
                {metric.change}
              </span>
            </div>
            <div>
              <p className="text-2xl font-bold">{metric.value}</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{metric.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Conversations */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-semibold">Recent Conversations</h2>
          <Link
            href="/logs"
            className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline no-underline"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Conversation</th>
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Language</th>
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Duration</th>
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Intent</th>
                <th className="text-left p-4 font-medium text-[var(--muted-foreground)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentConversations.map((conv) => (
                <tr key={conv.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                  <td className="p-4">
                    <div>
                      <p className="font-medium">{conv.id}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{conv.customer}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <Globe size={12} className="text-[var(--muted-foreground)]" />
                      {conv.language}
                    </div>
                  </td>
                  <td className="p-4 text-[var(--muted-foreground)]">{conv.duration}</td>
                  <td className="p-4">{conv.intent}</td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${
                        conv.status === 'Completed'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : conv.status === 'Lead'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-violet-50 text-violet-700 border border-violet-200'
                      }`}
                    >
                      {conv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
