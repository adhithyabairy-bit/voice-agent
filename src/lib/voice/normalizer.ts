// ============================================================
// Voice Text Normalizer for Text-to-Speech (TTS)
// Pre-processes LLM text before passing to speech synthesis:
// - Removes Markdown syntax (bold, italic, headers, bullet points)
// - Removes emojis and non-speech symbols
// - Removes internal system tokens, labels, and JSON fragments
// - Normalizes whitespace and punctuation pauses
// - Preserves Telugu Unicode, Indian currency (₹), numbers, times,
//   and natural spoken English loanwords (e.g., appointment, villas)
// ============================================================

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

/**
 * Normalizes conversational text for speech synthesis (TTS).
 *
 * @param text - Raw text from LLM stream or generator
 * @param language - BCP-47 language tag (e.g., 'te-IN', 'hi-IN', 'en-IN')
 * @returns Clean, natural spoken text ready for TTS
 */
export function normalizeForTTS(text: string, language = 'te-IN'): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text.normalize('NFC');

  // 1. Remove Markdown code blocks & inline code
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 2. Remove Markdown headers (#, ##, ###)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // 3. Remove Markdown bold/italic (*, **, _, __, ~~)
  cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');

  // 4. Remove Markdown links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 5. Remove bullet points and numbered list markers
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '');
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '');

  // 6. Remove HTML tags if any leaked through
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // 7. Remove Emojis
  cleaned = cleaned.replace(EMOJI_REGEX, '');

  // 8. Remove internal labels like "[Knowledge 1]:", "AI:", "Receptionist:", "Customer:"
  cleaned = cleaned.replace(/\[(?:knowledge|note|instruction|system)[\s\d]*\]:?/gi, '');
  cleaned = cleaned.replace(/^(?:ai|assistant|receptionist|bot|user|customer):\s*/gi, '');

  // 9. Remove brackets and curly braces with internal text if JSON-like
  cleaned = cleaned.replace(/\{[^{}]*\}/g, '');
  cleaned = cleaned.replace(/\[[^[\]]*\]/g, '');

  // 10. Language specific normalization for Telugu (te-IN)
  if (language === 'te-IN') {
    // Correct corrupt/mispronounced words
    // Replace corrupt "అప్రెంటైస్" with "అపార్ట్‌మెంట్స్"
    cleaned = cleaned.replace(/అప్రెంటైస్/g, 'అపార్ట్‌మెంట్స్');
    cleaned = cleaned.replace(/అప్రెంటీస్/g, 'అపార్ట్‌మెంట్స్');

    // Remove conversational filler openers if duplicated (e.g. "Sure! 😊")
    cleaned = cleaned.replace(/^(?:sure[!.]?\s*|yes[!.]?\s*|okay[!.]?\s*)/i, '');
  }

  // 11. Normalize currency symbols for spoken clarity
  cleaned = cleaned.replace(/₹\s*(\d+)/g, '$1 రూపాయలు');
  cleaned = cleaned.replace(/Rs\.?\s*(\d+)/gi, '$1 రూపాయలు');

  // 12. Normalize multiple exclamation/question marks to single
  cleaned = cleaned.replace(/!{2,}/g, '!');
  cleaned = cleaned.replace(/\?{2,}/g, '?');
  cleaned = cleaned.replace(/\.{2,}/g, '.');

  // 13. Remove unnecessary quotes and parentheses
  cleaned = cleaned.replace(/["“”'‘’«»]/g, '');
  cleaned = cleaned.replace(/[()]/g, ', ');

  // 14. Normalize multiple spaces and linebreaks
  cleaned = cleaned.replace(/[\r\n]+/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ');

  // 15. Clean trailing/leading punctuation
  cleaned = cleaned.replace(/^\s*[,;:—\u2013\u2014-]+\s*/, '');
  cleaned = cleaned.trim();

  return cleaned;
}
