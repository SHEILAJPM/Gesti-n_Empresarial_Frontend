import { Injectable, signal } from '@angular/core';

export type Tema = 'light' | 'dark';

const CLAVE_TEMA = 'nexo-tema';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly temaActual = signal<Tema>(
    document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light'
  );

  readonly tema = this.temaActual.asReadonly();

  /* Cambia el tema con una revelación circular que nace en el punto del clic */
  alternar(origen?: MouseEvent): void {
    const siguiente: Tema = this.temaActual() === 'light' ? 'dark' : 'light';
    const raiz = document.documentElement;
    const aplicar = () => {
      raiz.dataset['theme'] = siguiente;
      this.temaActual.set(siguiente);
      try {
        localStorage.setItem(CLAVE_TEMA, siguiente);
      } catch {
        /* sin almacenamiento el tema dura hasta recargar */
      }
    };

    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reducido) {
      aplicar();
      return;
    }

    const x = origen?.clientX ?? window.innerWidth - 40;
    const y = origen?.clientY ?? 30;
    const radio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    raiz.style.setProperty('--tema-x', `${x}px`);
    raiz.style.setProperty('--tema-y', `${y}px`);
    raiz.style.setProperty('--tema-r', `${radio}px`);
    raiz.classList.add('cambiando-tema');

    const transicion = document.startViewTransition(aplicar);
    transicion.finished.finally(() => raiz.classList.remove('cambiando-tema'));
  }
}
