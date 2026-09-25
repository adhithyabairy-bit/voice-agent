// ============================================================
// Voice Pipeline Configuration
// Centralized tunable parameters for lowest latency conversational voice
// ============================================================

export const VOICE_CONFIG = {
  // Voice Activity Detection (Section 4)
  vad: {
    hangoverTime: Number(process.env.VOICE_VAD_HANGOVER_MS || 200), // Target ~200ms
    minSpeechDuration: Number(process.env.VOICE_VAD_MIN_SPEECH_MS || 80), // Target ~80ms
    threshold: 0.007,
  },

  // Listening & Echo Guard (Section 5)
  echoGuardMs: Number(process.env.VOICE_ECHO_GUARD_MS || 120), // 120ms default for speaker decay; 60ms with headphones

  // LLM Model Config (Section 9)
  llm: {
    model: process.env.VOICE_LLM_MODEL || 'llama-3.3-70b-versatile',
    fallbackModel: 'openai/gpt-oss-20b',
    temperature: 0.6,
    maxTokens: 140,
  },

  // Audio Capture (Section 6)
  audio: {
    sampleRate: 16000,
    channelCount: 1,
    frameSize: 1024, // ~64ms frames at 16kHz for low buffering latency
  },

  // RAG retrieval timeout (Section 10)
  rag: {
    timeoutMs: 100, // strict 100ms timeout so retrieval never blocks voice
    topK: 2,
  },

  // Realtime transport (Section 8)
  realtime: {
    wsUrl: process.env.NEXT_PUBLIC_VOICE_REALTIME_URL || 'ws://localhost:3001',
    reconnectAttempts: 3,
    heartbeatIntervalMs: 15000,
  },

  // Debug & Benchmark (Section 26)
  debugLatency: process.env.VOICE_DEBUG_LATENCY === 'true' || process.env.NODE_ENV === 'development',
};
