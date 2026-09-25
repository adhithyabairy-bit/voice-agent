// ============================================================
// Low-Latency Voice Activity Detection (VAD)
// Optimized VAD State Machine for conversational turn-taking:
// IDLE -> SPEAKING -> POSSIBLE_END -> ENDED
// - Hangover time default: 120ms (tuned for sub-500ms TTFA without cutting speech)
// - Dynamic noise floor adaptation and short silence tolerance
// - State machine transitions and configurable thresholds
// ============================================================

import { VOICE_CONFIG } from './config';

export type VADState = 'IDLE' | 'SPEAKING' | 'POSSIBLE_END' | 'ENDED';

export interface VADConfig {
  silenceThreshold: number;
  minSpeechDurationMs: number;
  endSilenceMs: number;
  maxTurnDurationMs: number;
  preSpeechBufferMs: number;
}

export const DEFAULT_VAD_CONFIG: VADConfig = {
  silenceThreshold: VOICE_CONFIG.vad.threshold,
  minSpeechDurationMs: VOICE_CONFIG.vad.minSpeechDuration,
  endSilenceMs: VOICE_CONFIG.vad.hangoverTime, // ~120ms
  maxTurnDurationMs: 15000, // 15s max conversational turn safety cut
  preSpeechBufferMs: 150,
};

export interface VADOptions {
  /** RMS threshold for speech detection (0-1, default 0.007) */
  threshold?: number;
  /** Hangover time in ms before declaring speech end (default 120ms) */
  hangoverTime?: number;
  /** Minimum speech duration in ms to be considered valid (default 80ms) */
  minSpeechDuration?: number;
  /** Callback when speech starts */
  onSpeechStart?: () => void;
  /** Callback when speech ends */
  onSpeechEnd?: () => void;
  /** Callback with current normalized volume level (0-1) */
  onVolumeChange?: (volume: number) => void;
  /** Optional callback when VAD state transitions */
  onStateChange?: (state: VADState) => void;
}

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animationFrame: number | null = null;

  // FSM State: IDLE -> SPEAKING -> POSSIBLE_END -> ENDED
  private state: VADState = 'IDLE';
  private speechStartTime = 0;
  private silenceStartTime = 0;
  private active = false;

  private ambientBaseline = 0.005;
  private calibrationFrames = 0;
  private options: Required<Omit<VADOptions, 'onStateChange'>> & {
    onStateChange: (state: VADState) => void;
  };

  constructor(options?: VADOptions) {
    this.options = {
      threshold: options?.threshold ?? DEFAULT_VAD_CONFIG.silenceThreshold,
      hangoverTime: options?.hangoverTime ?? DEFAULT_VAD_CONFIG.endSilenceMs,
      minSpeechDuration: options?.minSpeechDuration ?? DEFAULT_VAD_CONFIG.minSpeechDurationMs,
      onSpeechStart: options?.onSpeechStart ?? (() => {}),
      onSpeechEnd: options?.onSpeechEnd ?? (() => {}),
      onVolumeChange: options?.onVolumeChange ?? (() => {}),
      onStateChange: options?.onStateChange ?? (() => {}),
    };
  }

  getState(): VADState {
    return this.state;
  }

  private transitionTo(newState: VADState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange(newState);
    }
  }

  /**
   * Start VAD analysis on a MediaStream.
   */
  start(stream: MediaStream, existingContext?: AudioContext): void {
    if (existingContext) {
      this.audioContext = existingContext;
    } else {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.25;

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.sourceNode.connect(this.analyser);

    this.active = true;
    this.transitionTo('IDLE');
    this.calibrationFrames = 0;
    this.ambientBaseline = 0.005;
    this.analyze();
  }

  /**
   * Main analysis loop with FSM state progression
   */
  private analyze = (): void => {
    if (!this.active || !this.analyser) return;

    const dataArray = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(dataArray);

    // Calculate RMS volume
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    // Dynamic calibration of room noise floor during first 25 frames (~400ms)
    if (this.calibrationFrames < 25) {
      this.ambientBaseline =
        (this.ambientBaseline * this.calibrationFrames + rms) / (this.calibrationFrames + 1);
      this.calibrationFrames++;
    }

    // Adaptive threshold floor with noise tolerance
    const effectiveThreshold = Math.max(
      0.005,
      Math.max(this.options.threshold, this.ambientBaseline * 1.35)
    );

    // Normalized volume (0-1)
    const normalizedVolume = Math.min(1, rms * 6);
    this.options.onVolumeChange(normalizedVolume);

    const now = Date.now();
    const isAboveThreshold = rms > effectiveThreshold;

    switch (this.state) {
      case 'IDLE':
        if (isAboveThreshold) {
          this.speechStartTime = now;
          this.silenceStartTime = 0;
          this.transitionTo('SPEAKING');
          this.options.onSpeechStart();
        }
        break;

      case 'SPEAKING':
        if (!isAboveThreshold) {
          this.silenceStartTime = now;
          this.transitionTo('POSSIBLE_END');
        } else {
          // Check safety max turn duration
          if (now - this.speechStartTime > DEFAULT_VAD_CONFIG.maxTurnDurationMs) {
            this.transitionTo('ENDED');
            this.options.onSpeechEnd();
            this.transitionTo('IDLE');
          }
        }
        break;

      case 'POSSIBLE_END':
        if (isAboveThreshold) {
          // Speech resumed within hangover window (natural conversational pause)
          this.silenceStartTime = 0;
          this.transitionTo('SPEAKING');
        } else {
          const silenceDuration = now - this.silenceStartTime;
          const speechDuration = this.silenceStartTime - this.speechStartTime;

          if (silenceDuration >= this.options.hangoverTime) {
            if (speechDuration >= this.options.minSpeechDuration) {
              this.transitionTo('ENDED');
              this.options.onSpeechEnd();
            }
            this.silenceStartTime = 0;
            this.transitionTo('IDLE');
          }
        }
        break;

      case 'ENDED':
        this.transitionTo('IDLE');
        break;
    }

    this.animationFrame = requestAnimationFrame(this.analyze);
  };

  forceSpeechEnd(): void {
    if (this.state === 'SPEAKING' || this.state === 'POSSIBLE_END') {
      this.transitionTo('ENDED');
      this.silenceStartTime = 0;
      this.options.onSpeechEnd();
      this.transitionTo('IDLE');
    }
  }

  setThreshold(threshold: number): void {
    this.options.threshold = threshold;
  }

  setHangoverTime(hangoverMs: number): void {
    this.options.hangoverTime = hangoverMs;
  }

  isSpeechDetected(): boolean {
    return this.state === 'SPEAKING' || this.state === 'POSSIBLE_END';
  }

  pause(): void {
    this.active = false;
    this.transitionTo('IDLE');
    this.silenceStartTime = 0;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  resume(): void {
    if (!this.active) {
      this.active = true;
      this.transitionTo('IDLE');
      this.silenceStartTime = 0;
      this.analyze();
    }
  }

  destroy(): void {
    this.active = false;
    this.transitionTo('IDLE');
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.analyser = null;
    this.audioContext = null;
  }
}
