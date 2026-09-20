'use client';

// ============================================================
// AI Agent Page — Live Full-Duplex Voice Call Interface
// Multi-Business Tenant Architecture
// Left: Dynamic Business & Agent config | Right: Live voice call + live transcript
// ============================================================

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Settings, AlertTriangle, Volume2, Keyboard, Send, Building2, Sparkles } from 'lucide-react';
import { CallButton } from '@/components/voice/call-button';
import { Waveform } from '@/components/voice/waveform';
import { Transcript } from '@/components/voice/transcript';
import { CallStatus } from '@/components/voice/call-status';
import { LanguageSelector } from '@/components/voice/language-selector';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';
import { useAuth } from '@/lib/auth/auth-context';
import { authFetch } from '@/lib/api/auth-fetch';
import type { LanguageCode, AgentPersonality, Business, Agent } from '@/types';

export default function AgentPage() {
  const { business: authBusiness, agent: authAgent } = useAuth();

  const [businessData, setBusinessData] = useState<Business | null>(authBusiness);
  const [agentData, setAgentData] = useState<Agent | null>(authAgent);
  const [language, setLanguage] = useState<LanguageCode>('te-IN');
  const [voice, setVoice] = useState('aditya');
  const [personality, setPersonality] = useState<AgentPersonality>('friendly');
  const [textInput, setTextInput] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Fetch business context if not present from auth
  useEffect(() => {
    async function loadContext() {
      try {
        const res = await authFetch('/api/business');
        if (res.ok) {
          const data = await res.json();
          if (data.business) {
            setBusinessData(data.business);
          }
          if (data.agent) {
            setAgentData(data.agent);
            if (data.agent.language) setLanguage(data.agent.language as LanguageCode);
            if (data.agent.voice) setVoice(data.agent.voice);
            if (data.agent.response_style) setPersonality(data.agent.response_style);
          }
        }
      } catch (err) {
        console.warn('Could not fetch business info:', err);
      }
    }
    loadContext();
  }, []);

  const bName = businessData?.business_name || (businessData as any)?.name || 'Smart AI Receptionist';
  const aName = agentData?.agent_name || (agentData as any)?.name || 'Aditya';

  const voiceAgent = useVoiceAgent({
    language,
    voice,
    personality,
    businessId: businessData?.id,
    businessName: bName,
    greeting: agentData?.greeting || undefined,
  });

  const isCallActive = ['listening', 'processing', 'speaking', 'connecting'].includes(voiceAgent.callState);

  const handleSendText = async () => {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput('');
    await voiceAgent.sendTextMessage(text);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Left Panel — Dynamic Business & Agent Configuration */}
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-bold">AI Voice Agent</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Live receptionist for {bName}
            </p>
          </div>

          {/* Business & Agent Card */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ background: 'var(--gradient-accent)' }}
              >
                <Building2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{bName}</p>
                <p className="text-xs text-[var(--muted-foreground)] capitalize">
                  {businessData?.business_type ? businessData.business_type.replace('_', ' ') : 'Business'} · Agent {aName}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
              <Link
                href="/business"
                className="text-[var(--primary)] hover:underline flex items-center gap-1 font-medium"
              >
                <Settings size={12} /> Edit Business Profile
              </Link>
              <Link
                href="/onboarding"
                className="text-emerald-500 hover:underline flex items-center gap-1 font-medium"
              >
                <Sparkles size={12} /> New Business
              </Link>
            </div>
          </div>

          {/* Language selector */}
          <div className="glass-card p-5">
            <LanguageSelector
              value={language}
              onChange={setLanguage}
              disabled={isCallActive}
            />
          </div>

          {/* Voice selector */}
          <div className="glass-card p-5 space-y-3">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Voice Model</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={isCallActive}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
              id="voice-select"
            >
              <option value="aditya">Aditya (Male — Conversational & Natural)</option>
              <option value="ritu">Ritu (Female — Warm & Expressive)</option>
              <option value="priya">Priya (Female — Clear & Conversational)</option>
              <option value="kavya">Kavya (Female — Gentle & Soothing)</option>
              <option value="rohan">Rohan (Male — Dynamic & Engaging)</option>
              <option value="shubh">Shubh (Male — Formal & Professional)</option>
              <option value="neha">Neha (Female — Crisp & Friendly)</option>
            </select>
          </div>

          {/* Response Style selector */}
          <div className="glass-card p-5 space-y-3">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Response Style</label>
            <div className="flex gap-2">
              {(['friendly', 'professional', 'concise'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPersonality(p)}
                  disabled={isCallActive}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    personality === p
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--primary)]'
                  } disabled:opacity-50`}
                  id={`personality-${p}`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Volume Boost Control */}
          <div className="glass-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1.5">
                <Volume2 size={13} />
                TTS Volume
              </label>
              <span className="text-xs font-mono font-medium text-[var(--primary)]">
                {Math.round(voiceAgent.volumeBoost * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={voiceAgent.volumeBoost}
              onChange={(e) => voiceAgent.setVolumeBoost(parseFloat(e.target.value))}
              className="w-full accent-[var(--primary)] cursor-pointer h-1.5 bg-[var(--muted)] rounded-lg"
              id="volume-boost-slider"
            />
            <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
              <span>Soft (50%)</span>
              <span>Natural (100%)</span>
              <span>Boosted (200%)</span>
            </div>
          </div>

          {/* Latency metrics */}
          {(voiceAgent.latency.sttLatency || voiceAgent.latency.llmFirstTokenLatency || voiceAgent.latency.ttsLatency) && (
            <div className="glass-card p-5 space-y-3">
              <label className="text-xs font-medium text-[var(--muted-foreground)]">Latency Metrics</label>
              <div className="space-y-2 text-xs">
                {voiceAgent.latency.sttLatency && (
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">STT</span>
                    <span className="font-mono">{voiceAgent.latency.sttLatency}ms</span>
                  </div>
                )}
                {voiceAgent.latency.llmFirstTokenLatency && (
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">LLM First Token</span>
                    <span className="font-mono">{voiceAgent.latency.llmFirstTokenLatency}ms</span>
                  </div>
                )}
                {voiceAgent.latency.ttsLatency && (
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">TTS</span>
                    <span className="font-mono">{voiceAgent.latency.ttsLatency}ms</span>
                  </div>
                )}
                {voiceAgent.latency.totalResponseLatency && (
                  <div className="flex justify-between font-semibold border-t border-[var(--border)] pt-2 mt-2">
                    <span>Total</span>
                    <span className="font-mono">{voiceAgent.latency.totalResponseLatency}ms</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel — Live Voice Call Interface */}
        <div className="glass-card flex flex-col min-h-[600px]">
          {/* Demo mode warning */}
          {voiceAgent.isDemo && (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium">
              <AlertTriangle size={14} />
              Demo Mode — API keys not configured. Using mock responses.
            </div>
          )}

          {/* Call status bar */}
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <CallStatus
              state={voiceAgent.callState}
              language={language}
              latency={voiceAgent.latency}
              isDemo={voiceAgent.isDemo}
              duration={voiceAgent.callDuration}
            />
          </div>

          {/* Main live call arena */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
            {/* Waveform */}
            <Waveform state={voiceAgent.callState} volume={voiceAgent.volume} />

            {/* Call button */}
            <CallButton
              state={voiceAgent.callState}
              onStart={voiceAgent.startCall}
              onEnd={voiceAgent.endCall}
              volume={voiceAgent.volume}
            />

            {/* Real-time Call Status / Voice Feedback */}
            {isCallActive && (
              <div className="flex flex-col items-center gap-2 animate-fade-in max-w-lg text-center">
                {voiceAgent.callState === 'speaking' ? (
                  <div className="text-xs px-4 py-2 rounded-full font-medium bg-purple-50 text-purple-800 border border-purple-300 shadow-sm animate-pulse">
                    🔊 AI Speaking... (speak anytime to interrupt)
                  </div>
                ) : voiceAgent.callState === 'processing' ? (
                  <div className="text-xs px-4 py-2 rounded-full font-medium bg-amber-50 text-amber-800 border border-amber-300 shadow-sm animate-pulse">
                    ⚡ Responding...
                  </div>
                ) : voiceAgent.liveTranscript ? (
                  <div className="text-xs px-4 py-2 rounded-full font-medium bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm animate-pulse">
                    🎙️ &ldquo;{voiceAgent.liveTranscript}&rdquo;
                  </div>
                ) : (
                  <div
                    className={`text-xs px-4 py-2 rounded-full font-medium transition-all ${
                      voiceAgent.isSpeakingDetected
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {voiceAgent.isSpeakingDetected ? '🎙️ Hearing your voice... Speak naturally' : '👂 Listening for your voice...'}
                  </div>
                )}
              </div>
            )}

            {/* Feedback notice if voice was silent/unclear */}
            {voiceAgent.feedbackNotice && (
              <div className="text-xs px-3.5 py-1.5 rounded-full font-medium bg-amber-50 text-amber-800 border border-amber-300 animate-fade-in">
                ℹ️ {voiceAgent.feedbackNotice}
              </div>
            )}

            {/* Error display */}
            {voiceAgent.error && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm max-w-md text-center">
                <AlertTriangle size={16} className="flex-shrink-0" />
                {voiceAgent.error}
              </div>
            )}
          </div>

          {/* Transcript area */}
          <div className="border-t border-[var(--border)] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Live Conversation
              </span>
              <button
                onClick={() => setShowKeyboard(prev => !prev)}
                className="text-[11px] text-[var(--primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Keyboard size={12} />
                {showKeyboard ? 'Hide keyboard' : 'Type message fallback'}
              </button>
            </div>
            <Transcript
              messages={voiceAgent.messages}
              isProcessing={voiceAgent.callState === 'processing'}
            />
          </div>

          {/* Optional Text input fallback */}
          {showKeyboard && (
            <div className="border-t border-[var(--border)] p-4 bg-[var(--muted)]/50 animate-fade-in">
              <div className="flex gap-2">
                <input
                  ref={textInputRef}
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                  placeholder="Type a message (keyboard fallback)..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  id="text-input"
                />
                <button
                  onClick={handleSendText}
                  disabled={!textInput.trim()}
                  className="px-4 py-2.5 rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--gradient-primary)' }}
                  aria-label="Send message"
                  id="send-button"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
