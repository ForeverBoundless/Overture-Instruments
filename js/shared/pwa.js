// Progressive enhancement only: the application remains usable when service
// workers are unavailable (for example in private browsing contexts).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch((err) => {
    console.warn('Overture offline support could not be enabled.', err);
  }));
}
