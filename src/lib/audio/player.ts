// ============================================================
// Audio Player
// Plays audio through the Web Audio API with strict sequential indexing
// and sample-accurate gapless buffer scheduling.
// Features:
// - Seamless gapless playback between chunks (no artificial breathing pauses)
// - Guaranteed in-order indexed streaming playback (no line jumping)
// - GainNode baseline (1.0x natural warmth)
// - Transparent soft limiter to prevent clipping
// - Instant stop for barge-in / interruption
// ============================================================

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private playing = false;
  private onEndCallback: (() => void) | null = null;
  private volumeMultiplier = 1.0; // Clean 100% baseline for warm, natural, unclipped vocal realism

  // Gapless scheduling & streaming queue
  private queue: AudioBuffer[] = [];
  private nextScheduledTime = 0;
  private onQueueDrainedCallback: (() => void) | null = null;
  private expectedChunkIndex = 0;
  private pendingIndexedChunks = new Map<number, AudioBuffer>();

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
   * Reset the chunk index counter for a new assistant turn.
   */
  resetChunkIndex(): void {
    this.expectedChunkIndex = 0;
    this.pendingIndexedChunks.clear();
  }

  /**
   * Enqueue an audio chunk with its sequential chunk index.
   * Pre-decodes into AudioBuffer and schedules gapless playback in exact sequence.
   */
  async enqueueIndexedAudio(audioData: ArrayBuffer, chunkIndex: number): Promise<void> {
    this.initialize();
    await this.resume();

    try {
      const audioBuffer = await this.audioContext!.decodeAudioData(audioData.slice(0));
      this.pendingIndexedChunks.set(chunkIndex, audioBuffer);

      // Drain all consecutive ready chunks into playback queue in exact sequence
      while (this.pendingIndexedChunks.has(this.expectedChunkIndex)) {
        const readyChunk = this.pendingIndexedChunks.get(this.expectedChunkIndex)!;
        this.pendingIndexedChunks.delete(this.expectedChunkIndex);
        this.queue.push(readyChunk);
        this.expectedChunkIndex++;
      }

      this.schedulePlayback();
    } catch (err) {
      console.warn('Audio decode error on indexed chunk:', err);
    }
  }

  /**
   * Enqueue an audio chunk for streaming playback (unindexed fallback).
   */
  async enqueueAudio(audioData: ArrayBuffer): Promise<void> {
    this.initialize();
    await this.resume();

    try {
      const audioBuffer = await this.audioContext!.decodeAudioData(audioData.slice(0));
      this.queue.push(audioBuffer);
      this.schedulePlayback();
    } catch (err) {
      console.warn('Audio decode error on raw chunk:', err);
    }
  }

  /**
   * Register a callback for when all queued chunks finish playing.
   */
  onQueueDrained(callback: () => void): void {
    this.onQueueDrainedCallback = callback;
  }

  /**
   * Schedule all queued chunks with sample-accurate Web Audio timing.
   * Chunks play seamlessly back-to-back with 0ms gap.
   */
  private schedulePlayback(): void {
    if (!this.audioContext) return;

    while (this.queue.length > 0) {
      const audioBuffer = this.queue.shift()!;
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;

      if (this.gainNode) {
        source.connect(this.gainNode);
      } else {
        source.connect(this.audioContext.destination);
      }

      const now = this.audioContext.currentTime;
      // Start at next scheduled time or right now (with 10ms lookahead for clean start)
      const startTime = Math.max(now + 0.01, this.nextScheduledTime);
      source.start(startTime);
      this.nextScheduledTime = startTime + audioBuffer.duration;
      this.playing = true;
      this.activeSources.push(source);

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }

        // If all scheduled sources and queues have drained, notify listener
        if (this.activeSources.length === 0 && this.queue.length === 0 && this.pendingIndexedChunks.size === 0) {
          this.playing = false;
          this.nextScheduledTime = 0;
          if (this.onQueueDrainedCallback) {
            const cb = this.onQueueDrainedCallback;
            this.onQueueDrainedCallback = null;
            cb();
          }
        }
      };
    }
  }

  /**
   * Play standalone audio from an ArrayBuffer (clears existing queue).
   */
  async playAudio(audioData: ArrayBuffer, onEnd?: () => void): Promise<void> {
    this.stopAudio();
    this.initialize();
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

      this.playing = true;
      this.activeSources.push(source);

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) this.activeSources.splice(idx, 1);
        this.playing = false;
        onEnd?.();
      };

      source.start(0);
    } catch (error) {
      this.playing = false;
      throw error;
    }
  }

  /**
   * Immediately stop audio playback and clear any pending queue.
   * Used for barge-in / interruption.
   */
  stopAudio(): void {
    for (const s of this.activeSources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        // Already stopped
      }
    }
    this.activeSources = [];
    this.expectedChunkIndex = 0;
    this.pendingIndexedChunks.clear();
    this.queue = [];
    this.nextScheduledTime = 0;
    this.playing = false;
    this.onQueueDrainedCallback = null;
    this.onEndCallback = null;
  }

  /**
   * Check if audio is currently playing or queued.
   */
  isPlaying(): boolean {
    return this.playing || this.activeSources.length > 0 || this.queue.length > 0 || this.pendingIndexedChunks.size > 0;
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
