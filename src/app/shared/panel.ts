import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output } from '@angular/core';
import { Icon } from './icon';

/* Panel lateral para formularios. Contenido por defecto = cuerpo; [pie] = botones */
@Component({
  selector: 'app-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'abierto() && cerrar.emit()' },
  template: `
    @if (abierto()) {
      <div class="velo" animate.enter="anim-fade-in" animate.leave="anim-fade-out" (click)="cerrar.emit()"></div>
      <aside class="panel" role="dialog" aria-modal="true" [attr.aria-label]="titulo()"
        animate.enter="anim-panel-in" animate.leave="anim-panel-out">
        <header class="papel-contable">
          <div>
            @if (etiqueta()) { <span class="etiqueta">{{ etiqueta() }}</span> }
            <h2>{{ titulo() }}</h2>
            @if (descripcion()) { <p>{{ descripcion() }}</p> }
          </div>
          <button type="button" class="btn btn-fantasma btn-icono" (click)="cerrar.emit()" aria-label="Cerrar">
            <app-icon name="cerrar" />
          </button>
        </header>
        <div class="cuerpo"><ng-content /></div>
        <footer><ng-content select="[pie]" /></footer>
      </aside>
    }
  `,
  styles: `
    .velo { position: fixed; inset: 0; z-index: 60; background: rgba(8, 15, 26, .38); backdrop-filter: blur(3px); }
    .panel {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 61;
      width: min(520px, 100vw); display: flex; flex-direction: column;
      background: var(--surface); border-left: 1px solid var(--border); box-shadow: var(--shadow-lg);
    }
    header {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
      padding: 24px 24px 20px; border-bottom: 1px solid var(--border);
    }
    .etiqueta { font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--brand); }
    h2 { font-size: 21px; margin-top: 4px; }
    header p { color: var(--ink-3); font-size: 13.5px; margin-top: 4px; }
    .cuerpo { flex: 1; overflow-y: auto; padding: 24px; }
    footer {
      display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px;
      border-top: 1px solid var(--border); background: var(--surface-2);
    }
    footer:empty { display: none; }
  `
})
export class Panel {
  private readonly el = inject(ElementRef<HTMLElement>);

  readonly abierto = input.required<boolean>();
  readonly titulo = input.required<string>();
  readonly etiqueta = input('');
  readonly descripcion = input('');
  readonly cerrar = output<void>();

  constructor() {
    // Lleva el foco al primer campo al abrir
    effect(() => {
      if (this.abierto()) {
        setTimeout(() => this.el.nativeElement.querySelector('input, select, textarea')?.focus(), 80);
      }
    });
  }
}
