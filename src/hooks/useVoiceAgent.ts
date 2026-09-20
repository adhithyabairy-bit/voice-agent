'use client';

// ============================================================
// useVoiceAgent — Main orchestration hook for the voice pipeline
// Manages: mic → VAD/WebSpeech → record → STT → LLM (streaming)
//         → Real-time sentence chunking → TTS stream → playback
// Features:
// - Real-time word-by-word streaming transcript
// - Sentence-by-sentence streaming TTS (plays sentence 1 while LLM generates sentence 2)
// - Web Audio GainNode & DynamicsCompressor for amplified, crystal clear audio
// - Dual-pipeline STT (Web Speech API + Sarvam STT fallback)
// - Barge-in / interruption with instant queue flush
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioRecorder } from '@/lib/audio/recorder';
import { AudioPlayer } from '@/lib/audio/player';
import { VoiceActivityDetector } from '@/lib/audio/vad';
import type { CallState, LanguageCode, LatencyMetrics } from '@/types';

interface VoiceAgentOptions {
  language: LanguageCode;
  voice: string;
  personality: 'friendly' | 'professional' | 'concise';
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onStateChange?: (state: CallState) => void;
  onError?: (error: string) => void;
  onVolumeChange?: (volume: number) => void;
  onLatencyUpdate?: (metrics: LatencyMetrics) => void;
}

