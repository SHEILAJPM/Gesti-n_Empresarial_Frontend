import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { Formato, formatear } from './formato';

/* Anima un número desde el valor anterior hasta el nuevo: <span [appContador]="total" formato="soles"></span> */
@Directive({ selector: '[appContador]' })
export class Contador implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private cuadro = 0;
  private mostrado = 0;

  readonly appContador = input.required<number>();
  readonly formato = input<Formato>('entero');
  readonly duracion = input(1100);

  constructor() {
    effect(() => this.animar(this.appContador() ?? 0, this.formato(), this.duracion()));
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.cuadro);
  }

  private animar(destino: number, formato: Formato, duracion: number): void {
    cancelAnimationFrame(this.cuadro);
    const origen = this.mostrado;
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducido || origen === destino) {
      this.pintar(destino, formato);
      return;
    }
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const suavizado = 1 - Math.pow(2, -10 * t); // easeOutExpo
      this.pintar(t === 1 ? destino : origen + (destino - origen) * suavizado, formato);
      if (t < 1) {
        this.cuadro = requestAnimationFrame(paso);
      }
    };
    this.cuadro = requestAnimationFrame(paso);
  }

  private pintar(valor: number, formato: Formato): void {
    this.mostrado = valor;
    this.el.nativeElement.textContent = formatear(valor, formato);
  }
}
