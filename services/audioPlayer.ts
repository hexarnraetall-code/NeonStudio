import { Note } from '../types';

export type InstrumentName = 
  | 'sine' | 'triangle' | 'square' | 'sawtooth' 
  | 'pluck' | 'pad' | 'bass' | 'cloud' | 'bell' | 'whisper' | 'piano';

interface InstrumentPreset {
  type: OscillatorType;
  attack: number;
  release: number;
  gainMultiplier: number;
  decay?: number;
  sustain?: number;
}

const INSTRUMENTS: Record<InstrumentName, InstrumentPreset> = {
  sine: { type: 'sine', attack: 0.1, release: 0.4, gainMultiplier: 0.25 },
  triangle: { type: 'triangle', attack: 0.15, release: 0.5, gainMultiplier: 0.2 },
  square: { type: 'square', attack: 0.01, release: 0.2, gainMultiplier: 0.08 },
  sawtooth: { type: 'sawtooth', attack: 0.01, release: 0.3, gainMultiplier: 0.08 },
  pluck: { type: 'sawtooth', attack: 0.002, release: 0.3, gainMultiplier: 0.15, decay: 0.1, sustain: 0.2 },
  pad: { type: 'triangle', attack: 1.5, release: 2.5, gainMultiplier: 0.18 },
  bass: { type: 'square', attack: 0.02, release: 0.4, gainMultiplier: 0.22 },
  cloud: { type: 'sine', attack: 2.5, release: 4.0, gainMultiplier: 0.15 },
  bell: { type: 'sine', attack: 0.002, release: 2.0, gainMultiplier: 0.1, decay: 0.05, sustain: 0.1 },
  whisper: { type: 'triangle', attack: 1.0, release: 2.0, gainMultiplier: 0.06 },
  piano: { type: 'triangle', attack: 0.005, release: 0.8, gainMultiplier: 0.3, decay: 0.2, sustain: 0.4 },
};

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private driveNode: WaveShaperNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private activeOscillators = new Map<number, { osc: OscillatorNode; gain: GainNode }>();
  private currentInstrument: InstrumentName = 'piano';
  private masterVolume = 0.7;
  private warmth = 0.6;
  private drive = 0.15;
  private isResuming = false;

  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume * 0.4;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(40, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      this.driveNode = this.ctx.createWaveShaper();
      this.driveNode.curve = this.makeDistortionCurve(this.drive);
      
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 200 + (this.warmth * 8000);

      this.driveNode.connect(this.filterNode);
      this.filterNode.connect(this.compressor);
      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended' && !this.isResuming) {
      this.isResuming = true;
      try {
        await this.ctx.resume();
      } finally {
        this.isResuming = false;
      }
    }
    return this.ctx;
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = amount * 100;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  public setInstrument(name: string) {
    if (name in INSTRUMENTS) this.currentInstrument = name as InstrumentName;
  }

  public setVolume(val: number) {
    this.masterVolume = Math.max(0, Math.min(100, val)) / 100;
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setTargetAtTime(this.masterVolume * 0.5, this.ctx.currentTime, 0.1);
      } catch (e) {}
    }
  }

  public setParams(warmth: number, drive: number) {
    this.warmth = warmth;
    this.drive = drive;
    if (this.filterNode && this.ctx) {
      try {
        this.filterNode.frequency.setTargetAtTime(200 + (warmth * 8000), this.ctx.currentTime, 0.1);
      } catch (e) {}
    }
    if (this.driveNode) {
      this.driveNode.curve = this.makeDistortionCurve(drive);
    }
  }

  public async playNote(note: Note) {
    let ctx: AudioContext;
    try {
      ctx = await this.ensureContext();
    } catch (e) {
      return;
    }

    this.stopNote(note.pitch);

    const preset = INSTRUMENTS[this.currentInstrument];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = preset.type;
    osc.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12);

    const now = ctx.currentTime;
    // Safety check for attack: don't let attack be longer than half the duration
    const actualAttack = Math.min(preset.attack, note.duration * 0.5);
    const targetGain = Math.max(0.001, (note.velocity / 127) * preset.gainMultiplier);
    const sustainGain = targetGain * (preset.sustain ?? 1.0);
    const decayTime = preset.decay ?? 0;

    try {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(targetGain, now + actualAttack);
      
      if (decayTime > 0) {
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainGain), now + actualAttack + decayTime);
      }

      const stopTime = now + Math.max(0.05, note.duration);
      gain.gain.setValueAtTime(sustainGain, stopTime);
      gain.gain.linearRampToValueAtTime(0, stopTime + preset.release);

      osc.connect(gain);
      if (this.driveNode) gain.connect(this.driveNode);

      osc.start(now);
      osc.stop(stopTime + preset.release + 0.1);

      this.activeOscillators.set(note.pitch, { osc, gain });
      
      osc.onended = () => {
        this.activeOscillators.delete(note.pitch);
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      // Catch invalid scheduling errors
      console.warn("Audio scheduling failed", e);
    }
  }

  public stopNote(pitch: number) {
    const data = this.activeOscillators.get(pitch);
    if (data && this.ctx) {
      const now = this.ctx.currentTime;
      try {
        data.gain.gain.cancelScheduledValues(now);
        data.gain.gain.linearRampToValueAtTime(0, now + 0.1);
        if (this.ctx.state !== 'closed') {
          data.osc.stop(now + 0.2);
        }
      } catch(e) {}
      this.activeOscillators.delete(pitch);
    }
  }

  public stopAll() {
    this.activeOscillators.forEach((_, p) => this.stopNote(p));
    this.activeOscillators.clear();
  }
}

export const audioPlayer = new AudioPlayer();