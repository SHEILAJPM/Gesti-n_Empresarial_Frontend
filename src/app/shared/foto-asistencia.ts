import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api/api.service';
import { Icon } from './icon';

/* Muestra la foto de una marcación. Se descarga con la sesión (token JWT) y se enseña como URL local:
   un <img src> directo no enviaría las credenciales.
   fotoId → vista de RRHH; marcacionPropia → el trabajador viendo la suya. */
@Component({
  selector: 'app-foto-asistencia',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (estado()) {
      @case ('cargando') { <div class="skeleton marco"></div> }
      @case ('error') {
        <div class="marco vacio"><app-icon name="alerta" [size]="22" /><span>No se pudo cargar la foto</span></div>
      }
      @case ('lista') {
        <a class="marco" [href]="url()" target="_blank" rel="noopener" title="Abrir en tamaño completo">
          <img [src]="url()" [alt]="alt()" />
        </a>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .marco {
      display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 14px; overflow: hidden;
      background: var(--surface-3); border: 1px solid var(--border);
    }
    img { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
    .vacio { display: grid; place-content: center; justify-items: center; gap: 8px; color: var(--ink-3); font-size: 13px; }
  `
})
export class FotoAsistencia {
  private readonly api = inject(ApiService);

  readonly fotoId = input<number | null>(null);
  readonly marcacionPropia = input<number | null>(null);
  readonly alt = input('Foto tomada al marcar asistencia');

  protected readonly estado = signal<'cargando' | 'lista' | 'error'>('cargando');
  protected readonly url = signal<string | null>(null);
  private peticion: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.liberar());
    effect(() => {
      const fotoId = this.fotoId();
      const propia = this.marcacionPropia();
      untracked(() => this.liberar());
      if (fotoId === null && propia === null) {
        this.estado.set('error');
        return;
      }
      this.estado.set('cargando');
      const fuente = fotoId !== null ? this.api.asistencia.foto(fotoId) : this.api.portal.miFoto(propia!);
      this.peticion = fuente.subscribe({
        next: (blob) => {
          this.url.set(URL.createObjectURL(blob));
          this.estado.set('lista');
        },
        error: () => this.estado.set('error')
      });
    });
  }

  private liberar(): void {
    this.peticion?.unsubscribe();
    this.peticion = null;
    const anterior = this.url();
    if (anterior) {
      URL.revokeObjectURL(anterior);
      this.url.set(null);
    }
  }
}
