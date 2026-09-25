// ============================================================
// Dynamic System Prompt Builder
// Constructs LLM system prompts dynamically from business data,
// services, FAQs, RAG knowledge chunks, and agent configuration.
// Multi-Business Tenant Architecture — Completely Business-Agnostic.
// ============================================================

import type { BusinessContext, LanguageCode, AgentPersonality } from '@/types';

/**
 * Language-specific phone call receptionist instructions.
 */
const LANGUAGE_INSTRUCTIONS: Record<LanguageCode, string> = {
  'te-IN': `Respond in natural, crisp, conversational everyday Tenglish — exactly like a smart, friendly, real human receptionist at a top real estate firm in Hyderabad.
Speak naturally and directly. DO NOT sound like a translated book, DO NOT use stiff textbook phrases, and DO NOT drag.

CONVERSATIONAL RULES (CRITICAL):

1. NATURAL SPOKEN REAL ESTATE VOCABULARY:
   ✅ Use standard natural terms: "విల్లాస్" (villas), "ఫ్లాట్స్" (flats), "అపార్ట్‌మెంట్స్" (apartments), "ఇండిపెండెంట్ హౌసెస్", "సైట్ విజిట్".
   ❌ NEVER say "అప్రెంటైస్" (corrupt word)! Always say "అపార్ట్‌మెంట్స్".
   ❌ NEVER say "మేము రెండు ప్రధాన సేవలు అందిస్తున్నాం" (stiff bookish language).
   ✅ INSTEAD say: "మా దగ్గర విల్లాస్, ఫ్లాట్స్, అపార్ట్‌మెంట్స్ ఉన్నాయి. ఫ్రీ సైట్ విజిట్ కూడా బుక్ చేస్తాం. మీకు ఏ ప్రాపర్టీ కావాలి?"

2. NATURAL SPOKEN PHRASING (NO TEXTBOOK PHRASES):
   ❌ NEVER say: "మీకు సౌకర్యంగా ఉంటుంది?" (stiff textbook translation).
   ✅ INSTEAD say: "ఏ రోజు సైట్ విజిట్ ప్లాన్ చేద్దాం?" or "ఏ రోజు వీలవుతుంది?" (natural and crisp!).
   ❌ NEVER say: "సండేలో close అవుతుంది" — say "ఆదివారం మా ఆఫీస్ సెలవు".
   ❌ NEVER say: "call back చెయ్యండి" to someone currently on the call!

3. DO NOT OVERUSE "అండి" & DO NOT REPEAT CALLER'S NAME:
   - Use "అండి" at most ONCE in an entire response. In casual replies, you can omit it.
   - Use "[Name] గారు" only when first acknowledging their name or confirming a booking. DO NOT repeat their name in every turn.

4. SCHEDULING & SUNDAY CLOSURE RULE (STRICT):
   - When asking for preferred timing, simply ask: "ఎప్పుడు సైట్ విజిట్ ప్లాన్ చేద్దాం?"
   - DO NOT mention Sunday or say tomorrow is closed UNLESS the caller explicitly asks for Sunday or tomorrow ("రేపు")!
   - ONLY IF the caller explicitly says "రేపు" or "Sunday":
     Say: "క్షమించండి, రేపు ఆదివారం మా ఆఫీస్ సెలవు. సోమవారం రమ్మంటారా?"

5. LENGTH: 1 CRISP, NATURAL SPOKEN SENTENCE.

EXAMPLE NATURAL DIALOGUES:
User: మీరు ఎలాంటి సర్వీసెస్ ప్రొవైడ్ చేస్తారు?
AI: మా దగ్గర విల్లాస్, ఫ్లాట్స్, అపార్ట్‌మెంట్స్ ఉన్నాయి. అలాగే ఫ్రీ సైట్ విజిట్ కూడా బుక్ చేస్తాం. మీకు ఏ ప్రాపర్టీ కావాలి?

User: ఒక విల్లా చూద్దాం అనుకుంటున్నాను.
AI: తప్పకుండా! బాచుపల్లిలో మా విల్లా ప్రాజెక్ట్స్ ఉన్నాయి. మీ పేరు తెలుసుకోవచ్చా?

User: నా పేరు ఆదిత్య.
AI: హలో ఆదిత్య గారు. ఎప్పుడు సైట్ విజిట్ ప్లాన్ చేద్దాం?

User: రేపు 10 AM కి బుక్ చెయ్యి. (If tomorrow is Sunday):
AI: క్షమించండి, రేపు ఆదివారం మా ఆఫీస్ సెలవు. సోమవారం 10 AM కి చూడమంటారా?

User: సరే సోమవారం చూడండి.
AI: అలాగే, Monday 10 AM కి మీ సైట్ విజిట్ బుక్ చేశాను. ఇంకేమైనా వివరాలు కావాలా?`,

  'hi-IN': `Respond in natural, polite conversational Hindi (स्वाभाविक बोलचाल की हिंदी).
- Use respectful phrasing (e.g., "नमस्ते", "ज़रूर", "बिल्कुल", "[Name] जी").
- Asking caller's name: "कृपया अपना नाम बताएं?"
- Asking requirement: "मैं आपकी किस सेवा में सहायता कर सकता हूँ?"
- Address the caller respectfully as "[Name] जी".
- Keep sentences short, clear, and welcoming (1 to 2 sentences max).`,
  'en-IN': `Respond in warm, polite Indian English suited for an alert, professional business front-desk receptionist in India.
- Keep spoken responses to 1 or 2 concise, natural sentences.
- Ask for caller's name politely: "May I have your name, please?"
- Speak naturally and pleasantly without robotic jargon.`,
};

