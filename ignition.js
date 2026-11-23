import { mountCockpit } from './cockpit.js?v=horn-1';
import { ENGINE_CATCH_MS, MotorcycleAudio } from './sound.js?v=horn-1';

const root = document.documentElement;
const byId = id => document.getElementById(id);
const key = byId('key'), rocker = byId('rocker'), starter = byId('starter'), throttle = byId('throttle');
const horn = byId('horn');
const speaker = byId('speaker'), content = byId('club-content'), title = byId('ride-title'), status = byId('status');
const sound = new MotorcycleAudio();
const grip = mountCockpit();
const TITLE_DELAY_MS = 2500;
let stage = 'off', fireTimer, welcomeTimer, pressTimer, revTimer;
let startRequested = false;
let hornInput = null;
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
  horn.hidden = next !== 'running';
  status.textContent = messages[next];
}
function fire() {
  if (stage !== 'cranking') return;
  setStage('running');
  content.hidden = false;
  content.inert = false;
  root.setAttribute('data-unlocked','');
  welcomeTimer = setTimeout(() => {
    if (stage !== 'running') return;
    title.inert = false;
    title.setAttribute('aria-hidden','false');
    root.setAttribute('data-in-club','');
    speaker.hidden = false;
  }, TITLE_DELAY_MS);
}
function shutDown(next) {
  startRequested = false;
  hornInput = null;
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
  speaker.hidden = true;
  content.inert = true;
  content.hidden = true;
  grip.reset();
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
  if (stage === 'off') setStage('powered');
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
function startWhenReady() {
  if (!startRequested || stage !== 'armed' || !root.hasAttribute('data-bike-ready')) return;
  startRequested = false;
  setStage('cranking');
  sound.start();
  fireTimer = setTimeout(fire, ENGINE_CATCH_MS);
}
window.addEventListener('ride-ready', startWhenReady);
starter.addEventListener('click', () => {
  sound.unlock(); physicalPress(); sound.pressStarter();
  if (stage !== 'armed') {
    if (stage === 'off' || stage === 'powered') status.textContent = 'Щелчок кнопки стартера.';
    return;
  }
  startRequested = true;
  if (!root.hasAttribute('data-bike-ready')) status.textContent = 'Загружается дорога.';
  startWhenReady();
});
function openThrottle() {
  if (stage !== 'running') return;
  sound.unlock(); sound.rev(); grip.blip();
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
function pressHorn(input) {
  if (stage !== 'running' || hornInput !== null) return false;
  hornInput = input;
  sound.startHorn();
  return true;
}
function releaseHorn(input, immediate = false) {
  if (hornInput !== input) return;
  hornInput = null;
  sound.stopHorn(immediate);
}
horn.addEventListener('pointerdown', event => {
  if (event.isPrimary && event.button === 0 && pressHorn(event.pointerId)) horn.setPointerCapture(event.pointerId);
});
horn.addEventListener('pointerup', event => releaseHorn(event.pointerId));
for (const type of ['pointercancel','lostpointercapture']) {
  horn.addEventListener(type, event => releaseHorn(event.pointerId, true));
}
for (const type of ['keydown','keyup']) {
  horn.addEventListener(type, event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (type === 'keyup') releaseHorn(event.key);
    else if (!event.repeat) pressHorn(event.key);
  });
}
horn.addEventListener('click', event => {
  if ((event.detail === 0 || !window.PointerEvent) && pressHorn('click')) releaseHorn('click');
});
function cancelHorn() {
  if (hornInput !== null) releaseHorn(hornInput, true);
}
horn.addEventListener('blur', cancelHorn);
window.addEventListener('blur', cancelHorn);
function resetHeldControls() {
  cancelHorn();
  grip.reset();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) resetHeldControls(); });
window.addEventListener('pagehide', resetHeldControls);
function toggleSound() {
  sound.unlock(); sound.setMuted(!sound.muted);
  const label = sound.muted ? 'Включить звук' : 'Выключить звук';
  speaker.setAttribute('aria-pressed', String(!sound.muted));
  speaker.setAttribute('aria-label', label);
  speaker.title = label;
}
speaker.addEventListener('click', toggleSound);
byId('reset').addEventListener('click', () => {
  const withFocus = byId('reset').matches(':focus-visible');
  sound.unlock(); sound.click('key'); shutDown('off');
  if (withFocus) key.focus({preventScroll:true});
});
