// ============================================================
// Voice Activity Detection (VAD)
// Re-exports optimized VAD with FSM state progression:
// IDLE -> SPEAKING -> POSSIBLE_END -> ENDED
// ============================================================

export {
  VoiceActivityDetector,
  DEFAULT_VAD_CONFIG,
  type VADState,
  type VADConfig,
  type VADOptions,
} from '@/lib/voice/vad';
