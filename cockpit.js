import { ThrottleGrip } from './throttle.js';

const portrait = {
  variant: 'portrait', width: 941, height: 1671, sky: 112, horizon: 428, tank: 1240,
  dial: { x: 468, y: 615, rx: 114, ry: 114, tip: [381,681] },
  neutral: [446,680,32,23], runLamp: [490,680,17],
  lock: [472,1033], key: [435,932,78,153], charm: [401,1063,145,128], hinge: [472.5,1070.5],
  switchCorners: [[765,726],[816,733],[808,790],[752,782]], starter: [775,833,56],
  grip: [[887,834,55.5],[945,845,52]], horn: [162,782,72,80]
};
const landscape = {
  variant: 'wide', width: 1672, height: 941, sky: 62, horizon: 218, tank: 808,
  dial: { x: 836.5, y: 390, rx: 85, ry: 85, tip: [768,441] },
  neutral: [822,438,24,17], runLamp: [852,438,13],
  lock: [836.5,655], key: [808.75,579.25,58.5,114.75], charm: [783.25,677.5,108.75,96], hinge: [836.875,683.125],
  switchCorners: [[1146,464],[1188,469],[1184,514],[1136,508]], starter: [1158,552,48],
  grip: [[1268,548,44],[1522,577,41]], horn: [516,511,58,64]
};
const artCache = new Map();
const byId = id => document.getElementById(id);
const root = document.documentElement;
const clamp = (v, low, high) => Math.max(low, Math.min(v, high));

function photo(name) {
  const key = `assets/${name}.webp`;
  if (!artCache.has(key)) {
    const pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось загрузить сцену'));
      img.src = key;
    }).catch(error => { artCache.delete(key); throw error; });
    artCache.set(key, pending);
  }
  return artCache.get(key);
}

// The two exposures and all controls share one projection throughout the ride.
function projection(p, width, height) {
  const scale = p === portrait ? width / p.width : Math.min(width / 1350, height / 1070);
  const left = (width - p.width * scale) / 2;
  const dialTop = p.dial.y - 1.2 * p.dial.ry;
  const offset = height * (p === portrait ? .438 : .423) - dialTop * scale;
  const marks = [0, p.sky, p.horizon, p.tank, p.height];
  const dst = [0, p.sky * scale, offset + p.horizon * scale,
    offset + p.tank * scale, Math.max(height, offset + p.height * scale)];
  function y(raw) {
    let band = 0;
    while (band < marks.length - 2 && raw > marks[band + 1]) band++;
    return dst[band] + (raw - marks[band]) * (dst[band + 1] - dst[band]) / (marks[band + 1] - marks[band]);
  }
  return { width, height, scale, left, x: raw => left + raw * scale, y, marks, dst };
}

function paintPlate(canvas, img, p, g, transparent) {
  const density = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(g.width * density);
  canvas.height = Math.round(g.height * density);
  const ctx = canvas.getContext('2d', {alpha: transparent});
  ctx.setTransform(canvas.width / g.width, 0, 0, canvas.height / g.height, 0, 0);
  if (!transparent) {
    ctx.fillStyle = '#10100f';
    ctx.fillRect(0, 0, g.width, g.height);
  }
  for (let i = 0; i < g.marks.length - 1; i++) {
    const sourceY = g.marks[i], band = g.marks[i+1] - sourceY;
    const destY = g.dst[i], height = g.dst[i+1] - destY + .3;
    if (g.left > .5 && !transparent) {
      ctx.drawImage(img, 0, sourceY, 1, band, 0, destY, g.left+.5, height);
      ctx.drawImage(img, p.width-1, sourceY, 1, band, g.width-g.left-.5, destY, g.left+.5, height);
    }
    ctx.drawImage(img, 0, sourceY, p.width, band, g.left, destY, p.width*g.scale, height);
  }
}

function makeDial(p, img) {
  const canvas = byId('dial');
  const {x, y, rx, ry} = p.dial;
  canvas.width = rx * 2; canvas.height = ry * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, x-rx, y-ry, rx*2, ry*2, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  for (let row = 0; row < canvas.height; row++) {
    for (let col = 0; col < canvas.width; col++) {
      const i = (row * canvas.width + col) * 4;
      const radius = Math.hypot((col-rx)/rx, (row-ry)/ry);
      const lamp = 7 + 15 * radius * radius;
      pixels[i] = pixels[i] * 1.65 + lamp;
      pixels[i+1] = pixels[i+1] * 1.37 + lamp * .5;
      pixels[i+2] = pixels[i+2] * .87 + lamp * .09;
      pixels[i+3] = 255 * clamp((1-radius)*40, 0, 1);
    }
  }
  ctx.putImageData(frame, 0, 0);
}

