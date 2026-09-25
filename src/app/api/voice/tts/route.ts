// ============================================================
// POST /api/voice/tts — Text-to-Speech (Ultra-Low-Latency Streaming)
// Uses Sarvam TTS streaming endpoint for <450ms TTFB.
// Keeps SARVAM_API_KEY server-side.
// ============================================================

import { synthesizeSpeechStream, synthesizeSpeech, getCachedTTSAudio } from '@/lib/ai/sarvam-tts';
import { isSarvamConfigured } from '@/lib/ai/sarvam-stt';
import { normalizeForTTS } from '@/lib/voice/normalizer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, language = 'te-IN', voice = 'aditya', pace = 1.15, temperature = 0.25 } = body;

    const cleanText = normalizeForTTS(text, language);
    if (!cleanText) {
      return Response.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    // Demo mode — return empty audio with flag
    if (!isSarvamConfigured()) {
      return Response.json({
        mode: 'demo',
        text: cleanText,
        warning: 'SARVAM_API_KEY not configured. Use browser SpeechSynthesis as fallback.',
      });
    }

    // 0ms instant cached response for frequent conversational phrases
    const cachedAudio = getCachedTTSAudio(cleanText, language, { speaker: voice, pace });
    if (cachedAudio) {
      return new Response(cachedAudio, {
        headers: {
          'Content-Type': 'audio/wav',
          'X-TTS-Cached': 'true',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // For short chunks (<= 6 words, e.g. openers), REST synthesis with caching is fastest
    const wordCount = cleanText.trim().split(/\s+/).length;
    if (wordCount <= 6) {
      const startTime = Date.now();
      const audioData = await synthesizeSpeech(cleanText, language, {
        speaker: voice,
        pace,
        temperature,
      });
      const latency = Date.now() - startTime;
      return new Response(audioData, {
        headers: {
          'Content-Type': 'audio/wav',
          'X-TTS-Latency': String(latency),
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Ultra-low latency streaming TTS from Sarvam for longer sentences
    try {
      const stream = await synthesizeSpeechStream(cleanText, language, {
        speaker: voice,
        pace,
        temperature,
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-TTS-Mode': 'stream',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (streamErr) {
      console.warn('Sarvam stream TTS failed, falling back to REST:', streamErr);
      const startTime = Date.now();
      const audioData = await synthesizeSpeech(cleanText, language, {
        speaker: voice,
        pace,
        temperature,
      });
      const latency = Date.now() - startTime;

      return new Response(audioData, {
        headers: {
          'Content-Type': 'audio/wav',
          'X-TTS-Latency': String(latency),
          'Cache-Control': 'no-cache',
        },
      });
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error('TTS Error:', err.message);
    return Response.json(
      { error: 'Text-to-speech processing failed', details: err.message },
      { status: 500 }
    );
  }
}
