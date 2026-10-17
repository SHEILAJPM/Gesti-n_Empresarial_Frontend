import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { MiBoleta } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Vacio } from '../../shared/bloques';
import { BoletaPago } from '../../shared/boleta-pago';
import { soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { nombrePeriodo } from '../personal/planillas';

@Component({
  selector: 'app-mis-boletas',
  imports: [DatePipe, PageHeader, Icon, Vacio, BoletaPago],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'abierta.set(null)' },
  template: `
    <div class="pila">
      <app-page-header seccion="Mi espacio" titulo="Mis boletas de pago"
        descripcion="Boletas de las planillas aprobadas por Contabilidad. Puedes imprimirlas o guardarlas en PDF." />

      @if (cargando()) {
        <div class="grilla">
          @for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 150px; border-radius: 16px"></div> }
        </div>
      } @else if (boletas().length) {
        <div class="grilla escalonado">
          @for (b of boletas(); track b.detalle.id; let i = $index) {
            <button type="button" class="card card-hover boleta-card" [style.--i]="i" (click)="abierta.set(b)">
              <span class="periodo">{{ nombrePeriodo(b) }}</span>
              <strong class="num">{{ soles(b.detalle.neto) }}</strong>
              <span class="muted">Neto a pagar · {{ b.detalle.diasLaborados }} días</span>
              <span class="pie">
                <span class="badge punto" [class.badge-exito]="b.detalle.estadoPago === 'PAGADO'" [class.badge-alerta]="b.detalle.estadoPago !== 'PAGADO'">
                  {{ b.detalle.estadoPago === 'PAGADO' ? 'Pagado' : 'Pago programado' + (b.fechaPago ? ' · ' + (b.fechaPago | date: 'd MMM') : '') }}
                </span>
                <span class="ver">Ver boleta <app-icon name="flecha" [size]="15" /></span>
              </span>
            </button>
          }
        </div>
      } @else {
        <article class="card">
          <app-vacio icono="recibo" titulo="Aún no tienes boletas"
            texto="Aparecen aquí cuando Contabilidad aprueba la planilla del mes." />
        </article>
      }
    </div>

    @if (abierta(); as b) {
      <div class="boleta-velo" animate.enter="anim-fade-in" animate.leave="anim-fade-out" (click)="abierta.set(null)"></div>
      <div class="boleta-contenedor" role="dialog" aria-modal="true" aria-label="Boleta de pago" animate.enter="anim-pop-in" animate.leave="anim-pop-out">
        <div class="boleta-barra">
          <span>Boleta · {{ nombrePeriodo(b) }}</span>
          <div>
            <button type="button" class="btn btn-sm btn-primario" (click)="imprimir()"><app-icon name="documento" [size]="15" /> Imprimir o guardar PDF</button>
            <button type="button" class="btn btn-sm btn-fantasma btn-icono" (click)="abierta.set(null)" aria-label="Cerrar"><app-icon name="cerrar" [size]="16" /></button>
          </div>
        </div>
        <app-boleta-pago [detalle]="b.detalle" [periodo]="nombrePeriodo(b)" />
      </div>
    }
  `,
  styles: `
    .grilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
    .boleta-card {
      display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 18px 20px;
      text-align: left; cursor: pointer; font: inherit; color: inherit;
    }
    .periodo { font-size: 12px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--brand); }
    .boleta-card strong { font-size: 26px; font-weight: 600; letter-spacing: -.03em; }
    .pie { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 12px; gap: 8px; }
    .ver { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--brand); }
    .boleta-velo { position: fixed; inset: 0; z-index: 80; background: rgba(8, 15, 26, .5); backdrop-filter: blur(4px); }
    .boleta-contenedor {
      position: fixed; z-index: 81; top: 4vh; left: 0; right: 0; max-height: 92vh; margin: 0 auto;
      width: min(760px, calc(100vw - 24px)); display: flex; flex-direction: column; overflow: hidden;
      border-radius: var(--radius-lg); background: var(--surface-3); box-shadow: var(--shadow-lg);
    }
    .boleta-contenedor app-boleta-pago { overflow-y: auto; }
    .boleta-barra {
      display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px;
      background: var(--surface); border-bottom: 1px solid var(--border); font-weight: 600; font-size: 13.5px;
    }
    .boleta-barra div { display: flex; gap: 6px; }
  `
})
export class MisBoletas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly soles = soles;
  protected readonly nombrePeriodo = nombrePeriodo;

  protected readonly cargando = signal(true);
  protected readonly boletas = signal<MiBoleta[]>([]);
  protected readonly abierta = signal<MiBoleta | null>(null);

  constructor() {
    this.api.portal.misBoletas().subscribe({
      next: (lista) => {
        this.boletas.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected imprimir(): void {
    const raiz = document.documentElement;
    raiz.classList.add('imprimiendo-boleta');
    window.addEventListener('afterprint', () => raiz.classList.remove('imprimiendo-boleta'), { once: true });
    window.print();
  }
}
