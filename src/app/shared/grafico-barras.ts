import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { compacto, soles } from './formato';

export interface PuntoBarras {
  etiqueta: string;
  valores: number[];
}

export interface SerieBarras {
  nombre: string;
  color: string;
}

/* Barras agrupadas en SVG: crecen desde abajo de forma escalonada y muestran detalle al pasar el mouse */
@Component({
  selector: 'app-grafico-barras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="leyenda">
      @for (s of series(); track s.nombre) {
        <span><i [style.background]="s.color"></i>{{ s.nombre }}</span>
      }
    </div>

    <div class="lienzo" (mouseleave)="activo.set(null)">
      <svg [attr.viewBox]="'0 0 ' + ANCHO + ' ' + ALTO" preserveAspectRatio="none" role="img"
        [attr.aria-label]="descripcion()">
        @for (g of geometria().guias; track g.y) {
          <line class="guia" x1="0" [attr.x2]="ANCHO" [attr.y1]="g.y" [attr.y2]="g.y" />
        }
        @for (grupo of geometria().grupos; track grupo.etiqueta; let gi = $index) {
          <rect class="zona" [attr.x]="grupo.x" y="0" [attr.width]="grupo.ancho" [attr.height]="ALTO"
            [class.activa]="activo() === gi" (mouseenter)="activo.set(gi)" />
          @for (b of grupo.barras; track $index; let bi = $index) {
            <rect class="barra" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.ancho" [attr.height]="b.alto"
              rx="4" [attr.fill]="series()[bi].color"
              [style.animation-delay.ms]="gi * 70 + bi * 40" />
          }
        }
      </svg>

      <div class="ejes-y">
        @for (g of geometria().guias; track g.y) {
          <span class="num" [style.top.%]="(g.y / ALTO) * 100">{{ g.texto }}</span>
        }
      </div>

      @if (activo() !== null) {
        @let grupo = geometria().grupos[activo()!];
        <div class="tooltip" [style.left.%]="((grupo.x + grupo.ancho / 2) / ANCHO) * 100">
          <strong>{{ grupo.etiqueta }}</strong>
          @for (s of series(); track s.nombre; let i = $index) {
            <span><i [style.background]="s.color"></i>{{ s.nombre }} <b class="num">{{ soles(datos()[activo()!].valores[i]) }}</b></span>
          }
        </div>
      }
    </div>

    <div class="ejes-x">
      @for (d of datos(); track d.etiqueta) {
        <span>{{ d.etiqueta }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .leyenda { display: flex; gap: 16px; font-size: 12.5px; color: var(--ink-2); margin-bottom: 14px; }
    .leyenda span, .tooltip span { display: inline-flex; align-items: center; gap: 7px; }
    i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
    .lienzo { position: relative; height: 230px; margin-left: 52px; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .guia { stroke: var(--border); stroke-dasharray: 3 5; vector-effect: non-scaling-stroke; }
    .zona { fill: transparent; transition: fill .2s ease; }
    .zona.activa { fill: var(--surface-3); }
    .barra {
      transform-box: fill-box; transform-origin: bottom;
      animation: crecer-barra .9s var(--ease-out) both; pointer-events: none;
    }
    .ejes-y { position: absolute; inset: 0 auto 0 -52px; width: 44px; }
    .ejes-y span { position: absolute; right: 0; transform: translateY(-50%); font-size: 11px; color: var(--ink-3); }
    .ejes-x { display: flex; margin-left: 52px; margin-top: 8px; }
    .ejes-x span { flex: 1; text-align: center; font-size: 12px; color: var(--ink-3); text-transform: capitalize; }
    .tooltip {
      position: absolute; top: 4px; transform: translateX(-50%); z-index: 2; pointer-events: none;
      display: flex; flex-direction: column; gap: 4px; min-width: 170px; padding: 10px 12px;
      background: var(--ink); color: var(--bg); border-radius: 10px; box-shadow: var(--shadow-md);
      font-size: 12px; animation: escalar-entrada .18s var(--ease-out);
    }
    .tooltip strong { text-transform: capitalize; font-size: 12.5px; }
    .tooltip b { margin-left: auto; padding-left: 12px; font-weight: 500; }
  `
})
export class GraficoBarras {
  protected readonly ANCHO = 600;
  protected readonly ALTO = 230;
  protected readonly soles = soles;

  readonly datos = input.required<PuntoBarras[]>();
  readonly series = input.required<SerieBarras[]>();

  protected readonly activo = signal<number | null>(null);

  protected readonly descripcion = computed(
    () => `Gráfico de ${this.series().map((s) => s.nombre).join(' y ')}`
  );

  protected readonly geometria = computed(() => {
    const datos = this.datos();
    const maximo = escalaAmigable(Math.max(1, ...datos.flatMap((d) => d.valores)));
    const guias = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: this.ALTO - f * this.ALTO,
      texto: compacto(maximo * f)
    }));
    const anchoGrupo = this.ANCHO / Math.max(1, datos.length);
    const nSeries = Math.max(1, this.series().length);
    const anchoBarra = Math.min(26, (anchoGrupo * 0.56) / nSeries);
    const grupos = datos.map((d, i) => {
      const x = i * anchoGrupo;
      const inicio = x + (anchoGrupo - anchoBarra * nSeries - 4 * (nSeries - 1)) / 2;
      return {
        etiqueta: d.etiqueta,
        x,
        ancho: anchoGrupo,
        barras: d.valores.map((v, j) => {
          const alto = Math.max(v > 0 ? 3 : 0, (v / maximo) * this.ALTO);
          return { x: inicio + j * (anchoBarra + 4), y: this.ALTO - alto, ancho: anchoBarra, alto };
        })
      };
    });
    return { guias, grupos };
  });
}

/* Redondea el máximo del eje a un número "limpio" (1, 2, 2.5, 5 × 10^n) */
function escalaAmigable(valor: number): number {
  const potencia = Math.pow(10, Math.floor(Math.log10(valor)));
  const base = valor / potencia;
  const paso = base <= 1 ? 1 : base <= 2 ? 2 : base <= 2.5 ? 2.5 : base <= 5 ? 5 : 10;
  return paso * potencia;
}
