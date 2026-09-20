'use client';

// ============================================================
// useVoiceAgent — Main orchestration hook for the voice pipeline
// Manages: mic → VAD → record → STT → LLM → TTS → playback
// Supports barge-in, interruption, and conversation memory.
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioRecorder } from '@/lib/audio/recorder';
import { AudioPlayer } from '@/lib/audio/player';
import { VoiceActivityDetector } from '@/lib/audio/vad';
import type { CallState, LanguageCode, LatencyMetrics, Message } from '@/types';

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
  volume: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
  latency: LatencyMetrics;
  conversationId: string | null;
  error: string | null;
  isDemo: boolean;
}

export function useVoiceAgent(options: VoiceAgentOptions): VoiceAgentReturn {
  const [callState, setCallState] = useState<CallState>('idle');
  const [volume, setVolume] = useState(0);
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

  // Refs for mutable state that shouldn't trigger re-renders
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const callStartTimeRef = useRef<number>(0);
  const isActiveRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    isActiveRef.current = false;
    abortControllerRef.current?.abort();
    vadRef.current?.destroy();
    recorderRef.current?.destroy();
    playerRef.current?.destroy();
    vadRef.current = null;
    recorderRef.current = null;
    playerRef.current = null;
  }, []);

  /**
   * Update call state and notify listener.
   */
  const updateState = useCallback((newState: CallState) => {
    setCallState(newState);
    optionsRef.current.onStateChange?.(newState);
  }, []);

  /**
   * Add a message to the conversation.
   */
  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const msg = { role, content, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    optionsRef.current.onTranscript?.(content, role);
  }, []);

  /**
   * Process a user message through the AI pipeline.
   */
  const processMessage = useCallback(async (text: string) => {
    if (!isActiveRef.current) return;

    updateState('processing');
    addMessage('user', text);

    const totalStart = Date.now();

    try {
      // Cancel any previous pending request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

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

      // Check if it's a demo JSON response (non-streaming)
      const contentType = chatResponse.headers.get('content-type') || '';
      let fullResponse = '';

      if (contentType.includes('application/json')) {
        const jsonData = await chatResponse.json();
        fullResponse = jsonData.content;
        if (jsonData.mode === 'demo') setIsDemo(true);
      } else {
        // Parse streaming NDJSON response
        const reader = chatResponse.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'content') {
                  fullResponse += parsed.content;
                } else if (parsed.type === 'latency') {
                  setLatency(prev => ({
                    ...prev,
                    llmFirstTokenLatency: parsed.firstTokenLatency,
                  }));
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }
      }

      if (!fullResponse || !isActiveRef.current) return;

      addMessage('assistant', fullResponse);

      // --- TTS Call ---
      updateState('speaking');
      const ttsStart = Date.now();

      const ttsResponse = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fullResponse,
          language: optionsRef.current.language,
          voice: optionsRef.current.voice,
        }),
        signal: abortControllerRef.current.signal,
      });

      const ttsLatency = Date.now() - ttsStart;
      const totalLatency = Date.now() - totalStart;

      setLatency(prev => ({
        ...prev,
        ttsLatency: ttsLatency,
        totalResponseLatency: totalLatency,
      }));
      optionsRef.current.onLatencyUpdate?.({
        ...latency,
        ttsLatency,
        totalResponseLatency: totalLatency,
      });

      if (!isActiveRef.current) return;

      // Check if TTS returned audio or demo JSON
      const ttsContentType = ttsResponse.headers.get('content-type') || '';

      if (ttsContentType.includes('audio')) {
        // Real audio — play it
        const audioData = await ttsResponse.arrayBuffer();
        
        // Pause VAD while speaking to prevent self-listening
        vadRef.current?.pause();

        await playerRef.current?.playAudio(audioData, () => {
          // Audio finished playing — resume listening
          if (isActiveRef.current) {
            vadRef.current?.resume();
            updateState('listening');
          }
        });
      } else {
        // Demo mode — use browser SpeechSynthesis
        const demoData = await ttsResponse.json();
        setIsDemo(true);

        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(demoData.text || fullResponse);
          utterance.lang = optionsRef.current.language.replace('-IN', '');
          utterance.rate = 1.0;

          utterance.onend = () => {
            if (isActiveRef.current) {
              vadRef.current?.resume();
              updateState('listening');
            }
          };

          vadRef.current?.pause();
          speechSynthesis.speak(utterance);
        } else {
          // No TTS at all — just return to listening after a brief pause
          setTimeout(() => {
            if (isActiveRef.current) {
              vadRef.current?.resume();
              updateState('listening');
            }
          }, 1000);
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return; // Expected on interruption
      const errorMsg = (err as Error).message || 'An error occurred';
      console.error('Voice pipeline error:', errorMsg);
      setError(errorMsg);
      optionsRef.current.onError?.(errorMsg);

      // Try to recover
      if (isActiveRef.current) {
        setTimeout(() => {
          if (isActiveRef.current) {
            updateState('listening');
            vadRef.current?.resume();
          }
        }, 2000);
      }
    }
  }, [messages, latency, updateState, addMessage]);

  /**
   * Start a voice call session.
   */
  const startCall = useCallback(async () => {
    try {
      setError(null);
      setMessages([]);
      updateState('connecting');

      // Initialize audio components
      const recorder = new AudioRecorder();
      const player = new AudioPlayer();

      recorderRef.current = recorder;
      playerRef.current = player;

      // Request mic permission and get stream
      const stream = await recorder.initialize();
      player.initialize();

      // Create conversation session
      try {
        const sessionResp = await fetch('/api/voice/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: options.language,
          }),
        });
        const sessionData = await sessionResp.json();
        setConversationId(sessionData.conversationId);
      } catch {
        setConversationId(`local-${Date.now()}`);
      }

      // Initialize VAD
      const vad = new VoiceActivityDetector({
        threshold: 0.015,
        hangoverTime: 800,
        minSpeechDuration: 300,
        onSpeechStart: () => {
          if (!isActiveRef.current) return;

          // BARGE-IN: If AI is speaking, interrupt it
          if (playerRef.current?.isPlaying()) {
            playerRef.current.stopAudio();
            abortControllerRef.current?.abort();
            speechSynthesis?.cancel(); // Cancel browser TTS too
          }

          // Start recording
          recorderRef.current?.startRecording();
          updateState('listening');
        },
        onSpeechEnd: async () => {
          if (!isActiveRef.current || !recorderRef.current?.isRecording()) return;

          try {
            // Stop recording and get audio blob
            const audioBlob = await recorderRef.current.stopRecording();

            updateState('processing');

            // Send to STT
            const sttStart = Date.now();
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            formData.append('language', optionsRef.current.language);

            const sttResponse = await fetch('/api/voice/stt', {
              method: 'POST',
              body: formData,
            });

            const sttData = await sttResponse.json();
            const sttLatency = Date.now() - sttStart;

            setLatency(prev => ({ ...prev, sttLatency }));

            if (sttData.transcript && sttData.transcript.trim()) {
              // Process the transcribed message
              await processMessage(sttData.transcript);
            } else {
              // No speech detected
              if (isActiveRef.current) {
                updateState('listening');
              }
            }
          } catch (err: unknown) {
            console.error('Recording processing error:', err);
            if (isActiveRef.current) {
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

      isActiveRef.current = true;
      callStartTimeRef.current = Date.now();
      updateState('listening');

      // Check if we're in demo mode
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
  }, [options.language, updateState, processMessage]);

  /**
   * End the voice call.
   */
  const endCall = useCallback(async () => {
    isActiveRef.current = false;
    updateState('ended');

    // Stop all audio
    playerRef.current?.stopAudio();
    speechSynthesis?.cancel();
    abortControllerRef.current?.abort();

    // Stop recording if active
    if (recorderRef.current?.isRecording()) {
      try {
        await recorderRef.current.stopRecording();
      } catch {
        // Ignore
      }
    }

    // Generate summary
    if (conversationId && messages.length > 0) {
      try {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            language: options.language,
            startTime: callStartTimeRef.current,
          }),
        });
      } catch {
        // Non-critical
      }
    }

    cleanup();
  }, [conversationId, messages, options.language, updateState, cleanup]);

  /**
   * Send a text message (fallback when voice is unavailable).
   */
  const sendTextMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    await processMessage(text.trim());
  }, [processMessage]);

  return {
    callState,
    startCall,
    endCall,
    sendTextMessage,
    volume,
    messages,
    latency,
    conversationId,
    error,
    isDemo,
  };
}
