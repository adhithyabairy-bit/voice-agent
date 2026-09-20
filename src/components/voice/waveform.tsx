'use client';

import type { CallState } from '@/types';

interface WaveformProps {
  state: CallState;
  volume: number;
}

export function Waveform({ state, volume }: WaveformProps) {
  const isActive = ['listening', 'speaking'].includes(state);
  const barCount = 5;

  if (!isActive) return null;

  const color = state === 'listening' ? 'var(--listening)' : 'var(--speaking)';

  return (
    <div className="flex items-center justify-center gap-1 h-8" role="img" aria-label={`Audio ${state}`}>
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className="waveform-bar rounded-full transition-all duration-150"
          style={{
            width: '4px',
            height: `${8 + volume * 20 + Math.random() * 4}px`,
            backgroundColor: color,
            opacity: 0.6 + volume * 0.4,
            animationDelay: `${i * 0.1}s`,
            animationPlayState: isActive ? 'running' : 'paused',
          }}
        />
      ))}
    </div>
  );
}
