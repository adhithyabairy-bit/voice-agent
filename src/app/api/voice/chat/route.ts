// ============================================================
// POST /api/voice/chat — LLM Chat (Streaming)
// Receives user message + context, streams Groq response.
// Keeps GROQ_API_KEY server-side.
// ============================================================

import { streamChatResponse, isGroqConfigured } from '@/lib/ai/groq';
import { getDemoResponse } from '@/lib/ai/demo';
import { getBusinessInfo } from '@/lib/services/business';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import type { LanguageCode, AgentPersonality } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      message,
      conversationHistory = [],
      language = 'te-IN',
      personality = 'friendly',
    } = body as {
      message: string;
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      language: LanguageCode;
      personality: AgentPersonality;
    };

    if (!message) {
      return Response.json(
        { error: 'No message provided' },
        { status: 400 }
      );
    }

    // Demo mode
    if (!isGroqConfigured()) {
      const demoResponse = getDemoResponse(message, language);
      return Response.json({
        content: demoResponse,
        mode: 'demo',
        warning: 'GROQ_API_KEY not configured. Using demo mode.',
      });
    }

    // Fetch business context
    const businessContext = await getBusinessInfo();
    const systemPrompt = buildSystemPrompt(businessContext, language, personality);

    // Build message array with sliding window (last 10 messages)
    const recentHistory = conversationHistory.slice(-10);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message },
    ];

    // Stream the response
    const startTime = Date.now();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let firstChunk = true;
          for await (const chunk of streamChatResponse(messages, {
            temperature: 0.6,
            maxTokens: 120,
          })) {
            // Send timing info with first chunk
            if (firstChunk) {
              const firstTokenLatency = Date.now() - startTime;
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: 'latency', firstTokenLatency }) + '\n'
                )
              );
              firstChunk = false;
            }

            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: 'content', content: chunk }) + '\n'
              )
            );
          }

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: 'done', totalLatency: Date.now() - startTime }) + '\n'
            )
          );
          controller.close();
        } catch (error: unknown) {
          const err = error as Error;
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: 'error', error: err.message }) + '\n'
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Chat Error:', err.message);
    return Response.json(
      { error: 'Chat processing failed', details: err.message },
      { status: 500 }
    );
  }
}
