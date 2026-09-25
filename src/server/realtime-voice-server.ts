// ============================================================
// Realtime Conversational Voice Server
// Persistent WebSocket server orchestrating:
// Client WebSocket <-> Sarvam Realtime STT <-> Groq Streaming LLM <-> Sarvam Streaming TTS
// Keeps all API keys strictly server-side.
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import Groq from 'groq-sdk';

// 1. Automatically load .env.local if keys are not set
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const PORT = Number(process.env.REALTIME_PORT || 3001);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const VOICE_LLM_MODEL = process.env.VOICE_LLM_MODEL || 'qwen/qwen3.8-27b';

if (!GROQ_API_KEY) {
  console.warn('⚠️ GROQ_API_KEY is not set in environment or .env.local');
}
if (!SARVAM_API_KEY) {
  console.warn('⚠️ SARVAM_API_KEY is not set in environment or .env.local');
}

const groq = new Groq({ apiKey: GROQ_API_KEY || 'dummy' });

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'realtime-voice', model: VOICE_LLM_MODEL }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

interface SessionState {
  sessionId: string;
  businessId?: string;
  language: string;
  voice: string;
  personality: string;
  sessionContext?: Record<string, unknown>;
  activeTurnId: string;
  turnAbortController: AbortController | null;
  sarvamWs: WebSocket | null;
  sarvamWsConnected: boolean;
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

// Map WebSocket connection to session state
const sessions = new Map<WebSocket, SessionState>();

// Phrase boundary extractor for LLM -> TTS stream
function extractSpeechPhrases(buffer: string): { phrases: string[]; remaining: string } {
  const phrases: string[] = [];
  let remaining = buffer;

  while (remaining.length > 0) {
    // 1. Sentence boundary
    const sentenceMatch = remaining.match(/^([\s\S]*?[.?!।\n]+)(\s+|$)([\s\S]*)/);
    if (sentenceMatch) {
      const phrase = sentenceMatch[1].trim();
      remaining = sentenceMatch[3];
      if (phrase.length > 0) phrases.push(phrase);
      continue;
    }

    const words = remaining.trim().split(/\s+/);

    // 2. Clause boundary (2+ words before comma)
    if (words.length >= 2) {
      const clauseMatch = remaining.match(/^([\s\S]*?[,;:—\u2013\u2014]+)(\s+|$)([\s\S]*)/);
      if (clauseMatch) {
        const phrase = clauseMatch[1].trim();
        const clauseWords = phrase.split(/\s+/);
        if (clauseWords.length >= 2) {
          remaining = clauseMatch[3];
          if (phrase.length > 0) phrases.push(phrase);
          continue;
        }
      }
    }

    // 3. Early speculative flush on 4 words
    if (words.length >= 4) {
      const phrase = words.slice(0, 3).join(' ');
      remaining = words.slice(3).join(' ');
      phrases.push(phrase);
      continue;
    }

    // 4. Fallback threshold
    if (words.length >= 6) {
      const phrase = words.slice(0, 3).join(' ');
      remaining = words.slice(3).join(' ');
      phrases.push(phrase);
      continue;
    }

    break;
  }

  return { phrases, remaining };
}

// Synthesize a speech chunk via Sarvam TTS
async function synthesizeTTSChunk(
  text: string,
  languageCode: string,
  voice: string,
  signal?: AbortSignal
): Promise<ArrayBuffer | null> {
  if (!SARVAM_API_KEY || !text.trim() || signal?.aborted) return null;

  try {
    const resp = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.slice(0, 500),
        language_code: languageCode,
        model: 'bulbul:v3',
        speaker: voice || 'aditya',
        pace: 1.45,
        temperature: 0.25,
        speech_sample_rate: 24000,
      }),
      signal,
    });

    if (!resp.ok) {
      console.warn(`Sarvam TTS error (${resp.status}):`, await resp.text());
      return null;
    }

    const data = await resp.json();
    if (data.audios && data.audios[0]) {
      const nodeBuf = Buffer.from(data.audios[0], 'base64');
      return nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('Sarvam TTS chunk error:', err);
    }
  }
  return null;
}

