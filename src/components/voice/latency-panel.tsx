'use client';

// ============================================================
// Voice Latency & Benchmark Development Panel
// Realtime telemetry with strict un-clamped metrics and aggregate stats.
// ============================================================

import React, { useState } from 'react';
import { Activity, BarChart2, ChevronDown, ChevronUp, Zap, RotateCcw } from 'lucide-react';
import type { TurnLatencyMetrics, BenchmarkStats } from '@/lib/voice/types';

interface LatencyPanelProps {
  latestTurn?: TurnLatencyMetrics | null;
  benchmarkStats?: BenchmarkStats;
  onResetBenchmark?: () => void;
  activeEngine?: 'realtime' | 'legacy';
}

export function LatencyPanel({
  latestTurn,
  benchmarkStats,
  onResetBenchmark,
  activeEngine = 'legacy',
}: LatencyPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'turn' | 'benchmark'>('turn');

  const firstAudio = latestTurn?.timeToFirstAudio || 0;
  const isSub300 = firstAudio > 0 && firstAudio <= 300;

  return (
    <div className="glass-card p-4 space-y-3 font-mono text-xs border border-[var(--border)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[var(--primary)]" />
          <span className="font-semibold text-xs tracking-wider uppercase">Voice Telemetry</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-sans font-medium ${
              activeEngine === 'realtime'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-blue-100 text-blue-800 border border-blue-200'
            }`}
          >
            {activeEngine === 'realtime' ? '⚡ Realtime WS' : '🔄 Fast HTTP'}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 cursor-pointer"
          aria-label="Toggle telemetry panel"
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Tab Selector */}
          <div className="flex border-b border-[var(--border)] gap-2 pb-2">
            <button
              onClick={() => setActiveTab('turn')}
              className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'turn'
                  ? 'bg-[var(--primary)] text-white font-medium'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Zap size={12} />
              Last Turn
            </button>
            <button
              onClick={() => setActiveTab('benchmark')}
              className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'benchmark'
                  ? 'bg-[var(--primary)] text-white font-medium'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <BarChart2 size={12} />
              Session Benchmark
            </button>
          </div>

          {activeTab === 'turn' && (
            <div className="space-y-2 pt-1">
              {latestTurn ? (
                <>
                  <div className="flex justify-between py-0.5 text-[var(--muted-foreground)]">
                    <span>VAD END</span>
                    <span className="font-bold text-[var(--foreground)]">0 ms</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-[var(--muted-foreground)]">STT FINAL</span>
                    <span className="font-semibold">{Math.max(0, latestTurn.vadEndToSttFinal)} ms</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-[var(--muted-foreground)]">LLM FIRST TOKEN</span>
                    <span className="font-semibold">{Math.max(0, latestTurn.timeToFirstToken || latestTurn.sttFinalToLlmFirstToken)} ms</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-[var(--muted-foreground)]">TTS FIRST BYTE</span>
                    <span className="font-semibold">{Math.max(0, latestTurn.timeToFirstTtsByte || latestTurn.llmFirstTokenToTtsFirstByte)} ms</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-[var(--muted-foreground)]">AUDIO START</span>
                    <span className="font-semibold">{Math.max(0, latestTurn.ttsFirstByteToAudioPlayStart)} ms</span>
                  </div>
                  <div className="border-t border-[var(--border)] pt-2 mt-2 flex justify-between items-center">
                    <span className="font-bold">FIRST AUDIO (TTFA)</span>
                    <span
                      className={`text-sm font-bold ${
                        isSub300
                          ? 'text-emerald-600'
                          : firstAudio < 600
                          ? 'text-amber-600'
                          : 'text-[var(--primary)]'
                      }`}
                    >
                      {firstAudio > 0 ? `${firstAudio} ms` : 'Measuring...'}
                    </span>
                  </div>
                  {latestTurn.isInterrupted && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 text-center">
                      ⚡ Turn interrupted by user (Barge-in)
                    </div>
                  )}
                </>
              ) : (
                <div className="py-4 text-center text-[var(--muted-foreground)] text-xs">
                  Speak to measure conversation latency
                </div>
              )}
            </div>
          )}

          {activeTab === 'benchmark' && benchmarkStats && (
            <div className="space-y-2 pt-1">
              <div className="flex justify-between py-0.5">
                <span className="text-[var(--muted-foreground)]">Average First Audio</span>
                <span className="font-bold">{benchmarkStats.averageFirstAudio} ms</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-[var(--muted-foreground)]">P50 (Median)</span>
                <span className="font-semibold">{benchmarkStats.p50FirstAudio} ms</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-[var(--muted-foreground)]">P95</span>
                <span className="font-semibold">{benchmarkStats.p95FirstAudio} ms</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-[var(--muted-foreground)]">Average STT</span>
                <span className="font-semibold">{benchmarkStats.averageStt} ms</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-[var(--muted-foreground)]">Average LLM TTFT</span>
                <span className="font-semibold">{benchmarkStats.averageLlmTtft} ms</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-[var(--muted-foreground)]">Average TTS TTFB</span>
                <span className="font-semibold">{benchmarkStats.averageTtsTtfb} ms</span>
              </div>
              <div className="border-t border-[var(--border)] pt-2 mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                <div className="bg-[var(--muted)]/50 p-1.5 rounded">
                  <div className="text-[var(--muted-foreground)]">Turns</div>
                  <div className="font-bold text-xs">{benchmarkStats.successfulTurns}</div>
                </div>
                <div className="bg-[var(--muted)]/50 p-1.5 rounded">
                  <div className="text-[var(--muted-foreground)]">Barge-in</div>
                  <div className="font-bold text-xs text-amber-600">{benchmarkStats.interruptions}</div>
                </div>
                <div className="bg-[var(--muted)]/50 p-1.5 rounded">
                  <div className="text-[var(--muted-foreground)]">Failed</div>
                  <div className="font-bold text-xs text-red-600">{benchmarkStats.failedTurns}</div>
                </div>
              </div>
              {onResetBenchmark && (
                <button
                  onClick={onResetBenchmark}
                  className="w-full mt-2 py-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center justify-center gap-1 border border-dashed border-[var(--border)] rounded"
                >
                  <RotateCcw size={11} /> Reset Benchmark Stats
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
