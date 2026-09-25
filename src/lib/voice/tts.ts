// ============================================================
// Streaming TTS Client & Chunk Dispatcher
// Dispatches speech chunks immediately to Sarvam TTS
// Handles abort cancellation, indexed sequencing, and TTFB measurement
// ============================================================

import type { LanguageCode } from '@/types';

export interface TTSChunkRequest {
  text: string;
  chunkIndex: number;
  language: LanguageCode;
  voice: string;
  isFirst: boolean;
  signal?: AbortSignal;
}

export interface TTSChunkResult {
  chunkIndex: number;
  audioData: ArrayBuffer;
  ttfbMs: number;
  isFirst: boolean;
}

export class StreamingTTSClient {
  private inFlightRequests = new Map<number, AbortController>();

  /**
   * Synthesize a text chunk with cancellation tracking.
   */
  async synthesizeChunk({
    text,
    chunkIndex,
    language,
    voice,
    isFirst,
    signal,
  }: TTSChunkRequest): Promise<TTSChunkResult | null> {
    if (!text.trim() || signal?.aborted) return null;

    const controller = new AbortController();
    this.inFlightRequests.set(chunkIndex, controller);

    // Merge external signal with internal controller
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const startTime = Date.now();

    try {
      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language,
          voice,
          pace: 1.10,
          temperature: 0.25,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS HTTP error: ${response.status}`);
      }

      const ttfbMs = Date.now() - startTime;
      const audioData = await response.arrayBuffer();

      this.inFlightRequests.delete(chunkIndex);

      return {
        chunkIndex,
        audioData,
        ttfbMs,
        isFirst,
      };
    } catch (err) {
      this.inFlightRequests.delete(chunkIndex);
      if ((err as Error).name === 'AbortError') {
        return null;
      }
      console.warn(`TTS error for chunk ${chunkIndex}:`, err);
      return null;
    }
  }

  /**
   * Cancel all pending in-flight TTS synthesis requests (for barge-in).
   */
  cancelAll(): void {
    for (const controller of this.inFlightRequests.values()) {
      controller.abort();
    }
    this.inFlightRequests.clear();
  }
}
