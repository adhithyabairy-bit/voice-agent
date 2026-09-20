'use client';

// ============================================================
// AI Agent Page — The core voice interaction interface
// Left: Agent config | Right: Live call + transcript
// ============================================================

import { useState, useRef } from 'react';
import { Send, Settings, AlertTriangle } from 'lucide-react';
import { CallButton } from '@/components/voice/call-button';
import { Waveform } from '@/components/voice/waveform';
import { Transcript } from '@/components/voice/transcript';
import { CallStatus } from '@/components/voice/call-status';
import { LanguageSelector } from '@/components/voice/language-selector';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';
import type { LanguageCode, AgentPersonality } from '@/types';

export default function AgentPage() {
  const [language, setLanguage] = useState<LanguageCode>('en-IN');
  const [voice, setVoice] = useState('shubh');
  const [personality, setPersonality] = useState<AgentPersonality>('friendly');
  const [textInput, setTextInput] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  const voiceAgent = useVoiceAgent({
    language,
    voice,
    personality,
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
        {/* Left Panel — Agent Configuration */}
        <div className="space-y-5">
          <div>
            <h1 className="text-xl font-bold">AI Agent</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Configure and test your voice agent
            </p>
          </div>

          {/* Agent name card */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                style={{ background: 'var(--gradient-accent)' }}
              >
                <Settings size={18} />
              </div>
              <div>
                <p className="font-semibold text-sm">ABC Clinic Receptionist</p>
                <p className="text-xs text-[var(--muted-foreground)]">AI Voice Agent</p>
              </div>
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
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={isCallActive}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
              id="voice-select"
            >
              <option value="shubh">Shubh (Male)</option>
              <option value="ritu">Ritu (Female)</option>
              <option value="priya">Priya (Female)</option>
            </select>
          </div>

          {/* Personality selector */}
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

        {/* Right Panel — Live Call Interface */}
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
            />
          </div>

          {/* Main call area */}
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

            {/* Live speech feedback & manual send button */}
            {voiceAgent.callState === 'listening' && (
              <div className="flex flex-col items-center gap-2 animate-fade-in">
                <div
                  className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                    voiceAgent.isSpeakingDetected
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  {voiceAgent.isSpeakingDetected ? '🎙️ Hearing your voice... Speak naturally' : '👂 Listening for your voice...'}
                </div>
                {voiceAgent.isSpeakingDetected && (
                  <button
                    onClick={voiceAgent.stopSpeakingAndSend}
                    className="text-xs px-4 py-1.5 rounded-full bg-[var(--primary)] text-white font-medium shadow-sm hover:opacity-90 transition-all flex items-center gap-1.5"
                    id="done-speaking-btn"
                  >
                    <span>Done Speaking</span>
                    <Send size={12} />
                  </button>
                )}
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
          <div className="border-t border-[var(--border)] p-5 max-h-96 overflow-y-auto">
            <Transcript
              messages={voiceAgent.messages}
              isProcessing={voiceAgent.callState === 'processing'}
            />
          </div>

          {/* Text input fallback */}
          <div className="border-t border-[var(--border)] p-4">
            <div className="flex gap-2">
              <input
                ref={textInputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder={isCallActive ? 'Type a message (text fallback)...' : 'Start a call or type a message...'}
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
            {!isCallActive && (
              <p className="text-[10px] text-[var(--muted-foreground)] mt-2 text-center">
                Voice unavailable? Use text input as a fallback.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
