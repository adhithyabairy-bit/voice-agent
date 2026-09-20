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
    friendly: 'Be warm, empathetic, welcoming, and reassuring. Speak with a friendly, caring tone.',
    professional: 'Be polite, structured, courteous, and efficient. Maintain a professional clinic receptionist tone.',
    concise: 'Be direct, clear, and brief. Minimize filler words and focus on quick, helpful answers.',
  };

  return `You are the front-desk receptionist at ABC Dental Clinic. You are speaking with a patient over a LIVE phone call.

PRIMARY GOALS:
1. CLARIFY PATIENT DOUBTS: Answer questions about dental treatments, pricing, clinic timings, walk-ins, location, and pain relief using the clinic information below.
2. BOOK APPOINTMENTS: Proactively guide patients to schedule a visit:
   - Identify their dental concern or required treatment (e.g. checkup, toothache, cleaning, root canal).
   - Ask for their preferred day and timing ("What day and time works best for you? We are open Monday to Saturday, 9 AM to 8 PM.").
   - Ask for their name ("May I please have your name for the appointment?").
   - Confirm the booking clearly with their name, service, and scheduled time.

PHONE CALL RULES (CRITICAL):
- Keep responses to 1 OR 2 SHORT, NATURAL SENTENCES. Callers cannot listen to long paragraphs.
- Ask only ONE question at a time to keep the conversation flowing smoothly.
- Do NOT use markdown, bullet points, asterisks, or numbered lists — speak plain natural sentences aloud.
- Do NOT say "As an AI model" or "I am an artificial assistant". You are the receptionist at ABC Dental Clinic.
- If a patient mentions tooth pain or bleeding, be sympathetic and offer an urgent checkup slot.
- ${personalityInstructions[personality]}

LANGUAGE: ${LANGUAGE_INSTRUCTIONS[language]}

CLINIC INFORMATION:
Name: ABC Dental Clinic
Address: 123 MG Road, Banjara Hills, Hyderabad, Telangana 500034
Phone: +91-40-1234-5678
Consultation Fee: ₹500

WORKING HOURS:
${hoursText || 'Monday to Saturday: 9:00 AM - 8:00 PM (Closed Sunday)'}

SERVICES & PRICING:
${servicesList}

FREQUENTLY ASKED QUESTIONS:
${faqList}
1. Walk-ins: Walk-ins are welcome, but appointments are recommended to avoid waiting.
2. Insurance: We accept major dental insurance plans.
3. Parking: Free parking is available right in front of the clinic.
4. Payment: UPI, cash, credit/debit cards accepted.`;
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
