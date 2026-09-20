// ============================================================
// Core type definitions for the Multilingual AI Voice Agent
// ============================================================

// --- Database Entity Types ---

export interface Business {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  working_hours: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  created_at: string;
}

export interface FAQ {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  created_at: string;
}

export interface Agent {
  id: string;
  business_id: string;
  name: string;
  language: LanguageCode;
  voice: string;
  personality: AgentPersonality;
  system_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  agent_id: string | null;
  language: string;
  started_at: string;
  ended_at: string | null;
  duration: number | null;
  summary: string | null;
  intent: string | null;
  lead_status: LeadStatus;
  customer_name: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  audio_duration: number | null;
  created_at: string;
}

export interface Lead {
  id: string;
  conversation_id: string;
  name: string | null;
  phone: string | null;
  interest: string | null;
  follow_up_required: boolean;
  notes: string | null;
  created_at: string;
}

// --- Business Data (aggregated for context) ---

export interface BusinessContext {
  business: Business;
  services: Service[];
  faqs: FAQ[];
}

// --- Voice / Call State Types ---

export type CallState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error'
  | 'ended';

export type LanguageCode = 'te-IN' | 'hi-IN' | 'en-IN';

export type AgentPersonality = 'friendly' | 'professional' | 'concise';

export type LeadStatus = 'none' | 'interested' | 'converted' | 'lost';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'en-IN', name: 'English', nativeName: 'English', flag: '🇮🇳' },
];

export interface VoiceConfig {
  language: LanguageCode;
  voice: string;
  personality: AgentPersonality;
  temperature: number;
  maxResponseLength: number;
  enableInterruption: boolean;
  enableConversationLogging: boolean;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  language: 'te-IN',
  voice: 'shubh',
  personality: 'friendly',
  temperature: 0.7,
  maxResponseLength: 150,
  enableInterruption: true,
  enableConversationLogging: true,
};

// --- Voice Adapter Interface (for future telephony) ---

export interface VoiceAdapter {
  /** Initialize the adapter (request permissions, etc.) */
  initialize(): Promise<void>;
  /** Start capturing audio */
  startCapture(): Promise<void>;
  /** Stop capturing audio and return the recorded blob */
  stopCapture(): Promise<Blob>;
  /** Play audio from an ArrayBuffer */
  playAudio(audio: ArrayBuffer): Promise<void>;
  /** Stop any currently playing audio */
  stopAudio(): void;
  /** Check if audio is currently playing */
  isPlaying(): boolean;
  /** Clean up resources */
  destroy(): void;
}

// --- API Response Types ---

export interface STTResponse {
  transcript: string;
  language_code: string;
  confidence?: number;
}

export interface ChatResponse {
  content: string;
  conversationId?: string;
}

export interface TTSResponse {
  audio: ArrayBuffer;
  duration?: number;
}

// --- Latency Metrics ---

export interface LatencyMetrics {
  sttLatency: number | null;
  llmFirstTokenLatency: number | null;
  ttsLatency: number | null;
  totalResponseLatency: number | null;
}

// --- Dashboard Types ---

export interface DashboardMetrics {
  totalConversations: number;
  avgDuration: number;
  leadsCollected: number;
  successfulConversations: number;
}

// --- Demo mode ---

export interface DemoConfig {
  isDemo: boolean;
  reason?: string;
}
