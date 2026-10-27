document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  const cabecera = document.querySelector('body > header');
  const volverArriba = document.querySelector('.volver-arriba');
  const progresoPagina = document.querySelector('.progreso-pagina');
  const elementosAnimados = document.querySelectorAll('.panel, .servicio, .contador');
  const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  elementosAnimados.forEach((elemento, indice) => {
    elemento.classList.add('revelar');
    elemento.style.setProperty('--retraso', `${Math.min(indice * 55, 275)}ms`);
  });

  if (movimientoReducido || !('IntersectionObserver' in window)) {
    elementosAnimados.forEach((elemento) => elemento.classList.add('visible'));
  } else {
    const observador = new IntersectionObserver((entradas, instancia) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('visible');
        instancia.unobserve(entrada.target);
      });
    }, { threshold: 0.12 });

    elementosAnimados.forEach((elemento) => observador.observe(elemento));
  }

  const actualizarDesplazamiento = () => {
    const desplazada = window.scrollY > 12;
    cabecera?.classList.toggle('con-sombra', desplazada);
    volverArriba?.classList.toggle('visible', window.scrollY > 420);

    if (progresoPagina) {
      const recorrido = document.documentElement.scrollHeight - window.innerHeight;
      const avance = recorrido > 0 ? Math.min(window.scrollY / recorrido, 1) : 0;
      progresoPagina.style.transform = `scaleX(${avance})`;
    }
  };

  actualizarDesplazamiento();
  window.addEventListener('scroll', actualizarDesplazamiento, { passive: true });

  volverArriba?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: movimientoReducido ? 'auto' : 'smooth' });
  });

  document.querySelectorAll('.servicio').forEach((tarjeta) => {
    tarjeta.addEventListener('pointermove', (evento) => {
      const caja = tarjeta.getBoundingClientRect();
      tarjeta.style.setProperty('--puntero-x', `${evento.clientX - caja.left}px`);
      tarjeta.style.setProperty('--puntero-y', `${evento.clientY - caja.top}px`);

      if (!movimientoReducido && evento.pointerType !== 'touch') {
        const x = (evento.clientX - caja.left) / caja.width - 0.5;
        const y = (evento.clientY - caja.top) / caja.height - 0.5;
        tarjeta.style.setProperty('--giro-x', `${(-y * 1.8).toFixed(2)}deg`);
        tarjeta.style.setProperty('--giro-y', `${(x * 1.8).toFixed(2)}deg`);
        tarjeta.classList.add('interactiva');
      }
    });

    tarjeta.addEventListener('pointerleave', () => {
      tarjeta.classList.remove('interactiva');
      tarjeta.style.removeProperty('--giro-x');
      tarjeta.style.removeProperty('--giro-y');
    });
  });

  document.querySelectorAll('.acceso, .consulta').forEach((enlace) => {
    enlace.addEventListener('pointerdown', (evento) => {
      enlace.classList.add('presionado');

      if (!movimientoReducido) {
        const caja = enlace.getBoundingClientRect();
        const onda = document.createElement('span');
        const diametro = Math.max(caja.width, caja.height) * 1.6;
        onda.className = 'onda';
        onda.style.width = `${diametro}px`;
        onda.style.height = `${diametro}px`;
        onda.style.left = `${evento.clientX - caja.left}px`;
        onda.style.top = `${evento.clientY - caja.top}px`;
        enlace.appendChild(onda);
        onda.addEventListener('animationend', () => onda.remove(), { once: true });
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((evento) => {
      enlace.addEventListener(evento, () => enlace.classList.remove('presionado'));
    });
  });
});
