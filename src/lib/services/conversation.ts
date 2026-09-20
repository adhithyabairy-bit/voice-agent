// ============================================================
// Conversation Service
// Handles conversation CRUD and summary generation.
// ============================================================

import { supabaseAdmin, isSupabaseConfigured } from '@/lib/db/supabase';
import { getChatResponse } from '@/lib/ai/groq';
import { buildSummaryPrompt } from '@/lib/ai/prompts';
import type { Conversation, Message, LanguageCode } from '@/types';

/**
 * Create a new conversation record.
 */
export async function createConversation(
  agentId: string,
  language: LanguageCode
): Promise<string> {
  if (!isSupabaseConfigured()) {
    // Return a mock conversation ID
    return `demo-${Date.now()}`;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        agent_id: agentId,
        language,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error('Error creating conversation:', error);
    return `error-${Date.now()}`;
  }
}

/**
 * Add a message to a conversation.
 */
export async function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  audioDuration?: number
): Promise<void> {
  if (!isSupabaseConfigured() || conversationId.startsWith('demo-') || conversationId.startsWith('error-')) {
    return; // Skip DB write in demo mode
  }

  try {
    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      role,
      content,
      audio_duration: audioDuration || null,
    });
  } catch (error) {
    console.error('Error adding message:', error);
  }
}

/**
 * End a conversation and generate summary.
 */
export async function endConversation(
  conversationId: string,
  messages: Array<{ role: string; content: string }>,
  language: LanguageCode,
  startTime: number
): Promise<{
  summary: string | null;
  intent: string | null;
  customerName: string | null;
  leadStatus: string;
}> {
  const duration = Math.round((Date.now() - startTime) / 1000);

  // Generate summary using Groq (if configured)
  let summaryData = {
    summary: null as string | null,
    intent: null as string | null,
    customerName: null as string | null,
    leadStatus: 'none',
  };

  try {
    if (messages.length > 1) {
      const summaryPrompt = buildSummaryPrompt(messages, language);
      const summaryResponse = await getChatResponse([
        { role: 'user', content: summaryPrompt },
      ], { temperature: 0.3, maxTokens: 200 });

      // Parse the JSON response
      const parsed = JSON.parse(summaryResponse);
      summaryData = {
        summary: parsed.summary || null,
        intent: parsed.intent || null,
        customerName: parsed.customer_name || null,
        leadStatus: parsed.lead_status || 'none',
      };
    }
  } catch (error) {
    console.error('Error generating summary:', error);
    summaryData.summary = `Conversation in ${language} with ${messages.length} messages.`;
  }

  // Update the conversation in DB
  if (isSupabaseConfigured() && !conversationId.startsWith('demo-') && !conversationId.startsWith('error-')) {
    try {
      await supabaseAdmin
        .from('conversations')
        .update({
          ended_at: new Date().toISOString(),
          duration,
          summary: summaryData.summary,
          intent: summaryData.intent,
          lead_status: summaryData.leadStatus,
          customer_name: summaryData.customerName,
        })
        .eq('id', conversationId);

      // Create lead if interested
      if (summaryData.leadStatus === 'interested' || summaryData.leadStatus === 'converted') {
        await supabaseAdmin.from('leads').insert({
          conversation_id: conversationId,
          name: summaryData.customerName,
          interest: summaryData.intent,
          follow_up_required: true,
        });
      }
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
  }

  return summaryData;
}

/**
 * Get recent conversations for the dashboard.
 */
export async function getRecentConversations(
  limit: number = 10
): Promise<Conversation[]> {
  if (!isSupabaseConfigured()) {
    // Return mock data
    return getMockConversations();
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as Conversation[];
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return getMockConversations();
  }
}

/**
 * Get conversation with messages.
 */
export async function getConversationWithMessages(
  conversationId: string
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const [convResult, msgResult] = await Promise.all([
      supabaseAdmin.from('conversations').select('*').eq('id', conversationId).single(),
      supabaseAdmin.from('messages').select('*').eq('conversation_id', conversationId).order('created_at'),
    ]);

    if (convResult.error) return null;

    return {
      conversation: convResult.data as Conversation,
      messages: (msgResult.data || []) as Message[],
    };
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return null;
  }
}

/**
 * Mock conversations for demo/fallback mode.
 */
function getMockConversations(): Conversation[] {
  const now = new Date();
  return [
    {
      id: 'mock-1',
      agent_id: null,
      language: 'te-IN',
      started_at: new Date(now.getTime() - 3600000).toISOString(),
      ended_at: new Date(now.getTime() - 3500000).toISOString(),
      duration: 154,
      summary: 'Customer inquired about dental consultation pricing and clinic hours.',
      intent: 'Pricing inquiry',
      lead_status: 'interested' as const,
      customer_name: 'Rahul',
      created_at: new Date(now.getTime() - 3600000).toISOString(),
    },
    {
      id: 'mock-2',
      agent_id: null,
      language: 'hi-IN',
      started_at: new Date(now.getTime() - 7200000).toISOString(),
      ended_at: new Date(now.getTime() - 7080000).toISOString(),
      duration: 120,
      summary: 'Customer wanted to book a teeth cleaning appointment for next week.',
      intent: 'Appointment booking',
      lead_status: 'converted' as const,
      customer_name: 'Priya',
      created_at: new Date(now.getTime() - 7200000).toISOString(),
    },
    {
      id: 'mock-3',
      agent_id: null,
      language: 'en-IN',
      started_at: new Date(now.getTime() - 14400000).toISOString(),
      ended_at: new Date(now.getTime() - 14320000).toISOString(),
      duration: 80,
      summary: 'Customer asked about insurance acceptance and payment methods.',
      intent: 'General information',
      lead_status: 'none' as const,
      customer_name: null,
      created_at: new Date(now.getTime() - 14400000).toISOString(),
    },
    {
      id: 'mock-4',
      agent_id: null,
      language: 'te-IN',
      started_at: new Date(now.getTime() - 86400000).toISOString(),
      ended_at: new Date(now.getTime() - 86200000).toISOString(),
      duration: 200,
      summary: 'Customer Venkat inquired about root canal treatment cost and procedure.',
      intent: 'Treatment inquiry',
      lead_status: 'interested' as const,
      customer_name: 'Venkat',
      created_at: new Date(now.getTime() - 86400000).toISOString(),
    },
  ];
}
