// ============================================================
// Development Telugu Conversational Quality Test Set (Part 35)
// Benchmarking natural spoken Hyderabad Tenglish vs. robotic calque translations.
// Used for prompt regression testing, naturalness evaluation, and LLM fine-tuning checks.
// ============================================================

export interface TeluguTestCase {
  category:
    | 'greeting'
    | 'service_inquiry'
    | 'price_inquiry'
    | 'working_hours'
    | 'location'
    | 'appointment'
    | 'availability'
    | 'follow_up'
    | 'unknown_request'
    | 'goodbye';
  customerUtterance: string;
  roboticBefore: string;
  naturalSpokenAfter: string;
  rationale: string;
}

export const TELUGU_EVALUATION_DATASET: TeluguTestCase[] = [
  {
    category: 'greeting',
    customerUtterance: 'హలో, నమస్కారం అండి.',
    roboticBefore: 'నమస్కారం అండి! Adhi estate కి స్వాగతం అండి. నేను మీకు ఈ రోజు ఏ విధంగా సహాయం చేయగలను అండి?',
    naturalSpokenAfter: 'నమస్కారం! Adhi estate కి స్వాగతం, నేను మీకు ఎలా సహాయపడగలను?',
    rationale: 'Eliminated triple "అండి" repetitions and unnatural bookish translation "ఏ విధంగా సహాయం చేయగలను".',
  },
  {
    category: 'service_inquiry',
    customerUtterance: 'మీరు ఎలాంటి సర్వీసెస్ ప్రొవైడ్ చేస్తారు?',
    roboticBefore: 'మేము మా సంస్థలో రెండు ప్రధాన సేవలను అందిస్తున్నాము అండి. అవి ప్రాపర్టీ విజిట్ మరియు అప్రెంటైస్ సంప్రదింపులు.',
    naturalSpokenAfter: 'మా దగ్గర విల్లాస్, ఫ్లాట్స్, అపార్ట్‌మెంట్స్ ఉన్నాయి. అలాగే ఫ్రీ సైట్ విజిట్ కూడా బుక్ చేస్తాం. మీకు ఏ ప్రాపర్టీ కావాలి?',
    rationale: 'Replaced corrupt word "అప్రెంటైస్" with "అపార్ట్‌మెంట్స్", removed stiff corporate bookish grammar.',
  },
  {
    category: 'price_inquiry',
    customerUtterance: 'బాచుపల్లి విల్లాస్ ధర ఎంత నుండి స్టార్ట్ అవుతుంది?',
    roboticBefore: 'బాచుపల్లి విల్లాస్ ప్రారంభ ధర 1 కోటి 20 లక్షల రూపాయలుగా నిర్ణయించబడి ఉన్నది అండి.',
    naturalSpokenAfter: 'బాచుపల్లి విల్లాస్ 1.2 Cr నుండి స్టార్ట్ అవుతాయి. మీకు 3BHK కావాలా, 4BHK నా?',
    rationale: 'Conversational pricing format (1.2 Cr) and immediate natural qualifying question.',
  },
  {
    category: 'working_hours',
    customerUtterance: 'ఆఫీస్ ఏ టైమింగ్స్‌లో ఓపెన్ ఉంటుంది?',
    roboticBefore: 'మా కార్యాలయము సోమవారం నుండి శనివారం వరకు ఉదయం 9 గంటల నుండి రాత్రి 8 గంటల వరకు పనిచేయును.',
    naturalSpokenAfter: 'మండే నుండి సాటర్డే ఉదయం 9 నుండి రాత్రి 8 వరకు ఉంటుంది. ఆదివారం సెలవు.',
    rationale: 'Natural conversational Hyderabad Tenglish with clear hours and concise phrasing.',
  },
  {
    category: 'location',
    customerUtterance: 'మీ ఆఫీస్ ఎక్కడ ఉంది?',
    roboticBefore: 'మా సంస్థ యొక్క చిరునామా బంజారా హిల్స్ రోడ్ నెంబర్ 12 వద్ద స్థితమై ఉన్నది అండి.',
    naturalSpokenAfter: 'మా ఆఫీస్ బంజారా హిల్స్ రోడ్ నెంబర్ 12 లో ఉంది. లొకేషన్ WhatsApp లో పంపమంటారా?',
    rationale: 'Natural spoken Telugu without archaic formal words like "చిరునామా", "స్థితమై ఉన్నది".',
  },
  {
    category: 'appointment',
    customerUtterance: 'నేను ఒకసారి సైట్ చూడడానికి రావచ్చా?',
    roboticBefore: 'అవును అండి, మీకు ఏ సమయమునందు సౌకర్యవంతముగా ఉండునో తెలుపగలరు అండి?',
    naturalSpokenAfter: 'తప్పకుండా! ఏ రోజు సైట్ విజిట్ ప్లాన్ చేద్దాం?',
    rationale: 'Replaced textbook phrasing "సౌకర్యవంతముగా ఉండునో" with natural "ఏ రోజు సైట్ విజిట్ ప్లాన్ చేద్దాం?".',
  },
  {
    category: 'availability',
    customerUtterance: 'రేపు మార్నింగ్ 10 గంటలకి స్లాట్ దొరుకుతుందా? (Assuming tomorrow is Sunday)',
    roboticBefore: 'ఖచ్చితంగా అండి, రేపు 10 గంటలకి మీ స్లాట్ బుక్ చేశాను అండి.',
    naturalSpokenAfter: 'క్షమించండి, రేపు ఆదివారం మా ఆఫీస్ సెలవు. సోమవారం 10 AM కి చూడమంటారా?',
    rationale: 'Enforces strictly conditional Sunday closure constraint instead of incorrectly booking a closed day.',
  },
  {
    category: 'follow_up',
    customerUtterance: 'నా పేరు రమేష్. నా నంబర్ 9876543210.',
    roboticBefore: 'ధన్యవాదాలు రమేష్ గారు అండి. దయచేసి మీ పేరు మళ్లీ చెప్పగలరా అండి?',
    naturalSpokenAfter: 'థాంక్యూ రమేష్ గారు, మీ వివరాలు నోట్ చేసుకున్నాను. ఎప్పుడు విజిట్ ప్లాన్ చేద్దాం?',
    rationale: 'Remembers caller name permanently without asking twice or repeating "అండి".',
  },
  {
    category: 'unknown_request',
    customerUtterance: 'మీరు కార్ లోన్స్ కూడా ఇస్తారా?',
    roboticBefore: 'క్షమించండి, ఒక ఆర్టిఫిషియల్ ఇంటెలిజెన్స్ మోడల్ గా నేను కార్ లోన్స్ గురించి సమాచారం ఇవ్వలేను.',
    naturalSpokenAfter: 'మేము కేవలం రియల్ ఎస్టేట్ ప్రాపర్టీస్ డీల్ చేస్తాం. మా టీమ్ తో మాట్లాడించమంటారా?',
    rationale: 'Never mentions being an AI; stays firmly in character as business receptionist.',
  },
  {
    category: 'goodbye',
    customerUtterance: 'సరే అండి, అంతే. వివరాలు సరిపోతాయి.',
    roboticBefore: 'సరే అండి, మీరు మా సంస్థను సంప్రదించినందుకు ధన్యవాదములు అండి, బై అండి.',
    naturalSpokenAfter: 'సరే, ధన్యవాదాలు! Have a great day!',
    rationale: 'Clean, warm, authentic Hyderabad closing without trailing polite loops.',
  },
];

