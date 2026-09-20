// ============================================================
// Sarvam Speech-to-Text Service
// Uses Sarvam's saaras:v3 model for Indian language ASR.
// Endpoint: POST https://api.sarvam.ai/speech-to-text
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
 * @param audioBlob - Audio data as a Blob or Buffer
 * @param languageCode - Optional BCP-47 language hint (e.g., 'te-IN')
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

  // Handle both Blob and Buffer inputs
  if (Buffer.isBuffer(audioBlob)) {
    const uint8 = new Uint8Array(audioBlob);
    formData.append('file', new Blob([uint8], { type: 'audio/webm' }), 'audio.webm');
  } else {
    formData.append('file', audioBlob, 'audio.webm');
  }

  formData.append('model', 'saaras:v3');
  formData.append('mode', 'transcribe');

  if (languageCode) {
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
