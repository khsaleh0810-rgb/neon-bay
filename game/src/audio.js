// All sound is synthesised with WebAudio — no audio files, nothing to fetch,
// so the game stays offline and self-contained. Every call is guarded: in a
// headless browser or with sound off, the game simply plays silent.
export function createAudio() {
  let context = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (context) return context;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      context = new AC();
    } catch {
      context = null;
    }
    return context;
  }

  function tone(freq, dur, type, gainValue, slideTo) {
    const ctx = ensure();
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(gainValue || 0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(dur, gainValue, lowpass) {
    const ctx = ensure();
    if (!ctx || muted) return;
    try {
      const size = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      const gain = ctx.createGain();
      gain.gain.value = gainValue || 0.15;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      // Silent is fine.
    }
  }

  return {
    /** Call once from a user gesture so the browser unlocks audio. */
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      if (muted) {
        this.stopEngine();
        this.stopSiren();
      }
      return muted;
    },
    isMuted() {
      return muted;
    },
    click() {
      tone(660, 0.06, 'square', 0.04);
    },
    punch() {
      noise(0.09, 0.18, 700);
    },
    shoot() {
      noise(0.12, 0.22, 2400);
      tone(190, 0.1, 'square', 0.1, 60);
    },
    hit() {
      tone(140, 0.12, 'sawtooth', 0.1, 70);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.08);
      tone(1320, 0.12, 'sine', 0.07);
    },
    cash() {
      tone(1046, 0.08, 'sine', 0.08);
      tone(1318, 0.08, 'sine', 0.08);
      tone(1568, 0.16, 'sine', 0.08);
    },
    missionDone() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => {
        window.setTimeout(() => tone(f, 0.22, 'triangle', 0.1), i * 110);
      });
    },
    busted() {
      tone(392, 0.25, 'sawtooth', 0.1, 196);
      tone(311, 0.4, 'sawtooth', 0.1, 155);
    },
    crash() {
      noise(0.25, 0.25, 500);
    },
    /** A continuous engine hum whose pitch follows the car's speed (0..1). */
    engine(speedRatio) {
      const ctx = ensure();
      if (!ctx || muted) {
        this.stopEngine();
        return;
      }
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(ctx.destination);
          engineOsc.start();
        }
        engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, ctx.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(0.028 + speedRatio * 0.03, ctx.currentTime, 0.1);
      } catch {
        this.stopEngine();
      }
    },
    stopEngine() {
      try {
        if (engineOsc) engineOsc.stop();
      } catch {
        // Already stopped.
      }
      engineOsc = null;
      engineGain = null;
    },
    /** A two-tone siren that wails while any police car is chasing. */
    siren(dt) {
      const ctx = ensure();
      if (!ctx || muted) {
        this.stopSiren();
        return;
      }
      try {
        if (!sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'triangle';
          sirenGain.gain.value = 0.035;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(ctx.destination);
          sirenOsc.start();
          sirenTimer = 0;
        }
        sirenTimer += dt;
        const high = Math.floor(sirenTimer / 0.45) % 2 === 0;
        sirenOsc.frequency.setTargetAtTime(high ? 960 : 720, ctx.currentTime, 0.05);
      } catch {
        this.stopSiren();
      }
    },
    stopSiren() {
      try {
        if (sirenOsc) sirenOsc.stop();
      } catch {
        // Already stopped.
      }
      sirenOsc = null;
      sirenGain = null;
    },
  };
}
