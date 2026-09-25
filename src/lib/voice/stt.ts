// ============================================================
// Streaming STT Abstraction & Provider Implementations
// Clean interface isolating provider-specific logic (Sarvam, WebSpeech, REST fallback)
// ============================================================

import type { StreamingSTT } from './types';
import { transcribeAudio } from '@/lib/ai/sarvam-stt';

export interface STTConfig {
  languageCode: string;
  model?: string;
  apiKey?: string;
}

/**
 * Sarvam Streaming STT Provider (Server-side / Realtime Gateway)
 * Uses Sarvam's saaras:v3-realtime / saaras:v4 WebSocket endpoint.
 */
export class SarvamWebSocketSTT implements StreamingSTT {
  private ws: WebSocket | null = null;
  private config: STTConfig;
  private partialCb: ((text: string) => void) | null = null;
  private finalCb: ((text: string, languageCode?: string) => void) | null = null;
  private errorCb: ((err: Error) => void) | null = null;
  private connected = false;

  constructor(config: STTConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const apiKey = this.config.apiKey || process.env.SARVAM_API_KEY;
    if (!apiKey) {
      throw new Error('SARVAM_API_KEY is not configured for Streaming STT');
    }

    const lang = this.config.languageCode || 'te-IN';
    const model = this.config.model || 'saaras:v3-realtime';
    const wsUrl = `wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=${encodeURIComponent(
      lang
    )}&model=${encodeURIComponent(model)}`;

    return new Promise((resolve, reject) => {
      try {
        // Node / Server environment supports headers in WebSocket constructor
        const wsOptions = {
          headers: {
            'API-SUBSCRIPTION-KEY': apiKey,
          },
        };

        const WebSocketClass =
          typeof window !== 'undefined'
            ? window.WebSocket
            : (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket;
        type WebSocketConstructor = new (url: string, protocolsOrOptions?: unknown) => WebSocket;
        const WS = WebSocketClass as unknown as WebSocketConstructor;
        this.ws = new WS(wsUrl, wsOptions);

        this.ws!.onopen = () => {
          this.connected = true;
          resolve();
        };

        this.ws!.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data.toString());

            // Handle Sarvam Realtime STT events
            if (data.event === 'transcript.partial' || data.type === 'partial') {
              const text = data.transcript || data.text || '';
              if (text && this.partialCb) {
                this.partialCb(text);
              }
            } else if (data.event === 'transcript' || data.type === 'final' || data.transcript) {
              const text = data.transcript || data.text || '';
              const detectedLang = data.language_code || this.config.languageCode;
              if (text && this.finalCb) {
                this.finalCb(text, detectedLang);
              }
            }
          } catch (parseErr) {
            console.warn('Sarvam STT WS message parse error:', parseErr);
          }
        };

        this.ws!.onerror = () => {
          this.connected = false;
          const error = new Error('Sarvam STT WebSocket error');
          this.errorCb?.(error);
          reject(error);
        };

        this.ws!.onclose = () => {
          this.connected = false;
        };
      } catch (err) {
        this.connected = false;
        reject(err);
      }
    });
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const bytes = new Uint8Array(chunk);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      this.ws.send(
        JSON.stringify({
          event: 'audio_input',
          audio: base64,
        })
      );
    } catch (err) {
      console.warn('Error sending audio to Sarvam STT:', err);
    }
  }

  onPartialTranscript(cb: (text: string) => void): void {
    this.partialCb = cb;
  }

  onFinalTranscript(cb: (text: string, languageCode?: string) => void): void {
    this.finalCb = cb;
  }

  onError(cb: (err: Error) => void): void {
    this.errorCb = cb;
  }

  async stop(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ event: 'speech_end' }));
        this.ws.close();
      } catch {
        // Ignore
      }
    }
    this.connected = false;
    this.ws = null;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Fallback REST STT Provider
 * Uses Sarvam's 16kHz WAV REST endpoint when streaming WS is unavailable
 */
export class SarvamRestSTT implements StreamingSTT {
  private config: STTConfig;
  private partialCb: ((text: string) => void) | null = null;
  private finalCb: ((text: string, languageCode?: string) => void) | null = null;
  private errorCb: ((err: Error) => void) | null = null;
  private connected = false;

  constructor(config: STTConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  sendAudio(_chunk: ArrayBuffer): void {
    // REST STT receives complete audio buffer at speech end
  }

  async transcribeBlob(blob: Blob): Promise<string> {
    try {
      const result = await transcribeAudio(blob, this.config.languageCode);
      if (this.finalCb) {
        this.finalCb(result.transcript, result.language_code);
      }
      return result.transcript;
    } catch (err) {
      const error = err as Error;
      this.errorCb?.(error);
      throw error;
    }
  }

  onPartialTranscript(cb: (text: string) => void): void {
    this.partialCb = cb;
  }

  onFinalTranscript(cb: (text: string, languageCode?: string) => void): void {
    this.finalCb = cb;
  }

  onError(cb: (err: Error) => void): void {
    this.errorCb = cb;
  }

  async stop(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
