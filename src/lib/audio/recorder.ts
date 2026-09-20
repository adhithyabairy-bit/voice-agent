// ============================================================
// Audio Recorder
// Captures audio directly via Web Audio API into 16kHz 16-bit Mono WAV.
// - 100% standard WAV format with proper RIFF header (ideal for Sarvam STT)
// - Rolling pre-speech buffer (~350ms) to capture speech onset consonants
// - Automatic downsampling to 16,000 Hz
// - Fallback to MediaRecorder if AudioContext is restricted
// ============================================================

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  private isRecordingState = false;
  private preSpeechBuffer: Float32Array[] = [];
  private recordedChunks: Float32Array[] = [];
  private maxPreSpeechChunks = 4; // ~350ms buffer at 4096 buffer size

  // MediaRecorder fallback
  private mediaRecorder: MediaRecorder | null = null;
  private mediaRecorderChunks: Blob[] = [];

  /**
   * Request microphone permission and initialize the stream.
   */
  async initialize(): Promise<MediaStream> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.setupWebAudioCapture();
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
   * Set up Web Audio PCM capture pipeline for 16kHz WAV encoding.
   */
  private setupWebAudioCapture(): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();

      // Use 4096 buffer size (~85ms chunks at 48kHz)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.source = this.audioContext.createMediaStreamSource(this.stream!);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(inputData);

        // Crucial: Zero out output buffer so mic is NEVER echoed to speakers
        for (let i = 0; i < e.outputBuffer.numberOfChannels; i++) {
          e.outputBuffer.getChannelData(i).fill(0);
        }

        if (!this.isRecordingState) {
          // Keep a rolling pre-speech buffer of the last ~350ms
          this.preSpeechBuffer.push(copy);
          if (this.preSpeechBuffer.length > this.maxPreSpeechChunks) {
            this.preSpeechBuffer.shift();
          }
        } else {
          // Actively recording user speech
          this.recordedChunks.push(copy);
        }
      };

      this.source.connect(this.processor);
      // Route through a zero-gain node to destination to keep processor active without audio leakage
      const muteGain = this.audioContext.createGain();
      muteGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.processor.connect(muteGain);
      muteGain.connect(this.audioContext.destination);
    } catch (err) {
      console.warn('Web Audio capture failed, falling back to MediaRecorder:', err);
      this.setupMediaRecorderFallback();
    }
  }

  /**
   * MediaRecorder fallback for browsers that restrict ScriptProcessor.
   */
  private setupMediaRecorderFallback(): void {
    if (!this.stream) return;
    try {
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      }

      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.mediaRecorderChunks.push(e.data);
        }
      };
    } catch {
      // Ignore
    }
  }

  /**
   * Start recording audio.
   */
  startRecording(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    this.isRecordingState = true;
    this.recordedChunks = [];

    // Fallback MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.mediaRecorderChunks = [];
      try {
        this.mediaRecorder.start(100);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Reset chunks (kept for backwards compatibility).
   */
  resetChunks(): void {
    this.recordedChunks = [];
  }

  /**
   * Stop recording and return a 16kHz 16-bit Mono WAV audio blob.
   */
  async stopRecording(): Promise<Blob> {
    this.isRecordingState = false;

    // Use Web Audio PCM WAV if chunks were captured
    if (this.audioContext && this.recordedChunks.length > 0) {
      const allChunks = [...this.preSpeechBuffer, ...this.recordedChunks];
      this.preSpeechBuffer = [];
      this.recordedChunks = [];

      // Calculate total sample length
      let totalLength = 0;
      for (const chunk of allChunks) {
        totalLength += chunk.length;
      }

      // Merge into single Float32Array
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of allChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Downsample to 16,000 Hz if necessary
      const inputSampleRate = this.audioContext.sampleRate || 48000;
      const targetSampleRate = 16000;
      const samples16k = this.downsample(merged, inputSampleRate, targetSampleRate);

      // Encode into WAV
      const wavBytes = this.encodeWAV(samples16k, targetSampleRate);
      return new Blob([wavBytes], { type: 'audio/wav' });
    }

    // Fallback to MediaRecorder if PCM not available
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      return new Promise((resolve) => {
        this.mediaRecorder!.onstop = () => {
          const blob = new Blob(this.mediaRecorderChunks, {
            type: this.mediaRecorder?.mimeType || 'audio/webm',
          });
          this.mediaRecorderChunks = [];
          resolve(blob);
        };
        this.mediaRecorder!.stop();
      });
    }

    // Return empty audio/wav if nothing recorded
    return new Blob([], { type: 'audio/wav' });
  }

  /**
   * Downsample audio buffer to 16,000 Hz.
   */
  private downsample(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (outputRate === inputRate || outputRate > inputRate) return buffer;
    const ratio = inputRate / outputRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const start = Math.round(i * ratio);
      const end = Math.round((i + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let j = start; j < end && j < buffer.length; j++) {
        sum += buffer[j];
        count++;
      }
      result[i] = count > 0 ? sum / count : 0;
    }
    return result;
  }

  /**
   * Encode 16-bit Mono PCM WAV buffer.
   */
  private encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');

    // "fmt " sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (1 = mono)
    view.setUint32(24, sampleRate, true); // SampleRate (16000)
    view.setUint32(28, sampleRate * 2, true); // ByteRate (16000 * 1 * 2)
    view.setUint16(32, 2, true); // BlockAlign (1 * 2)
    view.setUint16(34, 16, true); // BitsPerSample (16 bits)

    // "data" sub-chunk
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return buffer;
  }

  isRecording(): boolean {
    return this.isRecordingState;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  destroy(): void {
    this.isRecordingState = false;
    this.preSpeechBuffer = [];
    this.recordedChunks = [];

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignore
      }
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
