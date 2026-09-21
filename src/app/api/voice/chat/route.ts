// ============================================================
// POST /api/voice/chat — LLM Chat (Streaming with RAG)
// Receives user message + businessId, performs vector retrieval,
// builds dynamic business system prompt, streams Groq response.
// ============================================================

import { streamChatResponse, isGroqConfigured } from '@/lib/ai/groq';
import { getDemoResponse } from '@/lib/ai/demo';
import { getBusinessInfo } from '@/lib/services/business';
import { retrieveBusinessKnowledge } from '@/lib/ai/knowledge';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { getAuthSession } from '@/lib/auth/session';
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
      businessId,
    } = body as {
      message: string;
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      language: LanguageCode;
      personality: AgentPersonality;
      businessId?: string;
    };

    if (!message) {
      return Response.json(
        { error: 'No message provided' },
        { status: 400 }
      );
    }

    // Demo mode if Groq not configured
    if (!isGroqConfigured()) {
      const demoResponse = getDemoResponse(message, language);
      return Response.json({
        content: demoResponse,
        mode: 'demo',
        warning: 'GROQ_API_KEY not configured. Using demo mode.',
      });
    }

    // Resolve business context
    let resolvedBusinessId = businessId;
    if (!resolvedBusinessId) {
      const session = await getAuthSession(request);
      resolvedBusinessId = session?.business?.id;
    }

    const businessContext = await getBusinessInfo(resolvedBusinessId);

    // Retrieve semantic RAG knowledge chunks for this specific business
    if (businessContext.business?.id) {
      try {
        const chunks = await retrieveBusinessKnowledge(businessContext.business.id, message, 3);
        businessContext.knowledgeChunks = chunks;
      } catch (ragErr) {
        console.warn('RAG knowledge retrieval non-blocking error:', ragErr);
      }
    }

    // Build personalized system prompt with dynamic business context & RAG chunks
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
            maxTokens: 80,
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
