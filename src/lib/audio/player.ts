// ============================================================
// Audio Player
// Plays audio through the Web Audio API.
// Supports immediate stop for barge-in/interruption.
// ============================================================

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private playing = false;
  private onEndCallback: (() => void) | null = null;

  /**
   * Initialize the AudioContext.
   * Must be called after a user gesture (click/tap).
   */
  initialize(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
  }

  /**
   * Resume AudioContext if it was suspended (browser autoplay policy).
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Play audio from an ArrayBuffer.
   * @param audioData - Raw audio data (WAV/MP3)
   * @param onEnd - Callback when playback finishes naturally
   */
  async playAudio(audioData: ArrayBuffer, onEnd?: () => void): Promise<void> {
    if (!this.audioContext) {
      this.initialize();
    }

    await this.resume();

    // Stop any currently playing audio
    this.stopAudio();

    try {
      const audioBuffer = await this.audioContext!.decodeAudioData(audioData.slice(0));
      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext!.destination);

      this.currentSource = source;
      this.playing = true;
      this.onEndCallback = onEnd || null;

      source.onended = () => {
        this.playing = false;
        this.currentSource = null;
        if (this.onEndCallback) {
          this.onEndCallback();
          this.onEndCallback = null;
        }
      };

      source.start(0);
    } catch (error) {
      console.error('Error playing audio:', error);
      this.playing = false;
      this.currentSource = null;
      throw error;
    }
  }

  /**
   * Immediately stop audio playback.
   * Used for barge-in / interruption.
   */
  stopAudio(): void {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null; // Prevent callback
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
   * Check if audio is currently playing.
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Get the AudioContext (useful for VAD integration).
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
  }
}