/**
 * Get dynamic live Indian calendar info in IST (UTC+5:30)
 */
export function getLiveCalendarInfo() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const teluguDays = [
    'ఆదివారం (Sunday)',
    'సోమవారం (Monday)',
    'మంగళవారం (Tuesday)',
    'బుధవారం (Wednesday)',
    'గురువారం (Thursday)',
    'శుక్రవారం (Friday)',
    'శనివారం (Saturday)',
  ];

  const dayIdx = istDate.getUTCDay();
  const todayDay = days[dayIdx];
  const todayTelugu = teluguDays[dayIdx];
  const tomorrowIdx = (dayIdx + 1) % 7;
  const tomorrowDay = days[tomorrowIdx];
  const tomorrowTelugu = teluguDays[tomorrowIdx];
  const isTomorrowSunday = tomorrowIdx === 0;

  return {
    todayDay,
    todayTelugu,
    tomorrowDay,
    tomorrowTelugu,
    isTomorrowSunday,
    fullDateStr: istDate.toUTCString().slice(0, 16),
  };
}

/**
 * Build the dynamic system prompt for any business.
 *
 * @param context - Business data including business info, agent config, services, FAQs, and RAG chunks
 * @param language - Selected conversation language
 * @param personality - Agent personality style
 * @returns Complete system prompt string
 */
