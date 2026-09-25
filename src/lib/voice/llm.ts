// ============================================================
// Low-Latency LLM Streaming & Intelligent Phrase Chunking
// - Configurable Groq model (VOICE_LLM_MODEL)
// - Voice-optimized system prompting (concise, 1-2 sentences)
// - Fast RAG decision router (bypasses RAG for greetings & common info)
// - Speculative phrase chunking (triggers TTS on 3-4 words for minimum TTFA)
// ============================================================

import { streamChatResponse } from '@/lib/ai/groq';
import { retrieveBusinessKnowledge } from '@/lib/ai/knowledge';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { VOICE_CONFIG } from './config';
import type { LanguageCode, AgentPersonality, BusinessContext } from '@/types';
import type { VoiceSessionContext } from './types';

// Common greetings, acknowledgments, and booking statements that NEVER require RAG retrieval
const GREETING_OR_SHORT_PATTERNS = [
  /^(hello|hi|hey|halo|hlo|helo)[\s.!?,]*$/i,
  /^(namaste|namaskaram|vanakkam|namaskar|నమస్కారం)[\s.!?,]*$/i,
  /^(okay|ok|okk|okey|sure|alright|fine|cool|ఓకే|సరే|సరేనా|అలాగే)[\s.!?,]*$/i,
  /^(thank you|thanks|dhanyavadalu|shukriya|థాంక్స్|థాంక్యూ|ధన్యవాదాలు)[\s.!?,]*$/i,
  /^(yes|yeah|yep|no|nope|nah|avunu|kadu|haan|nahi|హా|అవును|కాదు)[\s.!?,]*$/i,
  /^(bye|goodbye|see you|tata|బై)[\s.!?,]*$/i,
  /^(who are you|meeru evaru|aap kaun hain)[\s.!?,]*$/i,
  // Name declarations & slot requests have direct business facts in prompt
  /^(నా పేరు|my name is|i am)\s+/i,
  /(?:బుక్ చెయ్యి|book చేయండి|స్లాట్|slot|రేపు|సండే|మండే|ఆదివారం|సోమవారం)/i,
];

export function shouldBypassRAG(query: string, context?: VoiceSessionContext): boolean {
  const clean = query.trim().toLowerCase();

  // 1. Very short utterance (< 3 words) or matches greeting/ack pattern
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2) return true;

  for (const pattern of GREETING_OR_SHORT_PATTERNS) {
    if (pattern.test(clean)) return true;
  }

  // 2. Query asks for basic business info already available in cached context
  if (context) {
    const isHoursQuery = /timing|hours|open|close|when|time|samayam|vela/i.test(clean);
    const isLocationQuery = /address|location|where|place|ekkada|kahan/i.test(clean);
    const isContactQuery = /phone|number|contact|call|email/i.test(clean);
    const isServicesQuery = /service|services|treatment|menu|what do you do|em chestharu/i.test(clean);

    if (
      (isHoursQuery && context.hours) ||
      (isLocationQuery && context.location) ||
      (isContactQuery && context.contact) ||
      (isServicesQuery && context.services.length > 0)
    ) {
      return true; // Already directly in system context!
    }
  }

  return false;
}

/**
 * Split streamed LLM tokens into natural, human speech breath-groups.
 * DSA Sliding Window with Prosodic Lookahead:
 * - Prevents artificial robotic 3-word stops (e.g. "సరే అండి, ఆదిత్య గారు.")
 * - Combines short openers (< 5 words) with the subsequent clause so playback is continuous and fluent
 * - Emits on full sentence boundaries or natural breath clauses (5-18 words)
 */
export function extractStreamingSpeechChunks(buffer: string): {
  chunks: string[];
  remaining: string;
} {
  const chunks: string[] = [];
  let remaining = buffer;

  while (remaining.length > 0) {
    // 1. Check for complete sentence boundary (. ? ! । \n)
    const sentenceMatch = remaining.match(/^([\s\S]*?[.?!।\n]+)(\s+|$)([\s\S]*)/);
    if (sentenceMatch) {
      const candidate = sentenceMatch[1].trim();
      const rest = sentenceMatch[3];
      const wordCount = candidate.split(/\s+/).filter(Boolean).length;

      // If candidate is very short (< 5 words, e.g. "సరే అండి, ఆదిత్య గారు.")
      // AND there is more text following or currently streaming in rest,
      // combine them into a single natural breath group to eliminate robotic pauses!
      if (wordCount < 5 && rest.trim().length > 0) {
        const nextSentenceMatch = rest.match(/^([\s\S]*?[.?!।\n]+)(\s+|$)([\s\S]*)/);
        if (nextSentenceMatch) {
          const combined = `${candidate} ${nextSentenceMatch[1].trim()}`.trim();
          remaining = nextSentenceMatch[3];
          chunks.push(combined);
          continue;
        } else {
          // The rest of the thought is still streaming; hold candidate in buffer
          break;
        }
      }

      if (candidate.length > 0) {
        chunks.push(candidate);
        remaining = rest;
        continue;
      }
    }

    // 2. Clause boundary (, ; : —) only if clause has at least 7 words
    const words = remaining.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 7) {
      const clauseMatch = remaining.match(/^([\s\S]*?[,;:—\u2013\u2014]+)(\s+|$)([\s\S]*)/);
      if (clauseMatch) {
        const chunk = clauseMatch[1].trim();
        const clauseWords = chunk.split(/\s+/).filter(Boolean);
        if (clauseWords.length >= 6) {
          remaining = clauseMatch[3];
          if (chunk.length > 0) chunks.push(chunk);
          continue;
        }
      }
    }

    // 3. Fallback for long run-on sentences without punctuation (16+ words)
    if (words.length >= 16) {
      const chunk = words.slice(0, 12).join(' ');
      remaining = words.slice(12).join(' ');
      chunks.push(chunk);
      continue;
    }

    break;
  }

  return { chunks, remaining };
}

