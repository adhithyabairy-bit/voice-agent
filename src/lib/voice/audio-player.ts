// ============================================================
// True Streaming Audio Player
// Gapless Web Audio playback with sample-accurate scheduling.
// Supports indexed chunk reordering, zero-delay startup,
// instant barge-in cancellation, and exact playback start telemetry.
// ============================================================

import type { StreamingAudioPlayerInterface } from './types';

export class StreamingAudioPlayer implements StreamingAudioPlayerInterface {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private playing = false;
  private volumeMultiplier = 1.0;

  // Queue & sequence management
  private queue: AudioBuffer[] = [];
  private nextScheduledTime = 0;
  private queueDrainedCallbacks: Set<() => void> = new Set();
  private onAudioStartCallback: (() => void) | null = null;
  private expectedChunkIndex = 0;
  private pendingIndexedChunks = new Map<number, AudioBuffer>();
  private hasReportedFirstAudioInTurn = false;

  initialize(): void {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }

    if (!this.compressor && this.audioContext) {
      // Gentle transparent safety limiter
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-2.0, this.audioContext.currentTime);
      this.compressor.knee.setValueAtTime(12, this.audioContext.currentTime);
      this.compressor.ratio.setValueAtTime(2.0, this.audioContext.currentTime);
      this.compressor.attack.setValueAtTime(0.005, this.audioContext.currentTime);
      this.compressor.release.setValueAtTime(0.1, this.audioContext.currentTime);

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(this.volumeMultiplier, this.audioContext.currentTime);

      // Chain: Source -> GainNode -> Compressor -> Destination
      this.gainNode.connect(this.compressor);
      this.compressor.connect(this.audioContext.destination);
    }
  }

  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  setVolume(multiplier: number): void {
    this.volumeMultiplier = Math.max(0.2, Math.min(3.0, multiplier));
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(this.volumeMultiplier, this.audioContext.currentTime);
    }
  }

  getVolume(): number {
    return this.volumeMultiplier;
  }

  resetChunkIndex(): void {
    this.expectedChunkIndex = 0;
    this.pendingIndexedChunks.clear();
    this.hasReportedFirstAudioInTurn = false;
  }

  setOnAudioStart(callback: () => void): void {
    this.onAudioStartCallback = callback;
  }

  async enqueueIndexedAudio(audioData: ArrayBuffer, chunkIndex: number): Promise<void> {
    this.initialize();
    await this.resume();

    try {
      const audioBuffer = await this.audioContext!.decodeAudioData(audioData.slice(0));
      this.pendingIndexedChunks.set(chunkIndex, audioBuffer);

      // Drain all contiguous ready chunks into the playback schedule
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

  onQueueDrained(callback: () => void): void {
    this.queueDrainedCallbacks.add(callback);
  }

  removeQueueDrained(callback: () => void): void {
    this.queueDrainedCallbacks.delete(callback);
  }

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
      // Start immediately with minimum 5ms buffer or at scheduled contiguous time
      const startTime = Math.max(now + 0.005, this.nextScheduledTime);
      source.start(startTime);
      this.nextScheduledTime = startTime + audioBuffer.duration;
      this.playing = true;
      this.activeSources.push(source);

      // Trigger first audio callback on start of new turn
      if (!this.hasReportedFirstAudioInTurn) {
        this.hasReportedFirstAudioInTurn = true;
        this.onAudioStartCallback?.();
      }

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }

        if (
          this.activeSources.length === 0 &&
          this.queue.length === 0 &&
          this.pendingIndexedChunks.size === 0
        ) {
          this.playing = false;
          this.nextScheduledTime = 0;
          for (const cb of this.queueDrainedCallbacks) {
            try {
              cb();
            } catch (drainErr) {
              console.warn('Queue drain callback error:', drainErr);
            }
          }
        }
      };
    }
  }

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

      if (!this.hasReportedFirstAudioInTurn) {
        this.hasReportedFirstAudioInTurn = true;
        this.onAudioStartCallback?.();
      }

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

  stopAudio(): void {
    for (const s of this.activeSources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        // Ignore
      }
    }
    this.activeSources = [];
    this.expectedChunkIndex = 0;
    this.pendingIndexedChunks.clear();
    this.queue = [];
    this.nextScheduledTime = 0;
    this.playing = false;
    this.hasReportedFirstAudioInTurn = false;
  }

  isPlaying(): boolean {
    return (
      this.playing ||
      this.activeSources.length > 0 ||
      this.queue.length > 0 ||
      this.pendingIndexedChunks.size > 0
    );
  }

  getContext(): AudioContext | null {
    return this.audioContext;
  }

  destroy(): void {
    this.queueDrainedCallbacks.clear();
    this.stopAudio();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.gainNode = null;
    this.compressor = null;
  }
}
