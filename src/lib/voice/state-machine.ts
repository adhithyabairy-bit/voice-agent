// ============================================================
// Deterministic Finite State Machine (FSM) & Caller Slot Extractor
// DSA-based conversational state tracking:
// - O(N) multi-pattern token parser extracting caller entities:
//   (name, service requested, day, time, confirmation status)
// - Finite State Machine enforcing conversational progression:
//   GREETING -> INQUIRY -> SCHEDULING -> CONFIRMED -> FAREWELL
// - O(1) Fast-Path Acknowledgment Resolver for instant 0ms LLM bypass
// - Prevents assistant from forgetting customer name or repeating questions
// ============================================================

export interface CallerSlots {
  callerName: string | null;
  serviceType: string | null;
  dayOfWeek: string | null;
  timeOfDay: string | null;
  appointmentConfirmed: boolean;
  state: 'GREETING' | 'INQUIRY' | 'SCHEDULING' | 'CONFIRMED' | 'FAREWELL';
}

// Telugu and English common name detection patterns
const TELUGU_NAME_PATTERNS = [
  /(?:నా\s*పేరు|నాది|నేను)\s+([A-Za-z\u0C00-\u0C7F]+)/i,
  /(?:my\s*name\s*is|i\s*am|this\s*is)\s+([A-Za-z]+)/i,
  /([A-Za-z\u0C00-\u0C7F]+)\s*గారు/i,
];

// Day keywords in Telugu and English
const DAY_PATTERNS: Array<{ regex: RegExp; day: string }> = [
  { regex: /(?:మండే|సోమవారం|monday)/i, day: 'Monday' },
  { regex: /(?:ట్యూస్డే|మంగళవారం|tuesday)/i, day: 'Tuesday' },
  { regex: /(?:వెడ్నెస్డే|బుధవారం|wednesday)/i, day: 'Wednesday' },
  { regex: /(?:థర్స్డే|గురువారం|thursday)/i, day: 'Thursday' },
  { regex: /(?:ఫ్రైడే|శుక్రవారం|friday)/i, day: 'Friday' },
  { regex: /(?:సాటర్డే|శనివారం|saturday)/i, day: 'Saturday' },
  { regex: /(?:సండే|ఆదివారం|sunday)/i, day: 'Sunday' },
  { regex: /(?:రేపు|tomorrow)/i, day: 'Tomorrow' },
];

// Time patterns
const TIME_REGEX = /(?:(\d{1,2}(?::\d{2})?)\s*(?:am|pm|ఏ ఎం|పి ఎం)|morning|evening|ఉదయం|సాయంత్రం)/i;

// Appointment confirmation keywords spoken by assistant or user
const CONFIRM_PATTERNS = [
  /(?:slot\s*book\s*చేశాను|బుక్\s*చేశాను|appointment\s*confirm|slot\s*confirm|బుక్\s*అయింది)/i,
  /(?:booked\s*your|confirmed\s*your|appointment\s*is\s*booked)/i,
];

// Standard short acknowledgment phrases
const SHORT_ACK_PATTERNS = [
  /^(?:ఓకే|ఓకే\s*అండి|సరే|సరే\s*అండి|సరేనా|థాంక్యూ|ధన్యవాదాలు|థాంక్స్|ధన్యవాదములు)[\s.!?,]*$/i,
  /^(?:ok|okay|sure|alright|fine|cool|thanks|thank\s*you|great|done)[\s.!?,]*$/i,
  /^(?:హా|అవును|avunu|haan|yes|yep)[\s.!?,]*$/i,
];

// Closing / wrap-up phrases
const FAREWELL_PATTERNS = [
  /^(?:బై|గుడ్‌బై|bye|goodbye|see\s*you|tata|అంతే|ఇంకేం\s*లేదు|nothing\s*else)[\s.!?,]*$/i,
];

/**
 * Extract caller slots from conversation history using multi-pattern scanning.
 */
