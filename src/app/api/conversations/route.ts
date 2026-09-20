// ============================================================
// GET /api/conversations — List conversations
// POST /api/conversations — End conversation with summary
// ============================================================

import { getRecentConversations, endConversation } from '@/lib/services/conversation';
import type { LanguageCode } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const conversations = await getRecentConversations(20);
    return Response.json({ conversations });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Conversations Error:', err.message);
    return Response.json(
      { error: 'Failed to fetch conversations', details: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { conversationId, messages, language, startTime } = body as {
      conversationId: string;
      messages: Array<{ role: string; content: string }>;
      language: LanguageCode;
      startTime: number;
    };

    const result = await endConversation(conversationId, messages, language, startTime);

    return Response.json({
      ...result,
      status: 'ended',
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('End Conversation Error:', err.message);
    return Response.json(
      { error: 'Failed to end conversation', details: err.message },
      { status: 500 }
    );
  }
}
