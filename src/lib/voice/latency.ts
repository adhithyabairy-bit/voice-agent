// ============================================================
// Real Latency Instrumentation & Benchmark Tracking
// Strictly NO clamping (no Math.min / Math.max to fake metrics).
// Accurate timestamp calculations for conversational turns.
// ============================================================

import type { TurnTimestamps, TurnLatencyMetrics, BenchmarkStats } from './types';

export class TurnLatencyTracker {
  private turnId: string;
  private timestamps: Partial<TurnTimestamps>;
  private completed = false;

  constructor(turnId: string) {
    this.turnId = turnId;
    this.timestamps = {
      turnId,
      turn_start: Date.now(),
    };
  }

  getTurnId(): string {
    return this.turnId;
  }

  recordSpeechStart(ts = Date.now()): void {
    if (!this.timestamps.speech_start) {
      this.timestamps.speech_start = ts;
    }
  }

  recordSpeechEnd(ts = Date.now()): void {
    if (!this.timestamps.speech_end) {
      this.timestamps.speech_end = ts;
    }
  }

  recordSttStart(ts = Date.now()): void {
    if (!this.timestamps.stt_start) {
      this.timestamps.stt_start = ts;
    }
  }

  recordSttPartial(ts = Date.now()): void {
    if (!this.timestamps.stt_first_partial) {
      this.timestamps.stt_first_partial = ts;
    }
  }

  recordSttFinal(ts = Date.now()): void {
    if (!this.timestamps.stt_final) {
      this.timestamps.stt_final = ts;
    }
  }

  recordLlmStart(ts = Date.now()): void {
    if (!this.timestamps.llm_start) {
      this.timestamps.llm_start = ts;
    }
  }

  recordLlmFirstToken(ts = Date.now()): void {
    if (!this.timestamps.llm_first_token) {
      this.timestamps.llm_first_token = ts;
    }
  }

  recordLlmEnd(ts = Date.now()): void {
    if (!this.timestamps.llm_end) {
      this.timestamps.llm_end = ts;
    }
  }

  recordTtsStart(ts = Date.now()): void {
    if (!this.timestamps.tts_start) {
      this.timestamps.tts_start = ts;
    }
  }

  recordTtsFirstByte(ts = Date.now()): void {
    if (!this.timestamps.tts_first_byte) {
      this.timestamps.tts_first_byte = ts;
    }
  }

  recordTtsFirstAudio(ts = Date.now()): void {
    if (!this.timestamps.tts_first_audio) {
      this.timestamps.tts_first_audio = ts;
    }
  }

  recordAudioPlayStart(ts = Date.now()): void {
    if (!this.timestamps.audio_play_start) {
      this.timestamps.audio_play_start = ts;
    }
  }

  recordAudioPlayEnd(ts = Date.now()): void {
    if (!this.timestamps.audio_play_end) {
      this.timestamps.audio_play_end = ts;
    }
  }

  getTimestamps(): Readonly<Partial<TurnTimestamps>> {
    return this.timestamps;
  }

  /**
   * Calculate exact latency metrics without clamping.
   */
  computeMetrics(isInterrupted = false, success = true): TurnLatencyMetrics {
    this.completed = true;
    const t = this.timestamps;

    const speechDuration =
      t.speech_start && t.speech_end ? t.speech_end - t.speech_start : 0;

    const vadEnd = t.speech_end || t.turn_start || 0;
    const sttFinal = t.stt_final || vadEnd;
    const llmStart = t.llm_start || sttFinal;
    const llmFirstToken = t.llm_first_token || llmStart;
    const ttsStart = t.tts_start || llmFirstToken;
    const ttsFirstByte = t.tts_first_byte || t.tts_first_audio || ttsStart;
    const audioPlayStart = t.audio_play_start || ttsFirstByte;

    // Strict calculations:
    const vadEndToSttFinal = sttFinal - vadEnd;
    const sttFinalToLlmFirstToken = llmFirstToken - sttFinal;
    const llmFirstTokenToTtsFirstByte = ttsFirstByte - llmFirstToken;
    const ttsFirstByteToAudioPlayStart = audioPlayStart - ttsFirstByte;
    const timeToFirstAudio = audioPlayStart - vadEnd;
    const timeToFirstToken = llmFirstToken - llmStart;
    const timeToFirstTtsByte = ttsFirstByte - ttsStart;
    const totalResponseTime = audioPlayStart - vadEnd;

    return {
      turnId: this.turnId,
      speechDuration,
      vadEndToSttFinal,
      sttFinalToLlmFirstToken,
      llmFirstTokenToTtsFirstByte,
      ttsFirstByteToAudioPlayStart,
      timeToFirstAudio,
      timeToFirstToken,
      timeToFirstTtsByte,
      totalResponseTime,
      isInterrupted,
      success,
    };
  }
}

/**
 * Benchmark accumulator for session-level performance analysis
 */
export class VoiceBenchmarkTracker {
  private turns: TurnLatencyMetrics[] = [];
  private interruptions = 0;
  private successfulTurns = 0;
  private failedTurns = 0;

  addTurn(metric: TurnLatencyMetrics): void {
    this.turns.push(metric);
    if (metric.isInterrupted) {
      this.interruptions++;
    }
    if (metric.success) {
      this.successfulTurns++;
    } else {
      this.failedTurns++;
    }

    // Persist up to 50 turns in browser session storage for benchmarking comparison
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.setItem(
          'voice_latency_benchmark',
          JSON.stringify(this.getStats())
        );
      } catch {
        // Ignore quota
      }
    }
  }

  recordInterruption(): void {
    this.interruptions++;
  }

  getStats(): BenchmarkStats {
    const validTurns = this.turns.filter((t) => t.success && t.timeToFirstAudio > 0);
    const count = validTurns.length;

    if (count === 0) {
      return {
        averageFirstAudio: 0,
        p50FirstAudio: 0,
        p95FirstAudio: 0,
        averageStt: 0,
        averageLlmTtft: 0,
        averageTtsTtfb: 0,
        interruptions: this.interruptions,
        successfulTurns: this.successfulTurns,
        failedTurns: this.failedTurns,
        history: [...this.turns],
      };
    }

    const firstAudioList = validTurns.map((t) => t.timeToFirstAudio).sort((a, b) => a - b);
    const sumFirstAudio = firstAudioList.reduce((acc, v) => acc + v, 0);

    const p50Index = Math.floor(firstAudioList.length * 0.5);
    const p95Index = Math.min(firstAudioList.length - 1, Math.floor(firstAudioList.length * 0.95));

    const avgStt = Math.round(
      validTurns.reduce((acc, t) => acc + t.vadEndToSttFinal, 0) / count
    );
    const avgLlm = Math.round(
      validTurns.reduce((acc, t) => acc + t.timeToFirstToken, 0) / count
    );
    const avgTts = Math.round(
      validTurns.reduce((acc, t) => acc + t.timeToFirstTtsByte, 0) / count
    );

    return {
      averageFirstAudio: Math.round(sumFirstAudio / count),
      p50FirstAudio: firstAudioList[p50Index],
      p95FirstAudio: firstAudioList[p95Index],
      averageStt: avgStt,
      averageLlmTtft: avgLlm,
      averageTtsTtfb: avgTts,
      interruptions: this.interruptions,
      successfulTurns: this.successfulTurns,
      failedTurns: this.failedTurns,
      history: [...this.turns],
    };
  }

  reset(): void {
    this.turns = [];
    this.interruptions = 0;
    this.successfulTurns = 0;
    this.failedTurns = 0;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem('voice_latency_benchmark');
      } catch {
        // Ignore
      }
    }
  }
}
