import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { VentasPorProducto, VentasPorVendedor } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Vacio } from '../../shared/bloques';
import { descargarCsv } from '../../shared/csv';
import { colorAvatar, hoyIso, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { StatCard } from '../../shared/stat-card';

/* Cuánto vendió cada vendedor y qué productos se vendieron en el periodo (solo comprobantes emitidos) */
@Component({
  selector: 'app-reportes-ventas',
  imports: [DecimalPipe, PageHeader, StatCard, Icon, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Comercial" titulo="Reportes de ventas"
        descripcion="Ventas emitidas (sin anuladas) por vendedor y por producto en el periodo elegido." />

      <article class="card entrada">
        <div class="filtros" style="flex-wrap: wrap; gap: 10px">
          <label class="en-linea">Desde <input type="date" class="control" [value]="desde()" (change)="desde.set($any($event.target).value)" /></label>
          <label class="en-linea">Hasta <input type="date" class="control" [value]="hasta()" (change)="hasta.set($any($event.target).value)" /></label>
          <button type="button" class="btn btn-primario" (click)="cargar()"><app-icon name="recargar" [size]="16" /> Actualizar</button>
        </div>
      </article>

      <section class="grid-kpi escalonado">
        <app-stat-card style="--i: 0" titulo="Total vendido" [valor]="total()" formato="soles" icono="recibo" [cargando]="cargando()" detalle="con IGV" />
        <app-stat-card style="--i: 1" titulo="Comprobantes" [valor]="comprobantes()" icono="documento" tono="info" [cargando]="cargando()" />
        <app-stat-card style="--i: 2" titulo="Mejor vendedor" [valor]="vendedores()[0]?.total ?? 0" formato="soles" icono="usuario" tono="exito"
          [cargando]="cargando()" [detalle]="vendedores()[0]?.vendedor ?? '—'" />
      </section>

      <div class="grid-2">
        <article class="card entrada">
          <header class="card-cabecera">
            <h3 style="margin: 0">Por vendedor</h3>
            <button type="button" class="btn btn-sm" [disabled]="!vendedores().length" (click)="csvVendedores()"><app-icon name="bajada" [size]="15" /> CSV</button>
          </header>
          @if (vendedores().length) {
            <div class="tabla-contenedor">
              <table class="tabla">
                <thead><tr><th>Vendedor</th><th class="right">Comprob.</th><th class="right">Sin IGV</th><th class="right">Total</th><th class="right">%</th></tr></thead>
                <tbody>
                  @for (v of vendedores(); track v.vendedor) {
                    <tr>
                      <td><div class="celda-persona"><span class="avatar" [style.background]="colorAvatar(v.vendedor)">{{ iniciales(v.vendedor) }}</span><strong>{{ v.vendedor }}</strong></div></td>
                      <td class="right num">{{ v.comprobantes }}</td>
                      <td class="right num muted">{{ soles(v.totalSinIgv) }}</td>
                      <td class="right num"><strong>{{ soles(v.total) }}</strong></td>
                      <td class="right num muted">{{ (total() ? (v.total / total()) * 100 : 0) | number: '1.0-1' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else if (!cargando()) {
            <app-vacio icono="usuarios" titulo="Sin ventas" texto="No hay comprobantes emitidos en el periodo." />
          }
        </article>

        <article class="card entrada">
          <header class="card-cabecera">
            <h3 style="margin: 0">Por producto</h3>
            <button type="button" class="btn btn-sm" [disabled]="!productos().length" (click)="csvProductos()"><app-icon name="bajada" [size]="15" /> CSV</button>
          </header>
          @if (productos().length) {
            <div class="tabla-contenedor">
              <table class="tabla">
                <thead><tr><th>Producto o servicio</th><th class="right">Cantidad</th><th class="right">Vendido sin IGV</th></tr></thead>
                <tbody>
                  @for (p of productos(); track p.descripcion) {
                    <tr>
                      <td><strong>{{ p.descripcion }}</strong>@if (p.codigo) { <small class="mono muted" style="display: block">{{ p.codigo }}</small> }</td>
                      <td class="right num">{{ p.cantidad | number: '1.0-3' }} <small class="muted">{{ p.unidad }}</small></td>
                      <td class="right num"><strong>{{ soles(p.totalSinIgv) }}</strong></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else if (!cargando()) {
            <app-vacio icono="bandeja" titulo="Sin productos" texto="Las ventas antiguas sin detalle no aparecen aquí." />
          }
        </article>
      </div>
    </div>
  `,
  styles: `
    .en-linea { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); }
    .card-cabecera { display: flex; justify-content: space-between; align-items: center; }
  `
})
export class ReportesVentas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  protected readonly desde = signal(hoyIso().slice(0, 8) + '01');
  protected readonly hasta = signal(hoyIso());
  protected readonly cargando = signal(true);
  protected readonly vendedores = signal<VentasPorVendedor[]>([]);
  protected readonly productos = signal<VentasPorProducto[]>([]);
  protected readonly total = computed(() => this.vendedores().reduce((s, v) => s + v.total, 0));
  protected readonly comprobantes = computed(() => this.vendedores().reduce((s, v) => s + v.comprobantes, 0));

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({
      vendedores: this.api.reportesVentas.porVendedor(this.desde(), this.hasta()),
      productos: this.api.reportesVentas.porProducto(this.desde(), this.hasta())
    }).subscribe({
      next: ({ vendedores, productos }) => {
        this.vendedores.set(vendedores);
        this.productos.set(productos);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected csvVendedores(): void {
    descargarCsv(`ventas-por-vendedor-${this.desde()}-a-${this.hasta()}.csv`, [
      ['Vendedor', 'Comprobantes', 'Total sin IGV', 'Total con IGV'],
      ...this.vendedores().map((v) => [v.vendedor, v.comprobantes, v.totalSinIgv, v.total])
    ]);
  }

  protected csvProductos(): void {
    descargarCsv(`ventas-por-producto-${this.desde()}-a-${this.hasta()}.csv`, [
      ['Código', 'Descripción', 'Unidad', 'Cantidad', 'Vendido sin IGV'],
      ...this.productos().map((p) => [p.codigo, p.descripcion, p.unidad, p.cantidad, p.totalSinIgv])
    ]);
  }
}
