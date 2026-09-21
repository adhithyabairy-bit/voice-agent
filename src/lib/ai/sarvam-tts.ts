// ============================================================
// Sarvam Text-to-Speech Service
// Uses Sarvam's bulbul:v3 model for Indian language TTS.
// REST endpoint: POST https://api.sarvam.ai/text-to-speech
// Streaming endpoint: POST https://api.sarvam.ai/text-to-speech/stream
// ============================================================

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_TTS_STREAM_URL = 'https://api.sarvam.ai/text-to-speech/stream';

export interface TTSOptions {
  speaker?: string;
  pace?: number;
  model?: string;
  temperature?: number;
  speech_sample_rate?: number;
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

  // Truncate text to stay within API limits
  const truncatedText = text.slice(0, 2500);

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
      speaker: options?.speaker || 'aditya',
      pace: options?.pace || 1.05,
      temperature: options?.temperature ?? 0.4,
      speech_sample_rate: options?.speech_sample_rate ?? 24000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam TTS error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  // Sarvam returns base64-encoded audio; decode it
  if (result.audios && result.audios.length > 0) {
    const base64Audio = result.audios[0];
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
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

  const truncatedText = text.slice(0, 2500);

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
      speaker: options?.speaker || 'aditya',
      pace: options?.pace || 1.05,
      temperature: options?.temperature ?? 0.4,
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