/**
 * Build voice-optimized LLM prompt with conversational latency directives.
 */
export function buildVoiceSystemPrompt(
  context: BusinessContext,
  language: LanguageCode,
  personality: AgentPersonality = 'friendly'
): string {
  const basePrompt = buildSystemPrompt(context, language, personality);

  const voiceDirectives = `
=== REALTIME VOICE CONVERSATION DIRECTIVES (CRITICAL) ===
You are a realtime business voice assistant speaking directly over a live voice phone line.
1. Speak naturally, warmly, and conversationally.
2. Keep responses very concise: 1 or 2 short sentences maximum. Phone callers cannot listen to long paragraphs.
3. Do not produce long lists or explanations unless explicitly requested by the caller.
4. Ask only one clear question at a time.
5. Do not repeat information unnecessarily.
6. Start answering immediately with the most essential information.
7. Optimize for natural, rapid conversational turn-taking.
==========================================================`;

  return `${basePrompt}\n${voiceDirectives}`;
}

export interface StreamVoiceChatOptions {
  message: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  language: LanguageCode;
  personality: AgentPersonality;
  businessContext: BusinessContext;
  sessionContext?: VoiceSessionContext;
  signal?: AbortSignal;
  onToken?: (token: string, isFirst: boolean) => void;
  onChunk?: (chunk: string, index: number, isFirst: boolean) => void;
}

/**
 * Orchestrate low-latency streaming chat with conditional non-blocking RAG.
 */
export async function streamVoiceChat({
  message,
  conversationHistory,
  language,
  personality,
  businessContext,
  sessionContext,
  signal,
  onToken,
  onChunk,
}: StreamVoiceChatOptions): Promise<{ fullText: string; firstTokenLatency: number }> {
  const startTime = Date.now();
  let firstTokenLatency = 0;

  // Decide whether RAG is strictly needed
  const bypassRAG = shouldBypassRAG(message, sessionContext);

  if (!bypassRAG && businessContext.business?.id) {
    try {
      // Non-blocking RAG with strict timeout
      const ragPromise = retrieveBusinessKnowledge(businessContext.business.id, message, VOICE_CONFIG.rag.topK);
      const timeoutPromise = new Promise<string[]>((res) =>
        setTimeout(() => res([]), VOICE_CONFIG.rag.timeoutMs)
      );
      const chunks = await Promise.race([ragPromise, timeoutPromise]);
      if (chunks && chunks.length > 0) {
        businessContext.knowledgeChunks = chunks;
      }
    } catch (err) {
      console.warn('Non-blocking RAG timeout/error:', err);
    }
  }

  const systemPrompt = buildVoiceSystemPrompt(businessContext, language, personality);
  const recentHistory = conversationHistory.slice(-8);

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: message },
  ];

  let fullText = '';
  let streamBuffer = '';
  let chunkIndex = 0;
  let hasDispatchedFirstToken = false;
  let hasDispatchedFirstChunk = false;

  const modelToUse = VOICE_CONFIG.llm.model;

  for await (const token of streamChatResponse(messages, {
    model: modelToUse,
    temperature: VOICE_CONFIG.llm.temperature,
    maxTokens: VOICE_CONFIG.llm.maxTokens,
  })) {
    if (signal?.aborted) break;

    if (!hasDispatchedFirstToken) {
      hasDispatchedFirstToken = true;
      firstTokenLatency = Date.now() - startTime;
      onToken?.(token, true);
    } else {
      onToken?.(token, false);
    }

    fullText += token;
    streamBuffer += token;

    // Check for complete phrases or speculative chunks
    const { chunks, remaining } = extractStreamingSpeechChunks(streamBuffer);
    streamBuffer = remaining;

    for (const chunk of chunks) {
      if (chunk.trim()) {
        const isFirst = !hasDispatchedFirstChunk;
        hasDispatchedFirstChunk = true;
        onChunk?.(chunk.trim(), chunkIndex++, isFirst);
      }
    }
  }

  // Flush remaining buffer
  if (streamBuffer.trim() && !signal?.aborted) {
    const isFirst = !hasDispatchedFirstChunk;
    onChunk?.(streamBuffer.trim(), chunkIndex++, isFirst);
  }

  return { fullText, firstTokenLatency };
}
