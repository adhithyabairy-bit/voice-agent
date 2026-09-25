// ============================================================
// Low-Latency Audio Recorder with AudioWorklet
// Replaces deprecated ScriptProcessorNode with high-performance AudioWorklet
// Captures 16kHz 16-bit Mono PCM in real-time small frames (~32-64ms)
// Provides both streaming chunk emissions and fallback WAV blob export
// ============================================================

import { VOICE_CONFIG } from './config';

const WORKLET_PROCESSOR_CODE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 1024; // ~64ms frames at 16kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage({
          type: 'pcm_data',
          buffer: this.buffer.slice(0),
        });
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
`;

export type AudioChunkCallback = (pcm16: Int16Array, base64: string) => void;

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  private isRecordingState = false;
  private preSpeechBuffer: Float32Array[] = [];
  private recordedChunks: Float32Array[] = [];
  private maxPreSpeechChunks = 3; // ~150ms buffer to preserve speech onset consonants
  private onChunkCallback: AudioChunkCallback | null = null;

  // Fallback MediaRecorder
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
          channelCount: 1,
        },
      });

      await this.setupAudioWorkletCapture();
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
   * Set callback for streaming PCM audio chunks in real-time.
   */
  setOnChunkCallback(callback: AudioChunkCallback | null): void {
    this.onChunkCallback = callback;
  }

  /**
   * Set up AudioWorklet capture pipeline.
   */
  private async setupAudioWorkletCapture(): Promise<void> {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: VOICE_CONFIG.audio.sampleRate });

      // Create blob url for worklet code
      const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);

      await this.audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor');
      this.source = this.audioContext.createMediaStreamSource(this.stream!);

      this.workletNode.port.onmessage = (event) => {
        if (event.data?.type === 'pcm_data') {
          const rawBuffer: Float32Array = event.data.buffer;
          const copy = new Float32Array(rawBuffer);

          // Downsample if AudioContext sampleRate is not 16000
          const inputRate = this.audioContext?.sampleRate || 16000;
          const samples16k = inputRate === 16000 ? copy : this.downsample(copy, inputRate, 16000);

          // Convert Float32 (-1.0 to 1.0) to Int16 PCM
          const pcm16 = new Int16Array(samples16k.length);
          for (let i = 0; i < samples16k.length; i++) {
            const s = Math.max(-1, Math.min(1, samples16k[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }

          if (!this.isRecordingState) {
            this.preSpeechBuffer.push(samples16k);
            if (this.preSpeechBuffer.length > this.maxPreSpeechChunks) {
              this.preSpeechBuffer.shift();
            }
          } else {
            this.recordedChunks.push(samples16k);

            // Stream real-time chunk to listener
            if (this.onChunkCallback) {
              const base64 = this.pcm16ToBase64(pcm16);
              this.onChunkCallback(pcm16, base64);
            }
          }
        }
      };

      this.source.connect(this.workletNode);
      // Mute destination connection to keep worklet clock running without acoustic feedback
      const muteGain = this.audioContext.createGain();
      muteGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.workletNode.connect(muteGain);
      muteGain.connect(this.audioContext.destination);
    } catch (err) {
      console.warn('AudioWorklet setup failed, using MediaRecorder fallback:', err);
      this.setupMediaRecorderFallback();
    }
  }

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

  startRecording(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    this.isRecordingState = true;
    this.recordedChunks = [];

    // Emit buffered pre-speech chunks if callback registered
    if (this.onChunkCallback && this.preSpeechBuffer.length > 0) {
      for (const pre of this.preSpeechBuffer) {
        const pcm16 = new Int16Array(pre.length);
        for (let i = 0; i < pre.length; i++) {
          const s = Math.max(-1, Math.min(1, pre[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.onChunkCallback(pcm16, this.pcm16ToBase64(pcm16));
      }
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.mediaRecorderChunks = [];
      try {
        this.mediaRecorder.start(60);
      } catch {
        // Ignore
      }
    }
  }

  resetChunks(): void {
    this.recordedChunks = [];
  }

  async stopRecording(): Promise<Blob> {
    this.isRecordingState = false;

    if (this.audioContext && this.recordedChunks.length > 0) {
      const allChunks = [...this.preSpeechBuffer, ...this.recordedChunks];
      this.preSpeechBuffer = [];
      this.recordedChunks = [];

      let totalLength = 0;
      for (const chunk of allChunks) {
        totalLength += chunk.length;
      }

      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of allChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const inputRate = this.audioContext.sampleRate || 16000;
      const targetRate = 16000;
      const samples16k = inputRate === targetRate ? merged : this.downsample(merged, inputRate, targetRate);

      const wavBytes = this.encodeWAV(samples16k, targetRate);
      return new Blob([wavBytes], { type: 'audio/wav' });
    }

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

    return new Blob([], { type: 'audio/wav' });
  }

  private downsample(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (outputRate >= inputRate) return buffer;
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

  private pcm16ToBase64(pcm16: Int16Array): string {
    const bytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');

    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

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
    this.onChunkCallback = null;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
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
