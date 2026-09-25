// ============================================================
// Sarvam Text-to-Speech Service
// Uses Sarvam's bulbul:v3 model for Indian language TTS.
// REST endpoint: POST https://api.sarvam.ai/text-to-speech
// Streaming endpoint: POST https://api.sarvam.ai/text-to-speech/stream
// Features:
// - O(1) LRU Audio Cache with normalized Unicode keys
// - Automatic pre-TTS normalization (removes markdown, emoji, junk)
// - Configurable speaker and speech pace
// ============================================================

import { normalizeForTTS } from '@/lib/voice/normalizer';

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_TTS_STREAM_URL = 'https://api.sarvam.ai/text-to-speech/stream';

export interface TTSOptions {
  speaker?: string;
  pace?: number;
  model?: string;
  temperature?: number;
  speech_sample_rate?: number;
}

// Default voice settings
const DEFAULT_SPEAKER = process.env.SARVAM_TTS_SPEAKER || 'aditya';
const DEFAULT_PACE = Number(process.env.SARVAM_TTS_PACE || 1.15);

// ============================================================
// DSA LRU Audio Cache with Key Normalization
// O(1) get & put with fixed capacity (capacity: 250 chunks)
// Normalizes whitespace, punctuation, and Unicode combining forms
// Ensures 0ms instant playback for repeated/common phrases
// ============================================================

class LRUAudioCache {
  private capacity: number;
  private cache = new Map<string, ArrayBuffer>();

  constructor(capacity = 250) {
    this.capacity = capacity;
  }

  get(key: string): ArrayBuffer | null {
    const item = this.cache.get(key);
    if (!item) return null;
    // Refresh recency
    this.cache.delete(key);
    this.cache.set(key, item);
    return item;
  }

  set(key: string, value: ArrayBuffer): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Evict least recently used (first key in Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const ttsAudioCache = new LRUAudioCache(250);

function normalizeCacheKey(text: string, languageCode: string, speaker: string, pace: number): string {
  const normalized = normalizeForTTS(text, languageCode)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.?!,;:]+$/, '');
  return `${languageCode}:${speaker}:${pace.toFixed(2)}:${normalized}`;
}

export function getCachedTTSAudio(
  text: string,
  languageCode: string,
  options?: TTSOptions
): ArrayBuffer | null {
  const speaker = options?.speaker || DEFAULT_SPEAKER;
  const pace = options?.pace ?? DEFAULT_PACE;
  const cacheKey = normalizeCacheKey(text, languageCode, speaker, pace);
  const cached = ttsAudioCache.get(cacheKey);
  return cached ? cached.slice(0) : null;
}

/**
 * Synthesize speech from text using Sarvam TTS (REST, base64 response).
 *
 * @param text - Text to convert to speech (max 2500 chars)
 * @param languageCode - BCP-47 language code (e.g., 'te-IN', 'hi-IN', 'en-IN')
 * @param options - Optional speaker, pace, model settings
 * @returns Audio data as ArrayBuffer (WAV/MP3)
 */
export async function synthesizeSpeech(
  text: string,
  languageCode: string,
  options?: TTSOptions
): Promise<ArrayBuffer> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error('SARVAM_API_KEY is not configured');
  }

  const cleanText = normalizeForTTS(text, languageCode);
  if (!cleanText) {
    throw new Error('Text is empty after normalization');
  }

  const speaker = options?.speaker || DEFAULT_SPEAKER;
  const pace = options?.pace ?? DEFAULT_PACE;
  const cacheKey = normalizeCacheKey(cleanText, languageCode, speaker, pace);

  const cached = ttsAudioCache.get(cacheKey);
  if (cached) {
    return cached.slice(0);
  }

  // Truncate text to stay within API limits
  const truncatedText = cleanText.slice(0, 2500);

  const response = await fetch(SARVAM_TTS_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: truncatedText,
      language_code: languageCode,
      model: options?.model || 'bulbul:v3',
      speaker,
      pace,
      temperature: options?.temperature ?? 0.25,
      speech_sample_rate: options?.speech_sample_rate ?? 24000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam TTS error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  // Sarvam returns base64-encoded audio; decode it natively
  if (result.audios && result.audios.length > 0) {
    const base64Audio = result.audios[0];
    const nodeBuf = Buffer.from(base64Audio, 'base64');
    const arrayBuffer = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength
    );
    ttsAudioCache.set(cacheKey, arrayBuffer);
    return arrayBuffer.slice(0);
  }

  throw new Error('No audio data in Sarvam TTS response');
}

/**
 * Synthesize speech using the streaming endpoint.
 * Returns a ReadableStream of raw audio bytes for lower latency.
 */
export async function synthesizeSpeechStream(
  text: string,
  languageCode: string,
  options?: TTSOptions
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error('SARVAM_API_KEY is not configured');
  }

  const cleanText = normalizeForTTS(text, languageCode);
  if (!cleanText) {
    throw new Error('Text is empty after normalization');
  }

  const speaker = options?.speaker || DEFAULT_SPEAKER;
  const pace = options?.pace ?? DEFAULT_PACE;
  const truncatedText = cleanText.slice(0, 2500);

  const response = await fetch(SARVAM_TTS_STREAM_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: truncatedText,
      language_code: languageCode,
      model: options?.model || 'bulbul:v3',
      speaker,
      pace,
      temperature: options?.temperature ?? 0.25,
      speech_sample_rate: options?.speech_sample_rate ?? 24000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam TTS stream error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No stream body in Sarvam TTS response');
  }

  return response.body;
}
