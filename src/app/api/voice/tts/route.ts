// ============================================================
// POST /api/voice/tts — Text-to-Speech
// Receives text, sends to Sarvam TTS, returns audio.
// Keeps SARVAM_API_KEY server-side.
// ============================================================

import { synthesizeSpeech } from '@/lib/ai/sarvam-tts';
import { isSarvamConfigured } from '@/lib/ai/sarvam-stt';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, language = 'te-IN', voice = 'shubh', pace = 1.0 } = body;

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

    // Real TTS
    const startTime = Date.now();
    const audioData = await synthesizeSpeech(text, language, {
      speaker: voice,
      pace,
    });
    const latency = Date.now() - startTime;

    // Return audio as binary with latency header
    return new Response(audioData, {
      headers: {
        'Content-Type': 'audio/wav',
        'X-TTS-Latency': String(latency),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('TTS Error:', err.message);
    return Response.json(
      { error: 'Text-to-speech processing failed', details: err.message },
      { status: 500 }
    );
  }
}
