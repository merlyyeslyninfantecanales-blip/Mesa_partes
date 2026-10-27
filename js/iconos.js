window.actualizarIconos = (raiz = document) => {
  if (window.lucide) {
    window.lucide.createIcons({ root: raiz, attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } });
  }
};

document.addEventListener('DOMContentLoaded', () => window.actualizarIconos());
