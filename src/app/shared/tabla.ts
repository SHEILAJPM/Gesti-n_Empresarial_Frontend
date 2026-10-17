import { Signal, computed, signal } from '@angular/core';
import { sinTildes } from './formato';

/* Estado de una tabla en el cliente: búsqueda sin tildes, filtro extra, orden y paginación */
export class TablaEstado<T> {
  readonly busqueda = signal('');
  readonly pagina = signal(1);
  readonly orden = signal<{ campo: keyof T; dir: 1 | -1 } | null>(null);

  readonly filtradas: Signal<T[]>;
  readonly visibles: Signal<T[]>;
  readonly paginas: Signal<number>;

  constructor(
    fuente: Signal<T[]>,
    textoDe: (fila: T) => string,
    readonly tamano = 8,
    filtroExtra: Signal<(fila: T) => boolean> = signal(() => true)
  ) {
    this.filtradas = computed(() => {
      const termino = sinTildes(this.busqueda().trim());
      const filtro = filtroExtra();
      const filas = fuente().filter((f) => filtro(f) && (!termino || sinTildes(textoDe(f)).includes(termino)));
      const orden = this.orden();
      if (!orden) {
        return filas;
      }
      return [...filas].sort((a, b) => {
        const x = a[orden.campo];
        const y = b[orden.campo];
        if (typeof x === 'number' && typeof y === 'number') {
          return (x - y) * orden.dir;
        }
        return String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true }) * orden.dir;
      });
    });
    this.paginas = computed(() => Math.max(1, Math.ceil(this.filtradas().length / this.tamano)));
    this.visibles = computed(() => {
      const pagina = Math.min(this.pagina(), this.paginas());
      return this.filtradas().slice((pagina - 1) * this.tamano, pagina * this.tamano);
    });
  }

  buscar(texto: string): void {
    this.busqueda.set(texto);
    this.pagina.set(1);
  }

  ordenarPor(campo: keyof T): void {
    const actual = this.orden();
    this.orden.set({ campo, dir: actual?.campo === campo && actual.dir === 1 ? -1 : 1 });
  }

  flecha(campo: keyof T): string {
    const actual = this.orden();
    return actual?.campo === campo ? (actual.dir === 1 ? '↑' : '↓') : '';
  }
}
