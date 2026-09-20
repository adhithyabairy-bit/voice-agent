'use client';

import { Mic, MicOff, Phone, PhoneOff, Loader2, Volume2, AlertCircle } from 'lucide-react';
import type { CallState } from '@/types';

interface CallButtonProps {
  state: CallState;
  onStart: () => void;
  onEnd: () => void;
  volume?: number;
  disabled?: boolean;
}

const stateConfig: Record<CallState, {
  label: string;
  sublabel: string;
  className: string;
  icon: React.ReactNode;
}> = {
  idle: {
    label: 'Start Call',
    sublabel: 'Ready to talk',
    className: 'call-button--ready',
    icon: <Mic size={32} className="text-white" />,
  },
  connecting: {
    label: 'Connecting',
    sublabel: 'Setting up...',
    className: 'call-button--listening',
    icon: <Loader2 size={32} className="text-white animate-spin" />,
  },
  listening: {
    label: 'Listening',
    sublabel: 'Speak now...',
    className: 'call-button--listening',
    icon: <Mic size={32} className="text-white" />,
  },
  processing: {
    label: 'Processing',
    sublabel: 'Thinking...',
    className: 'call-button--processing',
    icon: <Loader2 size={32} className="text-white animate-spin-slow" />,
  },
  speaking: {
    label: 'Speaking',
    sublabel: 'AI responding...',
    className: 'call-button--speaking',
    icon: <Volume2 size={32} className="text-white" />,
  },
  error: {
    label: 'Error',
    sublabel: 'Something went wrong',
    className: 'call-button--error',
    icon: <AlertCircle size={32} className="text-white" />,
  },
  ended: {
    label: 'Call Ended',
    sublabel: 'Conversation saved',
    className: 'call-button--ended',
    icon: <PhoneOff size={32} className="text-white" />,
  },
};

export function CallButton({ state, onStart, onEnd, volume = 0, disabled }: CallButtonProps) {
  const config = stateConfig[state];
  const isActive = ['listening', 'processing', 'speaking', 'connecting'].includes(state);

  const handleClick = () => {
    if (disabled) return;
    if (state === 'idle' || state === 'ended' || state === 'error') {
      onStart();
    } else {
      onEnd();
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Call button with animated rings */}
      <div className="relative">
        {/* Pulse rings (only when active) */}
        {isActive && (
          <>
            <div
              className="absolute inset-0 rounded-full animate-pulse-ring"
              style={{
                background: state === 'listening' ? 'rgba(37, 99, 235, 0.15)' :
                  state === 'speaking' ? 'rgba(139, 92, 246, 0.15)' :
                  'rgba(245, 158, 11, 0.15)',
                transform: `scale(${1 + volume * 0.3})`,
              }}
            />
            <div
              className="absolute inset-[-12px] rounded-full animate-pulse-ring"
              style={{
                background: state === 'listening' ? 'rgba(37, 99, 235, 0.08)' :
                  state === 'speaking' ? 'rgba(139, 92, 246, 0.08)' :
                  'rgba(245, 158, 11, 0.08)',
                animationDelay: '0.5s',
              }}
            />
          </>
        )}

        {/* Main button */}
        <button
          onClick={handleClick}
          disabled={disabled}
          className={`call-button ${config.className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{
            transform: isActive ? `scale(${1 + volume * 0.05})` : undefined,
          }}
          aria-label={config.label}
          id="call-button"
        >
          {config.icon}
        </button>
      </div>

      {/* Status text */}
      <div className="text-center">
        <p className="text-lg font-semibold text-[var(--foreground)]">
          {config.label}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {config.sublabel}
        </p>
      </div>

      {/* End call button (shown when active) */}
      {isActive && (
        <button
          onClick={onEnd}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 hover:scale-105 active:scale-95"
          style={{ background: 'var(--gradient-end)' }}
          aria-label="End call"
          id="end-call-button"
        >
          <PhoneOff size={16} />
          End Call
        </button>
      )}

      {/* Restart button (after call ends) */}
      {(state === 'ended' || state === 'error') && (
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 hover:scale-105 active:scale-95"
          style={{ background: 'var(--gradient-call)' }}
          aria-label="Start new call"
          id="restart-call-button"
        >
          <Phone size={16} />
          New Call
        </button>
      )}
    </div>
  );
}
