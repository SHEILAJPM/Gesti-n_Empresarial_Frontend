import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Despacho, EstadoAlistamiento } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Vacio } from '../../shared/bloques';
import { Icon } from '../../shared/icon';

export const ESTADO_ALISTAMIENTO: Record<EstadoAlistamiento, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Por alistar', clase: 'badge-alerta' },
  EN_PROCESO: { texto: 'Alistando', clase: 'badge-info' },
  LISTO: { texto: 'Listo para despachar', clase: 'badge-exito' }
};

/* Pedidos que Almacén debe alistar: se abre uno y se escanean los productos con el celular */
@Component({
  selector: 'app-despachos',
  imports: [DatePipe, RouterLink, PageHeader, Icon, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Abastecimiento" titulo="Alistar pedidos"
        descripcion="Abre un pedido y escanea con el celular cada producto que sacas del estante. Cuando esté completo, crea la guía." />

      @if (cargando()) {
        <div class="pila">@for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 110px; border-radius: 16px"></div> }</div>
      } @else {
        <div class="lista">
          @for (d of despachos(); track d.ventaId; let i = $index) {
            <article class="card pedido entrada" [style.--i]="i">
              <div class="cabeza">
                <div>
                  <strong>{{ d.cliente }}</strong>
                  <small class="muted">{{ d.numeroComprobante }} · {{ d.fecha | date: 'd MMM' }}@if (d.emitidaPor) { · vendió {{ d.emitidaPor }} }</small>
                </div>
                <span class="badge punto" [class]="estados[d.estadoAlistamiento].clase">{{ estados[d.estadoAlistamiento].texto }}</span>
              </div>
              <div class="avance">
                <div class="barra"><span [style.width.%]="d.unidadesPedidas ? (d.unidadesAlistadas / d.unidadesPedidas) * 100 : 0"></span></div>
                <small class="num">{{ d.unidadesAlistadas }} de {{ d.unidadesPedidas }} unidades · {{ d.items.length }} productos</small>
              </div>
              <div class="botones">
                @if (d.estadoAlistamiento === 'LISTO') {
                  <a class="btn btn-sm" [routerLink]="['/despachos', d.ventaId]">Ver</a>
                  <a class="btn btn-sm btn-primario" routerLink="/guias" [queryParams]="{ venta: d.ventaId }"><app-icon name="camion" [size]="15" /> Crear guía</a>
                } @else {
                  <a class="btn btn-primario" [routerLink]="['/despachos', d.ventaId]">
                    <app-icon name="camara" [size]="16" /> {{ d.estadoAlistamiento === 'EN_PROCESO' ? 'Seguir alistando' : 'Alistar' }}
                  </a>
                }
              </div>
            </article>
          } @empty {
            <article class="card"><app-vacio icono="checkCirculo" titulo="Nada por alistar" texto="No hay pedidos con mercadería pendientes de despacho." /></article>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .pedido { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .cabeza { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .cabeza div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .avance { display: flex; flex-direction: column; gap: 6px; }
    .barra { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
    .barra span { display: block; height: 100%; background: var(--brand); transition: width .3s; }
    .botones { display: flex; gap: 8px; justify-content: flex-end; }
  `
})
export class Despachos {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly estados = ESTADO_ALISTAMIENTO;
  protected readonly cargando = signal(true);
  protected readonly despachos = signal<Despacho[]>([]);

  constructor() {
    this.api.despachos.pendientes().subscribe({
      next: (l) => {
        this.despachos.set(l);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }
}
