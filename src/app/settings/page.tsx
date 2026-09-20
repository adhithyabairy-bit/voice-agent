'use client';

// ============================================================
// Settings Page — Provider status + AI config
// ============================================================

import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Shield,
} from 'lucide-react';

interface ProviderStatus {
  configured: boolean;
  status: string;
}

interface AgentInfo {
  agent: {
    name: string;
    language: string;
    voice: string;
    personality: string;
    status: string;
  };
  providers: {
    groq: ProviderStatus;
    sarvam: ProviderStatus;
    supabase: ProviderStatus;
  };
  demo: {
    isDemo: boolean;
    reason?: string;
  };
}

export default function SettingsPage() {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/agent');
      if (resp.ok) {
        const data = await resp.json();
        setAgentInfo(data);
      }
    } catch {
      // Leave null
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const StatusBadge = ({ configured }: { configured: boolean }) => (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${
      configured ? 'text-green-600' : 'text-red-500'
    }`}>
      {configured ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {configured ? 'Connected' : 'Not Configured'}
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Manage API providers, agent configuration, and preferences
          </p>
        </div>
        <button
          onClick={loadStatus}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
          id="refresh-status"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Provider Status */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Shield size={18} />
          </div>
          <div>
            <h2 className="font-semibold">AI Provider Status</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Connection status of external AI services
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-[var(--muted-foreground)]" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Groq */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--muted)]">
              <div>
                <p className="font-medium text-sm">Groq (LLM)</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  qwen3.8-27b — Chat completions with streaming
                </p>
              </div>
              <StatusBadge configured={agentInfo?.providers?.groq?.configured ?? false} />
            </div>

            {/* Sarvam */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--muted)]">
              <div>
                <p className="font-medium text-sm">Sarvam AI (STT + TTS)</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  saaras:v3 (STT) + bulbul:v3 (TTS) — Indian language speech
                </p>
              </div>
              <StatusBadge configured={agentInfo?.providers?.sarvam?.configured ?? false} />
            </div>

            {/* Supabase */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--muted)]">
              <div>
                <p className="font-medium text-sm">Supabase (Database)</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  PostgreSQL — Business data, conversations, leads
                </p>
              </div>
              <StatusBadge configured={agentInfo?.providers?.supabase?.configured ?? false} />
            </div>
          </div>
        )}

        {/* Demo mode warning */}
        {agentInfo?.demo?.isDemo && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <p className="font-medium">⚠️ Demo Mode Active</p>
            <p className="text-xs mt-1">{agentInfo.demo.reason}</p>
            <p className="text-xs mt-2">
              Add the missing API keys to your <code className="bg-amber-100 px-1 rounded">.env.local</code> file and restart the dev server.
            </p>
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
            <SettingsIcon size={18} />
          </div>
          <h2 className="font-semibold">Agent Configuration</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-[var(--muted)] space-y-1">
            <p className="text-xs text-[var(--muted-foreground)]">Agent Name</p>
            <p className="text-sm font-medium">{agentInfo?.agent?.name || 'ABC Clinic Receptionist'}</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--muted)] space-y-1">
            <p className="text-xs text-[var(--muted-foreground)]">Default Language</p>
            <p className="text-sm font-medium">{agentInfo?.agent?.language || 'te-IN'}</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--muted)] space-y-1">
            <p className="text-xs text-[var(--muted-foreground)]">Voice</p>
            <p className="text-sm font-medium">{agentInfo?.agent?.voice || 'shubh'}</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--muted)] space-y-1">
            <p className="text-xs text-[var(--muted-foreground)]">Personality</p>
            <p className="text-sm font-medium capitalize">{agentInfo?.agent?.personality || 'friendly'}</p>
          </div>
        </div>
      </div>

      {/* Environment Variables Guide */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="font-semibold">Environment Variables</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Add these to your <code className="bg-[var(--muted)] px-1.5 py-0.5 rounded text-xs">.env.local</code> file:
        </p>
        <pre className="p-4 rounded-xl bg-[var(--muted)] text-xs font-mono overflow-x-auto leading-relaxed">
{`# Groq API (LLM)
GROQ_API_KEY=gsk_your_key_here

# Sarvam AI (STT + TTS)
SARVAM_API_KEY=your_sarvam_key_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here`}
        </pre>
      </div>
    </div>
  );
}
