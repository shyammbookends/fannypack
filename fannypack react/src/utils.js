import { Collapse } from 'bootstrap';

// Smooth-scroll to a section, accounting for the fixed navbar
export function scrollToSection(id, offset = 78) {
  const t = document.getElementById(id);
  if (!t) return;
  window.scrollTo({ top: t.offsetTop - offset, behavior: 'smooth' });
}

// Close Bootstrap mobile navbar if open
export function closeMobileNav() {
  const navCollapse = document.getElementById('navmenu');
  if (navCollapse && navCollapse.classList.contains('show')) {
    const bsCollapse = Collapse.getInstance(navCollapse);
    if (bsCollapse) bsCollapse.hide();
    else navCollapse.classList.remove('show');
  }
}

// Lock/unlock page scroll while a popup is open
export function lockBody(lock) {
  document.body.style.overflow = lock ? 'hidden' : '';
}
