const gallery = [...document.querySelectorAll('.archive-photo .enlarge')];
const viewer = document.querySelector('#viewer');
const large = document.querySelector('#large');
const legend = document.querySelector('#legend');
const fullSize = document.querySelector('#full-size');
const position = document.querySelector('#position');
let current = 0;
let opener;
let touchStart;

function selectImage(index) {
  current = (index + gallery.length) % gallery.length;
  const link = gallery[current];
  const caption = link.nextElementSibling;
  large.src = link.href;
  large.alt = link.querySelector('img').alt;
  fullSize.href = link.href;
  legend.replaceChildren(...Array.from(caption.children, element => element.cloneNode(true)));
  position.textContent = (current + 1) + ' / ' + gallery.length;
}

if (typeof viewer.showModal === 'function') {
  for (const [index, link] of gallery.entries()) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      opener = link;
      selectImage(index);
      viewer.showModal();
    });
  }
  document.querySelector('#close').addEventListener('click', () => viewer.close());
  document.querySelector('#previous').addEventListener('click', () => selectImage(current - 1));
  document.querySelector('#next').addEventListener('click', () => selectImage(current + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectImage(current + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  viewer.addEventListener('close', () => {
    touchStart = undefined;
    large.removeAttribute('src');
    opener?.focus({preventScroll: true});
  });
  viewer.addEventListener('click', event => {
    if (event.target === viewer) viewer.close();
  });
  large.addEventListener('touchstart', event => {
    touchStart = event.touches.length === 1 ? event.touches[0] : undefined;
  }, {passive: true});
  large.addEventListener('touchcancel', () => { touchStart = undefined; }, {passive: true});
  large.addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.clientX;
    const dy = event.changedTouches[0].clientY - touchStart.clientY;
    touchStart = undefined;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy)) selectImage(current + (dx < 0 ? 1 : -1));
  }, {passive: true});
}
