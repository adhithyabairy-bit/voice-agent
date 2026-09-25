// ============================================================
// Voice Pipeline Configuration
// Centralized tunable parameters for lowest latency conversational voice.
// Fully customizable via environment variables.
// ============================================================

export const VOICE_CONFIG = {
  // Voice Activity Detection (Part 2 & Part 32)
  vad: {
    threshold: Number(process.env.VAD_SILENCE_THRESHOLD || 0.007),
    hangoverTime: Number(process.env.VAD_END_SILENCE_MS || process.env.VOICE_VAD_HANGOVER_MS || 120), // Target ~120ms
    minSpeechDuration: Number(process.env.VAD_MIN_SPEECH_MS || process.env.VOICE_VAD_MIN_SPEECH_MS || 80), // Target ~80ms
    maxTurnDurationMs: Number(process.env.VAD_MAX_TURN_DURATION_MS || 15000),
    preSpeechBufferMs: Number(process.env.VAD_PRE_SPEECH_BUFFER_MS || 150),
  },

  // Listening & Echo Guard
  echoGuardMs: Number(process.env.VOICE_ECHO_GUARD_MS || 120), // 120ms default for speaker decay

  // LLM Model Config (Part 10, 11, 17, 32)
  llm: {
    model: process.env.VOICE_LLM_MODEL || 'llama-3.3-70b-versatile',
    fallbackModel: process.env.VOICE_LLM_FALLBACK_MODEL || 'openai/gpt-oss-20b',
    temperature: 0.6,
    maxTokens: 140,
    maxResponseSentences: Number(process.env.MAX_RESPONSE_SENTENCES || 2),
    conversationWindowSize: Number(process.env.CONVERSATION_WINDOW_SIZE || 10),
  },

  // Sarvam STT & TTS Config (Part 15, 32)
  stt: {
    defaultLanguage: process.env.SARVAM_STT_LANGUAGE || 'te-IN',
  },
  tts: {
    defaultLanguage: process.env.SARVAM_TTS_LANGUAGE || 'te-IN',
    speaker: process.env.SARVAM_TTS_SPEAKER || 'aditya',
    pace: Number(process.env.SARVAM_TTS_PACE || 1.15),
  },

  // Business Context Cache TTL (Part 9, 32)
  business: {
    cacheTtlMs: Number(process.env.BUSINESS_CACHE_TTL_MS || 300000), // 5 minutes
  },

  // Audio Capture
  audio: {
    sampleRate: 16000,
    channelCount: 1,
    frameSize: 1024, // ~64ms frames at 16kHz for low buffering latency
  },

  // RAG retrieval timeout
  rag: {
    timeoutMs: Number(process.env.RAG_TIMEOUT_MS || 100), // strict 100ms timeout
    topK: 2,
  },

  // Realtime transport
  realtime: {
    wsUrl: process.env.NEXT_PUBLIC_VOICE_REALTIME_URL || 'ws://localhost:3001',
    reconnectAttempts: 3,
    heartbeatIntervalMs: 15000,
  },

  // Debug & Benchmark (Part 1 & 29)
  debugLatency: process.env.VOICE_DEBUG_LATENCY === 'true' || process.env.NODE_ENV === 'development',
};