// Lift the stationary needle off its photographed face only in the riding state.
function makeMovingNeedle(p, img) {
  const {x,y,rx,ry,tip} = p.dial;
  const dial = byId('travel-dial'), needle = byId('speed-needle');
  dial.width = needle.width = 2*rx;
  dial.height = needle.height = 2*ry;
  const ctx = dial.getContext('2d', {willReadFrequently:true});
  ctx.drawImage(img, x-rx, y-ry, 2*rx, 2*ry, 0, 0, dial.width, dial.height);
  const frame = ctx.getImageData(0,0,dial.width,dial.height);
  const src = new Uint8ClampedArray(frame.data);
  const dx = tip[0]-x, dy = tip[1]-y, len = Math.hypot(dx,dy);
  const vx = dx/len, vy = dy/len, width = dial.width;
  const feather = rx*.052;
  for (let row=0; row<dial.height; row++) {
    for (let col=0; col<width; col++) {
      const u = col-rx, v = row-ry;
      const offset = (row*width+col)*4;
      const along = u*vx+v*vy, across = -u*vy+v*vx;
      frame.data[offset+3] = 255*clamp((1-Math.hypot(u/rx,v/ry))*38,0,1);
      if (along < rx*.092 || along > len+2 || Math.abs(across) > feather+2) continue;
      const s = feather+2;
      const sample = distance => {
        const a = Math.round(rx+along*vx-vy*distance);
        const b = Math.round(ry+along*vy+vx*distance);
        return 4*(b*width+a);
      };
      const l = sample(-s), r = sample(s), mix = (across+s)/(2*s);
      const weight = clamp(s-Math.abs(across),0,1);
      for (let c=0; c<3; c++) {
        const clean = src[l+c]+(src[r+c]-src[l+c])*mix;
        frame.data[offset+c] += (clean-src[offset+c])*weight;
      }
    }
  }
  ctx.putImageData(frame,0,0);
  const pin = needle.getContext('2d');
  pin.translate(rx,ry); pin.rotate(Math.atan2(dy,dx));
  pin.shadowColor='#080704c9'; pin.shadowBlur=1.4; pin.shadowOffsetY=1;
  pin.fillStyle='#e3c8a3';
  pin.beginPath(); pin.moveTo(rx*.09,-rx*.019); pin.lineTo(len,0); pin.lineTo(rx*.09,rx*.018); pin.closePath(); pin.fill();
  pin.shadowBlur=0; pin.shadowOffsetY=0;
  // Photograph the original hub back onto the hand, preserving its rim and depth.
  pin.rotate(-Math.atan2(dy,dx));
  const hub=rx*.119;
  pin.beginPath(); pin.arc(0,0,hub,0,Math.PI*2); pin.clip();
  pin.drawImage(img,x-hub,y-hub,hub*2,hub*2,-hub,-hub,hub*2,hub*2);
}