export function extractCallerSlots(
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  currentMessage?: string
): CallerSlots {
  const slots: CallerSlots = {
    callerName: null,
    serviceType: null,
    dayOfWeek: null,
    timeOfDay: null,
    appointmentConfirmed: false,
    state: 'GREETING',
  };

  const allMessages = [...history];
  if (currentMessage) {
    allMessages.push({ role: 'user', content: currentMessage });
  }

  for (const msg of allMessages) {
    const text = msg.content || '';

    // 1. Extract Caller Name if not yet identified
    if (!slots.callerName) {
      for (const pattern of TELUGU_NAME_PATTERNS) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const candidate = match[1].trim();
          // Filter out stop words
          if (
            !/^(ఏమిటి|ఏంటి|చెప్పండి|పేరు|name|what|who|hello|హలో)$/i.test(candidate) &&
            candidate.length >= 2
          ) {
            slots.callerName = candidate;
            break;
          }
        }
      }
    }

    // 2. Extract Service
    if (!slots.serviceType) {
      if (/(?:విల్లా|villa)/i.test(text)) slots.serviceType = 'Villa / Site Visit';
      else if (/(?:site\s*visit|ప్లాట్|plot)/i.test(text)) slots.serviceType = 'Property Site Visit';
      else if (/(?:consultation|కన్సల్టేషన్|ఇన్వెస్ట్‌మెంట్|investment)/i.test(text)) slots.serviceType = 'Investment Consultation';
      else if (/(?:ఫ్లాట్|flat|apartment)/i.test(text)) slots.serviceType = 'Apartment / Flat';
    }

    // 3. Extract Day
    if (!slots.dayOfWeek) {
      for (const { regex, day } of DAY_PATTERNS) {
        if (regex.test(text)) {
          slots.dayOfWeek = day;
          break;
        }
      }
    }

    // 4. Extract Time
    if (!slots.timeOfDay) {
      const timeMatch = text.match(TIME_REGEX);
      if (timeMatch) {
        slots.timeOfDay = timeMatch[0].trim();
      }
    }

    // 5. Detect Appointment Confirmation
    if (!slots.appointmentConfirmed) {
      for (const pattern of CONFIRM_PATTERNS) {
        if (pattern.test(text)) {
          slots.appointmentConfirmed = true;
          break;
        }
      }
    }
  }

  // Determine FSM State
  if (slots.appointmentConfirmed) {
    const lastUserMsg = currentMessage || (allMessages.filter(m => m.role === 'user').pop()?.content || '');
    if (FAREWELL_PATTERNS.some(p => p.test(lastUserMsg.trim()))) {
      slots.state = 'FAREWELL';
    } else {
      slots.state = 'CONFIRMED';
    }
  } else if (slots.dayOfWeek || slots.timeOfDay) {
    slots.state = 'SCHEDULING';
  } else if (slots.serviceType || slots.callerName) {
    slots.state = 'INQUIRY';
  } else {
    slots.state = 'GREETING';
  }

  return slots;
}

/**
 * Check if the user message is a short conversational acknowledgment.
 */
export function isAcknowledgment(message: string): boolean {
  const clean = message.trim();
  return SHORT_ACK_PATTERNS.some((p) => p.test(clean));
}

/**
 * Check if the user message is a farewell / ending message.
 */
export function isFarewell(message: string): boolean {
  const clean = message.trim();
  return FAREWELL_PATTERNS.some((p) => p.test(clean));
}

/**
 * Fast-Path O(1) Instant Response Resolver:
 * When caller gives an acknowledgment after slot confirmation,
 * bypasses LLM (0ms) and returns a polite, natural Telugu receptionist response.
 */
export function resolveFastPathResponse(
  message: string,
  slots: CallerSlots,
  language: string
): string | null {
  if (language !== 'te-IN') return null;

  const isAck = isAcknowledgment(message);
  const isBye = isFarewell(message);

  if (slots.appointmentConfirmed) {
    const namePart = slots.callerName ? `${slots.callerName} గారు` : 'అండి';

    if (isBye) {
      return `ధన్యవాదాలు ${namePart}, మంచి రోజు కావాలని కోరుకుంటున్నాం!`;
    }

    if (isAck) {
      // Natural Telugu follow-up without asking name or repeating appointment
      return `సరే అండి, ${namePart}. ఇంకేమైనా వివరాలు కావాలా అండి?`;
    }
  }

  return null;
}

/**
 * Generate strict state directives to inject into LLM system prompt.
 * Mathematically prevents LLM from forgetting caller name or asking questions twice.
 */
export function generateConversationDirectives(slots: CallerSlots): string {
  const directives: string[] = [
    '\n=== ACTIVE CALLER MEMORY & CONVERSATIONAL STATE (STRICT COMPLIANCE) ===',
  ];

  if (slots.callerName) {
    directives.push(
      `• CALLER NAME: "${slots.callerName} గారు" (ALREADY REGISTERED).`,
      `  CRITICAL: NEVER ask "దయచేసి మీ పేరు చెప్పండి?" or ask for caller's name again! Address caller as "${slots.callerName} గారు".`
    );
  } else {
    directives.push(
      `• CALLER NAME: Not yet provided. You may politely ask for their name ONCE if booking an appointment.`
    );
  }

  if (slots.appointmentConfirmed) {
    directives.push(
      `• APPOINTMENT STATUS: ALREADY CONFIRMED AND BOOKED!`,
      `  CRITICAL: Do NOT re-book, do NOT ask for day/time again, and NEVER say "call back చెయ్యండి".`,
      `  If caller acknowledges (e.g., says "ఓకే" or "సరే"), simply say: "సరే అండి! ఇంకేమైనా వివరాలు కావాలా?" or warmly wrap up the call.`
    );
  } else if (slots.dayOfWeek || slots.timeOfDay) {
    directives.push(
      `• SCHEDULING DETAILS: Requested day: "${slots.dayOfWeek || 'not set'}", time: "${slots.timeOfDay || 'not set'}".`,
      `  Proceed to confirm the slot directly without asking redundant questions.`
    );
  }

  directives.push(
    '========================================================================'
  );

  return directives.join('\n');
}
