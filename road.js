export class RoadFilm {
  constructor(video, scene) {
    this.video = video;
    this.wide = matchMedia('(orientation: landscape)');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.visible = true;
    this.active = false;
    video.muted = true;
    video.playsInline = true;
    video.addEventListener('playing', () => video.toggleAttribute('data-playing', this.active));
    video.addEventListener('error', () => video.removeAttribute('data-playing'));
    this.wide.addEventListener('change', () => { if (this.active) this.sync(); });
    this.reduced.addEventListener('change', () => this.sync());
    document.addEventListener('visibilitychange', () => this.sync());
    window.addEventListener('pagehide', () => video.pause());
    window.addEventListener('pageshow', () => this.sync());
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.sync();
    }).observe(scene);
  }
  prepare() {
    if (this.reduced.matches) return;
    const variant = this.wide.matches ? 'wide' : 'portrait';
    if (variant === this.variant && !this.video.error) return;
    this.variant = variant;
    this.video.removeAttribute('data-playing');
    this.video.preload = 'auto';
    this.video.src = 'assets/day-ride-' + variant + '.mp4';
    this.video.load();
  }
  sync() {
    if (!this.active || this.reduced.matches || document.hidden || !this.visible) {
      this.video.pause();
      if (this.reduced.matches) this.video.removeAttribute('data-playing');
      return;
    }
    this.prepare();
    this.video.play().catch(() => {});
  }
  start() {
    this.active = true;
    this.sync();
  }
  surge() {
    if (!this.active || this.reduced.matches) return;
    this.video.playbackRate = 1.16;
    clearTimeout(this.rateTimer);
    this.rateTimer = setTimeout(() => { this.video.playbackRate = 1; }, 900);
  }
  stop() {
    this.active = false;
    clearTimeout(this.rateTimer);
    this.video.pause();
    this.video.playbackRate = 1;
    if (this.video.readyState) this.video.currentTime = 0;
    this.video.removeAttribute('data-playing');
  }
}
