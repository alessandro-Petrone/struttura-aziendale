// Namespace globale semplice
window.WT = window.WT || {};

WT.toggleSidebar = function () {
  var sb = document.getElementById('wt-sidebar');
  if (sb) sb.classList.toggle('open');
};
// Namespace globale sicuro
window.WT = window.WT || (function () {
  const KEY = 'wt-theme'; // 'light' | 'dark'
  const html = document.documentElement;

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      html.setAttribute('data-theme', theme);
      swapLogo(theme);
    } else {
      html.removeAttribute('data-theme'); // fallback a prefers-color-scheme
      swapLogo(null);
    }
  }

  function getStoredTheme() {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }
  function setStoredTheme(v) {
    try { localStorage.setItem(KEY, v); } catch (_) {}
  }

  function prefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Cambia tema: light <-> dark (se not set, usa prefers e imposta l'altro)
  function toggleTheme() {
    const current = getStoredTheme();
    let next;
    if (current === 'dark') next = 'light';
    else if (current === 'light') next = 'dark';
    else next = prefersDark() ? 'light' : 'dark';

    setStoredTheme(next);
    applyTheme(next);
  }

  // Applica il tema memorizzato (usata al primo paint)
  function applyStoredTheme() {
    const stored = getStoredTheme();
    if (stored) applyTheme(stored);
    else applyTheme(null);
  }

  // Logo swap (se presenti data attributes)
  function swapLogo(theme) {
    const img = document.querySelector('.wt-logo');
    if (!img) return;
    const darkSrc = img.getAttribute('data-logo-dark');
    const lightSrc = img.getAttribute('data-logo-light') || img.getAttribute('src');
    if (!darkSrc) return; // non c'è variante scura, esci

    if (theme === 'dark') img.setAttribute('src', darkSrc);
    else if (theme === 'light') img.setAttribute('src', lightSrc);
    else {
      // segue prefers-color-scheme
      if (prefersDark()) img.setAttribute('src', darkSrc);
      else img.setAttribute('src', lightSrc);
    }
  }

  // Sidebar
  function toggleSidebar() {
    const el = document.getElementById('wt-sidebar');
    if (!el) return;
    const open = el.classList.toggle('open');
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  // Espone API
  return {
    toggleTheme,
    applyStoredTheme,
    toggleSidebar
  };
})();

// Applica il tema appena caricato
document.addEventListener('DOMContentLoaded', function () {
  if (window.WT && WT.applyStoredTheme) WT.applyStoredTheme();
});
