# VoiceAI — Multilingual AI Voice Agent for Indian Businesses

A production-quality web-based AI voice agent that enables real-time voice conversations with customers in **Telugu**, **Hindi**, and **English**. Built as a prototype AI receptionist for Indian businesses.

## 🎯 What It Does

1. Customer opens the website
2. Selects a language (Telugu / Hindi / English)
3. Clicks **Start Call**
4. Speaks naturally through the browser microphone
5. Speech is transcribed via **Sarvam AI STT** (saaras:v3)
6. AI understands the request using **Groq LLM** (llama-3.3-70b-versatile)
7. Business knowledge (services, prices, hours) is used to generate an accurate response
8. Response is converted to natural speech via **Sarvam AI TTS** (bulbul:v3)
9. Customer hears the response through their browser
10. Supports barge-in/interruption — speak while the AI is talking to interrupt it

## 🏗️ Architecture

```
Browser Microphone
      ↓
Voice Activity Detection (RMS-based)
      ↓
Audio Recording (MediaRecorder → WebM/Opus)
      ↓
POST /api/voice/stt → Sarvam STT (saaras:v3)
      ↓
Transcript
      ↓
POST /api/voice/chat → Groq LLM (streaming)
      ↓  (with business context from Supabase)
AI Response
      ↓
POST /api/voice/tts → Sarvam TTS (bulbul:v3)
      ↓
Audio Playback (Web Audio API)
      ↓
Return to Listening (loop)
```

All API keys stay server-side via Next.js API routes.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| LLM | Groq API (llama-3.3-70b-versatile) |
| Speech-to-Text | Sarvam AI (saaras:v3) |
| Text-to-Speech | Sarvam AI (bulbul:v3) |
| Database | Supabase (PostgreSQL) |
| Audio | Web Audio API, MediaRecorder, VAD |
| Icons | Lucide React |
| Animations | Framer Motion, CSS Animations |

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Design system
│   ├── dashboard/               # Dashboard with metrics
│   ├── agent/                   # AI Agent + call interface (★ main page)
│   ├── business/                # Business knowledge config
│   ├── logs/                    # Conversation history
│   ├── settings/                # Provider status + config
│   └── api/
│       ├── voice/
│       │   ├── stt/route.ts     # Speech-to-Text proxy
│       │   ├── chat/route.ts    # LLM chat (streaming)
│       │   ├── tts/route.ts     # Text-to-Speech proxy
│       │   └── session/route.ts # Create conversation
│       ├── conversations/       # List/end conversations
│       ├── business/            # Business CRUD
│       └── agent/               # Agent status
├── components/
│   ├── layout/sidebar.tsx       # Navigation sidebar
│   └── voice/
│       ├── call-button.tsx      # Animated call button
│       ├── waveform.tsx         # Audio visualization
│       ├── transcript.tsx       # Live conversation
│       ├── call-status.tsx      # Status bar
│       └── language-selector.tsx
├── hooks/
│   └── useVoiceAgent.ts         # Main voice pipeline hook
├── lib/
│   ├── ai/
│   │   ├── groq.ts              # Groq LLM service
│   │   ├── sarvam-stt.ts        # Sarvam STT service
│   │   ├── sarvam-tts.ts        # Sarvam TTS service
│   │   ├── prompts.ts           # System prompt builder
│   │   └── demo.ts              # Demo mode provider
│   ├── audio/
│   │   ├── recorder.ts          # Browser audio recorder
│   │   ├── player.ts            # Audio player with stop
│   │   └── vad.ts               # Voice Activity Detection
│   ├── db/supabase.ts           # Supabase client
│   └── services/
│       ├── business.ts          # Business data service
│       └── conversation.ts      # Conversation service
└── types/index.ts               # TypeScript definitions
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repo
cd calling-agent

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

### Environment Variables

Edit `.env.local` with your API keys:

```env
# Groq API — get key at https://console.groq.com/keys
GROQ_API_KEY=gsk_your_key_here

# Sarvam AI — get key at https://dashboard.sarvam.ai
SARVAM_API_KEY=your_sarvam_key_here

# Supabase — get from project settings → API
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🎭 Demo Mode

The app works even without API keys configured. In demo mode:
- Text fallback chat is available
- Mock responses are provided for common queries (hours, pricing, appointments)
- Browser SpeechSynthesis is used as TTS fallback
- A clear "Demo Mode" banner is shown
- Once you add API keys and restart, real AI processing activates automatically

## 🗃️ Supabase Setup

### Create tables

Run this SQL in your Supabase SQL editor to create all required tables with seed data:

```sql
-- See the full migration in the implementation plan
-- Key tables: businesses, services, faqs, agents, conversations, messages, leads

CREATE TABLE businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  phone TEXT,
  working_hours JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ... (see implementation_plan.md for full schema)
```

The app includes fallback data for ABC Dental Clinic, so it works without Supabase too.

## 🎙️ Testing Voice

### Telugu Voice Test
1. Go to `/agent`
2. Select "తెలుగు" language
3. Click **Start Call**
4. Allow microphone
5. Say: "మీ క్లినిక్ రేపు ఎన్ని గంటలకు ఓపెన్ అవుతుంది?"
6. AI should respond with clinic hours in Telugu

### Hindi Voice Test
1. Select "हिन्दी" language
2. Say: "teeth cleaning का price kya hai?"
3. AI should respond with ₹1000 in Hindi

### English Voice Test
1. Select "English" language
2. Say: "Do you accept insurance?"
3. AI should respond with insurance info

### Barge-in Test
1. Start a call
2. While AI is speaking, start talking
3. AI should stop and listen to your new input

## 🔒 Security

- All API keys (GROQ, SARVAM, SUPABASE_SERVICE_ROLE) stay server-side in Next.js API routes
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are exposed to the browser
- No API keys in client bundles
- Input validation on all API routes

## 📞 Future Telephony Integration

The backend is designed with a `VoiceAdapter` interface pattern:

```typescript
interface VoiceAdapter {
  initialize(): Promise<void>;
  startCapture(): Promise<void>;
  stopCapture(): Promise<Blob>;
  playAudio(audio: ArrayBuffer): Promise<void>;
  stopAudio(): void;
  isPlaying(): boolean;
  destroy(): void;
}
```

Current implementation: `BrowserVoiceAdapter` (browser mic + Web Audio)

Future: Add `TelephonyVoiceAdapter` for Exotel/SIP without rewriting the AI core.

## 🐛 Troubleshooting

| Issue | Solution |
|-------|---------|
| Microphone not working | Check browser permissions, ensure HTTPS in production |
| "Demo Mode" showing | Add API keys to `.env.local` and restart dev server |
| STT not transcribing | Verify SARVAM_API_KEY, check network tab for errors |
| TTS no audio | Check browser allows autoplay, click page first |
| Groq timeout | Check GROQ_API_KEY, try smaller model (llama-3.1-8b-instant) |
| Build errors | Run `npm run build` and check TypeScript errors |

## 📄 License

MIT
