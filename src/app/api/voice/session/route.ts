// ============================================================
// POST /api/voice/session — Create Voice Session
// Creates a new conversation record in the database.
// ============================================================

import { createConversation } from '@/lib/services/conversation';
import type { LanguageCode } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentId, language = 'te-IN' } = body as {
      agentId?: string;
      language: LanguageCode;
    };

    const conversationId = await createConversation(
      agentId || 'default',
      language
    );

    return Response.json({
      conversationId,
      status: 'created',
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Session Error:', err.message);
    return Response.json(
      { error: 'Failed to create voice session', details: err.message },
      { status: 500 }
    );
  }
}
