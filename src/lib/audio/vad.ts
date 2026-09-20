// ============================================================
// Voice Activity Detection (VAD)
// RMS energy-based speech detection using Web Audio API.
// Emits events for speech start/end with hangover time.
// ============================================================

export interface VADOptions {
  /** RMS threshold for speech detection (0-1, default 0.01) */
  threshold?: number;
  /** Hangover time in ms before declaring speech end (default 800ms) */
  hangoverTime?: number;
  /** Minimum speech duration in ms to be considered valid (default 200ms) */
  minSpeechDuration?: number;
  /** Callback when speech starts */
  onSpeechStart?: () => void;
  /** Callback when speech ends */
  onSpeechEnd?: () => void;
  /** Callback with current volume level (0-1) */
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
      threshold: options?.threshold ?? 0.007,
      hangoverTime: options?.hangoverTime ?? 650,
      minSpeechDuration: options?.minSpeechDuration ?? 120,
      onSpeechStart: options?.onSpeechStart ?? (() => {}),
      onSpeechEnd: options?.onSpeechEnd ?? (() => {}),
      onVolumeChange: options?.onVolumeChange ?? (() => {}),
    };
  }

  /**
   * Start VAD analysis on a MediaStream.
   */
  start(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.3;

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

    // Calculate RMS (Root Mean Square) volume
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    // Calibrate background noise level during first ~30 frames (~500ms)
    if (this.calibrationFrames < 30) {
      this.ambientBaseline = (this.ambientBaseline * this.calibrationFrames + rms) / (this.calibrationFrames + 1);
      this.calibrationFrames++;
    }

    // Dynamic threshold: at least 0.006, but adapts to room noise floor
    const effectiveThreshold = Math.max(
      0.006,
      Math.max(this.options.threshold, this.ambientBaseline * 1.5)
    );

    // Normalize to 0-1 range (RMS is typically 0-0.5 for speech)
    const normalizedVolume = Math.min(1, rms * 6);
    this.options.onVolumeChange(normalizedVolume);

    const now = Date.now();

    if (rms > effectiveThreshold) {
      // Sound detected
      this.silenceStartTime = 0;

      if (!this.isSpeaking) {
        this.speechStartTime = now;
        this.isSpeaking = true;
        this.options.onSpeechStart();
      }
    } else {
      // Silence detected
      if (this.isSpeaking) {
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = now;
        }

        // Check hangover time
        const silenceDuration = now - this.silenceStartTime;
        const speechDuration = this.silenceStartTime - this.speechStartTime;

        if (silenceDuration >= this.options.hangoverTime) {
          // Only emit speech end if speech was long enough
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

  /**
   * Force speech end immediately (for manual done-speaking button).
   */
  forceSpeechEnd(): void {
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.silenceStartTime = 0;
      this.options.onSpeechEnd();
    }
  }

  /**
   * Update the volume threshold dynamically.
   */
  setThreshold(threshold: number): void {
    this.options.threshold = threshold;
  }

  /**
   * Check if speech is currently detected.
   */
  isSpeechDetected(): boolean {
    return this.isSpeaking;
  }

  /**
   * Pause VAD analysis (keeps resources alive).
   */
  pause(): void {
    this.active = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Resume VAD analysis.
   */
  resume(): void {
    if (!this.active) {
      this.active = true;
      this.analyze();
    }
  }

  /**
   * Stop and release all resources.
   */
  destroy(): void {
    this.active = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.analyser = null;
    this.sourceNode = null;
    this.audioContext = null;
  }
}
