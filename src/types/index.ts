// ============================================================
// Core type definitions for the Multilingual AI Voice Agent Platform
// Multi-Business Tenant Architecture
// ============================================================

export type BusinessType =
  | 'clinic'
  | 'restaurant'
  | 'salon'
  | 'gym'
  | 'real_estate'
  | 'dealership'
  | 'education'
  | 'retail'
  | 'professional_services'
  | 'service'
  | 'local'
  | 'other';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  owner_id?: string | null;
  business_name: string;
  name?: string; // backwards compatibility alias
  business_type: string;
  description: string | null;
  phone: string | null;
  email?: string | null;
  website?: string | null;
  address: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  working_hours: Record<string, string>;
  timezone?: string;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  business_id: string;
  agent_name: string;
  name?: string; // backwards compatibility alias
  language: LanguageCode;
  voice: string;
  response_style: AgentPersonality;
  personality?: string | null;
  system_prompt?: string | null;
  greeting?: string | null;
  fallback_message?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  duration_minutes?: number | null;
  availability?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FAQ {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  created_at?: string;
  updated_at?: string;
}

export interface KnowledgeDocument {
  id: string;
  business_id: string;
  title: string;
  content: string | null;
  source_type: 'text' | 'faq' | 'policy' | 'upload';
  file_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface KnowledgeChunk {
  id: string;
  business_id: string;
  document_id?: string | null;
  content: string;
  embedding?: number[] | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface Call {
  id: string;
  business_id: string;
  agent_id?: string | null;
  caller_number?: string | null;
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  status: 'connecting' | 'in-progress' | 'completed' | 'failed' | 'missed';
  language: string;
  created_at: string;
}

export interface CallMessage {
  id: string;
  call_id: string;
  speaker: 'user' | 'assistant' | 'system';
  message: string;
  timestamp: string;
}

export interface CallSummary {
  id: string;
  call_id: string;
  summary: string | null;
  customer_intent: string | null;
  lead_status: LeadStatus;
  follow_up_required: boolean;
  extracted_data?: {
    name?: string | null;
    phone?: string | null;
    requested_service?: string | null;
    preferred_time?: string | null;
    [key: string]: unknown;
  };
  created_at: string;
}

// Legacy aliases for backwards compatibility
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
  agent?: Agent | null;
  services: Service[];
  faqs: FAQ[];
  knowledgeChunks?: string[];
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
  voice: 'aditya',
  personality: 'friendly',
  temperature: 0.6,
  maxResponseLength: 150,
  enableInterruption: true,
  enableConversationLogging: true,
};

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

// Re-export production pipeline types
export type {
  VoiceTurn,
  TTSChunk,
  AudioQueueItem,
  VADConfig,
} from '@/lib/voice/types';

