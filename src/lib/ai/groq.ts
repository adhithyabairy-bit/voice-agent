import Groq from 'groq-sdk';

// ============================================================
// Resilient Low-Latency Groq LLM Service
// Supports automatic multi-model fallback, thinking suppression,
// and zero-delay streaming chat completions.
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

// Ordered candidate models for ultra-low latency voice with fallback
const CANDIDATE_MODELS = [
  process.env.VOICE_LLM_MODEL,
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
].filter(Boolean) as string[];

/**
 * Stream a chat response from Groq with automatic model fallback and thinking suppression.
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

  const modelsToTry: string[] = options?.model
    ? [options.model, ...CANDIDATE_MODELS.filter((m) => m !== options.model)]
    : CANDIDATE_MODELS;

  let activeStream: any = null;
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const isReasoning =
        model.includes('qwen') || model.includes('gpt-oss') || model.includes('deepseek');

      const params: any = {
        model,
        messages,
        stream: true,
        temperature: options?.temperature ?? 0.6,
        max_tokens: options?.maxTokens ?? 150,
      };

      if (isReasoning) {
        // Disable thinking trace so the model starts speaking the final answer immediately
        params.reasoning_effort = 'none';
      }

      activeStream = await client.chat.completions.create(params);
      console.log(`[Groq] Streaming started successfully with model: ${model}`);
      break;
    } catch (err: any) {
      console.warn(`[Groq] Model ${model} failed, trying next fallback:`, err.message);
      lastError = err;
    }
  }

  if (!activeStream) {
    throw lastError || new Error('All candidate Groq models failed to generate response');
  }

  // Stream chunks while suppressing any stray <think>...</think> tags
  let inThinkTag = false;

  for await (const chunk of activeStream) {
    let content = chunk.choices[0]?.delta?.content;
    if (!content) continue;

    if (inThinkTag) {
      if (content.includes('</think>')) {
        inThinkTag = false;
        content = content.substring(content.indexOf('</think>') + 8);
      } else {
        continue;
      }
    } else if (content.includes('<think>')) {
      const parts = content.split('<think>');
      if (parts[0]) yield parts[0];
      if (parts[1] && parts[1].includes('</think>')) {
        const afterThink = parts[1].substring(parts[1].indexOf('</think>') + 8);
        if (afterThink) yield afterThink;
      } else {
        inThinkTag = true;
      }
      continue;
    }

    if (content) {
      yield content;
    }
  }
}

/**
 * Get a complete (non-streaming) chat response from Groq with fallback.
 * Used for summaries and non-real-time operations.
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

  const modelsToTry: string[] = options?.model
    ? [options.model, ...CANDIDATE_MODELS.filter((m) => m !== options.model)]
    : CANDIDATE_MODELS;

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const isReasoning =
        model.includes('qwen') || model.includes('gpt-oss') || model.includes('deepseek');

      const params: any = {
        model,
        messages,
        temperature: options?.temperature ?? 0.6,
        max_tokens: options?.maxTokens ?? 250,
      };

      if (isReasoning) {
        params.reasoning_effort = 'none';
      }

      const response = await client.chat.completions.create(params);
      let content = response.choices[0]?.message?.content || '';

      // Strip think tags
      if (content.includes('</think>')) {
        content = content.substring(content.indexOf('</think>') + 8).trim();
      } else if (content.includes('<think>')) {
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }

      return content;
    } catch (err: any) {
      console.warn(`[Groq getChatResponse] Model ${model} failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All candidate Groq models failed');
}
