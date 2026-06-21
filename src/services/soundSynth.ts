class SoundSynth {
  private ctx: AudioContext | null = null;
  private gainMaster: GainNode | null = null;
  private gainMusic: GainNode | null = null;
  private gainEffects: GainNode | null = null;

  private bgmIntervalId: number | null = null;
  private bgmStep = 0;
  private isMuted = false;
  private isBgmPlaying = false;
  private comboLevel = 1;
  private bgmSpeedFactor = 1.0;

  // Mixer Volumes (0.0 to 1.0)
  private volMaster = 0.25;
  private volMusic = 0.25;
  private volEffects = 0.3;

  // Melody Arpeggiator fields
  private arpeggioIndex = 0;
  private lastCollectTime = 0;
  private arpNotes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];

  // Retro synthwave scales
  private bassNotes = [
    // E2, G2, C2, D2
    82.41, 98.00, 65.41, 73.42
  ];
  private leadNotes = [
    // E4, G4, A4, B4, D5, E5
    329.63, 392.00, 440.00, 493.88, 587.33, 659.25
  ];

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  private initCtx() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      
      // Create multi-channel mixer nodes
      this.gainMaster = this.ctx.createGain();
      this.gainMusic = this.ctx.createGain();
      this.gainEffects = this.ctx.createGain();

      // Configure initial volumes
      const mVal = this.isMuted ? 0 : this.volMaster;
      this.gainMaster.gain.setValueAtTime(mVal, this.ctx.currentTime);
      this.gainMusic.gain.setValueAtTime(this.volMusic, this.ctx.currentTime);
      this.gainEffects.gain.setValueAtTime(this.volEffects, this.ctx.currentTime);

      // Route channels: Music & Effects -> Master -> Destination
      this.gainMusic.connect(this.gainMaster);
      this.gainEffects.connect(this.gainMaster);
      this.gainMaster.connect(this.ctx.destination);
    } catch (e) {
      console.error("Web Audio API not supported in this browser:", e);
    }
  }

  private resumeCtx() {
    this.initCtx();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // MIXER CONTROLS
  public setMasterVolume(vol: number) {
    this.volMaster = Math.max(0, Math.min(1, vol));
    this.initCtx();
    if (this.gainMaster && this.ctx) {
      const target = this.isMuted ? 0 : this.volMaster;
      this.gainMaster.gain.setValueAtTime(target, this.ctx.currentTime);
    }
  }

  public getMasterVolume(): number {
    return this.volMaster;
  }

  public setMusicVolume(vol: number) {
    this.volMusic = Math.max(0, Math.min(1, vol));
    this.initCtx();
    if (this.gainMusic && this.ctx) {
      this.gainMusic.gain.setValueAtTime(this.volMusic, this.ctx.currentTime);
    }
  }

  public getMusicVolume(): number {
    return this.volMusic;
  }

  public setEffectsVolume(vol: number) {
    this.volEffects = Math.max(0, Math.min(1, vol));
    this.initCtx();
    if (this.gainEffects && this.ctx) {
      this.gainEffects.gain.setValueAtTime(this.volEffects, this.ctx.currentTime);
    }
  }

  public getEffectsVolume(): number {
    return this.volEffects;
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    this.initCtx();
    if (this.gainMaster && this.ctx) {
      const target = muted ? 0 : this.volMaster;
      this.gainMaster.gain.setValueAtTime(target, this.ctx.currentTime);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setComboLevel(level: number) {
    this.comboLevel = Math.max(1, level);
  }

  public setBgmSpeed(factor: number) {
    this.bgmSpeedFactor = Math.max(0.3, Math.min(2.0, factor));
  }

  // SOUND EFFECTS (SFX Routing)
  public playClick() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);

    gain.gain.setValueAtTime(0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  public playCollect() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(523.25, t); // C5
    osc1.frequency.setValueAtTime(659.25, t + 0.08); // E5
    osc1.frequency.setValueAtTime(783.99, t + 0.16); // G5
    osc1.frequency.setValueAtTime(1046.50, t + 0.24); // C6

    osc2.frequency.setValueAtTime(523.25 * 1.5, t);
    osc2.frequency.setValueAtTime(659.25 * 1.5, t + 0.08);
    osc2.frequency.setValueAtTime(783.99 * 1.5, t + 0.16);

    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.gainEffects);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.45);
    osc2.stop(t + 0.45);
  }

  public playHit() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.35);

    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + 0.4);

    try {
      const bufferSize = this.ctx.sampleRate * 0.25;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(200, t);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.06, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.gainEffects);

      noise.start(t);
      noise.stop(t + 0.25);
    } catch (_) {}
  }

  public playComboUp() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + 0.35);

    gain.gain.setValueAtTime(0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + 0.4);
  }

  public playLevelUp() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    // Harmonic sweeps up
    const frequencies = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major scale arpeggio
    
    frequencies.forEach((freq, idx) => {
      if (!this.ctx || !this.gainEffects) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);

      gain.gain.setValueAtTime(0.0, t + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.03, t + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.2);

      osc.connect(gain);
      gain.connect(this.gainEffects);

      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.25);
    });
  }

  public playAchievement() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00]; // Fanfare
    
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.gainEffects) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.05);

      gain.gain.setValueAtTime(0.0, t + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.02, t + idx * 0.05 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.35);

      osc.connect(gain);
      gain.connect(this.gainEffects);

      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.4);
    });
  }

  public playSlowMoStart() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.6);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.6);

    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + 0.7);
  }

  public playSlowMoEnd() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(147, t);
    osc.frequency.exponentialRampToValueAtTime(587.33, t + 0.5);

    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    osc.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + 0.6);
  }

  public playGameOver() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    this.stopBgm();

    const t = this.ctx.currentTime;
    const notes = [196.00, 155.56, 130.81];
    
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.gainEffects) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + idx * 0.15);
      osc.frequency.linearRampToValueAtTime(freq * 0.5, t + idx * 0.15 + 0.6);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, t + idx * 0.15);

      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.04, t + idx * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.15 + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.gainEffects);

      osc.start(t + idx * 0.15);
      osc.stop(t + idx * 0.15 + 0.8);
    });
  }

  // PROCEDURAL BGM (Music Routing)
  public startBgm() {
    this.resumeCtx();
    if (this.isBgmPlaying) return;
    this.isBgmPlaying = true;
    this.bgmStep = 0;

    const tempo = 120; // BPM

    const scheduleNextBeats = () => {
      if (!this.isBgmPlaying || !this.ctx || !this.gainMusic || this.isMuted) return;
      
      const t = this.ctx.currentTime;
      this.playBgmStep(t);

      this.bgmStep = (this.bgmStep + 1) % 16;
      
      const adjustedTempo = tempo + Math.min(25, (this.comboLevel - 1) * 3);
      const nextStepDuration = (60 / adjustedTempo / 2) / this.bgmSpeedFactor;

      this.bgmIntervalId = window.setTimeout(scheduleNextBeats, nextStepDuration * 1000);
    };

    scheduleNextBeats();
  }

  private playBgmStep(time: number) {
    if (!this.ctx || !this.gainMusic) return;

    // 1. Kick Drum
    if (this.bgmStep === 0 || this.bgmStep === 8 || this.bgmStep === 10 || this.bgmStep === 14) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.frequency.setValueAtTime(130 * this.bgmSpeedFactor, time);
      osc.frequency.exponentialRampToValueAtTime(45 * this.bgmSpeedFactor, time + 0.12);

      gain.gain.setValueAtTime(0.06, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.connect(gain);
      gain.connect(this.gainMusic);
      osc.start(time);
      osc.stop(time + 0.15);
    }

    // 2. Retro Synth Bass Line
    const barIndex = Math.floor(this.bgmStep / 4);
    const rootFreq = this.bassNotes[barIndex];
    
    if (this.bgmStep % 2 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      const isUp = (this.bgmStep % 4 === 2);
      osc.frequency.setValueAtTime((isUp ? rootFreq * 2 : rootFreq) * this.bgmSpeedFactor, time);
      osc.type = 'triangle';

      filter.type = 'lowpass';
      const cutoff = (250 + Math.min(300, this.comboLevel * 40)) * this.bgmSpeedFactor;
      filter.frequency.setValueAtTime(cutoff, time);
      filter.frequency.exponentialRampToValueAtTime(cutoff * 0.6, time + 0.15);

      gain.gain.setValueAtTime(0.025, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.gainMusic);

      osc.start(time);
      osc.stop(time + 0.2);
    }

    // 3. Hi-Hat / Snare
    if (this.bgmStep === 4 || this.bgmStep === 12) {
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000 * this.bgmSpeedFactor, time);

      gain.gain.setValueAtTime(0.015, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

      try {
        const bufferSize = this.ctx.sampleRate * 0.08;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.gainMusic);
        
        noise.start(time);
        noise.stop(time + 0.08);
      } catch (_) {}
    }

    // 4. Lead Pluck Melody
    if (this.comboLevel >= 2 && (this.bgmStep % 4 === 1 || this.bgmStep % 4 === 3 || this.bgmStep === 6 || this.bgmStep === 14)) {
      const noteIndex = (this.bgmStep * this.comboLevel) % this.leadNotes.length;
      const freq = this.leadNotes[noteIndex];

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const delay = this.ctx.createDelay();
      const feedback = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * this.bgmSpeedFactor, time);

      gain.gain.setValueAtTime(0.012, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

      delay.delayTime.setValueAtTime(0.12, time);
      feedback.gain.setValueAtTime(0.3, time);

      osc.connect(gain);
      gain.connect(this.gainMusic);

      gain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(this.gainMusic);

      osc.start(time);
      osc.stop(time + 0.15);
    }
  }

  public stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmIntervalId !== null) {
      clearTimeout(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
  }

  public playShardCollect(type: string) {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const now = performance.now();
    if (now - this.lastCollectTime < 1500) {
      this.arpeggioIndex = (this.arpeggioIndex + 1) % this.arpNotes.length;
    } else {
      this.arpeggioIndex = 0;
    }
    this.lastCollectTime = now;

    let freq = this.arpNotes[this.arpeggioIndex];
    let pluckVolume = 0.03;
    let decay = 0.2;

    if (type === 'crystal_rare') {
      freq *= 1.5;
      pluckVolume = 0.05;
    } else if (type === 'crystal_epic') {
      freq *= 2.0;
      pluckVolume = 0.07;
      decay = 0.35;
    } else if (type !== 'crystal_common') {
      this.playPowerUp();
      return;
    }

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.03, t + 0.04);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 2.5, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.4, t + decay - 0.02);

    gain.gain.setValueAtTime(pluckVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + decay + 0.01);
  }

  public playPowerUp() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.3);

    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + 0.36);
  }

  public playGlitch() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.setValueAtTime(40, t + 0.1);
    osc.frequency.setValueAtTime(150, t + 0.2);

    gain.gain.setValueAtTime(0.05, t);
    gain.gain.setValueAtTime(0.01, t + 0.08);
    gain.gain.setValueAtTime(0.04, t + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + 0.36);
  }

  public playBossWarning() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(90, t);
    osc1.frequency.linearRampToValueAtTime(105, t + 0.8);
    osc1.frequency.linearRampToValueAtTime(90, t + 1.6);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(90.5, t);
    osc2.frequency.linearRampToValueAtTime(105.5, t + 0.8);
    osc2.frequency.linearRampToValueAtTime(90.5, t + 1.6);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 1.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.85);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.gainEffects);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 1.95);
    osc2.stop(t + 1.95);
  }

  public playLightning() {
    this.resumeCtx();
    if (!this.ctx || !this.gainEffects || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.12);

    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.gainEffects);

    osc.start(t);
    osc.stop(t + 0.16);
  }
}

export const soundSynth = new SoundSynth();
export default SoundSynth;
