// WT namespace unico e sicuro
window.WT = (function () {

  // --- Tema (compatibilità futura) ---
  const KEY = 'wt-theme';
  const html = document.documentElement;

  function prefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function swapLogo(theme) {
    const img = document.querySelector('.wt-logo');
    if (!img) return;
    const darkSrc = img.getAttribute('data-logo-dark');
    const lightSrc = img.getAttribute('data-logo-light') || img.getAttribute('src');
    if (!darkSrc) return;

    if (theme === 'dark') img.src = darkSrc;
    else if (theme === 'light') img.src = lightSrc;
    else img.src = prefersDark() ? darkSrc : lightSrc;
  }

  function applyTheme(theme) {
    if (theme) html.dataset.theme = theme;
    else html.removeAttribute('data-theme');
    swapLogo(theme);
  }

  function getStoredTheme() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  function setStoredTheme(v) {
    try { localStorage.setItem(KEY, v); } catch { }
  }

  function toggleTheme() {
    const current = getStoredTheme();
    let next = current === 'dark' ? 'light' : 'dark';
    setStoredTheme(next);
    applyTheme(next);
  }

  function applyStoredTheme() {
    const stored = getStoredTheme();
    applyTheme(stored);
  }

  // --- Sidebar mobile ---
  function toggleSidebar() {
    const el = document.getElementById('wt-sidebar');
    if (!el) return;
    const open = el.classList.toggle('open');
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  // Inizializzazione
  document.addEventListener('DOMContentLoaded', applyStoredTheme);

  return {
    toggleTheme,
    applyStoredTheme,
    toggleSidebar,
    switchTab: function (tabId, btn) {
      const container = btn.closest('.wt-tabs-container');
      if (!container) return;

      // Update buttons
      container.querySelectorAll('.wt-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update contents
      container.querySelectorAll('.wt-tab-content').forEach(c => c.classList.remove('active'));
      const target = container.querySelector('#' + tabId);
      if (target) target.classList.add('active');
    }
  };

})();