interface VoiceAgentReturn {
  callState: CallState;
  startCall: () => Promise<void>;
  endCall: () => Promise<void>;
  sendTextMessage: (text: string) => Promise<void>;
  stopSpeakingAndSend: () => void;
  isSpeakingDetected: boolean;
  volume: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
  latency: LatencyMetrics;
  conversationId: string | null;
  error: string | null;
  isDemo: boolean;
  liveTranscript: string;
  volumeBoost: number;
  setVolumeBoost: (vol: number) => void;
  feedbackNotice: string | null;
  callDuration: number;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

/**
 * Splits streamed text buffer into ready-to-speak sentence/clause chunks.
 * Handles English, Telugu, and Hindi punctuation.
 */
function extractSpeechChunks(buffer: string): { chunks: string[]; remaining: string } {
  const chunks: string[] = [];
  let remaining = buffer;

  while (remaining.length > 0) {
    // 1. Look for full sentence terminators (. ? ! । \n)
    const sentenceMatch = remaining.match(/^([\s\S]*?[.?!।\n]+)(\s+|$)([\s\S]*)/);
    if (sentenceMatch) {
      const chunk = sentenceMatch[1].trim();
      remaining = sentenceMatch[3];
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      continue;
    }

    // 2. Look for natural clause pause (, ; :) if at least 3 words have accumulated
    const words = remaining.trim().split(/\s+/);
    if (words.length >= 3) {
      const clauseMatch = remaining.match(/^([\s\S]*?[,;:]+)(\s+|$)([\s\S]*)/);
      if (clauseMatch) {
        const chunk = clauseMatch[1].trim();
        remaining = clauseMatch[3];
        if (chunk.length > 0) {
          chunks.push(chunk);
        }
        continue;
      }
    }

    // 3. Fallback: if over 5 words accumulated without punctuation, split at word 4 for <500ms first audio
    if (words.length >= 5) {
      const chunk = words.slice(0, 4).join(' ');
      remaining = words.slice(4).join(' ');
      chunks.push(chunk);
      continue;
    }

    break;
  }

  return { chunks, remaining };
}

export function useVoiceAgent(options: VoiceAgentOptions): VoiceAgentReturn {
  const [callState, setCallState] = useState<CallState>('idle');
  const [volume, setVolume] = useState(0);
  const [isSpeakingDetected, setIsSpeakingDetected] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>([]);
  const [latency, setLatency] = useState<LatencyMetrics>({
    sttLatency: null,
    llmFirstTokenLatency: null,
    ttsLatency: null,
    totalResponseLatency: null,
  });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [volumeBoost, setVolumeBoostState] = useState(1.8);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (['listening', 'speaking', 'processing'].includes(callState)) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callState]);

  // Refs for audio components and pipeline coordination
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const callStartTimeRef = useRef<number>(0);
  const isActiveRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Web Speech API accumulation
  const webSpeechFinalRef = useRef('');
  const interimSpeechRef = useRef('');

  // Volume boost setter
  const setVolumeBoost = useCallback((vol: number) => {
    setVolumeBoostState(vol);
    playerRef.current?.setVolume(vol);
  }, []);

  const updateState = useCallback((newState: CallState) => {
    setCallState(newState);
    optionsRef.current.onStateChange?.(newState);
  }, []);

  const cleanup = useCallback(() => {
    isActiveRef.current = false;
    abortControllerRef.current?.abort();

    try {
      speechRecognitionRef.current?.abort();
    } catch {
      // Ignore
    }
    speechRecognitionRef.current = null;

    vadRef.current?.destroy();
    recorderRef.current?.destroy();
    playerRef.current?.destroy();

    vadRef.current = null;
    recorderRef.current = null;
    playerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * Helper to append an audio chunk to the player queue via /api/voice/tts.
   */
  const synthesizeAndQueueChunk = useCallback(async (textChunk: string, isFirst = false, totalStart = 0) => {
    if (!textChunk.trim() || !isActiveRef.current) return;
    const chunkStart = Date.now();

    try {
      const ttsResponse = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textChunk,
          language: optionsRef.current.language,
          voice: optionsRef.current.voice,
        }),
        signal: abortControllerRef.current?.signal,
      });

      if (!isActiveRef.current) return;

      const ttsContentType = ttsResponse.headers.get('content-type') || '';
      if (ttsResponse.ok && (ttsContentType.includes('audio') || ttsContentType.includes('mpeg') || ttsContentType.includes('wav'))) {
        const audioData = await ttsResponse.arrayBuffer();
        if (isFirst) {
          const ttsLatency = Date.now() - chunkStart;
          const totalLatency = totalStart ? Date.now() - totalStart : ttsLatency;
          setLatency(prev => ({
            ...prev,
            ttsLatency,
            totalResponseLatency: totalLatency,
          }));
        }
        if (isActiveRef.current && playerRef.current) {
          // Pause VAD while speaking to prevent self-listening
          vadRef.current?.pause();
          await playerRef.current.enqueueAudio(audioData);
        }
      } else {
        // Fallback: browser SpeechSynthesis
        let speechText = textChunk;
        try {
          const respData = await ttsResponse.json();
          if (respData.mode === 'demo') setIsDemo(true);
          if (respData.text) speechText = respData.text;
        } catch {
          // Ignore
        }

        if ('speechSynthesis' in window && isActiveRef.current) {
          vadRef.current?.pause();
          const utterance = new SpeechSynthesisUtterance(speechText);
          utterance.lang = optionsRef.current.language.replace('-IN', '');
          utterance.volume = 1.0;
          utterance.rate = 1.0;

          utterance.onend = () => {
            if (isActiveRef.current && !playerRef.current?.isPlaying()) {
              try {
                recorderRef.current?.startRecording();
              } catch {
                // Ignore
              }
              vadRef.current?.resume();
              updateState('listening');
            }
          };

          window.speechSynthesis.speak(utterance);
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('TTS streaming chunk error:', err);
      }
    }
  }, [updateState]);

  /**
   * Process a user message through streaming LLM & sentence-chunked TTS.
   */
  const processMessage = useCallback(async (text: string, fromText = false) => {
    if (!isActiveRef.current && !fromText) return;

    updateState('processing');
    setError(null);
    setLiveTranscript('');

    // Append user message
    const userMsg = { role: 'user' as const, content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    optionsRef.current.onTranscript?.(text, 'user');

    const totalStart = Date.now();

    try {
      // Cancel any existing in-flight operations
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      // Create empty assistant message placeholder for real-time streaming
      const assistantMsgTime = Date.now();
      setMessages(prev => [
        ...prev,
        { role: 'assistant' as const, content: '', timestamp: assistantMsgTime },
      ]);

      // --- LLM Call (streaming) ---
      const chatResponse = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content,
          })),
          language: optionsRef.current.language,
          personality: optionsRef.current.personality,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!chatResponse.ok) {
        throw new Error(`Chat API error: ${chatResponse.status}`);
      }

      // Prepare AudioPlayer completion hook
      if (playerRef.current) {
        playerRef.current.onQueueDrained(() => {
          if (isActiveRef.current) {
            try {
              recorderRef.current?.startRecording();
            } catch {
              // Ignore
            }
            vadRef.current?.resume();
            updateState('listening');
          }
        });
      }

      const contentType = chatResponse.headers.get('content-type') || '';
      let fullResponse = '';
      let streamBuffer = '';

      let hasDispatchedFirstTTS = false;

      if (contentType.includes('application/json')) {
        // Non-streaming fallback
        const jsonData = await chatResponse.json();
        fullResponse = jsonData.content;
        if (jsonData.mode === 'demo') setIsDemo(true);

        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = { ...updated[lastIdx], content: fullResponse };
          }
          return updated;
        });

        // Single chunk synthesize
        updateState('speaking');
        await synthesizeAndQueueChunk(fullResponse, true, totalStart);
      } else {
        // Streaming NDJSON response
        const reader = chatResponse.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let lineBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);

                if (parsed.type === 'content') {
                  const token = parsed.content;
                  fullResponse += token;
                  streamBuffer += token;

                  // Update UI message word-by-word
                  setMessages(prev => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                      updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: updated[lastIdx].content + token,
                      };
                    }
                    return updated;
                  });

                  // Check if a complete sentence or clause has formed
                  const { chunks, remaining } = extractSpeechChunks(streamBuffer);
                  streamBuffer = remaining;

                  if (chunks.length > 0) {
                    updateState('speaking');
                    for (const chunk of chunks) {
                      const isFirst = !hasDispatchedFirstTTS;
                      hasDispatchedFirstTTS = true;
                      synthesizeAndQueueChunk(chunk, isFirst, totalStart);
                    }
                  }
                } else if (parsed.type === 'latency') {
                  setLatency(prev => ({
                    ...prev,
                    llmFirstTokenLatency: parsed.firstTokenLatency,
                  }));
                }
              } catch {
                // Ignore parse errors on partial chunks
              }
            }
          }

          // Flush any remaining text at the end of the stream
          if (streamBuffer.trim().length > 0 && isActiveRef.current) {
            updateState('speaking');
            const isFirst = !hasDispatchedFirstTTS;
            hasDispatchedFirstTTS = true;
            await synthesizeAndQueueChunk(streamBuffer.trim(), isFirst, totalStart);
          }
        }
      }

      if (fullResponse) {
        optionsRef.current.onTranscript?.(fullResponse, 'assistant');
      }

      const totalLatency = Date.now() - totalStart;
      setLatency(prev => ({
        ...prev,
        totalResponseLatency: totalLatency,
      }));
      optionsRef.current.onLatencyUpdate?.({
        ...latency,
        totalResponseLatency: totalLatency,
      });

      // If audio player is not playing anything (e.g. silent or demo fallback finished), revert to listening
      setTimeout(() => {
        if (isActiveRef.current && !playerRef.current?.isPlaying() && !window.speechSynthesis?.speaking) {
          try {
            recorderRef.current?.startRecording();
          } catch {
            // Ignore
          }
          vadRef.current?.resume();
          updateState('listening');
        }
      }, 800);
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      const errorMsg = (err as Error).message || 'An error occurred';
      console.error('Voice pipeline error:', errorMsg);
      setError(errorMsg);
      optionsRef.current.onError?.(errorMsg);

      if (isActiveRef.current) {
        setTimeout(() => {
          if (isActiveRef.current) {
            try {
              recorderRef.current?.startRecording();
            } catch {
              // Ignore
            }
            updateState('listening');
            vadRef.current?.resume();
          }
        }, 1500);
      }
    }
  }, [messages, latency, updateState, synthesizeAndQueueChunk]);

  /**
   * Start a voice call session.
   */
  const startCall = useCallback(async () => {
    try {
      setError(null);
      setMessages([]);
      setIsSpeakingDetected(false);
      setLiveTranscript('');
      setFeedbackNotice(null);
      updateState('connecting');

      // Initialize audio components
      const recorder = new AudioRecorder();
      const player = new AudioPlayer();
      player.setVolume(volumeBoost);

      recorderRef.current = recorder;
      playerRef.current = player;

      // Request mic permission and initialize stream
      const stream = await recorder.initialize();
      player.initialize();

      // Create conversation session
      try {
        const sessionResp = await fetch('/api/voice/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: optionsRef.current.language,
          }),
        });
        const sessionData = await sessionResp.json();
        setConversationId(sessionData.conversationId);
      } catch {
        setConversationId(`local-${Date.now()}`);
      }

      // Initialize Web Speech API if supported in browser for instant zero-latency recognition
      if (typeof window !== 'undefined') {
        const win = window as unknown as {
          SpeechRecognition?: new () => BrowserSpeechRecognition;
          webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
        };
        const SpeechRecClass = win.SpeechRecognition || win.webkitSpeechRecognition;

        if (SpeechRecClass) {
          try {
            const recognition = new SpeechRecClass();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = optionsRef.current.language;

            recognition.onresult = (event: unknown) => {
              const recEvent = event as {
                resultIndex: number;
                results: Array<Array<{ transcript: string }> & { isFinal: boolean }>;
              };

              let interim = '';
              for (let i = recEvent.resultIndex; i < recEvent.results.length; ++i) {
                const transcriptPiece = recEvent.results[i][0].transcript;
                if (recEvent.results[i].isFinal) {
                  webSpeechFinalRef.current = (webSpeechFinalRef.current + ' ' + transcriptPiece).trim();
                } else {
                  interim += transcriptPiece;
                }
              }

              if (interim) {
                interimSpeechRef.current = interim;
                setLiveTranscript((webSpeechFinalRef.current + ' ' + interim).trim());
              } else if (webSpeechFinalRef.current) {
                setLiveTranscript(webSpeechFinalRef.current);
              }
            };

            recognition.onerror = () => {
              // Non-fatal, falls back to Sarvam STT
            };

            recognition.onend = () => {
              if (isActiveRef.current && speechRecognitionRef.current) {
                try {
                  recognition.start();
                } catch {
                  // Ignore
                }
              }
            };

            recognition.start();
            speechRecognitionRef.current = recognition;
          } catch {
            // Ignore if speech recognition blocked
          }
        }
      }

      // Initialize VAD with sensitive threshold & snappy hangover time for live natural turn-taking
      const vad = new VoiceActivityDetector({
        threshold: 0.007,
        hangoverTime: 650,
        minSpeechDuration: 120,
        onSpeechStart: () => {
          if (!isActiveRef.current) return;
          setIsSpeakingDetected(true);
          setFeedbackNotice(null);

          // BARGE-IN: If AI is speaking, interrupt immediately and flush queue
          if (playerRef.current?.isPlaying()) {
            playerRef.current.stopAudio();
            abortControllerRef.current?.abort();
            window.speechSynthesis?.cancel();
          }

          // Discard leading silence so Sarvam STT receives only active speech
          recorderRef.current?.resetChunks();
          webSpeechFinalRef.current = '';
          interimSpeechRef.current = '';

          // Ensure recorder is active
          if (!recorderRef.current?.isRecording()) {
            try {
              recorderRef.current?.startRecording();
            } catch {
              // Ignore
            }
          }
          updateState('listening');
        },
        onSpeechEnd: async () => {
          setIsSpeakingDetected(false);
          if (!isActiveRef.current) return;

          try {
            const sttStart = Date.now();
            // Ultra-fast path: Web Speech API (final or interim captured live) ~20ms
            let recognizedText = (webSpeechFinalRef.current || interimSpeechRef.current).trim();
            webSpeechFinalRef.current = '';
            interimSpeechRef.current = '';
            setLiveTranscript('');

            if (recognizedText) {
              const sttLatency = Math.min(25, Date.now() - sttStart);
              setLatency(prev => ({ ...prev, sttLatency }));
              await processMessage(recognizedText);
              return;
            }

            // Fallback path: Sarvam STT if browser recognition didn't yield text
            if (recorderRef.current) {
              const audioBlob = await recorderRef.current.stopRecording();

              if (audioBlob.size > 200) {
                updateState('processing');

                const sttStart = Date.now();
                const formData = new FormData();
                const isWav = audioBlob.type.includes('wav');
                formData.append('audio', audioBlob, isWav ? 'recording.wav' : 'recording.webm');
                formData.append('language', optionsRef.current.language);

                try {
                  const sttResponse = await fetch('/api/voice/stt', {
                    method: 'POST',
                    body: formData,
                  });

                  if (sttResponse.ok) {
                    const sttData = await sttResponse.json();
                    const sttLatency = Date.now() - sttStart;
                    setLatency(prev => ({ ...prev, sttLatency }));

                    if (sttData.transcript && sttData.transcript.trim()) {
                      recognizedText = sttData.transcript.trim();
                    }
                  } else {
                    const errText = await sttResponse.text();
                    console.error('STT API failed:', sttResponse.status, errText);
                  }
                } catch (fetchErr) {
                  console.error('STT fetch exception:', fetchErr);
                }
              }
            }

            if (recognizedText) {
              await processMessage(recognizedText);
            } else {
              // No clear speech detected (e.g. ambient noise or click)
              setFeedbackNotice('Could not catch your voice. Please speak again.');
              setTimeout(() => setFeedbackNotice(null), 3000);

              if (isActiveRef.current) {
                try {
                  recorderRef.current?.startRecording();
                } catch {
                  // Ignore
                }
                updateState('listening');
              }
            }
          } catch (err: unknown) {
            console.error('Audio processing error:', err);
            if (isActiveRef.current) {
              try {
                recorderRef.current?.startRecording();
              } catch {
                // Ignore
              }
              updateState('listening');
            }
          }
        },
        onVolumeChange: (vol) => {
          setVolume(vol);
          optionsRef.current.onVolumeChange?.(vol);
        },
      });

      vadRef.current = vad;
      vad.start(stream);

      // Start recording immediately
      try {
        recorder.startRecording();
      } catch {
        // Ignore
      }

      isActiveRef.current = true;
      callStartTimeRef.current = Date.now();

      // In a real live call, the AI receptionist speaks first to welcome the caller!
      const greetings: Record<LanguageCode, string> = {
        'te-IN': 'నమస్కారం! ఏబీసీ క్లినిక్‌కి స్వాగతం. నేను మీకు ఎలా సహాయపడగలను?',
        'hi-IN': 'नमस्ते! एबीसी क्लिनिक में आपका स्वागत है. मैं आपकी क्या सहायता कर सकता हूँ?',
        'en-IN': 'Hello! Welcome to ABC Clinic. How can I assist you today?',
      };
      const initialGreeting = greetings[optionsRef.current.language] || greetings['en-IN'];

      // Add greeting to transcript
      setMessages([{ role: 'assistant', content: initialGreeting, timestamp: Date.now() }]);
      optionsRef.current.onTranscript?.(initialGreeting, 'assistant');

      // Hook up player queue drained listener so agent automatically listens once greeting finishes
      if (playerRef.current) {
        playerRef.current.onQueueDrained(() => {
          if (isActiveRef.current) {
            try {
              recorderRef.current?.startRecording();
            } catch {
              // Ignore
            }
            vadRef.current?.resume();
            updateState('listening');
          }
        });
      }

      updateState('speaking');
      await synthesizeAndQueueChunk(initialGreeting);

      // Check demo mode
      try {
        const agentResp = await fetch('/api/agent');
        const agentData = await agentResp.json();
        if (agentData.demo?.isDemo) {
          setIsDemo(true);
        }
      } catch {
        // Non-critical
      }
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || 'Failed to start call';
      setError(errorMsg);
      optionsRef.current.onError?.(errorMsg);
      updateState('error');
    }
  }, [updateState, processMessage, volumeBoost, synthesizeAndQueueChunk]);

  /**
   * End the voice call.
   */
  const endCall = useCallback(async () => {
    isActiveRef.current = false;
    updateState('ended');
    setLiveTranscript('');
    setFeedbackNotice(null);

    // Stop all audio & recognition
    playerRef.current?.stopAudio();
    window.speechSynthesis?.cancel();
    abortControllerRef.current?.abort();

    try {
      speechRecognitionRef.current?.abort();
    } catch {
      // Ignore
    }
    speechRecognitionRef.current = null;

    if (recorderRef.current?.isRecording()) {
      try {
        await recorderRef.current.stopRecording();
      } catch {
        // Ignore
      }
    }

    // Save conversation summary
    if (conversationId && messages.length > 0) {
      try {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            language: optionsRef.current.language,
            startTime: callStartTimeRef.current,
          }),
        });
      } catch {
        // Non-critical
      }
    }

    cleanup();
  }, [conversationId, messages, updateState, cleanup]);

  /**
   * Send a text message (fallback when voice is unavailable).
   */
  const sendTextMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const wasActive = isActiveRef.current;
    isActiveRef.current = true;

    if (!playerRef.current) {
      const player = new AudioPlayer();
      player.setVolume(volumeBoost);
      playerRef.current = player;
      player.initialize();
    }

    try {
      await processMessage(text.trim(), true);
    } finally {
      if (!wasActive) {
        const checkAndReset = () => {
          if (!playerRef.current?.isPlaying() && !window.speechSynthesis?.speaking) {
            isActiveRef.current = wasActive;
            setCallState('idle');
          } else {
            setTimeout(checkAndReset, 200);
          }
        };
        setTimeout(checkAndReset, 500);
      }
    }
  }, [processMessage, volumeBoost]);

  /**
   * Manually finish speaking and trigger processing immediately.
   */
  const stopSpeakingAndSend = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.forceSpeechEnd();
    }
  }, []);

  return {
    callState,
    startCall,
    endCall,
    sendTextMessage,
    stopSpeakingAndSend,
    isSpeakingDetected,
    volume,
    messages,
    latency,
    conversationId,
    error,
    isDemo,
    liveTranscript,
    volumeBoost,
    setVolumeBoost,
    feedbackNotice,
    callDuration,
  };
}
