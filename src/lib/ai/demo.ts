// ============================================================
// Demo Mode Provider
// Provides mock STT/LLM/TTS when API keys aren't configured.
// Uses browser SpeechSynthesis as TTS fallback.
// ============================================================

import type { LanguageCode, DemoConfig } from '@/types';
import { isGroqConfigured } from './groq';
import { isSarvamConfigured } from './sarvam-stt';

/**
 * Check if the app should run in demo mode.
 */
export function getDemoConfig(): DemoConfig {
  const missingKeys: string[] = [];

  if (!isGroqConfigured()) missingKeys.push('GROQ_API_KEY');
  if (!isSarvamConfigured()) missingKeys.push('SARVAM_API_KEY');

  if (missingKeys.length > 0) {
    return {
      isDemo: true,
      reason: `Missing API keys: ${missingKeys.join(', ')}. Running in demo mode with mock responses.`,
    };
  }

  return { isDemo: false };
}

/**
 * Mock STT response for demo mode.
 */
export function getMockTranscript(text: string): { transcript: string; language_code: string } {
  return {
    transcript: text || 'What are your clinic hours?',
    language_code: 'en-IN',
  };
}

// Pre-scripted demo responses for common queries
const DEMO_RESPONSES: Record<string, Record<LanguageCode, string>> = {
  hours: {
    'te-IN': 'మా క్లినిక్ సోమవారం నుండి శనివారం వరకు ఉదయం 9 గంటల నుండి రాత్రి 8 గంటల వరకు ఓపెన్ ఉంటుంది. ఆదివారం సెలవు.',
    'hi-IN': 'हमारा क्लिनिक सोमवार से शनिवार सुबह 9 बजे से रात 8 बजे तक खुला रहता है। रविवार को बंद रहता है।',
    'en-IN': 'Our clinic is open Monday to Saturday from 9 AM to 8 PM. We are closed on Sundays.',
  },
  pricing: {
    'te-IN': 'డెంటల్ కన్సల్టేషన్ ₹500, టీత్ క్లీనింగ్ ₹1000, రూట్ కెనాల్ ₹5000. మరిన్ని వివరాలు కావాలా?',
    'hi-IN': 'डेंटल कंसल्टेशन ₹500, टीथ क्लीनिंग ₹1000, रूट कैनाल ₹5000. क्या आपको और जानकारी चाहिए?',
    'en-IN': 'Dental consultation is ₹500, teeth cleaning is ₹1000, and root canal treatment is ₹5000. Would you like to know more?',
  },
  appointment: {
    'te-IN': 'అపాయింట్మెంట్ బుక్ చేయడానికి, మీ పేరు, ఏ రోజు రావాలనుకుంటున్నారో చెప్పండి. మేము మీ కోసం అరేంజ్ చేస్తాము.',
    'hi-IN': 'अपॉइंटमेंट बुक करने के लिए, अपना नाम और कब आना चाहते हैं बताइए। हम आपके लिए अरेंज कर देंगे।',
    'en-IN': 'To book an appointment, please share your name and preferred date and time. We will arrange it for you.',
  },
  greeting: {
    'te-IN': 'నమస్కారం! ABC డెంటల్ క్లినిక్‌కి స్వాగతం. మీకు ఎలా సహాయం చేయగలను?',
    'hi-IN': 'नमस्ते! ABC डेंटल क्लिनिक में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?',
    'en-IN': 'Hello! Welcome to ABC Dental Clinic. How can I help you today?',
  },
  default: {
    'te-IN': 'మీ ప్రశ్నకు ధన్యవాదాలు. నాకు ఈ విషయంలో సమాచారం లేదు. మీ వివరాలు ఇస్తే, మా టీమ్ మీకు కాల్ బ్యాక్ చేస్తారు.',
    'hi-IN': 'आपके सवाल के लिए धन्यवाद। इस बारे में मेरे पास जानकारी नहीं है। अगर आप अपना नंबर दें तो हमारी टीम आपको कॉल बैक करेगी।',
    'en-IN': 'Thank you for your question. I don\'t have that information right now. If you share your contact details, our team will get back to you.',
  },
};

/**
 * Get a demo response based on the user's message.
 */
export function getDemoResponse(message: string, language: LanguageCode): string {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('hour') || lowerMessage.includes('open') || lowerMessage.includes('time') ||
      lowerMessage.includes('ఓపెన్') || lowerMessage.includes('గంట') ||
      lowerMessage.includes('खुल') || lowerMessage.includes('बजे') || lowerMessage.includes('टाइम')) {
    return DEMO_RESPONSES.hours[language];
  }

  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('fee') ||
      lowerMessage.includes('ఎంత') || lowerMessage.includes('ధర') ||
      lowerMessage.includes('कितन') || lowerMessage.includes('दाम') || lowerMessage.includes('फीस')) {
    return DEMO_RESPONSES.pricing[language];
  }

  if (lowerMessage.includes('appointment') || lowerMessage.includes('book') ||
      lowerMessage.includes('అపాయింట్మెంట్') || lowerMessage.includes('బుక్') ||
      lowerMessage.includes('अपॉइंटमेंट') || lowerMessage.includes('बुक')) {
    return DEMO_RESPONSES.appointment[language];
  }

  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') ||
      lowerMessage.includes('నమస్కారం') || lowerMessage.includes('హలో') ||
      lowerMessage.includes('नमस्ते') || lowerMessage.includes('हेलो') ||
      lowerMessage.length < 10) {
    return DEMO_RESPONSES.greeting[language];
  }

  return DEMO_RESPONSES.default[language];
}
