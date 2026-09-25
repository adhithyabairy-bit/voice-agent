// ============================================================
// Voice Pipeline Types & Interfaces
// Realtime Conversational Voice System
// ============================================================

import type { LanguageCode, AgentPersonality, BusinessContext } from '@/types';

export interface TurnTimestamps {
  turnId: string;
  turn_start: number;
  speech_start: number;
  speech_end: number; // VAD_END
  stt_start: number;
  stt_first_partial: number | null;
  stt_final: number;
  llm_start: number;
  llm_first_token: number;
  llm_end: number;
  tts_start: number;
  tts_first_byte: number;
  tts_first_audio: number;
  audio_play_start: number;
  audio_play_end: number | null;
}

export interface TurnLatencyMetrics {
  turnId: string;
  speechDuration: number;
  vadEndToSttFinal: number; // VAD_END -> STT_FINAL
  sttFinalToLlmFirstToken: number; // STT_FINAL -> LLM_FIRST_TOKEN
  llmFirstTokenToTtsFirstByte: number; // LLM_FIRST_TOKEN -> TTS_FIRST_BYTE
  ttsFirstByteToAudioPlayStart: number; // TTS_FIRST_BYTE -> AUDIO_PLAY_START
  timeToFirstAudio: number; // AUDIO_PLAY_START - VAD_END (THE PRIMARY METRIC)
  timeToFirstToken: number; // LLM_FIRST_TOKEN - LLM_START
  timeToFirstTtsByte: number; // TTS_FIRST_BYTE - TTS_START
  totalResponseTime: number; // AUDIO_PLAY_START - VAD_END or SpeechEnd
  isInterrupted?: boolean;
  success: boolean;
}

export interface BenchmarkStats {
  averageFirstAudio: number;
  p50FirstAudio: number;
  p95FirstAudio: number;
  averageStt: number;
  averageLlmTtft: number;
  averageTtsTtfb: number;
  interruptions: number;
  successfulTurns: number;
  failedTurns: number;
  history: TurnLatencyMetrics[];
}

export interface VoiceSessionContext {
  businessId: string;
  businessName: string;
  description: string;
  services: string[];
  hours: string;
  location?: string;
  contact?: string;
  faqs?: string[];
  policies?: string[];
  rawContext?: BusinessContext;
}

export interface StreamingSTT {
  connect(): Promise<void>;
  sendAudio(chunk: ArrayBuffer): void;
  onPartialTranscript(cb: (text: string) => void): void;
  onFinalTranscript(cb: (text: string, languageCode?: string) => void): void;
  onError(cb: (err: Error) => void): void;
  stop(): Promise<void>;
  isConnected(): boolean;
}

export interface StreamingAudioPlayerInterface {
  initialize(): void;
  resume(): Promise<void>;
  setVolume(multiplier: number): void;
  getVolume(): number;
  resetChunkIndex(): void;
  enqueueIndexedAudio(audioData: ArrayBuffer, chunkIndex: number): Promise<void>;
  enqueueAudio(audioData: ArrayBuffer): Promise<void>;
  onQueueDrained(callback: () => void): void;
  onAudioStart?(callback: () => void): void;
  stopAudio(): void;
  isPlaying(): boolean;
  destroy(): void;
}

// Realtime WebSocket Protocol Types
export type RealtimeClientMessage =
  | {
      type: 'session.init';
      sessionId: string;
      businessId?: string;
      language: LanguageCode;
      voice: string;
      personality: AgentPersonality;
      sessionContext?: VoiceSessionContext;
    }
  | {
      type: 'audio.chunk';
      turnId: string;
      pcm16Base64: string;
    }
  | {
      type: 'speech.start';
      turnId: string;
      timestamp: number;
    }
  | {
      type: 'speech.end';
      turnId: string;
      timestamp: number;
    }
  | {
      type: 'interrupt';
      turnId: string;
      timestamp: number;
    }
  | {
      type: 'text.input';
      turnId: string;
      text: string;
      timestamp: number;
    };

export type RealtimeServerMessage =
  | {
      type: 'session.ready';
      sessionId: string;
      cachedContext: boolean;
    }
  | {
      type: 'stt.partial';
      turnId: string;
      transcript: string;
      timestamp: number;
    }
  | {
      type: 'stt.final';
      turnId: string;
      transcript: string;
      languageCode?: string;
      latencyMs: number;
      timestamp: number;
    }
  | {
      type: 'llm.token';
      turnId: string;
      token: string;
      isFirstToken?: boolean;
      ttftMs?: number;
      timestamp: number;
    }
  | {
      type: 'tts.chunk';
      turnId: string;
      chunkIndex: number;
      audioBase64: string;
      format: 'wav' | 'mp3';
      isFirstChunk?: boolean;
      ttfbMs?: number;
      timestamp: number;
    }
  | {
      type: 'turn.complete';
      turnId: string;
      fullResponse: string;
      timestamp: number;
    }
  | {
      type: 'turn.cancelled';
      turnId: string;
      reason: string;
    }
  | {
      type: 'error';
      turnId?: string;
      code: string;
      message: string;
    };