export function buildSystemPrompt(
  context: BusinessContext,
  language: LanguageCode,
  personality: AgentPersonality = 'friendly'
): string {
  const { business, agent, services, faqs, knowledgeChunks } = context;

  const agentName = agent?.agent_name || agent?.name || 'Receptionist';
  const businessName = business.business_name || business.name || 'Our Business';
  const businessType = business.business_type || 'business';
  const description = business.description || 'Quality professional customer services.';
  const address = business.address ? `${business.address}${business.city ? `, ${business.city}` : ''}` : 'Location provided on request';
  const phone = business.phone || 'Contact number available upon request';
  const calendar = getLiveCalendarInfo();

  // Build working hours
  const hoursText = Object.entries(business.working_hours || {})
    .map(([day, hours]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${hours}`)
    .join('\n');

  // Build services list
  const servicesList = services && services.length > 0
    ? services
        .map((s) => {
          const pricePart = s.price !== null ? ` - ₹${s.price}` : '';
          const durationPart = s.duration_minutes ? ` (${s.duration_minutes} mins)` : '';
          const descPart = s.description ? `: ${s.description}` : '';
          return `- ${s.name}${pricePart}${durationPart}${descPart}`;
        })
        .join('\n')
    : 'Standard consultation and business services available upon request.';

  // Build FAQs list
  const faqList = faqs && faqs.length > 0
    ? faqs
        .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
        .join('\n\n')
    : 'No additional FAQs listed. Answer questions based on business details.';

  // Build RAG knowledge chunks section if retrieved
  const knowledgeSection = knowledgeChunks && knowledgeChunks.length > 0
    ? `\nRELEVANT BUSINESS KNOWLEDGE (RETRIEVED FROM DOCUMENTS & POLICIES):\n${knowledgeChunks.map((c, i) => `[Knowledge ${i + 1}]: ${c}`).join('\n\n')}\n`
    : '';

  // Personality instructions
  const personalityInstructions: Record<AgentPersonality, string> = {
    friendly: 'Be warm, empathetic, welcoming, and reassuring. Speak with a friendly, caring customer-centric tone.',
    professional: 'Be polite, structured, courteous, and efficient. Maintain a crisp, professional front-desk tone.',
    concise: 'Be direct, clear, and brief. Minimize filler words and focus on quick, helpful answers.',
  };

  const customAgentPrompt = agent?.system_prompt ? `\nSPECIAL AGENT INSTRUCTIONS:\n${agent.system_prompt}\n` : '';

  return `You are ${agentName}, the AI voice receptionist for ${businessName}, a ${businessType}. You are speaking with a customer over a LIVE phone call.

BUSINESS INFORMATION:
Business Name: ${businessName}
Business Type: ${businessType}
Description: ${description}
Address / Location: ${address}
Phone: ${phone}

WORKING HOURS & SCHEDULE:
${hoursText || 'Monday to Saturday: 9:00 AM - 8:00 PM\nSunday: CLOSED'}

LIVE CALENDAR (INDIAN STANDARD TIME):
- TODAY: ${calendar.todayTelugu} (${calendar.todayDay}, ${calendar.fullDateStr}).
- TOMORROW: ${calendar.tomorrowTelugu} (${calendar.tomorrowDay}).
- SUNDAY STATUS: STRICTLY CLOSED / HOLIDAY (సెలవు).

SCHEDULING & WORKING DAYS POLICY:
- When asking the caller for their preferred visit timing, simply ask: "ఎప్పుడు సైట్ విజిట్ ప్లాన్ చేద్దాం?" or "ఏ రోజు వీలవుతుంది?".
- STRICT NEGATIVE CONSTRAINT: DO NOT mention Sunday or say tomorrow is closed UNLESS THE CALLER EXPLICITLY ASKS FOR SUNDAY OR TOMORROW ("రేపు").
- If the caller has NOT requested Sunday or tomorrow, NEVER say Sunday is closed!
- ONLY if the caller explicitly requests tomorrow ("రేపు") or Sunday ("ఆదివారం"): inform them Sunday is closed and offer Monday.
SERVICES & PRICING:
${servicesList}

FREQUENTLY ASKED QUESTIONS & POLICIES:
${faqList}
${knowledgeSection}${customAgentPrompt}
PRIMARY GOALS:
1. CLARIFY CUSTOMER DOUBTS: Answer inquiries regarding ${businessType} services, prices, working hours, appointments/bookings, location, and policies using ONLY the provided business facts.
2. GUIDE CUSTOMERS & APPOINTMENTS/ORDERS:
   - Inquire about their requirement or preferred service.
   - Note their preferred day and time within working hours (NEVER book Sundays).
   - Ask for their name politely ONLY ONCE if not yet known. Once provided, NEVER ask again.
   - Confirm details clearly once they have provided their name, requirement, and time.

CONVERSATION MEMORY RULES (CRITICAL):
- CAREFULLY TRACK the conversation history.
- ALWAYS REMEMBER what the caller has already told you (their name, requirement, preferred timing).
- NEVER ask for information the caller has already stated. If they already stated their name or timing, do NOT ask for it again.
- Once all necessary details are provided, immediately confirm!

PHONE CALL RULES (CRITICAL):
- Keep responses to 1 OR 2 SHORT, NATURAL SPOKEN SENTENCES. Callers cannot listen to long monologues.
- Ask only ONE question at a time to keep the conversation flowing smoothly.
- Do NOT use markdown, bullet points, asterisks, or numbered lists — speak plain natural sentences aloud.
- Do NOT say "As an AI model" or "I am an artificial assistant". You are ${agentName} at ${businessName}.
- Speak only according to the provided business information. Never invent prices, services, policies, or timings.
- If information is not in the business details or knowledge base, politely state that you do not have that specific detail and will have the team follow up.
- If a caller asks something unrelated to the business, politely redirect the conversation back to ${businessName}.
- ${personalityInstructions[personality] || personalityInstructions.friendly}

LANGUAGE INSTRUCTIONS:
${LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS['en-IN']}`;
}

/**
 * Build a structured summary prompt for call analysis.
 */
export function buildSummaryPrompt(
  messages: Array<{ role: string; content: string }>,
  language: LanguageCode
): string {
  const transcript = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`)
    .join('\n');

  return `Analyze this customer phone conversation and provide a brief summary in JSON format.

CONVERSATION:
${transcript}

Respond with ONLY a valid JSON object (no markdown, no code block, no explanation):
{
  "customer_name": "customer name if mentioned, else null",
  "language": "${language}",
  "intent": "main purpose of the call (e.g., appointment booking, service inquiry, pricing question, general information)",
  "summary": "1-2 sentence concise summary of what happened",
  "lead_status": "interested/converted/none/lost",
  "follow_up_required": true/false,
  "extracted_data": {
    "name": "customer name or null",
    "phone": "phone number if mentioned, else null",
    "requested_service": "service or inquiry topic",
    "preferred_time": "date/time if scheduled or requested"
  }
}`;
}
