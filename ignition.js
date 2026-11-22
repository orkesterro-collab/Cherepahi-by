import { mountCockpit } from './cockpit.js';
import { ENGINE_CATCH_MS, MotorcycleAudio } from './sound.js';
import { RoadFilm } from './road.js';

const root = document.documentElement;
const byId = id => document.getElementById(id);
const key = byId('key'), rocker = byId('rocker'), starter = byId('starter'), throttle = byId('throttle');
const speaker = byId('speaker'), content = byId('club-content'), title = byId('ride-title'), status = byId('status');
const frameSpeaker = byId('frame-speaker'), finalPhoto = byId('final-photo');
const sound = new MotorcycleAudio();
const grip = mountCockpit();
const road = new RoadFilm(byId('road-film'), byId('ride'));
let stage = 'off', fireTimer, welcomeTimer, pressTimer, revTimer;
let frameSpeakerVisible = true;
const messages = {
  off: 'Двигатель заглушён. Приборы погасли.',
  powered: 'Нейтраль. Индикатор запуска красный.',
  armed: 'Индикатор запуска зелёный. Бензонасос включён.',
  cranking: 'Стартер крутится.',
  running: 'Двигатель работает. Мы в колонне. Разделы клуба доступны ниже.'
};
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function setStage(next) {
  stage = next;
  root.dataset.stage = next;
  const powered = next !== 'off';
  const armed = ['armed','cranking','running'].includes(next);
  root.toggleAttribute('data-key-on', powered);
  root.toggleAttribute('data-run-switch', armed);
  key.setAttribute('aria-pressed', String(powered));
  rocker.setAttribute('aria-pressed', String(armed));
  throttle.disabled = next !== 'running';
  status.textContent = messages[next];
}
function fire() {
  if (stage !== 'cranking') return;
  setStage('running');
  content.hidden = false;
  content.inert = false;
  root.setAttribute('data-unlocked','');
  const reveal = setTimeout(async () => {
    try {
      await finalPhoto.decode();
    } catch {
      if (stage === 'running' && welcomeTimer === reveal) speaker.hidden = false;
      return;
    }
    if (stage !== 'running' || welcomeTimer !== reveal) return;
    title.inert = false;
    title.setAttribute('aria-hidden','false');
    root.setAttribute('data-in-club','');
    updateSpeakers();
  },3000);
  welcomeTimer = reveal;
}
function shutDown(next) {
  clearTimeout(fireTimer); clearTimeout(welcomeTimer); clearTimeout(pressTimer); clearTimeout(revTimer);
  const wasOpen = root.hasAttribute('data-unlocked');
  if (wasOpen) {
    window.dispatchEvent(new Event('club-closed'));
    window.scrollTo({top:0,behavior:'instant'});
    if (location.hash) history.replaceState(null,'',location.pathname + location.search);
  }
  root.removeAttribute('data-unlocked');
  root.removeAttribute('data-in-club');
  root.removeAttribute('data-starter-down');
  root.removeAttribute('data-revving');
  title.inert = true;
  title.setAttribute('aria-hidden','true');
  updateSpeakers();
  content.inert = true;
  content.hidden = true;
  grip.reset();
  road.stop();
  sound.stop();
  setStage(next);
}
function physicalPress() {
  clearTimeout(pressTimer);
  root.setAttribute('data-starter-down','');
  pressTimer = setTimeout(() => root.removeAttribute('data-starter-down'),175);
}
key.addEventListener('click', () => {
  sound.unlock(); sound.click('key');
  if (stage === 'off') { setStage('powered'); road.prepare(); }
  else shutDown('off');
});
rocker.addEventListener('click', () => {
  sound.unlock();
  if (stage === 'off') return;
  sound.click('rocker');
  if (stage === 'powered') { setStage('armed'); sound.primeFuel(); }
  else shutDown('powered');
});
starter.addEventListener('pointerdown', physicalPress);
starter.addEventListener('click', () => {
  sound.unlock(); physicalPress(); sound.pressStarter();
  if (stage !== 'armed') {
    if (stage === 'off' || stage === 'powered') status.textContent = 'Щелчок кнопки стартера.';
    return;
  }
  setStage('cranking');
  sound.start();
  // The starter tap authorizes inline movie playback on mobile browsers.
  road.start();
  fireTimer = setTimeout(fire, ENGINE_CATCH_MS);
});
function openThrottle() {
  if (stage !== 'running') return;
  sound.unlock(); sound.rev(); grip.blip(); road.surge();
  root.setAttribute('data-revving','');
  clearTimeout(revTimer);
  revTimer = setTimeout(() => root.removeAttribute('data-revving'),880);
}
throttle.addEventListener('pointerdown', event => {
  if (event.isPrimary && event.button === 0) openThrottle();
});
throttle.addEventListener('click', event => {
  if (event.detail === 0 || !window.PointerEvent) openThrottle();
});
title.querySelector('.final-controls').addEventListener('click', event => {
  const control = event.target.closest('button[data-control]');
  if (!control || stage !== 'running') return;
  const cockpitButton = byId(control.dataset.control);
  cockpitButton.click();
  if (title.inert && event.detail === 0) cockpitButton.focus({preventScroll:true});
});
document.addEventListener('visibilitychange', () => { if (document.hidden) grip.reset(); });
window.addEventListener('pagehide', () => grip.reset());
function toggleSound() {
  sound.unlock(); sound.setMuted(!sound.muted);
  const label = sound.muted ? 'Включить звук' : 'Выключить звук';
  for (const button of [speaker, frameSpeaker]) {
    button.setAttribute('aria-pressed', String(!sound.muted));
    button.setAttribute('aria-label', label);
    button.title = label;
  }
}
speaker.addEventListener('click', toggleSound);
frameSpeaker.addEventListener('click', toggleSound);
new IntersectionObserver(([entry]) => {
  frameSpeakerVisible = entry.intersectionRatio >= .5;
  updateSpeakers();
}, {threshold: .5}).observe(frameSpeaker);
function updateSpeakers() {
  const open = root.hasAttribute('data-in-club');
  // Once the painted sound button scrolls away, use the floating club control.
  speaker.hidden = !open || frameSpeakerVisible;
}
byId('reset').addEventListener('click', () => {
  const withFocus = byId('reset').matches(':focus-visible');
  sound.unlock(); sound.click('key'); shutDown('off');
  if (withFocus) key.focus({preventScroll:true});
});
