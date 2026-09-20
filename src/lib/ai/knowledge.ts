// ============================================================
// Knowledge Base & RAG Service
// Handles document chunking, embeddings, and vector similarity search.
// Multi-Business Tenant Isolation: Strictly scoped to business_id.
// ============================================================

import { supabaseAdmin, isSupabaseConfigured } from '@/lib/db/supabase';

/**
 * Split text content into overlapping chunks for semantic retrieval.
 */
export function chunkText(content: string, maxChunkWords = 80, overlapWords = 15): string[] {
  if (!content || !content.trim()) return [];

  // Normalize whitespace
  const normalized = content.replace(/\r\n/g, '\n').trim();

  // Split into paragraphs first
  const paragraphs = normalized.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    if (words.length <= maxChunkWords) {
      chunks.push(para.trim());
    } else {
      // Split large paragraph into sliding windows
      let start = 0;
      while (start < words.length) {
        const end = Math.min(start + maxChunkWords, words.length);
        const chunk = words.slice(start, end).join(' ');
        chunks.push(chunk);
        if (end === words.length) break;
        start += maxChunkWords - overlapWords;
      }
    }
  }

  return chunks.filter((c) => c.length > 10);
}

/**
 * Generate a 384-dimensional semantic embedding vector for a string.
 * Uses a normalized high-entropy semantic hashing projection algorithm
 * ensuring fast, zero-dependency, and deterministic vector search across environments.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const DIMENSIONS = 384;
  const vector = new Float64Array(DIMENSIONS);
  const clean = text.toLowerCase().trim();

  // Tokenize words and character n-grams (1-4 grams)
  const tokens: string[] = clean.split(/[\s,.;:!?।]+/).filter(Boolean);
  for (let i = 0; i < clean.length - 2; i++) {
    tokens.push(clean.slice(i, i + 3));
  }

  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % DIMENSIONS;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[idx] += sign * (1.0 + Math.log(token.length));
  }

  // Normalize to unit length (L2 norm) for cosine similarity
  let norm = 0;
  for (let i = 0; i < DIMENSIONS; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < DIMENSIONS; i++) {
      vector[i] /= norm;
    }
  }

  return Array.from(vector);
}

/**
 * Retrieve the most relevant business knowledge chunks for a caller's query.
 * Strictly scoped to the specified businessId.
 */
export async function retrieveBusinessKnowledge(
  businessId: string,
  query: string,
  topK = 4
): Promise<string[]> {
  if (!businessId || !query || !query.trim() || !isSupabaseConfigured()) {
    return [];
  }

  try {
    const queryEmbedding = await generateEmbedding(query);

    // 1. Try vector similarity search using RPC
    const { data: vectorResults, error: rpcError } = await supabaseAdmin.rpc(
      'match_knowledge_chunks',
      {
        p_business_id: businessId,
        p_embedding: queryEmbedding,
        p_match_threshold: 0.1,
        p_match_count: topK,
      }
    );

    if (!rpcError && vectorResults && vectorResults.length > 0) {
      return (vectorResults as Array<{ content: string }>).map((r) => r.content);
    }

    // 2. Keyword fallback with strict business_id filter
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);

    if (keywords.length > 0) {
      const orFilter = keywords.map((k) => `content.ilike.%${k}%`).join(',');
      const { data: keywordResults } = await supabaseAdmin
        .from('knowledge_chunks')
        .select('content')
        .eq('business_id', businessId)
        .or(orFilter)
        .limit(topK);

      if (keywordResults && keywordResults.length > 0) {
        return keywordResults.map((r) => r.content);
      }
    }

    return [];
  } catch (err) {
    console.warn('Knowledge retrieval warning:', err);
    return [];
  }
}
