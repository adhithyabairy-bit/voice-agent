// ============================================================
// Realtime Voice Engine
// Persistent WebSocket-based voice runtime.
// Lowest practical conversational latency pipeline:
// Mic AudioWorklet -> WebSocket -> Sarvam Realtime STT -> Groq Streaming -> Sarvam TTS Stream -> AudioPlayer
// ============================================================

import { RealtimeVoiceClient } from './realtime-client';
import { TurnLatencyTracker } from './latency';
import type { StreamingAudioPlayerInterface, TurnLatencyMetrics, VoiceSessionContext } from './types';
import type { LanguageCode, AgentPersonality } from '@/types';

export interface RealtimeEngineOptions {
  language: LanguageCode;
  voice: string;
  personality: AgentPersonality;
  sessionContext?: VoiceSessionContext;
  player: StreamingAudioPlayerInterface;
  onPartialTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onToken?: (token: string) => void;
  onTurnComplete?: (fullResponse: string) => void;
  onPlaybackComplete?: () => void;
  onLatencyUpdate?: (metrics: TurnLatencyMetrics) => void;
  onError?: (err: Error) => void;
}

export class RealtimeVoiceEngine {
  private client: RealtimeVoiceClient;
  private options: RealtimeEngineOptions;
  private currentTurnTracker: TurnLatencyTracker | null = null;
  private activeTurnId = '';
  private isConnected = false;
  private isTurnServerComplete = false;

  constructor(options: RealtimeEngineOptions) {
    this.options = options;
    this.client = new RealtimeVoiceClient();

    this.options.player.onQueueDrained(() => {
      if (this.isTurnServerComplete && !this.options.player.isPlaying()) {
        this.isTurnServerComplete = false;
        this.options.onPlaybackComplete?.();
      }
    });
  }

  async initialize(): Promise<void> {
    this.client.setCallbacks({
      onPartialTranscript: (turnId, transcript) => {
        if (turnId === this.activeTurnId) {
          this.currentTurnTracker?.recordSttPartial();
          this.options.onPartialTranscript?.(transcript);
        }
      },
      onFinalTranscript: (turnId, transcript) => {
        if (turnId === this.activeTurnId) {
          this.currentTurnTracker?.recordSttFinal();
          this.options.onFinalTranscript?.(transcript);
        }
      },
      onToken: (turnId, token, isFirst) => {
        if (turnId === this.activeTurnId) {
          if (isFirst) {
            this.currentTurnTracker?.recordLlmFirstToken();
          }
          this.options.onToken?.(token);
        }
      },
      onTtsChunk: async (turnId, chunkIndex, audioBuffer, isFirst) => {
        if (turnId === this.activeTurnId) {
          if (isFirst) {
            this.currentTurnTracker?.recordTtsFirstByte();
            this.currentTurnTracker?.recordTtsFirstAudio();
          }
          await this.options.player.enqueueIndexedAudio(audioBuffer, chunkIndex);
        }
      },
      onTurnComplete: (turnId, fullResponse) => {
        if (turnId === this.activeTurnId) {
          this.currentTurnTracker?.recordLlmEnd();
          if (this.currentTurnTracker) {
            const metrics = this.currentTurnTracker.computeMetrics(false, true);
            this.options.onLatencyUpdate?.(metrics);
          }
          this.options.onTurnComplete?.(fullResponse);
          this.isTurnServerComplete = true;
          if (!this.options.player.isPlaying()) {
            this.isTurnServerComplete = false;
            this.options.onPlaybackComplete?.();
          }
        }
      },
      onTurnCancelled: (turnId) => {
        if (turnId === this.activeTurnId && this.currentTurnTracker) {
          const metrics = this.currentTurnTracker.computeMetrics(true, false);
          this.options.onLatencyUpdate?.(metrics);
        }
      },
      onError: (err) => {
        this.options.onError?.(err);
      },
      onDisconnect: () => {
        this.isConnected = false;
      },
    });

    await this.client.connect();
    this.isConnected = true;

    this.client.initSession(
      `sess-${Date.now()}`,
      this.options.sessionContext?.businessId,
      this.options.language,
      this.options.voice,
      this.options.personality,
      this.options.sessionContext
    );
  }

  isReady(): boolean {
    return this.isConnected && this.client.isConnected();
  }

  startTurn(turnId: string): void {
    this.activeTurnId = turnId;
    this.isTurnServerComplete = false;
    this.currentTurnTracker = new TurnLatencyTracker(turnId);
    this.currentTurnTracker.recordSpeechStart();
    this.client.sendSpeechStart(turnId);
  }

  sendAudioChunk(base64: string): void {
    if (this.activeTurnId) {
      this.client.sendAudioChunk(this.activeTurnId, base64);
    }
  }

  endTurn(turnId: string): void {
    if (this.activeTurnId === turnId) {
      this.currentTurnTracker?.recordSpeechEnd();
      this.currentTurnTracker?.recordSttStart();
      this.client.sendSpeechEnd(turnId);
    }
  }

  recordAudioPlayStart(): void {
    this.currentTurnTracker?.recordAudioPlayStart();
    if (this.currentTurnTracker) {
      const metrics = this.currentTurnTracker.computeMetrics(false, true);
      this.options.onLatencyUpdate?.(metrics);
    }
  }

  interrupt(): void {
    this.isTurnServerComplete = false;
    if (this.activeTurnId) {
      this.client.sendInterrupt(this.activeTurnId);
      this.options.player.stopAudio();
      if (this.currentTurnTracker) {
        const metrics = this.currentTurnTracker.computeMetrics(true, false);
        this.options.onLatencyUpdate?.(metrics);
      }
    }
  }

  sendTextInput(turnId: string, text: string): void {
    this.activeTurnId = turnId;
    this.currentTurnTracker = new TurnLatencyTracker(turnId);
    this.currentTurnTracker.recordSpeechEnd();
    this.currentTurnTracker.recordSttFinal();
    this.client.sendTextInput(turnId, text);
  }

  destroy(): void {
    this.interrupt();
    this.client.disconnect();
    this.isConnected = false;
    this.currentTurnTracker = null;
  }
}
