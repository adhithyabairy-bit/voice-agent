// ============================================================
// Low-Latency Voice Activity Detection (VAD)
// Optimized for conversational turn-taking:
// - Default hangoverTime: 200ms (tuned to 180-220ms range)
// - Default minSpeechDuration: 80ms
// - Configurable dynamic noise floor calibration
// ============================================================

import { VOICE_CONFIG } from './config';

export interface VADOptions {
  /** RMS threshold for speech detection (0-1, default 0.007) */
  threshold?: number;
  /** Hangover time in ms before declaring speech end (default 200ms) */
  hangoverTime?: number;
  /** Minimum speech duration in ms to be considered valid (default 80ms) */
  minSpeechDuration?: number;
  /** Callback when speech starts */
  onSpeechStart?: () => void;
  /** Callback when speech ends */
  onSpeechEnd?: () => void;
  /** Callback with current normalized volume level (0-1) */
  onVolumeChange?: (volume: number) => void;
}

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animationFrame: number | null = null;
  private isSpeaking = false;
  private speechStartTime = 0;
  private silenceStartTime = 0;
  private active = false;

  private ambientBaseline = 0.005;
  private calibrationFrames = 0;
  private options: Required<VADOptions>;

  constructor(options?: VADOptions) {
    this.options = {
      threshold: options?.threshold ?? VOICE_CONFIG.vad.threshold,
      hangoverTime: options?.hangoverTime ?? VOICE_CONFIG.vad.hangoverTime,
      minSpeechDuration: options?.minSpeechDuration ?? VOICE_CONFIG.vad.minSpeechDuration,
      onSpeechStart: options?.onSpeechStart ?? (() => {}),
      onSpeechEnd: options?.onSpeechEnd ?? (() => {}),
      onVolumeChange: options?.onVolumeChange ?? (() => {}),
    };
  }

  /**
   * Start VAD analysis on a MediaStream.
   */
  start(stream: MediaStream, existingContext?: AudioContext): void {
    if (existingContext) {
      this.audioContext = existingContext;
    } else {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.25;

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.sourceNode.connect(this.analyser);

    this.active = true;
    this.calibrationFrames = 0;
    this.ambientBaseline = 0.005;
    this.analyze();
  }

  /**
   * Main analysis loop — runs every animation frame.
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

    // Adaptive threshold floor
    const effectiveThreshold = Math.max(
      0.005,
      Math.max(this.options.threshold, this.ambientBaseline * 1.4)
    );

    // Normalized volume (0-1)
    const normalizedVolume = Math.min(1, rms * 6);
    this.options.onVolumeChange(normalizedVolume);

    const now = Date.now();

    if (rms > effectiveThreshold) {
      this.silenceStartTime = 0;
      if (!this.isSpeaking) {
        this.speechStartTime = now;
        this.isSpeaking = true;
        this.options.onSpeechStart();
      }
    } else {
      if (this.isSpeaking) {
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = now;
        }

        const silenceDuration = now - this.silenceStartTime;
        const speechDuration = this.silenceStartTime - this.speechStartTime;

        if (silenceDuration >= this.options.hangoverTime) {
          if (speechDuration >= this.options.minSpeechDuration) {
            this.options.onSpeechEnd();
          }
          this.isSpeaking = false;
          this.silenceStartTime = 0;
        }
      }
    }

    this.animationFrame = requestAnimationFrame(this.analyze);
  };

  forceSpeechEnd(): void {
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.silenceStartTime = 0;
      this.options.onSpeechEnd();
    }
  }

  setThreshold(threshold: number): void {
    this.options.threshold = threshold;
  }

  setHangoverTime(hangoverMs: number): void {
    this.options.hangoverTime = hangoverMs;
  }

  isSpeechDetected(): boolean {
    return this.isSpeaking;
  }

  pause(): void {
    this.active = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  resume(): void {
    if (!this.active) {
      this.active = true;
      this.silenceStartTime = 0;
      this.analyze();
    }
  }

  destroy(): void {
    this.active = false;
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
