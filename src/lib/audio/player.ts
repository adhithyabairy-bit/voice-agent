// ============================================================
// Audio Player
// Plays audio through the Web Audio API.
// Features:
// - GainNode volume boost (up to 2.5x)
// - DynamicsCompressorNode to normalize speech & prevent clipping
// - Sequential AudioQueue for real-time streaming sentence playback
// - Instant stop for barge-in / interruption
// ============================================================

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private playing = false;
  private onEndCallback: (() => void) | null = null;
  private volumeMultiplier = 1.0; // Clean 100% baseline for warm, natural, unclipped vocal realism

  // Streaming audio chunk queue
  private queue: ArrayBuffer[] = [];
  private isProcessingQueue = false;
  private onQueueDrainedCallback: (() => void) | null = null;

  /**
   * Initialize the AudioContext and signal chain.
   * Must be called after a user gesture (click/tap).
   */
  initialize(): void {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }

    if (!this.compressor && this.audioContext) {
      // Gentle transparent safety limiter (prevents digital clipping without flattening vocal dynamics)
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-2.0, this.audioContext.currentTime);
      this.compressor.knee.setValueAtTime(12, this.audioContext.currentTime);
      this.compressor.ratio.setValueAtTime(2.0, this.audioContext.currentTime);
      this.compressor.attack.setValueAtTime(0.005, this.audioContext.currentTime);
      this.compressor.release.setValueAtTime(0.1, this.audioContext.currentTime);

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(this.volumeMultiplier, this.audioContext.currentTime);

      // Connect: Source -> GainNode -> Limiter -> Destination
      this.gainNode.connect(this.compressor);
      this.compressor.connect(this.audioContext.destination);
    }
  }

  /**
   * Resume AudioContext if suspended.
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Set volume multiplier (e.g. 1.0 = 100%, 2.0 = 200%).
   */
  setVolume(multiplier: number): void {
    this.volumeMultiplier = Math.max(0.2, Math.min(3.0, multiplier));
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(this.volumeMultiplier, this.audioContext.currentTime);
    }
  }

  getVolume(): number {
    return this.volumeMultiplier;
  }

  /**
   * Enqueue an audio chunk for streaming playback.
   * Chunks are played sequentially without gaps.
   */
  async enqueueAudio(audioData: ArrayBuffer): Promise<void> {
    this.initialize();
    await this.resume();

    this.queue.push(audioData);

    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Register a callback for when all queued chunks finish playing.
   */
  onQueueDrained(callback: () => void): void {
    this.onQueueDrainedCallback = callback;
  }

  /**
   * Process the next chunk in the queue.
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessingQueue = false;
      this.playing = false;
      if (this.onQueueDrainedCallback) {
        const cb = this.onQueueDrainedCallback;
        this.onQueueDrainedCallback = null;
        cb();
      }
      return;
    }

    this.isProcessingQueue = true;
    const nextChunk = this.queue.shift();
    if (!nextChunk) {
      this.processQueue();
      return;
    }

    try {
      await this.playSingleBuffer(nextChunk, () => {
        this.processQueue();
      });
    } catch (err) {
      console.warn('Queue chunk playback error, continuing to next chunk:', err);
      this.processQueue();
    }
  }

  /**
   * Internal helper to play a single ArrayBuffer.
   */
  private async playSingleBuffer(audioData: ArrayBuffer, onEnd?: () => void): Promise<void> {
    if (!this.audioContext) {
      this.initialize();
    }
    await this.resume();

    try {
      const audioBuffer = await this.audioContext!.decodeAudioData(audioData.slice(0));
      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;

      if (this.gainNode) {
        source.connect(this.gainNode);
      } else {
        source.connect(this.audioContext!.destination);
      }

      this.currentSource = source;
      this.playing = true;
      this.onEndCallback = onEnd || null;

      source.onended = () => {
        this.playing = false;
        this.currentSource = null;
        if (this.onEndCallback) {
          const cb = this.onEndCallback;
          this.onEndCallback = null;
          cb();
        }
      };

      source.start(0);
    } catch (error) {
      this.playing = false;
      this.currentSource = null;
      throw error;
    }
  }

  /**
   * Play standalone audio from an ArrayBuffer (clears existing queue).
   */
  async playAudio(audioData: ArrayBuffer, onEnd?: () => void): Promise<void> {
    this.stopAudio();
    return this.playSingleBuffer(audioData, onEnd);
  }

  /**
   * Immediately stop audio playback and clear any pending queue.
   * Used for barge-in / interruption.
   */
  stopAudio(): void {
    this.queue = [];
    this.isProcessingQueue = false;
    this.onQueueDrainedCallback = null;

    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
      } catch {
        // Already stopped
      }
      this.currentSource = null;
    }
    this.playing = false;
    this.onEndCallback = null;
  }

  /**
   * Check if audio is currently playing or queued.
   */
  isPlaying(): boolean {
    return this.playing || this.isProcessingQueue || this.queue.length > 0;
  }

  /**
   * Get the AudioContext.
   */
  getContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Release all resources.
   */
  destroy(): void {
    this.stopAudio();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.gainNode = null;
    this.compressor = null;
  }
}
