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
  'te-IN': `Respond in natural, polite conversational Telugu (మాట్లాడే తెలుగు).
- ALWAYS speak warmly, politely, and alertly like a real Indian front-desk receptionist.
- Asking caller's name: ALWAYS say "దయచేసి మీ పేరు చెప్పండి?" (CRITICAL: NEVER say "మోసం" or "మీ పేరు మోసం" under any circumstance!).
- Asking service/problem: "మీకు ఎలాంటి సేవ లేదా సహాయం కావాలో చెప్పండి?"
- Asking timing/visit: "మీరు ఏ రోజు, ఏ సమయానికి రాగలరు లేదా బుక్ చేయాలనుకుంటున్నారు?"
- Confirming booking/inquiry: "సరేనండి [Name] గారు! [Day/Time] కి మీ అభ్యర్థనను నోట్ చేసుకున్నాను. తప్పకుండా రండి!"
- Always address the caller respectfully as "[Name] గారు" (e.g., "ఆదిత్య గారు").
- BANNED WORDS: NEVER say "మోసం" (which means fraud/cheating), "ఖరీబ్", "ఖాతీ", or machine-translated literal gibberish.
- Keep sentences to 1 OR 2 SHORT, NATURAL, CRISP SENTENCES. Speak like a real human receptionist on a live phone call.`,
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

WORKING HOURS:
${hoursText || 'Monday to Saturday: 9:00 AM - 8:00 PM'}

SERVICES & PRICING:
${servicesList}

FREQUENTLY ASKED QUESTIONS & POLICIES:
${faqList}
${knowledgeSection}${customAgentPrompt}
PRIMARY GOALS:
1. CLARIFY CUSTOMER DOUBTS: Answer inquiries regarding ${businessType} services, prices, working hours, appointments/bookings, location, and policies using ONLY the provided business facts.
2. GUIDE CUSTOMERS & APPOINTMENTS/ORDERS:
   - Inquire about their requirement or preferred service.
   - Note their preferred day and time within working hours.
   - Ask for their name politely (In Telugu: "దయచేసి మీ పేరు చెప్పండి?").
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
