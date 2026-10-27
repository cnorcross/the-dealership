/* Entry point. */
(function () {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.DS.ui.init());
  else window.DS.ui.init();
})();
