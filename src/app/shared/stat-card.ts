import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Contador } from './contador';
import { Formato } from './formato';
import { Icon, NombreIcono } from './icon';

export type Tono = 'brand' | 'alerta' | 'info' | 'peligro' | 'exito';

/* Tarjeta de indicador: número animado, ícono y una mini curva opcional */
@Component({
  selector: 'app-stat-card',
  imports: [Contador, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card card-hover kpi" [class]="'tono-' + tono()">
      <div class="kpi-top">
        <span class="kpi-titulo">{{ titulo() }}</span>
        <span class="kpi-icono"><app-icon [name]="icono()" [size]="18" /></span>
      </div>

      @if (cargando()) {
        <div class="skeleton" style="height: 34px; width: 70%; margin: 6px 0 4px"></div>
      } @else {
        <strong class="kpi-valor num" [appContador]="valor()" [formato]="formato()"></strong>
      }

      <div class="kpi-pie">
        @if (detalle()) {
          <span class="kpi-detalle">{{ detalle() }}</span>
        }
        @if (trazo(); as t) {
          <svg class="kpi-curva" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient [attr.id]="'g-' + idGradiente" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stop-color="currentColor" stop-opacity="0.25" />
                <stop offset="1" stop-color="currentColor" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path class="area" [attr.d]="t.area" [attr.fill]="'url(#g-' + idGradiente + ')'" />
            <path class="linea" [attr.d]="t.linea" pathLength="1" />
          </svg>
        }
      </div>
    </article>
  `,
  styles: `
    :host { display: block; }
    .kpi { padding: 18px 20px; display: flex; flex-direction: column; gap: 6px; min-height: 142px; overflow: hidden; }
    .kpi-top { display: flex; align-items: center; justify-content: space-between; }
    .kpi-titulo { font-size: 13px; font-weight: 600; color: var(--ink-2); }
    .kpi-icono {
      display: grid; place-items: center; width: 36px; height: 36px; border-radius: 11px;
      background: var(--tono-suave); color: var(--tono);
      transition: transform .4s var(--ease-spring);
    }
    .kpi:hover .kpi-icono { transform: rotate(-8deg) scale(1.08); }
    .kpi-valor { font-size: 27px; font-weight: 600; letter-spacing: -0.03em; color: var(--ink); line-height: 1.25; }
    .kpi-pie { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
    .kpi-detalle { font-size: 12.5px; color: var(--ink-3); }
    .kpi-curva { width: 96px; height: 32px; color: var(--tono); flex-shrink: 0; overflow: visible; }
    .linea {
      fill: none; stroke: currentColor; stroke-width: 2; vector-effect: non-scaling-stroke;
      stroke-dasharray: 1; stroke-dashoffset: 1; animation: trazar 1.3s .25s var(--ease-out) forwards;
    }
    .area { opacity: 0; animation: aparecer .8s .7s ease forwards; }
    .tono-brand { --tono: var(--brand); --tono-suave: var(--brand-soft); }
    .tono-alerta { --tono: var(--accent); --tono-suave: var(--accent-soft); }
    .tono-info { --tono: var(--info); --tono-suave: var(--info-soft); }
    .tono-peligro { --tono: var(--danger); --tono-suave: var(--danger-soft); }
    .tono-exito { --tono: var(--success); --tono-suave: var(--success-soft); }
  `
})
export class StatCard {
  private static contadorId = 0;
  protected readonly idGradiente = ++StatCard.contadorId;

  readonly titulo = input.required<string>();
  readonly valor = input.required<number>();
  readonly icono = input.required<NombreIcono>();
  readonly formato = input<Formato>('entero');
  readonly tono = input<Tono>('brand');
  readonly detalle = input<string>('');
  readonly serie = input<number[]>([]);
  readonly cargando = input(false);

  protected readonly trazo = computed(() => {
    const datos = this.serie();
    if (datos.length < 2) {
      return null;
    }
    const max = Math.max(...datos);
    const min = Math.min(...datos);
    const rango = max - min || 1;
    const puntos = datos.map((v, i) => [(i / (datos.length - 1)) * 100, 28 - ((v - min) / rango) * 24]);
    const linea = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { linea, area: `${linea} L100,32 L0,32 Z` };
  });
}
