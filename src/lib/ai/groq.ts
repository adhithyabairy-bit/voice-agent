import Groq from 'groq-sdk';

// ============================================================
// Groq LLM Service
// Provides streaming chat completions using Groq's API.
// Model: qwen/qwen3.8-27b (strong multilingual support)
// ============================================================

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

/**
 * Check if Groq API is configured.
 */
export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

/**
 * Stream a chat response from Groq.
 * Returns an async iterable of text chunks.
 */
export async function* streamChatResponse(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }
): AsyncGenerator<string> {
  const client = getGroqClient();

  const defaultModel = process.env.VOICE_LLM_MODEL || 'llama-3.3-70b-versatile';
  const stream = await client.chat.completions.create({
    model: options?.model || defaultModel,
    messages,
    stream: true,
    temperature: options?.temperature ?? 0.6,
    max_tokens: options?.maxTokens ?? 120,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

/**
 * Get a complete (non-streaming) chat response from Groq.
 * Used for summaries and other non-real-time operations.
 */
export async function getChatResponse(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }
): Promise<string> {
  const client = getGroqClient();

  const defaultModel = process.env.VOICE_LLM_MODEL || 'llama-3.3-70b-versatile';
  const response = await client.chat.completions.create({
    model: options?.model || defaultModel,
    messages,
    temperature: options?.temperature ?? 0.6,
    max_tokens: options?.maxTokens ?? 150,
  });

  return response.choices[0]?.message?.content || '';
}