/**
 * Naturalness heuristic score checker for generated Telugu text.
 * Flags robotic markers, word repetitions, and banned corrupt words.
 */
export function auditTeluguNaturalness(response: string): {
  isNatural: boolean;
  score: number; // 0 to 100
  flaws: string[];
} {
  const flaws: string[] = [];
  let score = 100;

  // 1. Check for corrupt word "అప్రెంటైస్"
  if (/అప్రెంటైస్|అప్రెంటీస్/.test(response)) {
    flaws.push('Contains corrupt pseudo-word "అప్రెంటైస్" (should be "అపార్ట్‌మెంట్స్")');
    score -= 35;
  }

  // 2. Check for excessive "అండి" (more than 1 occurrence in a 1-sentence reply is robotic)
  const andiMatches = response.match(/అండి/g);
  if (andiMatches && andiMatches.length > 1) {
    flaws.push(`Excessive "అండి" repetition (${andiMatches.length} times in one response)`);
    score -= 20;
  }

  // 3. Check for stiff textbook phrasing
  if (/సౌకర్యంగా\s*ఉంటుంది|సౌకర్యవంతముగా/.test(response)) {
    flaws.push('Contains stiff textbook phrasing ("సౌకర్యంగా ఉంటుంది", should be "వీలవుతుంది")');
    score -= 15;
  }

  // 4. Check for robotic AI disclosure
  if (/ఆర్టిఫిషియల్\s*ఇంటెలిజెన్స్|ai\s*మోడల్|భాషా\s*మోడల్/i.test(response)) {
    flaws.push('Exposes internal AI identity (prohibited on phone calls)');
    score -= 30;
  }

  // 5. Check for run-on length (> 30 words in phone response)
  const words = response.trim().split(/\s+/).filter(Boolean);
  if (words.length > 30) {
    flaws.push(`Response too long for voice interaction (${words.length} words; target is 10-25 words)`);
    score -= 15;
  }

  return {
    isNatural: score >= 80,
    score: Math.max(0, score),
    flaws,
  };
}
