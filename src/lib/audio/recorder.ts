// ============================================================
// Audio Recorder
// Browser audio recording using MediaRecorder API.
// Records audio as WebM/Opus for efficient upload.
// ============================================================

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  /**
   * Request microphone permission and initialize the stream.
   * @returns The MediaStream (useful for VAD/visualization)
   */
  async initialize(): Promise<MediaStream> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });
      return this.stream;
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === 'NotAllowedError') {
        throw new Error('Microphone access was denied. Please allow microphone access to use the voice agent.');
      }
      if (err.name === 'NotFoundError') {
        throw new Error('No microphone detected. Please connect a microphone and try again.');
      }
      throw new Error(`Microphone error: ${err.message}`);
    }
  }

  /**
   * Start recording audio.
   */
  startRecording(): void {
    if (!this.stream) {
      throw new Error('Recorder not initialized. Call initialize() first.');
    }

    this.audioChunks = [];

    // Use webm/opus if available, fall back to webm
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 32000,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Record in 250ms chunks for faster availability
    this.mediaRecorder.start(250);
  }

  /**
   * Stop recording and return the recorded audio blob.
   */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('Recorder is not active'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm',
        });
        this.audioChunks = [];
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Check if currently recording.
   */
  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /**
   * Get the underlying MediaStream (for VAD/visualization).
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Release all resources.
   */
  destroy(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}
