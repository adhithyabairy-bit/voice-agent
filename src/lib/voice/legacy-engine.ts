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
import { normalizeForTTS } from './normalizer';
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
  getHistory?: () => Array<{ role: 'user' | 'assistant'; content: string }>;
  onPartialTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onToken?: (token: string) => void;
  onTurnComplete?: (fullResponse: string) => void;
  onPlaybackComplete?: () => void;
  onLatencyUpdate?: (metrics: TurnLatencyMetrics) => void;
  onError?: (err: Error) => void;
}

export class LegacyVoiceEngine {
  private options: LegacyEngineOptions;
  private ttsClient: StreamingTTSClient;
  private currentTurnTracker: TurnLatencyTracker | null = null;
  private activeTurnId = '';
  private abortController: AbortController | null = null;
  private pendingTTSChunks = 0;
  private isProcessing = false;

  constructor(options: LegacyEngineOptions) {
    this.options = options;
    this.ttsClient = new StreamingTTSClient();

    // Hook queue drain callback on player to detect when audio output ends
    this.options.player.onQueueDrained(() => {
      this.checkTurnPlaybackCompletion();
    });
  }

  async initialize(): Promise<void> {
    // Legacy engine uses HTTP endpoints directly; initialization is instant
  }

  startTurn(turnId: string): void {
    this.interrupt();
    this.activeTurnId = turnId;
    this.pendingTTSChunks = 0;
    this.isProcessing = false;
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

    this.isProcessing = true;
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
        this.isProcessing = false;
        this.options.onPlaybackComplete?.();
        return;
      }

      this.options.onFinalTranscript?.(transcript);

      // 2. LLM Phase
      this.currentTurnTracker?.recordLlmStart();
      this.options.player.resetChunkIndex();

      const history = this.options.getHistory ? this.options.getHistory().slice(-8) : [];

      const chatResp = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: transcript,
          conversationHistory: history,
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
            let parsed: any;
            try {
              parsed = JSON.parse(line);
            } catch {
              continue; // Incomplete line fragment, skip
            }

            if (parsed.type === 'error') {
              console.error('[LegacyEngine] LLM streaming error received:', parsed.error);
              throw new Error(parsed.error || 'LLM generation failed');
            }

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
          }
        }

        // Flush remaining buffer
        if (streamBuffer.trim()) {
          this.dispatchTtsChunk(streamBuffer.trim(), chunkIndex++);
        }
      }

      this.currentTurnTracker?.recordLlmEnd();
      this.isProcessing = false;
      this.options.onTurnComplete?.(fullResponse);

      if (chunkIndex === 0) {
        // No speech chunks to synthesize, transition back immediately
        this.options.onPlaybackComplete?.();
      } else {
        this.checkTurnPlaybackCompletion();
      }
    } catch (err: unknown) {
      this.isProcessing = false;
      this.pendingTTSChunks = 0;
      if ((err as Error).name !== 'AbortError') {
        console.error('Legacy engine turn error:', (err as Error).message);
        this.options.onError?.(err as Error);
        if (this.currentTurnTracker) {
          const metrics = this.currentTurnTracker.computeMetrics(false, false);
          this.options.onLatencyUpdate?.(metrics);
        }
        // Always reset to listening so conversation does not stall
        this.options.onPlaybackComplete?.();
      }
    }
  }

  private dispatchTtsChunk(textChunk: string, chunkIndex: number): void {
    const cleanText = normalizeForTTS(textChunk, this.options.language);
    if (!cleanText) return;

    const isFirst = chunkIndex === 0;
    if (isFirst) {
      this.currentTurnTracker?.recordTtsStart();
    }

    this.pendingTTSChunks++;

    this.ttsClient
      .synthesizeChunk({
        text: cleanText,
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
      })
      .finally(() => {
        this.pendingTTSChunks = Math.max(0, this.pendingTTSChunks - 1);
        this.checkTurnPlaybackCompletion();
      });
  }

  private checkTurnPlaybackCompletion(): void {
    if (
      !this.isProcessing &&
      this.pendingTTSChunks === 0 &&
      !this.options.player.isPlaying()
    ) {
      this.options.onPlaybackComplete?.();
    }
  }

  hasPendingChunks(): boolean {
    return this.isProcessing || this.pendingTTSChunks > 0;
  }

  interrupt(): void {
    this.isProcessing = false;
    this.pendingTTSChunks = 0;
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
