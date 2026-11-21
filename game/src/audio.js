// Synthesized sound for Solmar Bay: every effect is built from oscillators and
// noise, so the game ships no audio files and works fully offline. Everything is
// guarded — with no AudioContext (headless tests, muted tab) every call is a no-op.

const NOTE = { C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47 };

class AudioBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = 0) {
    if (!this.ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.25, filterFreq = 1200) {
    if (!this.ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  click() {
    this.tone(660, 0.07, 'square', 0.12);
  }

  punch() {
    this.noise(0.09, 0.3, 500);
    this.tone(140, 0.1, 'sine', 0.25, 60);
  }

  shot() {
    this.noise(0.14, 0.4, 2800);
    this.tone(220, 0.12, 'square', 0.18, 55);
  }

  crash() {
    this.noise(0.35, 0.45, 700);
    this.tone(90, 0.3, 'sine', 0.3, 40);
  }

  pickup() {
    this.tone(880, 0.09, 'sine', 0.2);
    setTimeout(() => this.tone(1318, 0.12, 'sine', 0.2), 90);
  }

  cash() {
    this.tone(1046, 0.1, 'triangle', 0.22);
    setTimeout(() => this.tone(1568, 0.16, 'triangle', 0.22), 100);
  }

  missionOk() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.22), i * 110));
  }

  busted() {
    const seq = [392, 330, 262, 196];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'sawtooth', 0.16), i * 160));
  }

  engineStart() {
    if (!this.ensure() || this.muted || this.engineOsc) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  engineSet(speed01, on) {
    if (!this.engineOsc || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
  }

  engineStop() {
    if (!this.engineOsc) return;
    try { this.engineOsc.stop(); } catch {
      // already stopped
    }
    this.engineOsc = null;
    this.engineGain = null;
  }

  sirenStart() {
    if (!this.ensure() || this.muted || this.sirenOsc) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 750;
    lfo.type = 'square';
    lfo.frequency.value = 1.4;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.value = 0.045;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.sirenOsc = osc;
    this.sirenLfo = lfo;
  }

  sirenStop() {
    if (!this.sirenOsc) return;
    try {
      this.sirenOsc.stop();
      this.sirenLfo.stop();
    } catch {
      // already stopped
    }
    this.sirenOsc = null;
    this.sirenLfo = null;
  }

  musicStart() {
    if (!this.ensure() || this.muted || this.musicTimer) return;
    const bass = [NOTE.C2, NOTE.C2, NOTE.F2, NOTE.G2, NOTE.A2, NOTE.G2, NOTE.F2, NOTE.E2];
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const f = bass[this.musicStep % bass.length];
      this.tone(f, 0.34, 'triangle', 0.1);
      if (this.musicStep % 2 === 0) this.tone(f * 2, 0.1, 'sine', 0.05);
      this.musicStep++;
    }, 340);
  }

  musicStop() {
    if (!this.musicTimer) return;
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}

export const audio = new AudioBank();

