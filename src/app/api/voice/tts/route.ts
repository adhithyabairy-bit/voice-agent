// ============================================================
// POST /api/voice/tts — Text-to-Speech (Ultra-Low-Latency Streaming)
// Uses Sarvam TTS streaming endpoint for <450ms TTFB.
// Keeps SARVAM_API_KEY server-side.
// ============================================================

import { synthesizeSpeechStream, synthesizeSpeech } from '@/lib/ai/sarvam-tts';
import { isSarvamConfigured } from '@/lib/ai/sarvam-stt';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, language = 'te-IN', voice = 'aditya', pace = 1.45, temperature = 0.25 } = body;

    if (!text) {
      return Response.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    // Demo mode — return empty audio with flag
    if (!isSarvamConfigured()) {
      return Response.json({
        mode: 'demo',
        text,
        warning: 'SARVAM_API_KEY not configured. Use browser SpeechSynthesis as fallback.',
      });
    }

    // Ultra-low latency streaming TTS from Sarvam (TTFB ~400ms)
    try {
      const stream = await synthesizeSpeechStream(text, language, {
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
      const audioData = await synthesizeSpeech(text, language, {
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
