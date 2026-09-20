// ============================================================
// Sarvam Speech-to-Text Service
// Uses Sarvam's saaras:v3 model for Indian language ASR.
// Endpoint: POST https://api.sarvam.ai/speech-to-text
// Supports WAV (16kHz PCM recommended) and WebM.
// ============================================================

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';

/**
 * Check if Sarvam API is configured.
 */
export function isSarvamConfigured(): boolean {
  return !!process.env.SARVAM_API_KEY;
}

export interface STTResult {
  transcript: string;
  language_code: string;
}

/**
 * Transcribe audio using Sarvam's STT API.
 *
 * @param audioBlob - Audio data as a Blob or Buffer (WAV/WebM)
 * @param languageCode - Optional BCP-47 language hint (e.g., 'te-IN', 'hi-IN', 'en-IN')
 * @returns Transcription result with detected language
 */
export async function transcribeAudio(
  audioBlob: Blob | Buffer,
  languageCode?: string
): Promise<STTResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error('SARVAM_API_KEY is not configured');
  }

  const formData = new FormData();

  // Detect whether audio is WAV (preferred 16kHz) or WebM
  const isWav =
    (typeof Blob !== 'undefined' && audioBlob instanceof Blob && audioBlob.type.includes('wav')) ||
    (Buffer.isBuffer(audioBlob) && audioBlob.subarray(0, 4).toString() === 'RIFF');

  const fileName = isWav ? 'recording.wav' : 'recording.webm';
  const mimeType = isWav ? 'audio/wav' : 'audio/webm';

  if (Buffer.isBuffer(audioBlob)) {
    const uint8 = new Uint8Array(audioBlob);
    formData.append('file', new Blob([uint8], { type: mimeType }), fileName);
  } else {
    formData.append('file', audioBlob, fileName);
  }

  formData.append('model', 'saaras:v3');
  formData.append('mode', 'transcribe');

  // Provide language hint if explicitly specified and not auto/unknown
  if (languageCode && languageCode !== 'unknown' && languageCode !== 'auto') {
    formData.append('language_code', languageCode);
  }

  const response = await fetch(SARVAM_STT_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam STT error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  return {
    transcript: result.transcript || '',
    language_code: result.language_code || languageCode || 'unknown',
  };
}
