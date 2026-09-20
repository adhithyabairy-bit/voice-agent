'use client';

import { Wifi, WifiOff, Mic, MicOff, Clock, Globe } from 'lucide-react';
import type { CallState, LanguageCode, LatencyMetrics } from '@/types';
import { SUPPORTED_LANGUAGES } from '@/types';

interface CallStatusProps {
  state: CallState;
  language: LanguageCode;
  latency: LatencyMetrics;
  isDemo: boolean;
}

export function CallStatus({ state, language, latency, isDemo }: CallStatusProps) {
  const isConnected = ['listening', 'processing', 'speaking'].includes(state);
  const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === language);

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[var(--muted-foreground)]">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        {isConnected ? (
          <Wifi size={12} className="text-[var(--success)]" />
        ) : (
          <WifiOff size={12} />
        )}
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* Language */}
      <div className="flex items-center gap-1.5">
        <Globe size={12} />
        <span>{langInfo?.name || language}</span>
      </div>

      {/* Microphone status */}
      <div className="flex items-center gap-1.5">
        {state === 'listening' ? (
          <Mic size={12} className="text-[var(--success)]" />
        ) : (
          <MicOff size={12} />
        )}
        <span>{state === 'listening' ? 'Active' : 'Inactive'}</span>
      </div>

      {/* Latency */}
      {latency.totalResponseLatency && (
        <div className="flex items-center gap-1.5">
          <Clock size={12} />
          <span>{latency.totalResponseLatency}ms</span>
        </div>
      )}

      {/* Demo badge */}
      {isDemo && (
        <div className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
          Demo Mode
        </div>
      )}
    </div>
  );
}
