const TRACK = 'assets/harley-sportster.wav';
// Cuts in the local 32 kHz field recording of a Harley-Davidson Sportster.
const LOOP_START = 103022 / 32000;
const LOOP_END = 279758 / 32000;
export const ENGINE_CATCH_MS = 780;
const outputVolume = .73;

function holdLevel(param, now) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(now);
  } else {
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  }
}

class AudioCue {
  constructor(url, attack = 0, release = .018) {
    this.url = url;
    this.attack = attack;
    this.release = release;
    this.sequence = 0;
    this.native = new Audio(url);
    this.native.preload = 'auto';
    this.native.volume = outputVolume;
  }
  prepare(context) {
    if (this.loading) return;
    this.loading = fetch(this.url)
      .then(response => {
        if (!response.ok) throw new Error('Audio unavailable');
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(buffer => { this.buffer = buffer; })
      .catch(() => { this.loading = null; });
  }
  play(context, master, muted, onFailure) {
    this.stop();
    if (muted || document.hidden) return false;
    if (!context || !this.buffer || context.state !== 'running') {
      // At the first tap the decoder may still be starting. This call stays in the gesture.
      const sequence = this.sequence;
      this.native.muted = false;
      this.native.currentTime = 0;
      this.native.play().catch(() => { if (sequence === this.sequence) onFailure?.(); });
      return true;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.buffer;
    source.connect(gain).connect(master);
    if (this.attack) {
      const now = context.currentTime, end = now + this.buffer.duration;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + this.attack);
      gain.gain.setValueAtTime(1, end - this.release);
      gain.gain.linearRampToValueAtTime(0, end);
    }
    this.voice = { source, gain, context };
    source.onended = () => {
      if (this.voice?.source === source) this.voice = null;
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    return true;
  }
  stop(immediate = false) {
    this.sequence++;
    this.native.pause();
    if (!this.voice) return;
    const { source, gain, context } = this.voice;
    this.voice = null;
    const now = context.currentTime;
    const fade = immediate ? 0 : this.release;
    holdLevel(gain.gain, now);
    gain.gain.linearRampToValueAtTime(0, now + fade);
    source.stop(now + fade);
  }
}

export class MotorcycleAudio {
  constructor() {
    this.muted = false;
    this.startedAt = null;
    this.version = 0;
    this.context = null;
    this.master = null;
    this.samples = null;
    this.voice = null;
    this.native = null;
    this.pump = new AudioCue('assets/fuel-prime-half.wav');
    this.starterButton = new AudioCue('assets/starter-button.wav');
    this.throttle = new AudioCue('assets/harley-throttle.wav', .038, .050);
    this.revving = false;
    this.bytes = this.fetchTrack();
    document.addEventListener('visibilitychange', () => document.hidden ? this.pause() : this.restore());
    window.addEventListener('pagehide', () => this.pause());
    window.addEventListener('pageshow', () => this.restore());
  }
  fetchTrack() {
    return fetch(TRACK).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
  }
  unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!this.context && Audio) {
      try {
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : outputVolume;
        this.master.connect(this.context.destination);
        this.idleBus = this.context.createGain();
        this.idleBus.connect(this.master);
        this.pump.prepare(this.context);
        this.starterButton.prepare(this.context);
        this.throttle.prepare(this.context);
        // Start a zero sample inside the gesture so iOS can unlock the audio graph.
        const silent = this.context.createBufferSource();
        silent.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        silent.connect(this.master); silent.onended=()=>silent.disconnect(); silent.start();
      } catch { this.context = null; }
    }
    if (this.context && this.context.state !== 'running') this.context.resume().catch(() => {});
    if (this.context && !this.samples) {
      this.samples = this.bytes.then(async data => {
        const raw = data || await this.fetchTrack();
        return raw ? this.context.decodeAudioData(raw.slice(0)) : null;
      }).catch(() => null);
    }
    if (this.startedAt!==null && !this.voice && !this.native) this.ensurePlaying(this.version);
  }
  setMuted(value) {
    this.muted=value;
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : outputVolume, this.context.currentTime, .018);
    if (this.native) this.native.muted = value || this.revving;
    this.pump.native.muted = value;
    this.starterButton.native.muted = value;
    this.throttle.native.muted = value;
  }
  primeFuel() { this.pump.play(this.context, this.master, this.muted); }
  pressStarter() { this.starterButton.play(this.context, this.master, this.muted); }
  rev() {
    if (this.startedAt === null || document.hidden) return;
    if (!this.throttle.play(this.context, this.master, this.muted, () => this.restoreIdle())) return;
    clearTimeout(this.revTimer);
    this.revving = true;
    if (this.native) this.native.muted = true;
    if (this.idleBus) {
      const level = this.idleBus.gain, now = this.context.currentTime;
      holdLevel(level, now);
      level.linearRampToValueAtTime(.025, now + .042);
      level.setValueAtTime(.025, now + 1.34);
      level.linearRampToValueAtTime(1, now + 1.50);
    }
    // The idle recording keeps its place beneath the blip, including in the native fallback.
    this.revTimer = setTimeout(() => {
      this.revving = false;
      if (this.native) this.native.muted = this.muted;
    }, 1500);
  }
  restoreIdle() {
    clearTimeout(this.revTimer);
    this.revving = false;
    if (this.native) this.native.muted = this.muted;
    if (this.idleBus) {
      const level = this.idleBus.gain, now = this.context.currentTime;
      holdLevel(level, now);
      level.linearRampToValueAtTime(1, now + .09);
    }
  }
  click(kind) {
    const ctx=this.context;
    if (!ctx || !this.master || this.muted) return;
    const now=ctx.currentTime+.008;
    const metal = kind==='key';
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate*.042), ctx.sampleRate);
    const channel = noise.getChannelData(0);
    for(let i=0;i<channel.length;i++) channel[i]=(Math.random()*2-1)*Math.exp(-8*i/channel.length);
    const click=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), level=ctx.createGain();
    click.buffer=noise; filter.type='bandpass'; filter.frequency.value=metal?2400:1350; filter.Q.value=.78;
    level.gain.value=metal?.23:.26;
    click.connect(filter).connect(level).connect(this.master); click.onended=()=>{click.disconnect();filter.disconnect();level.disconnect();}; click.start(now);
    const strike=(at,frequency,amplitude,tail)=>{
      const tone=ctx.createOscillator(), envelope=ctx.createGain(); tone.type='sine'; tone.frequency.value=frequency;
      envelope.gain.setValueAtTime(amplitude,at); envelope.gain.exponentialRampToValueAtTime(.00008,at+tail);
      tone.connect(envelope).connect(this.master); tone.onended=()=>{tone.disconnect();envelope.disconnect();}; tone.start(at); tone.stop(at+tail);
    };
    strike(now,metal?880:370,metal?.051:.090,.052);
    if(metal) { strike(now+.049,2180,.041,.081); strike(now+.064,2840,.017,.095); }
  }
  start() {
    this.version++;
    this.silence();
    this.startedAt = performance.now();
    this.ensurePlaying(this.version);
  }
  offset() {
    const age=Math.max(0,(performance.now()-this.startedAt)/1000);
    return age<LOOP_END ? age : LOOP_START+(age-LOOP_START)%(LOOP_END-LOOP_START);
  }
  async ensurePlaying(version) {
    if (this.startedAt===null || document.hidden || this.voice || this.native || version!==this.version) return;
    const ctx=this.context;
    const buffer=ctx && this.samples ? await this.samples : null;
    if (version!==this.version || this.startedAt===null || document.hidden || this.voice || this.native) return;
    if (!ctx || !buffer || !this.master) { this.playNative(); return; }
    const node=ctx.createBufferSource(), gain=ctx.createGain();
    node.buffer=buffer; node.loop=true; node.loopStart=LOOP_START; node.loopEnd=LOOP_END;
    gain.gain.setValueAtTime(0,ctx.currentTime); gain.gain.linearRampToValueAtTime(1,ctx.currentTime+.03);
    node.connect(gain).connect(this.idleBus); this.voice={node,gain}; node.start(0,this.offset());
  }
  playNative() {
    const el=new Audio(TRACK); this.native=el; el.muted=this.muted || this.revving; el.volume=outputVolume;
    const current=()=>this.native===el && this.startedAt!==null && !document.hidden;
    el.addEventListener('loadedmetadata',()=>{ if(current()) el.currentTime=this.offset(); },{once:true});
    el.addEventListener('ended',()=>{ if(current()){el.currentTime=LOOP_START;el.play().catch(()=>{});} });
    el.play().catch(()=>{ if(this.native===el)this.native=null; });
  }
  silence() {
    if (this.voice) {
      const {node,gain}=this.voice, now=this.context.currentTime;
      gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(gain.gain.value,now); gain.gain.linearRampToValueAtTime(0,now+.085);
      node.onended=()=>{node.disconnect();gain.disconnect();}; node.stop(now+.09); this.voice=null;
    }
    if(this.native){ this.native.pause();this.native=null; }
  }
  stop() {
    this.pump.stop();
    this.throttle.stop();
    this.version++;
    this.startedAt = null;
    this.silence();
    this.restoreIdle();
  }
  pause() {
    this.pump.stop(true);
    this.starterButton.stop(true);
    this.throttle.stop(true);
    this.version++; this.silence();
    this.restoreIdle();
    if (this.context && this.context.state==='running') this.context.suspend().catch(()=>{});
  }
  restore() {
    if(document.hidden || this.startedAt===null) return;
    if(this.context && this.context.state!=='running') this.context.resume().catch(()=>{});
    this.ensurePlaying(this.version);
  }
}
