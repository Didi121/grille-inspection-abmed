// ═══════════════════ TOAST NOTIFICATIONS ═══════════════════
// Module indépendant sans dépendances — évite les imports circulaires

function ensureToastContainer() {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

export function showToast(message, type = 'info', duration = 3000) {
  const c = ensureToastContainer();
  const t = document.createElement('div');
  t.className = 'toast' + (type !== 'info' ? ' ' + type : '');
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(20px)';
    setTimeout(() => t.remove(), 300);
  }, duration);
}
