// Smooth-scroll to a section, accounting for the fixed navbar
export function scrollToSection(id, offset = 78) {
  const t = document.getElementById(id);
  if (!t) return;
  window.scrollTo({ top: t.offsetTop - offset, behavior: 'smooth' });
}

// Mobile navbar: Bootstrap's CSS shows ".navbar-collapse" when it has "show"
// (no Bootstrap JavaScript needed for just this)
export function toggleMobileNav() {
  const nav = document.getElementById('navmenu');
  if (!nav) return;
  const open = nav.classList.toggle('show');
  document.querySelector('[aria-controls="navmenu"]')?.setAttribute('aria-expanded', String(open));
}

export function closeMobileNav() {
  const nav = document.getElementById('navmenu');
  if (nav?.classList.contains('show')) {
    nav.classList.remove('show');
    document.querySelector('[aria-controls="navmenu"]')?.setAttribute('aria-expanded', 'false');
  }
}

// Lock/unlock page scroll while a popup is open
export function lockBody(lock) {
  document.body.style.overflow = lock ? 'hidden' : '';
}
