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

    // Stop any existing recorder instance cleanly
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignore
      }
    }

    this.audioChunks = [];

    // Detect best supported mime type
    let mimeType = '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/aac',
    ];

    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        mimeType = t;
        break;
      }
    }

    const options: MediaRecorderOptions = {
      audioBitsPerSecond: 64000,
    };
    if (mimeType) {
      options.mimeType = mimeType;
    }

    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Emit data every 200ms
    this.mediaRecorder.start(200);
  }

  /**
   * Stop recording and return the recorded audio blob.
   */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        // If inactive but we have chunks, resolve with what we have
        if (this.audioChunks.length > 0) {
          const blob = new Blob(this.audioChunks, {
            type: this.mediaRecorder?.mimeType || 'audio/webm',
          });
          this.audioChunks = [];
          resolve(blob);
          return;
        }
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

      // Request any buffered data before stopping
      try {
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
      } catch {
        // Ignore
      }

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
