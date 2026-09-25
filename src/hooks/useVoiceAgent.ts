'use client';

// ============================================================
// useVoiceAgent — Voice Pipeline Orchestration Hook
// Modular architecture coordinating:
// - AudioWorklet 16kHz PCM capture (AudioRecorder)
// - Fast VAD (200ms hangover, 80ms min speech)
// - True Streaming AudioPlayer with sample-accurate gapless playback
// - Persistent Realtime WebSocket Engine with seamless HTTP fallback
// - Turn & Barge-In coordination with strict race condition prevention
// - Real un-clamped latency measurement & session benchmark tracking
// - Throttled React state updates for optimal UI performance
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioRecorder } from '@/lib/voice/audio-recorder';
import { StreamingAudioPlayer } from '@/lib/voice/audio-player';
import { VoiceActivityDetector } from '@/lib/voice/vad';
import { TurnCoordinator } from '@/lib/voice/interruption';
import { VoiceBenchmarkTracker } from '@/lib/voice/latency';
import { RealtimeVoiceEngine } from '@/lib/voice/realtime-engine';
import { LegacyVoiceEngine } from '@/lib/voice/legacy-engine';
import { buildVoiceSessionContext } from '@/lib/voice/session';
import { VOICE_CONFIG } from '@/lib/voice/config';
import { authFetch } from '@/lib/api/auth-fetch';
import type { CallState, LanguageCode, LatencyMetrics, BusinessContext, AgentPersonality } from '@/types';
import type { TurnLatencyMetrics, BenchmarkStats, VoiceSessionContext } from '@/lib/voice/types';

export interface VoiceAgentOptions {
  language: LanguageCode;
  voice: string;
  personality: AgentPersonality;
  businessId?: string;
  businessName?: string;
  greeting?: string;
  businessContext?: BusinessContext;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onStateChange?: (state: CallState) => void;
  onError?: (error: string) => void;
  onVolumeChange?: (volume: number) => void;
  onLatencyUpdate?: (metrics: LatencyMetrics) => void;
}

export interface VoiceAgentReturn {
  callState: CallState;
  volume: number;
  isSpeakingDetected: boolean;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
  latency: LatencyMetrics;
  conversationId: string | null;
  error: string | null;
  isDemo: boolean;
  liveTranscript: string;
  feedbackNotice: string | null;
  volumeBoost: number;
  setVolumeBoost: (val: number) => void;
  startCall: () => Promise<void>;
  endCall: () => Promise<void>;
  interrupt: () => void;
  sendTextMessage: (text: string) => Promise<void>;
  stopSpeakingAndSend: () => void;
  callDuration: number;
  activeEngine: 'realtime' | 'legacy';
  latestTurnMetrics: TurnLatencyMetrics | null;
  benchmarkStats: BenchmarkStats;
  resetBenchmark: () => void;
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
  const [volumeBoost, setVolumeBoostState] = useState(1.0);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  // Development latency & benchmark metrics
  const [activeEngine, setActiveEngine] = useState<'realtime' | 'legacy'>('legacy');
  const [latestTurnMetrics, setLatestTurnMetrics] = useState<TurnLatencyMetrics | null>(null);
  const benchmarkTrackerRef = useRef<VoiceBenchmarkTracker>(null!);
  if (!benchmarkTrackerRef.current) {
    benchmarkTrackerRef.current = new VoiceBenchmarkTracker();
  }
  const [benchmarkStats, setBenchmarkStats] = useState<BenchmarkStats>(() =>
    new VoiceBenchmarkTracker().getStats()
  );

