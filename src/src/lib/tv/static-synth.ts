/**
 * Synthesized auditory television static.
 * Generates white noise procedurally from raw PCM audio buffers via the Web
 * Audio API — no network fetch, no looping artifacts.
 */

export class CathodeStaticSynthesizer {
  private audioContext: AudioContext | null = null;

  private initializeContext(): void {
    if (typeof window === 'undefined') return;
    if (!this.audioContext) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }
  }

  /** Must be invoked from within a user gesture handler at least once. */
  public unlock(): void {
    this.initializeContext();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
  }

  public triggerStaticBurst(durationSeconds: number = 0.35, gainLevel: number = 0.12): void {
    this.initializeContext();
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    // Allocate a 1-second mono PCM buffer sampled at native rate
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, sampleRate, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Populate buffer with uniform pseudo-random white noise
    for (let i = 0; i < sampleRate; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    const whiteNoiseSource = this.audioContext.createBufferSource();
    whiteNoiseSource.buffer = buffer;
    whiteNoiseSource.loop = true;

    const gainNode = this.audioContext.createGain();
    const now = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(gainLevel, now);

    // Exponential envelope decay prevents mechanical speaker pops
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    whiteNoiseSource.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    whiteNoiseSource.start(now);
    whiteNoiseSource.stop(now + durationSeconds);
  }
}

export const staticSynth = new CathodeStaticSynthesizer();
