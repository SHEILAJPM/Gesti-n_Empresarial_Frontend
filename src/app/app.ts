import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Avisos } from './shared/avisos';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Avisos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'onda($event)' },
  template: `
    <router-outlet />
    <app-avisos />
  `
})
export class App {
  /* Onda desde el punto del clic en cualquier botón .btn de la aplicación */
  protected onda(evento: PointerEvent): void {
    const boton = (evento.target as HTMLElement | null)?.closest<HTMLElement>('.btn');
    if (!boton || boton.matches(':disabled')) {
      return;
    }
    const caja = boton.getBoundingClientRect();
    const onda = document.createElement('span');
    onda.className = 'onda';
    onda.style.left = `${evento.clientX - caja.left}px`;
    onda.style.top = `${evento.clientY - caja.top}px`;
    boton.appendChild(onda);
    onda.addEventListener('animationend', () => onda.remove());
  }
}
