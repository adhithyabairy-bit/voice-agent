import Groq from 'groq-sdk';

// ============================================================
// Resilient Low-Latency Groq LLM Service
// Prioritizes immediate-turn low-latency conversational models
// with zero reasoning delay and automatic fallback.
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

// Candidate models: llama-3.3-70b-versatile provides immediate ~200-300ms TTFT
// without any reasoning/thinking delay, with native multilingual support for Indian languages.
const CANDIDATE_MODELS = [
  process.env.VOICE_LLM_MODEL || 'llama-3.3-70b-versatile',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
];

/**
 * Deduplicate model list preserving priority
 */
function getPrioritizedModels(preferredModel?: string): string[] {
  const list = preferredModel ? [preferredModel, ...CANDIDATE_MODELS] : CANDIDATE_MODELS;
  return Array.from(new Set(list.filter(Boolean))) as string[];
}

/**
 * Stream a chat response from Groq with immediate token delivery and automatic fallback.
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
  const modelsToTry = getPrioritizedModels(options?.model);

  let activeStream: any = null;
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const isReasoning =
        model.includes('gpt-oss') || model.includes('deepseek') || model.includes('qwen');

      const params: any = {
        model,
        messages,
        stream: true,
        temperature: options?.temperature ?? 0.6,
        max_tokens: options?.maxTokens ?? 150,
      };

      if (isReasoning) {
        // Groq requires 'low', 'medium', or 'high' for reasoning_effort
        params.reasoning_effort = 'low';
      }

      activeStream = await client.chat.completions.create(params);
      console.log(`[Groq] Streaming started with model: ${model}`);
      break;
    } catch (err: any) {
      console.warn(`[Groq] Model ${model} failed, trying fallback:`, err.message);
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
  const modelsToTry = getPrioritizedModels(options?.model);

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const isReasoning =
        model.includes('gpt-oss') || model.includes('deepseek') || model.includes('qwen');

      const params: any = {
        model,
        messages,
        temperature: options?.temperature ?? 0.6,
        max_tokens: options?.maxTokens ?? 250,
      };

      if (isReasoning) {
        params.reasoning_effort = 'low';
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
