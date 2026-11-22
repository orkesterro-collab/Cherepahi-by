const limit = (value, low, high) => Math.max(low, Math.min(high, value));
const STEPS = 28;
const TRAVEL = Math.PI * .33;

// Average the local light separately from the rubber texture. The knurl turns
// with the sleeve, while the light on the cylinder stays in place.
function localLight(pixels, width, height) {
  const stride = width + 1;
  const sums = new Float32Array(stride * (height + 1));
  const light = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const i = 4 * (y * width + x);
      row += .28 * pixels[i] + .57 * pixels[i + 1] + .15 * pixels[i + 2];
      sums[(y + 1) * stride + x + 1] = row + sums[y * stride + x + 1];
    }
  }
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - 6), bottom = Math.min(height, y + 7);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - 10), right = Math.min(width, x + 11);
      const total = sums[bottom * stride + right] - sums[top * stride + right]
        - sums[bottom * stride + left] + sums[top * stride + left];
      light[y * width + x] = total / ((right - left) * (bottom - top));
    }
  }
  return light;
}

export class ThrottleGrip {
  constructor(canvas, button) {
    this.canvas = canvas;
    this.button = button;
    this.context = canvas.getContext('2d');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.progress = 0;
    this.frame = 0;
  }
  configure([start, end], view, photo) {
    const [sx, sy, r0] = start;
    const [ex, ey, r1] = end;
    const length = Math.hypot(ex - sx, ey - sy);
    const ux = (ex - sx) / length, uy = (ey - sy) / length;
    const width = Math.ceil(length), height = 2 * Math.ceil(Math.max(r0, r1) + 2);
    const half = height / 2, scale = view.scale;
    this.canvas.width = width;
    this.canvas.height = height;
    const rotation = `rotate(${Math.atan2(uy, ux)}rad)`;
    Object.assign(this.canvas.style, {
      left: `${view.x(sx + uy * half)}px`, top: `${view.y(sy - ux * half)}px`,
      width: `${width * scale}px`, height: `${height * scale}px`, transform: rotation
    });
    const cap = r1 * .60;
    const targetWidth = Math.max(44, (length * 1.03 + cap) * scale);
    const targetHeight = Math.max(44, (r0 + r1) * scale);
    Object.assign(this.button.style, {
      left: `${limit(view.x((sx + ex + cap * ux) / 2) - targetWidth / 2, 0, view.width - targetWidth)}px`,
      top: `${view.y((sy + ey + cap * uy) / 2) - targetHeight / 2}px`,
      width: `${targetWidth}px`, height: `${targetHeight}px`, transform: 'none'
    });
    this.surface = { sx, sy, ux, uy, r0, r1, width, height, half, photo };
    this.texture = null;
    this.frames = new Map();
    this.lastStep = -1;
    this.paint(this.progress);
  }
  capture() {
    const {sx, sy, ux, uy, width, height, half, photo} = this.surface;
    const patch = document.createElement('canvas');
    patch.width = width; patch.height = height;
    const ctx = patch.getContext('2d', {willReadFrequently: true});
    ctx.setTransform(ux, -uy, uy, ux, -sx * ux - sy * uy, half + sx * uy - sy * ux);
    ctx.drawImage(photo, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    this.texture = {pixels, light: localLight(pixels, width, height)};
  }
  rolled(step) {
    if (!this.texture) this.capture();
    const {pixels, light} = this.texture;
    const {width, height, half, r0, r1} = this.surface;
    const output = this.context.createImageData(width, height);
    const out = output.data;
    const angle = step * TRAVEL / STEPS, cos = Math.cos(angle), sin = Math.sin(angle);
    for (let x = 0; x < width; x++) {
      const radius = r0 + (r1 - r0) * x / (width - 1);
      const end = limit(Math.min(x, width - 1 - x) / 4, 0, 1);
      for (let y = 0; y < height; y++) {
        const v = (y + .5 - half) / radius;
        if (Math.abs(v) >= 1) continue;
        const z = Math.sqrt(1 - v * v);
        const forward = z * cos + v * sin;
        const face = v * cos - z * sin;
        const sourceY = half - .5 + radius * Math.max(-.81, face);
        const row = Math.floor(sourceY), mix = sourceY - row;
        const dest = y * width + x, a = row * width + x, b = a + width;
        // Beyond the upper rib, continue the same diamond tread around the back.
        // The bright road line at the photographed silhouette stays stationary.
        const backMix = face < 0 ? limit((.60 - forward) / .20, 0, 1) : 0;
        const back = Math.round(half + radius * (-.03 + .54 * forward)) * width + x;
        const sourceLight = (light[a] + (light[b] - light[a]) * mix) * (1 - backMix) + light[back] * backMix;
        const shade = .28 + .72 * limit((light[dest] + 12) / (sourceLight + 12), .42, 2.15);
        for (let c = 0; c < 3; c++) {
          const p = pixels[4 * a + c];
          const front = p + (pixels[4 * b + c] - p) * mix;
          out[4 * dest + c] = (front + (pixels[4 * back + c] - front) * backMix) * shade;
        }
        out[4 * dest + 3] = 255 * end * limit(Math.min(v + .94, .94 - v) * radius / 3, 0, 1);
      }
    }
    return output;
  }
  paint(progress) {
    this.progress = progress;
    if (!this.surface) return;
    const step = Math.round(progress * STEPS);
    if (step === this.lastStep) return;
    this.lastStep = step;
    this.canvas.style.visibility = step ? 'visible' : 'hidden';
    if (!step) return;
    if (!this.frames.has(step)) this.frames.set(step, this.rolled(step));
    this.context.putImageData(this.frames.get(step), 0, 0);
  }
  blip() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.peakTimer);
    clearTimeout(this.restTimer);
    const reduced = this.motion.matches;
    const initial = Math.max(this.progress, reduced ? .48 : .09);
    this.paint(initial);
    this.restTimer = setTimeout(() => this.reset(), reduced ? 310 : 765);
    if (reduced) return;
    const start = performance.now();
    this.peakTimer = setTimeout(() => this.paint(1), 200);
    const tick = now => {
      const elapsed = Math.max(0, now - start);
      if (elapsed < 200) this.paint(1 - (1 - initial) * (1 - elapsed / 200) ** 2);
      else if (elapsed < 325) this.paint(1);
      else {
        const release = limit((elapsed - 325) / 440, 0, 1);
        this.paint(1 - release * release * (3 - 2 * release));
      }
      if (elapsed < 765) this.frame = requestAnimationFrame(tick);
      else this.frame = 0;
    };
    this.frame = requestAnimationFrame(tick);
  }
  reset() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.peakTimer);
    clearTimeout(this.restTimer);
    this.frame = 0;
    this.paint(0);
  }
}
