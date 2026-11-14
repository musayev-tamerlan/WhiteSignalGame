type Surface = 'snow' | 'floor';

export class AudioSystem {
  private context?: AudioContext;
  private master?: GainNode;
  private wind?: GainNode;
  private crunch?: AudioBuffer;
  private snowy = true;
  muted = true;

  start() {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      return;
    }
    if (!window.AudioContext) return;
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : .28;
    this.master.connect(ctx.destination);

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const wind = buffer.getChannelData(0);
    for (let i = 0; i < wind.length; i++) wind[i] = (Math.random() * 2 - 1) * .34;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 370;
    this.wind = ctx.createGain();
    this.wind.gain.value = this.snowy ? .46 : .07;
    source.connect(filter).connect(this.wind).connect(this.master);
    source.start();

    this.crunch = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .23), ctx.sampleRate);
    const grains = this.crunch.getChannelData(0);
    let pressure = 0;
    for (let i = 0; i < grains.length; i++) {
      if (Math.random() < .034) pressure += Math.random() * .48;
      pressure *= .967;
      grains[i] = (Math.random() * 2 - 1) * (.25 + pressure);
    }
  }

  surface(snowy: boolean) {
    this.snowy = snowy;
    if (this.wind && this.context) this.wind.gain.setTargetAtTime(snowy ? .46 : .07, this.context.currentTime, .35);
  }

  toggle() {
    this.muted = !this.muted;
    this.start();
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : .28, this.context.currentTime, .15);
  }

  step(surface: Surface, force: number, landing = false) {
    const { context: ctx, master, crunch } = this;
    if (!ctx || !master || !crunch || this.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const snow = surface === 'snow';
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    noise.buffer = crunch;
    noise.playbackRate.value = (snow ? .86 : 1.34) + Math.random() * .32;
    filter.type = snow ? 'bandpass' : 'lowpass';
    filter.frequency.value = snow ? 1350 + Math.random() * 480 : 510;
    filter.Q.value = snow ? .60 : .8;
    gain.gain.setValueAtTime(.001, t);
    gain.gain.exponentialRampToValueAtTime((snow ? .65 : .47) * force, t + .012);
    gain.gain.exponentialRampToValueAtTime(.001, t + (snow ? .17 : .075));
    noise.connect(filter).connect(gain).connect(master);
    noise.start(t);
    if (landing || !snow) this.tone(landing ? 70 : 100 + Math.random() * 24, .065, .12 * force);
  }

  beep(frequency = 660) { this.tone(frequency, .18, .24); }

  private tone(frequency: number, length: number, volume: number) {
    if (!this.context || !this.master || this.muted) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(.001, t + length);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(t + length + .01);
  }

  pause(paused: boolean) {
    if (this.context) void (paused ? this.context.suspend() : this.context.resume()).catch(() => {});
  }
}
