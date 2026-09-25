// ============================================================
// Realtime WebSocket Voice Client
// Persistent bi-directional link between browser and Realtime Voice Server.
// Handles audio chunk streaming, live events, reconnection, and barge-in.
// ============================================================

import type { RealtimeClientMessage, RealtimeServerMessage, VoiceSessionContext } from './types';
import type { LanguageCode, AgentPersonality } from '@/types';
import { VOICE_CONFIG } from './config';

export interface RealtimeClientCallbacks {
  onSessionReady?: (sessionId: string) => void;
  onPartialTranscript?: (turnId: string, transcript: string) => void;
  onFinalTranscript?: (turnId: string, transcript: string, latencyMs: number) => void;
  onToken?: (turnId: string, token: string, isFirst?: boolean) => void;
  onTtsChunk?: (turnId: string, chunkIndex: number, audioBuffer: ArrayBuffer, isFirst?: boolean) => void;
  onTurnComplete?: (turnId: string, fullResponse: string) => void;
  onTurnCancelled?: (turnId: string, reason: string) => void;
  onError?: (err: Error) => void;
  onDisconnect?: () => void;
}

export class RealtimeVoiceClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private isConnecting = false;
  private isConnectedState = false;
  private callbacks: RealtimeClientCallbacks = {};

  constructor(wsUrl: string = VOICE_CONFIG.realtime.wsUrl) {
    this.wsUrl = wsUrl;
  }

  setCallbacks(cbs: RealtimeClientCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cbs };
  }

  isConnected(): boolean {
    return this.isConnectedState && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(timeoutMs = 3000): Promise<void> {
    if (this.isConnected()) return;
    if (this.isConnecting) return;

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;

      try {
        this.ws = new WebSocket(this.wsUrl);

        timer = setTimeout(() => {
          this.isConnecting = false;
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            try {
              this.ws.close();
            } catch {
              // Ignore
            }
            reject(new Error(`Realtime WebSocket connection timed out (${timeoutMs}ms)`));
          }
        }, timeoutMs);

        this.ws.onopen = () => {
          if (timer) clearTimeout(timer);
          this.isConnecting = false;
          this.isConnectedState = true;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleServerMessage(event.data);
        };

        this.ws.onerror = () => {
          if (timer) clearTimeout(timer);
          this.isConnecting = false;
          this.isConnectedState = false;
          const err = new Error('Realtime WebSocket connection error');
          this.callbacks.onError?.(err);
          reject(err);
        };

        this.ws.onclose = () => {
          if (timer) clearTimeout(timer);
          this.isConnecting = false;
          this.isConnectedState = false;
          this.callbacks.onDisconnect?.();
        };
      } catch (err) {
        if (timer) clearTimeout(timer);
        this.isConnecting = false;
        this.isConnectedState = false;
        reject(err);
      }
    });
  }

  private handleServerMessage(rawData: string | ArrayBuffer): void {
    try {
      if (typeof rawData !== 'string') return;
      const msg: RealtimeServerMessage = JSON.parse(rawData);

      switch (msg.type) {
        case 'session.ready':
          this.callbacks.onSessionReady?.(msg.sessionId);
          break;
        case 'stt.partial':
          this.callbacks.onPartialTranscript?.(msg.turnId, msg.transcript);
          break;
        case 'stt.final':
          this.callbacks.onFinalTranscript?.(msg.turnId, msg.transcript, msg.latencyMs);
          break;
        case 'llm.token':
          this.callbacks.onToken?.(msg.turnId, msg.token, msg.isFirstToken);
          break;
        case 'tts.chunk': {
          const binaryStr = atob(msg.audioBase64);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          this.callbacks.onTtsChunk?.(msg.turnId, msg.chunkIndex, bytes.buffer, msg.isFirstChunk);
          break;
        }
        case 'turn.complete':
          this.callbacks.onTurnComplete?.(msg.turnId, msg.fullResponse);
          break;
        case 'turn.cancelled':
          this.callbacks.onTurnCancelled?.(msg.turnId, msg.reason);
          break;
        case 'error':
          this.callbacks.onError?.(new Error(msg.message));
          break;
      }
    } catch (parseErr) {
      console.warn('Realtime client message parse error:', parseErr);
    }
  }

  initSession(
    sessionId: string,
    businessId: string | undefined,
    language: LanguageCode,
    voice: string,
    personality: AgentPersonality,
    sessionContext?: VoiceSessionContext
  ): void {
    this.send({
      type: 'session.init',
      sessionId,
      businessId,
      language,
      voice,
      personality,
      sessionContext,
    });
  }

  sendAudioChunk(turnId: string, pcm16Base64: string): void {
    this.send({
      type: 'audio.chunk',
      turnId,
      pcm16Base64,
    });
  }

  sendSpeechStart(turnId: string): void {
    this.send({
      type: 'speech.start',
      turnId,
      timestamp: Date.now(),
    });
  }

  sendSpeechEnd(turnId: string): void {
    this.send({
      type: 'speech.end',
      turnId,
      timestamp: Date.now(),
    });
  }

  sendInterrupt(turnId: string): void {
    this.send({
      type: 'interrupt',
      turnId,
      timestamp: Date.now(),
    });
  }

  sendTextInput(turnId: string, text: string): void {
    this.send({
      type: 'text.input',
      turnId,
      text,
      timestamp: Date.now(),
    });
  }

  private send(msg: RealtimeClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.isConnectedState = false;
    this.isConnecting = false;
  }
}
