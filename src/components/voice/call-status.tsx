'use client';

import { Wifi, WifiOff, Mic, MicOff, Clock, Globe } from 'lucide-react';
import type { CallState, LanguageCode, LatencyMetrics } from '@/types';
import { SUPPORTED_LANGUAGES } from '@/types';

interface CallStatusProps {
  state: CallState;
  language: LanguageCode;
  latency: LatencyMetrics;
  isDemo: boolean;
  duration?: number;
}

export function CallStatus({ state, language, latency, isDemo, duration = 0 }: CallStatusProps) {
  const isConnected = ['listening', 'processing', 'speaking'].includes(state);
  const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === language);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-foreground)] w-full">
      {/* Left: Call State & Duration */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          ) : (
            <WifiOff size={12} />
          )}
          <span className={`font-medium ${isConnected ? 'text-emerald-700 font-mono' : ''}`}>
            {isConnected ? `LIVE CALL · ${formatTime(duration)}` : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Center: Language */}
      <div className="flex items-center gap-1.5 font-medium text-[var(--foreground)]">
        <Globe size={13} className="text-[var(--primary)]" />
        <span>{langInfo?.name || language} ({langInfo?.nativeName})</span>
      </div>

      {/* Right: Mic & Latency */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {state === 'listening' ? (
            <span className="text-emerald-600 flex items-center gap-1 font-medium">
              <Mic size={12} />
              Mic On
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--muted-foreground)]">
              <MicOff size={12} />
              {state === 'speaking' ? 'Agent Speaking' : state === 'processing' ? 'Thinking' : 'Mic Off'}
            </span>
          )}
        </div>

        {latency.totalResponseLatency && (
          <div className="flex items-center gap-1 text-[11px] font-mono text-[var(--muted-foreground)]">
            <Clock size={11} />
            <span>{latency.totalResponseLatency}ms</span>
          </div>
        )}

        {isDemo && (
          <div className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
            Demo
          </div>
        )}
      </div>
    </div>
  );
}