wss.on('connection', (clientWs: WebSocket) => {
  const session: SessionState = {
    sessionId: `session-${Date.now()}`,
    language: 'te-IN',
    voice: 'aditya',
    personality: 'friendly',
    activeTurnId: '',
    turnAbortController: null,
    sarvamWs: null,
    sarvamWsConnected: false,
    history: [],
  };
  sessions.set(clientWs, session);

  // Initialize Sarvam Realtime STT WebSocket connection
  function connectSarvamSTT() {
    if (!SARVAM_API_KEY) return;
    try {
      const wsUrl = `wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=${encodeURIComponent(
        session.language
      )}&model=saaras:v3-realtime`;

      const sWs = new WebSocket(wsUrl, {
        headers: {
          'API-SUBSCRIPTION-KEY': SARVAM_API_KEY,
        },
      });

      sWs.on('open', () => {
        session.sarvamWsConnected = true;
      });

      sWs.on('message', (data: Buffer | string) => {
        try {
          const parsed = JSON.parse(data.toString());
          const turnId = session.activeTurnId;
          if (!turnId) return;

          if (parsed.event === 'transcript.partial' || parsed.type === 'partial') {
            const transcript = parsed.transcript || parsed.text || '';
            if (transcript && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'stt.partial',
                  turnId,
                  transcript,
                  timestamp: Date.now(),
                })
              );
            }
          } else if (
            parsed.event === 'transcript' ||
            parsed.type === 'final' ||
            parsed.transcript
          ) {
            const transcript = parsed.transcript || parsed.text || '';
            if (transcript && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'stt.final',
                  turnId,
                  transcript,
                  languageCode: parsed.language_code || session.language,
                  latencyMs: 120,
                  timestamp: Date.now(),
                })
              );
              // Trigger conversational response
              handleUserUtterance(clientWs, session, turnId, transcript);
            }
          }
        } catch (err) {
          console.warn('Sarvam message parse error:', err);
        }
      });

      sWs.on('error', (err) => {
        console.warn('Sarvam STT WebSocket error:', err.message);
        session.sarvamWsConnected = false;
      });

      sWs.on('close', () => {
        session.sarvamWsConnected = false;
      });

      session.sarvamWs = sWs;
    } catch (err) {
      console.warn('Failed to connect to Sarvam STT WebSocket:', err);
    }
  }

  // Handle LLM and TTS response pipeline for a user turn
  async function handleUserUtterance(
    ws: WebSocket,
    sess: SessionState,
    turnId: string,
    userText: string
  ) {
    if (!userText.trim()) return;

    // Cancel existing turn in-flight
    if (sess.turnAbortController) {
      sess.turnAbortController.abort();
    }
    sess.turnAbortController = new AbortController();
    const signal = sess.turnAbortController.signal;

    // Record user message in session history
    sess.history.push({ role: 'user', content: userText });

    const llmStartTime = Date.now();
    let hasSentFirstToken = false;
    let fullResponse = '';
    let streamBuffer = '';
    let chunkIndex = 0;

    const systemPrompt = `You are a realtime business voice assistant.
Speak naturally and conversationally in ${sess.language}.
Keep responses very concise: 1 or 2 short sentences.
Do not produce long explanations unless asked.
Ask only one question at a time.
Do not repeat information unnecessarily.
Start answering as soon as enough information is available.
Optimize for natural conversational turn-taking.`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...sess.history.slice(-8),
    ];

    try {
      const stream = await groq.chat.completions.create({
        model: VOICE_LLM_MODEL,
        messages,
        stream: true,
        temperature: 0.6,
        max_tokens: 80,
      });

      for await (const chunk of stream) {
        if (signal.aborted || sess.activeTurnId !== turnId) break;

        const token = chunk.choices[0]?.delta?.content || '';
        if (!token) continue;

        if (!hasSentFirstToken) {
          hasSentFirstToken = true;
          const ttftMs = Date.now() - llmStartTime;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'llm.token',
                turnId,
                token,
                isFirstToken: true,
                ttftMs,
                timestamp: Date.now(),
              })
            );
          }
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'llm.token',
              turnId,
              token,
              timestamp: Date.now(),
            })
          );
        }

        fullResponse += token;
        streamBuffer += token;

        // Extract complete phrases or speculative chunks
        const { phrases, remaining } = extractSpeechPhrases(streamBuffer);
        streamBuffer = remaining;

        for (const phrase of phrases) {
          const currentIndex = chunkIndex++;
          const isFirstChunk = currentIndex === 0;

          // Dispatch TTS chunk asynchronously
          synthesizeTTSChunk(phrase, sess.language, sess.voice, signal).then((audioBuffer) => {
            if (audioBuffer && ws.readyState === WebSocket.OPEN && !signal.aborted && sess.activeTurnId === turnId) {
              const nodeBuf = Buffer.from(audioBuffer);
              const audioBase64 = nodeBuf.toString('base64');

              ws.send(
                JSON.stringify({
                  type: 'tts.chunk',
                  turnId,
                  chunkIndex: currentIndex,
                  audioBase64,
                  format: 'wav',
                  isFirstChunk,
                  timestamp: Date.now(),
                })
              );
            }
          });
        }
      }

      // Flush remaining stream buffer
      if (streamBuffer.trim() && !signal.aborted && sess.activeTurnId === turnId) {
        const currentIndex = chunkIndex++;
        const isFirstChunk = currentIndex === 0;
        synthesizeTTSChunk(streamBuffer.trim(), sess.language, sess.voice, signal).then((audioBuffer) => {
          if (audioBuffer && ws.readyState === WebSocket.OPEN && !signal.aborted && sess.activeTurnId === turnId) {
            const nodeBuf = Buffer.from(audioBuffer);
            const audioBase64 = nodeBuf.toString('base64');

            ws.send(
              JSON.stringify({
                type: 'tts.chunk',
                turnId,
                chunkIndex: currentIndex,
                audioBase64,
                format: 'wav',
                isFirstChunk,
                timestamp: Date.now(),
              })
            );
          }
        });
      }

      if (fullResponse && !signal.aborted && sess.activeTurnId === turnId) {
        sess.history.push({ role: 'assistant', content: fullResponse });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'turn.complete',
              turnId,
              fullResponse,
              timestamp: Date.now(),
            })
          );
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('Realtime turn processing error:', err);
      }
    }
  }

  // Handle client messages
  clientWs.on('message', (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'session.init': {
          session.sessionId = msg.sessionId || session.sessionId;
          session.businessId = msg.businessId;
          session.language = msg.language || session.language;
          session.voice = msg.voice || session.voice;
          session.personality = msg.personality || session.personality;
          session.sessionContext = msg.sessionContext;

          connectSarvamSTT();

          clientWs.send(
            JSON.stringify({
              type: 'session.ready',
              sessionId: session.sessionId,
              cachedContext: !!session.sessionContext,
            })
          );
          break;
        }

        case 'speech.start': {
          session.activeTurnId = msg.turnId;
          break;
        }

        case 'audio.chunk': {
          if (session.sarvamWs && session.sarvamWsConnected) {
            session.sarvamWs.send(
              JSON.stringify({
                event: 'audio_input',
                audio: msg.pcm16Base64,
              })
            );
          }
          break;
        }

        case 'speech.end': {
          if (session.sarvamWs && session.sarvamWsConnected) {
            session.sarvamWs.send(
              JSON.stringify({
                event: 'speech_end',
              })
            );
          }
          break;
        }

        case 'interrupt': {
          // Barge-in: immediately cancel active turn
          if (session.turnAbortController) {
            session.turnAbortController.abort();
            session.turnAbortController = null;
          }
          clientWs.send(
            JSON.stringify({
              type: 'turn.cancelled',
              turnId: msg.turnId,
              reason: 'user_interruption',
            })
          );
          break;
        }

        case 'text.input': {
          session.activeTurnId = msg.turnId;
          handleUserUtterance(clientWs, session, msg.turnId, msg.text);
          break;
        }
      }
    } catch (err) {
      console.warn('Realtime server message error:', err);
    }
  });

  clientWs.on('close', () => {
    if (session.turnAbortController) {
      session.turnAbortController.abort();
    }
    if (session.sarvamWs) {
      try {
        session.sarvamWs.close();
      } catch {
        // Ignore
      }
    }
    sessions.delete(clientWs);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Realtime Voice Server listening on ws://localhost:${PORT}`);
  console.log(`   Model: ${VOICE_LLM_MODEL}`);
  console.log(`   Sarvam STT/TTS: ${SARVAM_API_KEY ? 'Configured' : 'Missing Key'}`);
});
