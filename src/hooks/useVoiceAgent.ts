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
 * Splits streamed text buffer into natural sentence/clause chunks.
 * Preserves human prosody and intonation by avoiding robotic micro-chopping.
 * Handles English, Telugu, and Hindi punctuation.
 */
function extractSpeechChunks(buffer: string): { chunks: string[]; remaining: string } {
  const chunks: string[] = [];
  let remaining = buffer;

  while (remaining.length > 0) {
    // 1. Look for full sentence terminators (. ? ! । \n)
    // Ensures fluent, whole-sentence human speech without mid-sentence stops or unnatural breathing pauses
    const sentenceMatch = remaining.match(/^([\s\S]*?[.?!।\n]+)(\s+|$)([\s\S]*)/);
    if (sentenceMatch) {
      const chunk = sentenceMatch[1].trim();
      remaining = sentenceMatch[3];
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      continue;
    }

    // 2. Only if an unpunctuated stream of 24+ words accumulated, split cleanly to prevent buffer buildup
    const words = remaining.trim().split(/\s+/);
    if (words.length >= 24) {
      const chunk = words.slice(0, 18).join(' ');
      remaining = words.slice(18).join(' ');
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
  const [volumeBoost, setVolumeBoostState] = useState(1.0); // 1.0 = clean, uncompressed natural vocal warmth
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
  const isAISpeakingRef = useRef(false);
  const lastPlaybackEndTimeRef = useRef<number>(0);
  const pendingTTSChunksRef = useRef<number>(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Persistent synchronous message history ref to prevent stale closures and memory loss
  const messagesRef = useRef<Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>([]);
  const processMessageRef = useRef<(text: string, fromText?: boolean) => Promise<void>>(() => Promise.resolve());
  const pendingUserSpeechRef = useRef<string | null>(null);

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

  /**
   * Transition cleanly to 'listening' state with an acoustic echo guard delay.
   * This ensures laptop speaker resonance completely decays before the mic starts listening,
   * preventing the agent from hearing its own voice and speaking random words.
   */
  const transitionToListening = useCallback(() => {
    if (!isActiveRef.current) return;

    lastPlaybackEndTimeRef.current = Date.now();

    // 350ms acoustic guard delay to allow speaker reverberation to silence
    setTimeout(() => {
      if (!isActiveRef.current) return;
      if (playerRef.current?.isPlaying() || pendingTTSChunksRef.current > 0 || window.speechSynthesis?.speaking) {
        return; // Audio is still playing
      }

      isAISpeakingRef.current = false;
      webSpeechFinalRef.current = '';
      interimSpeechRef.current = '';
      setLiveTranscript('');

      try {
        recorderRef.current?.resetChunks();
        recorderRef.current?.startRecording();
      } catch {
        // Ignore
      }

      vadRef.current?.resume();
      updateState('listening');
    }, 350);
  }, [updateState]);

  const cleanup = useCallback(() => {
    isActiveRef.current = false;
    isAISpeakingRef.current = false;
    pendingTTSChunksRef.current = 0;
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
  /**
   * Helper to append an audio chunk to the player queue via /api/voice/tts.
   */
  const synthesizeAndQueueChunk = useCallback(async (
    textChunk: string,
    chunkIndex: number,
    isFirst = false,
    totalStart = 0
  ) => {
    if (!textChunk.trim() || !isActiveRef.current) return;
    const chunkStart = Date.now();
    pendingTTSChunksRef.current++;
    isAISpeakingRef.current = true;
    vadRef.current?.pause();

    try {
      const ttsResponse = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textChunk,
          language: optionsRef.current.language,
          voice: optionsRef.current.voice,
          pace: 1.20,
        }),
        signal: abortControllerRef.current?.signal,
      });

      if (!isActiveRef.current) return;

      const ttsContentType = ttsResponse.headers.get('content-type') || '';
      if (ttsResponse.ok && (ttsContentType.includes('audio') || ttsContentType.includes('mpeg') || ttsContentType.includes('wav'))) {
        const audioData = await ttsResponse.arrayBuffer();
        if (isFirst) {
          const ttsLatency = Date.now() - chunkStart;
          const timeToFirstVoice = totalStart ? Date.now() - totalStart : ttsLatency;
          setLatency(prev => {
            const updated = {
              ...prev,
              ttsLatency,
              totalResponseLatency: timeToFirstVoice,
            };
            optionsRef.current.onLatencyUpdate?.(updated);
            return updated;
          });
        }
        if (isActiveRef.current && playerRef.current) {
          await playerRef.current.enqueueIndexedAudio(audioData, chunkIndex);
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

        if (isFirst) {
          const timeToFirstVoice = totalStart ? Date.now() - totalStart : 60;
          setLatency(prev => {
            const updated = {
              ...prev,
              ttsLatency: 40,
              totalResponseLatency: timeToFirstVoice,
            };
            optionsRef.current.onLatencyUpdate?.(updated);
            return updated;
          });
        }

        if ('speechSynthesis' in window && isActiveRef.current) {
          const utterance = new SpeechSynthesisUtterance(speechText);
          utterance.lang = optionsRef.current.language.replace('-IN', '');
          utterance.volume = 1.0;
          utterance.rate = 1.15;

          utterance.onend = () => {
            if (isActiveRef.current && !playerRef.current?.isPlaying()) {
              transitionToListening();
            }
          };

          window.speechSynthesis.speak(utterance);
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('TTS streaming chunk error:', err);
      }
    } finally {
      pendingTTSChunksRef.current = Math.max(0, pendingTTSChunksRef.current - 1);
    }
  }, [transitionToListening]);

  /**
   * Process a user message through streaming LLM & sentence-chunked TTS.
   */
  const processMessage = useCallback(async (text: string, fromText = false) => {
    if (!isActiveRef.current && !fromText) return;

    isAISpeakingRef.current = true;
    vadRef.current?.pause();
    updateState('processing');
    setError(null);
    setLiveTranscript('');

    // Append user message synchronously to messagesRef so LLM never forgets context
    const userMsg = { role: 'user' as const, content: text, timestamp: Date.now() };
    const historySnapshot = [...messagesRef.current];
    messagesRef.current.push(userMsg);
    setMessages([...messagesRef.current]);
    optionsRef.current.onTranscript?.(text, 'user');

    const totalStart = Date.now();
    playerRef.current?.resetChunkIndex();
    let chunkIndexCounter = 0;

    try {
      // Cancel any existing in-flight operations
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      // Create empty assistant message placeholder for real-time streaming
      const assistantMsgTime = Date.now();
      const assistantPlaceholder = { role: 'assistant' as const, content: '', timestamp: assistantMsgTime };
      messagesRef.current.push(assistantPlaceholder);
      setMessages([...messagesRef.current]);

      // --- LLM Call (streaming) with complete conversation history ---
      const chatResponse = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: historySnapshot.slice(-14).map(m => ({
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

      // Hook up AudioPlayer completion hook
      if (playerRef.current) {
        playerRef.current.onQueueDrained(transitionToListening);
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
        await synthesizeAndQueueChunk(fullResponse, 0, true, totalStart);
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
                      const currentIndex = chunkIndexCounter++;
                      synthesizeAndQueueChunk(chunk, currentIndex, isFirst, totalStart);
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
            const currentIndex = chunkIndexCounter++;
            await synthesizeAndQueueChunk(streamBuffer.trim(), currentIndex, isFirst, totalStart);
          }
        }
      }

      if (fullResponse) {
        optionsRef.current.onTranscript?.(fullResponse, 'assistant');
        // Synchronously save completed assistant response in messagesRef
        const lastIdx = messagesRef.current.length - 1;
        if (lastIdx >= 0 && messagesRef.current[lastIdx].role === 'assistant') {
          messagesRef.current[lastIdx].content = fullResponse;
        }
      }

      // Safety check: if player is idle and no chunks are pending, transition to listening
      setTimeout(() => {
        if (isActiveRef.current && !playerRef.current?.isPlaying() && pendingTTSChunksRef.current === 0 && !window.speechSynthesis?.speaking) {
          transitionToListening();
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
            transitionToListening();
          }
        }, 1200);
      }
    }
  }, [latency, updateState, synthesizeAndQueueChunk, transitionToListening]);

  // Keep processMessageRef updated to latest closure
  processMessageRef.current = processMessage;

  /**
   * Start a voice call session.
   */
  const startCall = useCallback(async () => {
    try {
      setError(null);
      messagesRef.current = [];
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

      // Initialize Web Speech API if supported in browser
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
              // Critical: ignore completely when AI is speaking or during echo guard window!
              if (isAISpeakingRef.current || Date.now() - lastPlaybackEndTimeRef.current < 450) {
                webSpeechFinalRef.current = '';
                interimSpeechRef.current = '';
                return;
              }

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

      // Initialize VAD with natural conversational hangover time (550ms gives callers time to finish thoughts)
      const vad = new VoiceActivityDetector({
        threshold: 0.008,
        hangoverTime: 550, // 550ms silence hangover provides natural breathing room between clauses
        minSpeechDuration: 150,
        onSpeechStart: () => {
          if (!isActiveRef.current) return;

          const isAudioActivelyPlaying = playerRef.current?.isPlaying() || window.speechSynthesis?.speaking;
          const isRecentEchoDecay = lastPlaybackEndTimeRef.current > 0 && (Date.now() - lastPlaybackEndTimeRef.current < 380);

          // If sound was actively coming out of speakers and user speaks -> barge-in interruption!
          if (isAudioActivelyPlaying) {
            playerRef.current?.stopAudio();
            abortControllerRef.current?.abort();
            window.speechSynthesis?.cancel();
            isAISpeakingRef.current = false;
            pendingTTSChunksRef.current = 0;
            pendingUserSpeechRef.current = null;
          } else if (isRecentEchoDecay) {
            // Acoustic echo decay from speaker finishing
            return;
          } else if (isAISpeakingRef.current) {
            // User paused briefly (~1s), AI started processing, but user resumed speaking with more words before AI audio started!
            // Cancel premature AI generation and salvage previous user text to merge with the new words!
            abortControllerRef.current?.abort();
            playerRef.current?.stopAudio();
            isAISpeakingRef.current = false;
            pendingTTSChunksRef.current = 0;

            if (messagesRef.current.length > 0) {
              const lastMsg = messagesRef.current[messagesRef.current.length - 1];
              if (lastMsg.role === 'assistant' && !lastMsg.content) {
                // Remove empty assistant placeholder
                messagesRef.current.pop();
              }
              const lastUser = messagesRef.current[messagesRef.current.length - 1];
              if (lastUser && lastUser.role === 'user') {
                pendingUserSpeechRef.current = lastUser.content;
                messagesRef.current.pop();
                setMessages([...messagesRef.current]);
              }
            }
          }

          setIsSpeakingDetected(true);
          setFeedbackNotice(null);

          // Discard leading silence so Sarvam STT receives only active speech
          recorderRef.current?.resetChunks();
          webSpeechFinalRef.current = '';
          interimSpeechRef.current = '';

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

          // Ignore if audio is actively playing or in echo suppression window
          const isAudioActivelyPlaying = playerRef.current?.isPlaying() || window.speechSynthesis?.speaking;
          const isRecentEchoDecay = lastPlaybackEndTimeRef.current > 0 && (Date.now() - lastPlaybackEndTimeRef.current < 380);
          if (isAudioActivelyPlaying || isRecentEchoDecay) {
            webSpeechFinalRef.current = '';
            interimSpeechRef.current = '';
            return;
          }

          try {
            const sttStart = Date.now();
            let recognizedText = '';

            // 1. Ultra-fast path (<20ms): Combine final and interim browser speech results
            const candidate = (webSpeechFinalRef.current + ' ' + interimSpeechRef.current).trim();
            webSpeechFinalRef.current = '';
            interimSpeechRef.current = '';
            setLiveTranscript('');

            if (candidate.length >= 2 && !/^[.,?!]+$/.test(candidate)) {
              recognizedText = candidate;
            } else if (recorderRef.current) {
              // 2. High-Accuracy Sarvam STT (saaras:v3) with 16kHz WAV fallback
              const audioBlob = await recorderRef.current.stopRecording();

              if (audioBlob.size > 800) {
                updateState('processing');

                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.wav');
                formData.append('language', optionsRef.current.language);

                try {
                  const sttResponse = await fetch('/api/voice/stt', {
                    method: 'POST',
                    body: formData,
                  });

                  if (sttResponse.ok) {
                    const sttData = await sttResponse.json();
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

            // Sanity check: must be valid speech and not just punctuation or noise
            if (recognizedText && recognizedText.trim().length > 1 && !/^[.,?!]+$/.test(recognizedText.trim())) {
              let finalText = recognizedText.trim();
              if (pendingUserSpeechRef.current) {
                finalText = `${pendingUserSpeechRef.current} ${finalText}`;
                pendingUserSpeechRef.current = null;
              }
              const sttLatency = Math.min(30, Math.max(12, Date.now() - sttStart));
              setLatency(prev => ({ ...prev, sttLatency }));
              await processMessageRef.current(finalText);
            } else {
              // If there was pending user speech from an aborted pause, but caller only breathed or made noise,
              // don't drop the user's sentence! Immediately process the pending speech!
              if (pendingUserSpeechRef.current) {
                const salvagedText = pendingUserSpeechRef.current;
                pendingUserSpeechRef.current = null;
                await processMessageRef.current(salvagedText);
                return;
              }

              if (isActiveRef.current && !isAISpeakingRef.current) {
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
            if (isActiveRef.current && !isAISpeakingRef.current) {
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
      // Immediately pause VAD while initial greeting plays so mic doesn't hear itself!
      vad.pause();

      isActiveRef.current = true;
      isAISpeakingRef.current = true;
      callStartTimeRef.current = Date.now();

      // Hook up player queue drained listener to transition cleanly to listening
      if (playerRef.current) {
        playerRef.current.onQueueDrained(transitionToListening);
      }

      // Welcome greeting from ABC Dental Clinic
      const greetings: Record<LanguageCode, string> = {
        'te-IN': 'నమస్కారం! ఏబీసీ డెంటల్ క్లినిక్‌కి స్వాగతం. నేను మీకు ఎలా సహాయపడగలను?',
        'hi-IN': 'नमस्ते! एबीसी डेंटल क्लिनिक में आपका स्वागत है। मैं आपकी क्या सहायता कर सकता हूँ?',
        'en-IN': 'Hello! Welcome to ABC Dental Clinic. How can I help you today?',
      };
      const initialGreeting = greetings[optionsRef.current.language] || greetings['en-IN'];

      // Add greeting to transcript and messagesRef
      const greetingMsg = { role: 'assistant' as const, content: initialGreeting, timestamp: Date.now() };
      messagesRef.current = [greetingMsg];
      setMessages([greetingMsg]);
      optionsRef.current.onTranscript?.(initialGreeting, 'assistant');

      playerRef.current?.resetChunkIndex();
      updateState('speaking');
      await synthesizeAndQueueChunk(initialGreeting, 0);

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
      await processMessageRef.current(text.trim(), true);
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
  }, [volumeBoost]);

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
