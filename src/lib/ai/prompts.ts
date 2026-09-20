// ============================================================
// System Prompt Builder
// Constructs LLM system prompts with business context.
// Ensures the AI only uses provided business information.
// ============================================================

import type { BusinessContext, LanguageCode } from '@/types';

/**
 * Language-specific greeting instructions for the AI.
 */
const LANGUAGE_INSTRUCTIONS: Record<LanguageCode, string> = {
  'te-IN': 'Respond in Telugu (తెలుగు). Use natural Telugu script. If the customer mixes Telugu and English, respond primarily in Telugu.',
  'hi-IN': 'Respond in Hindi (हिन्दी). Use natural Devanagari script. If the customer mixes Hindi and English, respond primarily in Hindi.',
  'en-IN': 'Respond in Indian English. Use a natural, conversational tone appropriate for Indian customers.',
};

/**
 * Build the system prompt for the AI receptionist.
 *
 * @param context - Business data including services and FAQs
 * @param language - Selected conversation language
 * @param personality - Agent personality style
 * @returns Complete system prompt string
 */
export function buildSystemPrompt(
  context: BusinessContext,
  language: LanguageCode,
  personality: 'friendly' | 'professional' | 'concise' = 'friendly'
): string {
  const { business, services, faqs } = context;

  // Build compact service list
  const servicesList = services
    .map((s) => `- ${s.name}: ₹${s.price}${s.description ? ` (${s.description})` : ''}`)
    .join('\n');

  // Build FAQ list
  const faqList = faqs
    .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');

  // Build working hours
  const hoursText = Object.entries(business.working_hours || {})
    .map(([day, hours]) => `${day}: ${hours}`)
    .join('\n');

  // Personality instructions
  const personalityInstructions = {
    friendly: 'Be warm, welcoming, and conversational. Use a friendly tone.',
    professional: 'Be polite, formal, and efficient. Maintain a professional tone.',
    concise: 'Keep responses very brief and to the point. Minimize extra words.',
  };

  return `You are the AI receptionist for ${business.name}.

ROLE: You handle incoming customer calls. This is a VOICE conversation — keep your responses SHORT and natural-sounding (2-3 sentences max). Speak as you would in a real phone call.

PERSONALITY: ${personalityInstructions[personality]}

LANGUAGE: ${LANGUAGE_INSTRUCTIONS[language]}

BUSINESS INFORMATION:
Name: ${business.name}
${business.description ? `About: ${business.description}` : ''}
${business.address ? `Address: ${business.address}` : ''}
${business.phone ? `Phone: ${business.phone}` : ''}

WORKING HOURS:
${hoursText || 'Not specified'}

SERVICES & PRICES:
${servicesList || 'No services listed'}

FREQUENTLY ASKED QUESTIONS:
${faqList || 'No FAQs available'}

CRITICAL RULES:
1. ONLY use the business information provided above. NEVER invent prices, services, timings, or policies.
2. If you don't have information to answer a question, say so honestly and offer to collect the customer's details for a callback.
3. Keep responses SHORT — this is a voice call, not a text chat. Aim for 1-3 short sentences.
4. If a customer wants to book an appointment, collect their name, preferred date/time, and the service they need.
5. Be helpful about directions, parking, insurance, and payment methods using only the FAQ data.
6. If a customer provides their name, remember it and use it naturally in the conversation.
7. Do NOT use markdown formatting, bullet points, or numbered lists — this will be spoken aloud.
8. Do NOT say "as an AI" or "I'm a language model." You are the clinic's receptionist.`;
}

/**
 * Build a summary prompt to generate a conversation summary.
 */
export function buildSummaryPrompt(
  messages: Array<{ role: string; content: string }>,
  language: LanguageCode
): string {
  const transcript = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`)
    .join('\n');

  return `Analyze this customer conversation and provide a brief summary in JSON format.

CONVERSATION:
${transcript}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "customer_name": "name if mentioned, else null",
  "language": "${language}",
  "intent": "main purpose of the call (e.g., appointment inquiry, pricing question, general information)",
  "summary": "1-2 sentence summary of what happened",
  "lead_status": "interested/none/converted",
  "follow_up_required": true/false,
  "follow_up_notes": "what needs to be done, if any"
}`;
}
