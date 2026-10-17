import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Contador } from './contador';
import { Formato, formatear } from './formato';

export interface SegmentoDona {
  etiqueta: string;
  valor: number;
  color: string;
}

/* Dona en SVG: cada segmento se dibuja en secuencia; al pasar el mouse resalta y cambia el centro */
@Component({
  selector: 'app-grafico-dona',
  imports: [Contador],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor">
      <div class="dona">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="pista" cx="60" cy="60" r="48" />
          @for (s of arcos(); track s.etiqueta; let i = $index) {
            <circle class="arco" cx="60" cy="60" r="48" pathLength="100"
              [attr.stroke]="s.color" [attr.stroke-dasharray]="s.largo + ' ' + (100 - s.largo)"
              [style.stroke-dashoffset]="-s.desde" [style.animation-delay.ms]="200 + i * 220"
              [class.atenuado]="activo() !== null && activo() !== i"
              (mouseenter)="activo.set(i)" (mouseleave)="activo.set(null)" />
          }
        </svg>
        <div class="centro">
          <strong class="num" [appContador]="centro().valor" [formato]="formato()"></strong>
          <span>{{ centro().etiqueta }}</span>
        </div>
      </div>

      <ul class="leyenda">
        @for (s of arcos(); track s.etiqueta; let i = $index) {
          <li (mouseenter)="activo.set(i)" (mouseleave)="activo.set(null)" [class.activo]="activo() === i">
            <i [style.background]="s.color"></i>
            <span>{{ s.etiqueta }}</span>
            <b class="num">{{ formatear(s.valor, formato()) }}</b>
            <small class="num">{{ s.porcentaje }}%</small>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    .contenedor { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; justify-content: center; }
    .dona { position: relative; width: 168px; height: 168px; flex-shrink: 0; }
    svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .pista { fill: none; stroke: var(--surface-3); stroke-width: 13; }
    .arco {
      fill: none; stroke-width: 13; stroke-linecap: butt; cursor: pointer;
      animation: llenar 1s var(--ease-out) both;
      transition: opacity .2s ease, stroke-width .25s var(--ease-spring);
    }
    .arco:hover { stroke-width: 16; }
    .arco.atenuado { opacity: .3; }
    @keyframes llenar { from { stroke-dasharray: 0 100; } }
    .centro { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
    .centro strong { font-size: 22px; font-weight: 600; }
    .centro span { font-size: 12px; color: var(--ink-3); }
    .leyenda { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-width: 190px; flex: 1; }
    li {
      display: grid; grid-template-columns: 10px 1fr auto auto; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 10px; font-size: 13px; transition: background-color .2s ease;
    }
    li.activo { background: var(--surface-3); }
    i { width: 10px; height: 10px; border-radius: 3px; }
    b { font-weight: 500; }
    small { color: var(--ink-3); min-width: 38px; text-align: right; }
  `
})
export class GraficoDona {
  protected readonly formatear = formatear;

  readonly segmentos = input.required<SegmentoDona[]>();
  readonly formato = input<Formato>('entero');
  readonly etiquetaTotal = input('Total');

  protected readonly activo = signal<number | null>(null);

  protected readonly arcos = computed(() => {
    const total = this.segmentos().reduce((suma, s) => suma + s.valor, 0) || 1;
    let acumulado = 0;
    return this.segmentos().map((s) => {
      const largo = (s.valor / total) * 100;
      const arco = { ...s, largo, desde: acumulado, porcentaje: Math.round(largo) };
      acumulado += largo;
      return arco;
    });
  });

  protected readonly centro = computed(() => {
    const i = this.activo();
    if (i !== null) {
      const s = this.segmentos()[i];
      return { valor: s.valor, etiqueta: s.etiqueta };
    }
    return { valor: this.segmentos().reduce((suma, s) => suma + s.valor, 0), etiqueta: this.etiquetaTotal() };
  });
}
