'use strict';
/* Tiny WebAudio synth - no audio files needed. */
const Audio_ = {
  ctx: null, muted: false, last: {},
  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* no audio */ }
  },
  tone(f, d, type, vol, when, slide) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + d);
    g.gain.setValueAtTime(vol || .06, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d + .02);
  },
  play(n) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (this.last[n] && now - this.last[n] < 40) return;   // avoid stacking identical sounds
    this.last[n] = now;
    switch (n) {
      case 'pick': this.tone(520, .07, 'triangle', .08); break;
      case 'put': this.tone(330, .07, 'triangle', .08); break;
      case 'tick': this.tone(900 + Math.random() * 200, .04, 'square', .03); break;
      case 'ding': this.tone(880, .12, 'sine', .09); this.tone(1320, .16, 'sine', .07, .08); break;
      case 'bad': this.tone(160, .14, 'sawtooth', .07, 0, 110); break;
      case 'trash': this.tone(300, .15, 'sawtooth', .05, 0, 90); break;
      case 'burn': this.tone(120, .4, 'sawtooth', .08, 0, 60); break;
      case 'dash': this.tone(300, .12, 'sine', .06, 0, 800); break;
      case 'order': this.tone(988, .1, 'sine', .08); this.tone(1319, .18, 'sine', .08, .1); break;
      case 'deliver': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .14, 'triangle', .09, i * .07)); break;
      case 'expire': this.tone(300, .25, 'sawtooth', .08, 0, 120); this.tone(220, .3, 'sawtooth', .08, .18, 90); break;
      case 'over': [523, 440, 349, 262].forEach((f, i) => this.tone(f, .3, 'triangle', .1, i * .2)); break;
      case 'beep': this.tone(660, .12, 'square', .06); break;
      case 'go': this.tone(990, .3, 'square', .07); break;
    }
  },
};
