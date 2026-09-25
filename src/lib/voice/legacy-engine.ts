// ============================================================
// Legacy Voice Engine (Optimized HTTP Fallback)
// Highly optimized HTTP pipeline with AudioWorklet, low VAD hangover (200ms),
// intelligent RAG bypass, streaming LLM, and phrase-chunked TTS playback.
// Runs seamlessly when the persistent WebSocket server is not running.
// ============================================================

import { AudioRecorder } from './audio-recorder';
import { TurnLatencyTracker } from './latency';
import { extractStreamingSpeechChunks } from './llm';
import { StreamingTTSClient } from './tts';
import type { StreamingAudioPlayerInterface, TurnLatencyMetrics, VoiceSessionContext } from './types';
import type { LanguageCode, AgentPersonality, BusinessContext } from '@/types';

export interface LegacyEngineOptions {
  language: LanguageCode;
  voice: string;
  personality: AgentPersonality;
  businessId?: string;
  businessContext?: BusinessContext;
  sessionContext?: VoiceSessionContext;
  player: StreamingAudioPlayerInterface;
  recorder: AudioRecorder;
  onPartialTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onToken?: (token: string) => void;
  onTurnComplete?: (fullResponse: string) => void;
  onLatencyUpdate?: (metrics: TurnLatencyMetrics) => void;
  onError?: (err: Error) => void;
}

export class LegacyVoiceEngine {
  private options: LegacyEngineOptions;
  private ttsClient: StreamingTTSClient;
  private currentTurnTracker: TurnLatencyTracker | null = null;
  private activeTurnId = '';
  private abortController: AbortController | null = null;

  constructor(options: LegacyEngineOptions) {
    this.options = options;
    this.ttsClient = new StreamingTTSClient();
  }

  async initialize(): Promise<void> {
    // Legacy engine uses HTTP endpoints directly; initialization is instant
  }

  startTurn(turnId: string): void {
    this.interrupt();
    this.activeTurnId = turnId;
    this.abortController = new AbortController();
    this.currentTurnTracker = new TurnLatencyTracker(turnId);
    this.currentTurnTracker.recordSpeechStart();
  }

  recordAudioPlayStart(): void {
    this.currentTurnTracker?.recordAudioPlayStart();
    if (this.currentTurnTracker) {
      const metrics = this.currentTurnTracker.computeMetrics(false, true);
      this.options.onLatencyUpdate?.(metrics);
    }
  }

  /**
   * Process user speech audio blob or text input through STT -> LLM -> TTS.
   */
  async processSpeechEnd(audioBlob?: Blob, fallbackText?: string): Promise<void> {
    const turnId = this.activeTurnId;
    if (!turnId) return;

    this.currentTurnTracker?.recordSpeechEnd();
    this.currentTurnTracker?.recordSttStart();

    let transcript = fallbackText || '';

    try {
      // 1. STT Phase if audioBlob is provided
      if (!transcript && audioBlob && audioBlob.size > 800) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');
        formData.append('language', this.options.language);

        const sttResp = await fetch('/api/voice/stt', {
          method: 'POST',
          body: formData,
          signal: this.abortController?.signal,
        });

        if (sttResp.ok) {
          const sttData = await sttResp.json();
          transcript = sttData.transcript || '';
        }
      }

      this.currentTurnTracker?.recordSttFinal();

      if (!transcript.trim()) {
        return;
      }

      this.options.onFinalTranscript?.(transcript);

      // 2. LLM Phase
      this.currentTurnTracker?.recordLlmStart();
      this.options.player.resetChunkIndex();

      const chatResp = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: transcript,
          language: this.options.language,
          personality: this.options.personality,
          businessId: this.options.businessId || this.options.businessContext?.business?.id,
          businessContext: this.options.businessContext,
        }),
        signal: this.abortController?.signal,
      });

      if (!chatResp.ok) {
        throw new Error(`Chat API error: ${chatResp.status}`);
      }

      let fullResponse = '';
      let streamBuffer = '';
      let chunkIndex = 0;
      let hasDispatchedFirstToken = false;

      const reader = chatResp.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let lineBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'content') {
                const token = parsed.content;
                fullResponse += token;
                streamBuffer += token;

                if (!hasDispatchedFirstToken) {
                  hasDispatchedFirstToken = true;
                  this.currentTurnTracker?.recordLlmFirstToken();
                }

                this.options.onToken?.(token);

                // Check for phrase chunk
                const { chunks, remaining } = extractStreamingSpeechChunks(streamBuffer);
                streamBuffer = remaining;

                for (const chunk of chunks) {
                  this.dispatchTtsChunk(chunk, chunkIndex++);
                }
              }
            } catch {
              // Ignore partial parse
            }
          }
        }

        // Flush remaining buffer
        if (streamBuffer.trim()) {
          this.dispatchTtsChunk(streamBuffer.trim(), chunkIndex++);
        }
      }

      this.currentTurnTracker?.recordLlmEnd();
      this.options.onTurnComplete?.(fullResponse);
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        this.options.onError?.(err as Error);
        if (this.currentTurnTracker) {
          const metrics = this.currentTurnTracker.computeMetrics(false, false);
          this.options.onLatencyUpdate?.(metrics);
        }
      }
    }
  }

  private dispatchTtsChunk(textChunk: string, chunkIndex: number): void {
    const isFirst = chunkIndex === 0;
    if (isFirst) {
      this.currentTurnTracker?.recordTtsStart();
    }

    this.ttsClient
      .synthesizeChunk({
        text: textChunk,
        chunkIndex,
        language: this.options.language,
        voice: this.options.voice,
        isFirst,
        signal: this.abortController?.signal,
      })
      .then(async (result) => {
        if (result && this.abortController && !this.abortController.signal.aborted) {
          if (result.isFirst) {
            this.currentTurnTracker?.recordTtsFirstByte();
            this.currentTurnTracker?.recordTtsFirstAudio();
          }
          await this.options.player.enqueueIndexedAudio(result.audioData, result.chunkIndex);
        }
      });
  }

  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.ttsClient.cancelAll();
    this.options.player.stopAudio();

    if (this.currentTurnTracker) {
      const metrics = this.currentTurnTracker.computeMetrics(true, false);
      this.options.onLatencyUpdate?.(metrics);
    }
  }

  destroy(): void {
    this.interrupt();
    this.currentTurnTracker = null;
  }
}
