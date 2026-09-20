// ============================================================
// POST /api/voice/stt — Speech-to-Text
// Receives audio from the browser, sends to Sarvam STT,
// returns transcript. Keeps SARVAM_API_KEY server-side.
// ============================================================

import { transcribeAudio, isSarvamConfigured } from '@/lib/ai/sarvam-stt';
import { getMockTranscript } from '@/lib/ai/demo';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as Blob | null;
    const language = formData.get('language') as string | null;
    const textFallback = formData.get('text') as string | null;

    // Text fallback mode (when voice is unavailable)
    if (textFallback) {
      return Response.json({
        transcript: textFallback,
        language_code: language || 'en-IN',
        mode: 'text_fallback',
      });
    }

    if (!audioFile) {
      return Response.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Demo mode check
    if (!isSarvamConfigured()) {
      return Response.json({
        ...getMockTranscript(''),
        mode: 'demo',
        warning: 'SARVAM_API_KEY not configured. Using demo mode.',
      });
    }

    // Real STT
    const startTime = Date.now();
    const result = await transcribeAudio(audioFile, language || undefined);
    const latency = Date.now() - startTime;

    return Response.json({
      ...result,
      latency,
      mode: 'live',
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('STT Error:', err.message);
    return Response.json(
      { error: 'Speech-to-text processing failed', details: err.message },
      { status: 500 }
    );
  }
}
