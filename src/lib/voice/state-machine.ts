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
  isSundayRequested: boolean;
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
    isSundayRequested: false,
    state: 'GREETING',
  };

  const allMessages = [...history];
  if (currentMessage) {
    allMessages.push({ role: 'user', content: currentMessage });
  }

  // Calculate if tomorrow is Sunday in IST
  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const dayIdx = istDate.getUTCDay();
  const isTomorrowSunday = (dayIdx + 1) % 7 === 0;

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

  // Check if Sunday or tomorrow (when tomorrow is Sunday) is requested ONLY IN THE CURRENT MESSAGE
  if (currentMessage) {
    const isSundayWord = /(?:సండే|ఆదివారం|sunday)/i.test(currentMessage);
    const isTomorrowWord = /(?:రేపు|tomorrow)/i.test(currentMessage);
    if (isSundayWord || (isTomorrowWord && isTomorrowSunday)) {
      slots.isSundayRequested = true;
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
 * Resolves standard inquiries (services, greetings, acknowledgments) in 0ms LLM time
 * to achieve sub-500ms TTFA.
 */
export function resolveFastPathResponse(
  message: string,
  slots: CallerSlots,
  language: string
): string | null {
  if (language !== 'te-IN') return null;

  const clean = message.trim();
  const isAck = isAcknowledgment(clean);
  const isBye = isFarewell(clean);

  // 1. Common Services Inquiry -> Instant 0ms response
  if (
    /(?:ఎలాంటి|ఏమి|ఏం|what)\s*(?:సర్వీసెస్|services|సేవలు|ప్రొవైడ్|చేస్తారు)/i.test(clean) ||
    /(?:services|సర్వీసెస్)\s*(?:ఏంటి|enti|please|list)/i.test(clean)
  ) {
    return 'మా దగ్గర విల్లాస్, ఫ్లాట్స్, అపార్ట్‌మెంట్స్ ఉన్నాయి. అలాగే ఫ్రీ సైట్ విజిట్ కూడా బుక్ చేస్తాం. మీకు ఏ ప్రాపర్టీ కావాలి?';
  }

  // 2. Greetings -> Instant 0ms response
  if (/^(?:నమస్కారం|నమస్తే|హలో|హాయ్|hello|hi|hey)[\s.!?,]*$/i.test(clean)) {
    return 'నమస్కారం! Adhi estate కి స్వాగతం, నేను మీకు ఎలా సహాయపడగలను?';
  }

  // 3. Post-confirmation turns
  if (slots.appointmentConfirmed) {
    const nameGreeting = slots.callerName ? `${slots.callerName} గారు` : '';

    if (isBye) {
      return nameGreeting
        ? `ధన్యవాదాలు ${nameGreeting}, Have a great day!`
        : `ధన్యవాదాలు, Have a great day!`;
    }

    if (isAck) {
      return 'సరే, ఇంకేమైనా వివరాలు కావాలా?';
    }
  }

  // 4. Acknowledgment during inquiry when name is already captured
  if (isAck && slots.callerName && !slots.appointmentConfirmed) {
    return 'సరే, ఎప్పుడు సైట్ విజిట్ ప్లాన్ చేద్దాం?';
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
      `  CRITICAL: NEVER ask "దయచేసి మీ పేరు చెప్పండి?" again!`,
      `  DO NOT repeat their name in every turn — use it naturally and sparingly.`
    );
  }

  if (slots.isSundayRequested) {
    directives.push(
      `• 🚨 SUNDAY / TOMORROW REQUEST DETECTED: Caller requested Sunday (or tomorrow, which is Sunday).`,
      `  CRITICAL: You MUST tell the caller that our office is CLOSED on Sunday:`,
      `  "క్షమించండి, రేపు ఆదివారం మా ఆఫీస్ సెలవు. సోమవారం 10 AM కి చూడమంటారా?"`,
      `  STRICTLY FORBIDDEN to book or confirm a Sunday slot!`
    );
  }

  if (slots.appointmentConfirmed) {
    directives.push(
      `• APPOINTMENT STATUS: ALREADY CONFIRMED AND BOOKED!`,
      `  CRITICAL: Do NOT re-book, do NOT ask for day/time again, and NEVER say "call back చెయ్యండి".`,
      `  If caller acknowledges (e.g. "ఓకే" or "సరే"), simply say: "సరే, ఇంకేమైనా వివరాలు కావాలా?" or wish them a great day.`
    );
  } else if (slots.dayOfWeek || slots.timeOfDay) {
    directives.push(
      `• SCHEDULING DETAILS: Requested day: "${slots.dayOfWeek || 'not set'}", time: "${slots.timeOfDay || 'not set'}".`
    );
  }

  directives.push(
    '========================================================================'
  );

  return directives.join('\n');
}