function makeRocker(p, img) {
  const corners = p.switchCorners;
  const [a,b,,d] = corners;
  const left = Math.floor(Math.min(...corners.map(c=>c[0]))) - 2;
  const top = Math.floor(Math.min(...corners.map(c=>c[1]))) - 2;
  const w = Math.ceil(Math.max(...corners.map(c=>c[0]))) - left + 2;
  const h = Math.ceil(Math.max(...corners.map(c=>c[1]))) - top + 2;
  const canvas = byId('rocker-face'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.translate(-left, -top);
  ctx.beginPath(); corners.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.clip();
  const frame = new DOMMatrix([b[0]-a[0], b[1]-a[1], d[0]-a[0], d[1]-a[1], a[0], a[1]]);
  // Rotate the two faces across the rocker's physical hinge in its own coordinate system.
  const reflection = frame.translate(0,1).scale(1,-1).multiply(frame.inverse());
  ctx.save(); ctx.transform(reflection.a, reflection.b, reflection.c, reflection.d, reflection.e, reflection.f); ctx.drawImage(img, 0, 0); ctx.restore();
  const shade = ctx.createLinearGradient(a[0],a[1],d[0],d[1]);
  shade.addColorStop(0,'rgba(9,0,0,.56)'); shade.addColorStop(.49,'rgba(35,0,0,.02)'); shade.addColorStop(.98,'rgba(240,72,38,.20)');
  ctx.fillStyle=shade; ctx.fillRect(left,top,w,h);
  return {left, top, w, h};
}

function rect(el, x, y, w, h) {
  Object.assign(el.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});
}
function fitParts(p, g, rockerBox) {
  const s=g.scale;
  const rawRect = (el,x,y,w,h) => rect(el,g.x(x),g.y(y),s*w,s*h);
  const {x,y,rx,ry} = p.dial;
  for (const id of ['dial','travel-dial','speed-needle']) rawRect(byId(id),x-rx,y-ry,rx*2,ry*2);
  const [nx,ny,nw,nh]=p.neutral;
  rawRect(byId('neutral'),nx-nw/2,ny-nh/2,nw,nh);
  const [lampX, lampY, diameter] = p.runLamp;
  rawRect(byId('run-lamp'), lampX-diameter/2, lampY-diameter/2, diameter, diameter);
  root.style.setProperty('--lamp-size', `${nh * .94 * s}px`);
  rawRect(byId('rocker-face'),rockerBox.left,rockerBox.top,rockerBox.w,rockerBox.h);
  const [sx,sy,sd]=p.starter;
  rawRect(byId('starter-cap'),sx-sd*.5,sy-sd*.5,sd,sd);
  const [kx,ky,kw,kh]=p.key, [fx,fy,fw,fh]=p.charm;
  const prop=byId('key-prop'), fob=prop.querySelector('.key-fob');
  rawRect(prop,kx,ky,kw,kh);
  prop.style.transformOrigin=((p.lock[0]-kx)*s)+'px '+((p.lock[1]-ky)*s)+'px';
  rect(fob,(fx-kx)*s,(fy-ky)*s,fw*s,fh*s);
  fob.style.transformOrigin=((p.hinge[0]-fx)*s)+'px '+((p.hinge[1]-fy)*s)+'px';
  const minX=Math.min(kx,fx), minY=Math.min(ky,fy);
  const maxX=Math.max(kx+kw,fx+fw), maxY=Math.max(ky+kh,fy+fh);
  rect(byId('key'),g.x(minX)-6,g.y(minY)-5,Math.max(48,(maxX-minX)*s+12),Math.max(46,(maxY-minY)*s+10));
  const cx=p.switchCorners.reduce((sum,c)=>sum+c[0],0)/4;
  const cy=p.switchCorners.reduce((sum,c)=>sum+c[1],0)/4;
  const split=(g.y(cy)+g.y(sy))/2;
  const width=Math.max(54, Math.min(100,91*s));
  const leftBound = x => clamp(g.x(x)-width/2, 0, g.width-width);
  // The gap between the two switch centres can be under 44 px on a narrow phone.
  // Share a boundary in that gap and expand both targets away from each other.
  const top=Math.min(g.y(cy)-Math.max(23,41*s), split-44);
  const bottom=Math.max(g.y(sy)+Math.max(23,35*s), split+44);
  rect(byId('rocker'),leftBound(cx),top,width,split-top);
  rect(byId('starter'),leftBound(sx),split,width,bottom-split);
  const [hx,hy,hw,hh]=p.horn;
  const hornWidth=Math.max(44,hw*s), hornHeight=Math.max(44,hh*s);
  rect(byId('horn'),g.x(hx)-hornWidth/2,g.y(hy)-hornHeight/2,hornWidth,hornHeight);
}

export function mountCockpit() {
  const stage=byId('ride');
  const grip=new ThrottleGrip(byId('grip-skin'), byId('throttle'));
  let profile, requested, studio, sun, box, frameId=0;
  function draw() {
    if (!studio || !stage.clientWidth || !stage.clientHeight) return;
    const g=projection(profile,stage.clientWidth,stage.clientHeight);
    paintPlate(byId('night'),studio,profile,g,false);
    if (sun) paintPlate(byId('day-bike'),sun,profile,g,true);
    fitParts(profile,g,box);
    grip.configure(profile.grip,g,sun || studio);
    root.toggleAttribute('data-bike-ready',Boolean(sun));
    root.setAttribute('data-scene-ready','');
    byId('controls').inert=false;
  }
  async function update() {
    frameId=0;
    const selected=stage.clientWidth / stage.clientHeight > .75 ? landscape : portrait;
    if (requested===selected) { draw(); return; }
    requested=selected;
    try {
      const loadStudio=photo('cockpit-studio-'+selected.variant);
      const loadDay=photo('cockpit-riding-'+selected.variant);
      const scene=Promise.all([loadStudio, loadDay, byId('road-poster').decode(), document.querySelector('.ride-crest').decode()]);
      if (!studio) {
        // Paint the puzzle immediately while its daylight layers are loading.
        loadStudio.then(img => {
          if (requested!==selected || studio) return;
          profile=selected; studio=img;
          makeDial(selected,img);
          box=makeRocker(selected,img);
          draw();
        }).catch(() => {});
      }
      const [img,riding]=await scene;
      if (requested!==selected) return;
      profile=selected; studio=img; sun=riding;
      makeDial(selected,img);
      box=makeRocker(selected,img);
      makeMovingNeedle(selected,riding);
      draw();
      window.dispatchEvent(new Event('ride-ready'));
    } catch {
      if (requested===selected) {
        requested=null;
        byId('status').textContent='Сцена не загрузилась. Обнови страницу.';
      }
    }
  }
  const schedule=()=>{if(!frameId) frameId=requestAnimationFrame(update);};
  new ResizeObserver(schedule).observe(stage);
  window.addEventListener('pageshow',schedule);
  window.addEventListener('online',schedule);
  update();
  return grip;
}
