const byId = id => document.getElementById(id);
const menu = byId('menu-toggle');
const nav = byId('club-nav');

function setMenu(open) {
  menu.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('open', open);
}
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') === 'false'));
nav.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('pointerdown', event => { if (!event.target.closest('.club-bar')) setMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && nav.classList.contains('open')) {
    setMenu(false);
    menu.focus();
  }
});
matchMedia('(min-width: 831px)').addEventListener('change', () => setMenu(false));

const strip = byId('photo-strip');
const photos = [...strip.querySelectorAll('.photo')];
const previous = byId('strip-prev'), next = byId('strip-next');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

function updateArrows() {
  previous.disabled = strip.scrollLeft <= 2;
  next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
}
function scrollOne(direction) {
  const step = photos[1].offsetLeft - photos[0].offsetLeft;
  strip.scrollBy({left: direction * step, behavior: reduced.matches ? 'instant' : 'smooth'});
}
strip.addEventListener('scroll', updateArrows, {passive: true});
new ResizeObserver(updateArrows).observe(strip);
previous.addEventListener('click', () => scrollOne(-1));
next.addEventListener('click', () => scrollOne(1));

const dialog = byId('lightbox');
const enlarged = byId('lightbox-img');
let selectedPhoto = 0;
function showPhoto(number) {
  selectedPhoto = (number + photos.length) % photos.length;
  const photo = photos[selectedPhoto], img = photo.querySelector('img');
  enlarged.src = img.currentSrc || img.src;
  enlarged.alt = img.alt;
  byId('lightbox-caption').textContent = photo.parentElement.querySelector('figcaption').textContent;
  byId('photo-count').textContent = (selectedPhoto + 1) + ' / ' + photos.length;
}
photos.forEach((button, i) => button.addEventListener('click', () => {
  showPhoto(i);
  dialog.showModal();
}));
dialog.querySelector('.close-photo').addEventListener('click', () => dialog.close());
dialog.querySelector('.chev.prev').addEventListener('click', () => showPhoto(selectedPhoto - 1));
dialog.querySelector('.chev:not(.prev)').addEventListener('click', () => showPhoto(selectedPhoto + 1));
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showPhoto(selectedPhoto + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
let touchStart = null;
enlarged.addEventListener('touchstart', event => {
  touchStart = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null;
}, {passive: true});
enlarged.addEventListener('touchend', event => {
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart[0];
  const dy = event.changedTouches[0].clientY - touchStart[1];
  touchStart = null;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.35) showPhoto(selectedPhoto + (dx < 0 ? 1 : -1));
}, {passive: true});

const form = byId('contact-form'), reply = byId('form-status');
document.querySelector('.routes').addEventListener('click', event => {
  const link = event.target.closest('[data-route]');
  if (!link) return;
  form.elements.topic.value = link.dataset.route;
  reply.textContent = '';
});
form.addEventListener('input', event => {
  if ('setCustomValidity' in event.target) event.target.setCustomValidity('');
  reply.textContent = '';
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const {name, message} = form.elements;
  for (const field of [name, message]) {
    if (!field.value.trim()) {
      field.setCustomValidity(field === name ? 'Введи имя.' : 'Напиши сообщение.');
      field.reportValidity();
      return;
    }
  }
  reply.textContent = name.value.trim() + ', демо-сообщение готово. Тема — «' + form.elements.topic.value + '».';
});
window.addEventListener('club-closed', () => {
  setMenu(false);
  if (dialog.open) dialog.close();
});