  // Call duration counter
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (['listening', 'speaking', 'processing'].includes(callState)) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callState]);

  // Synchronous references
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const messagesRef = useRef<Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>>([]);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<StreamingAudioPlayer | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const turnCoordinatorRef = useRef(new TurnCoordinator());
  const realtimeEngineRef = useRef<RealtimeVoiceEngine | null>(null);
  const legacyEngineRef = useRef<LegacyVoiceEngine | null>(null);

  const isActiveRef = useRef(false);
  const isAISpeakingRef = useRef(false);
  const lastPlaybackEndTimeRef = useRef<number>(0);
  const callStartTimeRef = useRef<number>(0);
  const hotContextRef = useRef<VoiceSessionContext | null>(null);

  // Throttled volume dispatch for React rendering performance
  const lastVolumeUpdateRef = useRef<number>(0);

  const setVolumeBoost = useCallback((vol: number) => {
    setVolumeBoostState(vol);
    playerRef.current?.setVolume(vol);
  }, []);

  const updateState = useCallback((newState: CallState) => {
    setCallState(newState);
    optionsRef.current.onStateChange?.(newState);
  }, []);

  const resetBenchmark = useCallback(() => {
    benchmarkTrackerRef.current.reset();
    setBenchmarkStats(benchmarkTrackerRef.current.getStats());
    setLatestTurnMetrics(null);
  }, []);

  /**
   * Transition cleanly to 'listening' state with optimized acoustic echo guard (60ms).
   */
  const transitionToListening = useCallback(() => {
    if (!isActiveRef.current) return;

    lastPlaybackEndTimeRef.current = Date.now();

    setTimeout(() => {
      if (!isActiveRef.current) return;
      if (
        playerRef.current?.isPlaying() ||
        legacyEngineRef.current?.hasPendingChunks() ||
        window.speechSynthesis?.speaking
      ) {
        return; // Audio still playing or pending
      }

      isAISpeakingRef.current = false;
      setLiveTranscript('');

      try {
        recorderRef.current?.resetChunks();
        recorderRef.current?.startRecording();
      } catch {
        // Ignore
      }

      vadRef.current?.resume();
      updateState('listening');
    }, VOICE_CONFIG.echoGuardMs);
  }, [updateState]);

  /**
   * Handle accurate turn latency metrics update
   */
  const handleTurnLatencyUpdate = useCallback((metrics: TurnLatencyMetrics) => {
    setLatestTurnMetrics(metrics);
    benchmarkTrackerRef.current.addTurn(metrics);
    setBenchmarkStats(benchmarkTrackerRef.current.getStats());

    // Update legacy compatibility latency metrics
    const updatedCompat: LatencyMetrics = {
      sttLatency: metrics.vadEndToSttFinal > 0 ? metrics.vadEndToSttFinal : null,
      llmFirstTokenLatency: metrics.timeToFirstToken > 0 ? metrics.timeToFirstToken : null,
      ttsLatency: metrics.timeToFirstTtsByte > 0 ? metrics.timeToFirstTtsByte : null,
      totalResponseLatency: metrics.timeToFirstAudio > 0 ? metrics.timeToFirstAudio : null,
    };
    setLatency(updatedCompat);
    optionsRef.current.onLatencyUpdate?.(updatedCompat);
  }, []);

  const cleanup = useCallback(() => {
    isActiveRef.current = false;
    isAISpeakingRef.current = false;

    turnCoordinatorRef.current.reset();
    realtimeEngineRef.current?.destroy();
    legacyEngineRef.current?.destroy();

    vadRef.current?.destroy();
    recorderRef.current?.destroy();
    playerRef.current?.destroy();

    vadRef.current = null;
    recorderRef.current = null;
    playerRef.current = null;
    realtimeEngineRef.current = null;
    legacyEngineRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  /**
   * Interrupt active assistant speech (Barge-In)
   */
  const interrupt = useCallback(() => {
    isAISpeakingRef.current = false;
    playerRef.current?.stopAudio();
    window.speechSynthesis?.cancel();

    turnCoordinatorRef.current.handleBargeIn();
    realtimeEngineRef.current?.interrupt();
    legacyEngineRef.current?.interrupt();

    benchmarkTrackerRef.current.recordInterruption();
    setBenchmarkStats(benchmarkTrackerRef.current.getStats());

    // Remove empty assistant placeholder if in-flight
    if (messagesRef.current.length > 0) {
      const lastMsg = messagesRef.current[messagesRef.current.length - 1];
      if (lastMsg.role === 'assistant' && !lastMsg.content) {
        messagesRef.current.pop();
        setMessages([...messagesRef.current]);
      }
    }
  }, []);

  /**
   * Start a live voice call session
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

      // 1. Initialize audio components
      const recorder = new AudioRecorder();
      const player = new StreamingAudioPlayer();
      player.setVolume(volumeBoost);

      recorderRef.current = recorder;
      playerRef.current = player;

      const stream = await recorder.initialize();
      player.initialize();

      // Hook up exact audio play start telemetry
      player.setOnAudioStart(() => {
        if (realtimeEngineRef.current?.isReady()) {
          realtimeEngineRef.current.recordAudioPlayStart();
        } else {
          legacyEngineRef.current?.recordAudioPlayStart();
        }
      });


      // 2. Preload & cache hot business session context (Section 15 & 17)
      if (optionsRef.current.businessContext) {
        hotContextRef.current = buildVoiceSessionContext(optionsRef.current.businessContext);
      }

      // 3. Register Conversation ID
      try {
        const sessionResp = await fetch('/api/voice/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: optionsRef.current.language }),
        });
        const sessionData = await sessionResp.json();
        setConversationId(sessionData.conversationId);
      } catch {
        setConversationId(`local-${Date.now()}`);
      }

      // 4. Try Persistent Realtime Engine (Section 8), fallback to LegacyEngine (Section 21)
      const realtimeEngine = new RealtimeVoiceEngine({
        language: optionsRef.current.language,
        voice: optionsRef.current.voice,
        personality: optionsRef.current.personality,
        sessionContext: hotContextRef.current || undefined,
        player,
        onPartialTranscript: (transcript) => {
          setLiveTranscript(transcript);
        },
        onFinalTranscript: (transcript) => {
          setLiveTranscript(transcript);
          const userMsg = { role: 'user' as const, content: transcript, timestamp: Date.now() };
          messagesRef.current.push(userMsg);
          // Add assistant response placeholder
          const assistantMsg = { role: 'assistant' as const, content: '', timestamp: Date.now() };
          messagesRef.current.push(assistantMsg);
          setMessages([...messagesRef.current]);
          optionsRef.current.onTranscript?.(transcript, 'user');
          isAISpeakingRef.current = true;
          vadRef.current?.pause();
          updateState('speaking');
        },
        onToken: (token) => {
          const lastIdx = messagesRef.current.length - 1;
          if (lastIdx >= 0 && messagesRef.current[lastIdx].role === 'assistant') {
            messagesRef.current[lastIdx].content += token;
          }
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + token,
              };
            }
            return updated;
          });
        },
        onTurnComplete: (fullResponse) => {
          const lastIdx = messagesRef.current.length - 1;
          if (lastIdx >= 0 && messagesRef.current[lastIdx].role === 'assistant') {
            messagesRef.current[lastIdx].content = fullResponse;
          }
          optionsRef.current.onTranscript?.(fullResponse, 'assistant');
        },
        onPlaybackComplete: transitionToListening,
        onLatencyUpdate: handleTurnLatencyUpdate,
        onError: (err) => {
          console.warn('Realtime engine warning, switching to fallback:', err.message);
        },
      });

      const legacyEngine = new LegacyVoiceEngine({
        language: optionsRef.current.language,
        voice: optionsRef.current.voice,
        personality: optionsRef.current.personality,
        businessId: optionsRef.current.businessId,
        businessContext: optionsRef.current.businessContext,
        sessionContext: hotContextRef.current || undefined,
        player,
        recorder,
        getHistory: () => {
          const all = messagesRef.current;
          const past = all.slice(0, Math.max(0, all.length - 2));
          return past
            .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
            .map((m) => ({ role: m.role, content: m.content }));
        },
        onPartialTranscript: (transcript) => setLiveTranscript(transcript),
        onFinalTranscript: (transcript) => {
          setLiveTranscript(transcript);
          const userMsg = { role: 'user' as const, content: transcript, timestamp: Date.now() };
          messagesRef.current.push(userMsg);
          const assistantMsg = { role: 'assistant' as const, content: '', timestamp: Date.now() };
          messagesRef.current.push(assistantMsg);
          setMessages([...messagesRef.current]);
          optionsRef.current.onTranscript?.(transcript, 'user');
          isAISpeakingRef.current = true;
          vadRef.current?.pause();
          updateState('speaking');
        },
        onToken: (token) => {
          const lastIdx = messagesRef.current.length - 1;
          if (lastIdx >= 0 && messagesRef.current[lastIdx].role === 'assistant') {
            messagesRef.current[lastIdx].content += token;
          }
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + token,
              };
            }
            return updated;
          });
        },
        onTurnComplete: (fullResponse) => {
          const lastIdx = messagesRef.current.length - 1;
          if (lastIdx >= 0 && messagesRef.current[lastIdx].role === 'assistant') {
            messagesRef.current[lastIdx].content = fullResponse;
          }
          optionsRef.current.onTranscript?.(fullResponse, 'assistant');
        },
        onPlaybackComplete: transitionToListening,
        onLatencyUpdate: handleTurnLatencyUpdate,
        onError: (err) => {
          console.error('Legacy engine error:', err.message);
          setError(err.message);
          optionsRef.current.onError?.(err.message);
        },
      });

      realtimeEngineRef.current = realtimeEngine;
      legacyEngineRef.current = legacyEngine;

      // Attempt WebSocket connection with quick 1.5s timeout
      try {
        await realtimeEngine.initialize();
        setActiveEngine('realtime');
      } catch {
        console.info('Persistent Realtime Voice Server not running, using high-speed HTTP runtime.');
        await legacyEngine.initialize();
        setActiveEngine('legacy');
      }

      // Stream mic PCM chunks to realtime engine when connected
      recorder.setOnChunkCallback((_pcm16, base64) => {
        if (realtimeEngineRef.current?.isReady()) {
          realtimeEngineRef.current.sendAudioChunk(base64);
        }
      });

      // 5. Initialize Low-Latency VAD (hangover: 200ms, minSpeech: 80ms)
      const vad = new VoiceActivityDetector({
        hangoverTime: VOICE_CONFIG.vad.hangoverTime,
        minSpeechDuration: VOICE_CONFIG.vad.minSpeechDuration,
        threshold: VOICE_CONFIG.vad.threshold,
        onSpeechStart: () => {
          if (!isActiveRef.current) return;

          const isAudioPlaying = playerRef.current?.isPlaying() || window.speechSynthesis?.speaking;
          const isEchoDecay =
            lastPlaybackEndTimeRef.current > 0 &&
            Date.now() - lastPlaybackEndTimeRef.current < VOICE_CONFIG.echoGuardMs;

          // Ignore background noise or room reverberation while assistant is generating/speaking
          if (isAISpeakingRef.current && !isAudioPlaying) {
            return;
          }

          // Barge-in: user spoke while audio was actively outputting
          if (isAudioPlaying) {
            interrupt();
          } else if (isEchoDecay) {
            return; // Discard speaker decay
          }

          const { turnId } = turnCoordinatorRef.current.startNewTurn();
          setIsSpeakingDetected(true);
          setFeedbackNotice(null);

          if (realtimeEngineRef.current?.isReady()) {
            realtimeEngineRef.current.startTurn(turnId);
          } else {
            legacyEngineRef.current?.startTurn(turnId);
          }

          recorderRef.current?.resetChunks();
          if (!recorderRef.current?.isRecording()) {
            recorderRef.current?.startRecording();
          }
          updateState('listening');
        },
        onSpeechEnd: async () => {
          setIsSpeakingDetected(false);
          if (!isActiveRef.current) return;

          const isAudioPlaying = playerRef.current?.isPlaying() || window.speechSynthesis?.speaking;
          const isEchoDecay =
            lastPlaybackEndTimeRef.current > 0 &&
            Date.now() - lastPlaybackEndTimeRef.current < VOICE_CONFIG.echoGuardMs;

          if (isAudioPlaying || isEchoDecay) return;

          const turnId = turnCoordinatorRef.current.getActiveTurnId();
          if (!turnId) return;

          isAISpeakingRef.current = true;
          vadRef.current?.pause();

          if (realtimeEngineRef.current?.isReady()) {
            realtimeEngineRef.current.endTurn(turnId);
          } else if (recorderRef.current) {
            updateState('processing');
            const blob = await recorderRef.current.stopRecording();
            await legacyEngineRef.current?.processSpeechEnd(blob);
          }
        },
        onVolumeChange: (vol) => {
          // Throttled volume updates to prevent React rerender storms
          const now = Date.now();
          if (now - lastVolumeUpdateRef.current > 40) {
            lastVolumeUpdateRef.current = now;
            setVolume(vol);
            optionsRef.current.onVolumeChange?.(vol);
          }
        },
      });

      vadRef.current = vad;
      vad.start(stream);
      vad.pause(); // Pause VAD while initial greeting plays

      isActiveRef.current = true;
      isAISpeakingRef.current = true;
      callStartTimeRef.current = Date.now();

      // 6. Initial greeting
      const bName = optionsRef.current.businessName || 'మా సంస్థ';
      const bNameHi = optionsRef.current.businessName || 'हमारी संस्था';
      const bNameEn = optionsRef.current.businessName || 'our office';
      const defaultGreetings: Record<LanguageCode, string> = {
        'te-IN': `నమస్కారం! ${bName}కి స్వాగతం. నేను మీకు ఎలా సహాయపడగలను?`,
        'hi-IN': `नमस्ते! ${bNameHi} में आपका स्वागत है। मैं आपकी क्या सहायता कर सकता हूँ?`,
        'en-IN': `Hello! Welcome to ${bNameEn}. How can I assist you today?`,
      };
      const initialGreeting =
        optionsRef.current.greeting ||
        defaultGreetings[optionsRef.current.language] ||
        defaultGreetings['en-IN'];

      const greetingMsg = { role: 'assistant' as const, content: initialGreeting, timestamp: Date.now() };
      messagesRef.current = [greetingMsg];
      setMessages([greetingMsg]);
      optionsRef.current.onTranscript?.(initialGreeting, 'assistant');

      // Play greeting
      try {
        const ttsResp = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: initialGreeting,
            language: optionsRef.current.language,
            voice: optionsRef.current.voice,
          }),
        });
        if (ttsResp.ok) {
          const audioData = await ttsResp.arrayBuffer();
          updateState('speaking');
          await player.playAudio(audioData, transitionToListening);
        } else {
          transitionToListening();
        }
      } catch {
        transitionToListening();
      }

      // Check demo status
      try {
        const agentResp = await fetch('/api/agent');
        const agentData = await agentResp.json();
        if (agentData.demo?.isDemo) setIsDemo(true);
      } catch {
        // Non-critical
      }
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || 'Failed to start call';
      setError(errorMsg);
      optionsRef.current.onError?.(errorMsg);
      updateState('error');
    }
  }, [updateState, volumeBoost, handleTurnLatencyUpdate, interrupt, transitionToListening]);

  /**
   * End the voice call session
   */
  const endCall = useCallback(async () => {
    isActiveRef.current = false;
    updateState('ended');
    setLiveTranscript('');
    setFeedbackNotice(null);

    interrupt();

    if (recorderRef.current?.isRecording()) {
      try {
        await recorderRef.current.stopRecording();
      } catch {
        // Ignore
      }
    }

    // Persist call log
    const allMsgs = messagesRef.current.length > 0 ? messagesRef.current : messages;
    if (allMsgs.length > 0) {
      try {
        await authFetch('/api/calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId: conversationId,
            businessId: optionsRef.current.businessId,
            messages: allMsgs
              .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
              .map((m) => ({ role: m.role, content: m.content })),
            language: optionsRef.current.language,
            startTime: callStartTimeRef.current,
          }),
        });
      } catch (err) {
        console.warn('Call logging error:', err);
      }
    }

    cleanup();
  }, [conversationId, messages, updateState, interrupt, cleanup]);

  /**
   * Keyboard text fallback message
   */
  const sendTextMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const wasActive = isActiveRef.current;
      isActiveRef.current = true;

      if (!playerRef.current) {
        const player = new StreamingAudioPlayer();
        player.setVolume(volumeBoost);
        player.initialize();
        player.onQueueDrained(transitionToListening);
        playerRef.current = player;
      }

      const { turnId } = turnCoordinatorRef.current.startNewTurn();

      if (realtimeEngineRef.current?.isReady()) {
        realtimeEngineRef.current.sendTextInput(turnId, text);
      } else {
        updateState('processing');
        legacyEngineRef.current?.startTurn(turnId);
        await legacyEngineRef.current?.processSpeechEnd(undefined, text);
      }

      if (!wasActive) {
        // Keep active
      }
    },
    [volumeBoost, updateState, transitionToListening]
  );

  const stopSpeakingAndSend = useCallback(() => {
    vadRef.current?.forceSpeechEnd();
  }, []);

  return {
    callState,
    volume,
    isSpeakingDetected,
    messages,
    latency,
    conversationId,
    error,
    isDemo,
    liveTranscript,
    feedbackNotice,
    volumeBoost,
    setVolumeBoost,
    startCall,
    endCall,
    interrupt,
    sendTextMessage,
    stopSpeakingAndSend,
    callDuration,
    activeEngine,
    latestTurnMetrics,
    benchmarkStats,
    resetBenchmark,
  };
}
