// ============================================================
// Audio Player
// Plays audio through the Web Audio API with strict sequential indexing.
// Features:
// - Guaranteed in-order indexed streaming playback (no line jumping)
// - GainNode baseline (1.0x natural warmth)
// - Transparent soft limiter to prevent clipping
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

  // Streaming audio chunk queue & indexing
  private queue: ArrayBuffer[] = [];
  private isProcessingQueue = false;
  private onQueueDrainedCallback: (() => void) | null = null;
  private expectedChunkIndex = 0;
  private pendingIndexedChunks = new Map<number, ArrayBuffer>();

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
   * Guarantees chunks are strictly played in chronological order (0, 1, 2, 3...)
   * even if async network requests resolve out of order.
   */
  async enqueueIndexedAudio(audioData: ArrayBuffer, chunkIndex: number): Promise<void> {
    this.initialize();
    await this.resume();

    this.pendingIndexedChunks.set(chunkIndex, audioData);

    // Drain all consecutive ready chunks into playback queue in exact sequence
    while (this.pendingIndexedChunks.has(this.expectedChunkIndex)) {
      const readyChunk = this.pendingIndexedChunks.get(this.expectedChunkIndex)!;
      this.pendingIndexedChunks.delete(this.expectedChunkIndex);
      this.queue.push(readyChunk);
      this.expectedChunkIndex++;
    }

    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Enqueue an audio chunk for streaming playback (unindexed fallback).
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
      // If there are still higher indexed chunks waiting for an earlier chunk to finish fetching, do not declare drained
      if (this.pendingIndexedChunks.size > 0) {
        return;
      }

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
    this.expectedChunkIndex = 0;
    this.pendingIndexedChunks.clear();
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
    return this.playing || this.isProcessingQueue || this.queue.length > 0 || this.pendingIndexedChunks.size > 0;
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
