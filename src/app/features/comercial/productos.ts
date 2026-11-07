import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { TASA_IGV_REFERENCIAL } from '../../core/config/constantes';
import { Producto } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

const CANTIDAD = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });

/* Catálogo de productos y servicios que se facturan. Al emitir una venta se eligen de aquí. */
@Component({
  selector: 'app-productos',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Comercial" titulo="Productos y servicios"
        descripcion="Catálogo con el que se arman las facturas y boletas. El precio se registra sin IGV.">
        @if (puedeEditar) {
          <button type="button" class="btn btn-primario" (click)="abrir()"><app-icon name="mas" [size]="17" /> Nuevo producto</button>
        }
      </app-page-header>

      <section class="grid-kpi escalonado">
        <app-stat-card style="--i: 0" titulo="En el catálogo" [valor]="activos()" icono="bandeja" [cargando]="cargando()"
          [detalle]="productos().length - activos() + ' desactivados'" />
        <app-stat-card style="--i: 1" titulo="Servicios" [valor]="servicios()" icono="reloj" tono="info" [cargando]="cargando()" />
        <app-stat-card style="--i: 2" titulo="Precio promedio (con IGV)" [valor]="promedio()" formato="soles" icono="recibo"
          tono="exito" [cargando]="cargando()" />
      </section>

      <article class="card entrada">
        <div class="filtros">
          <div class="control-icono busqueda">
            <app-icon name="buscar" [size]="16" />
            <input #b class="control" placeholder="Buscar por código o descripción…" [value]="tabla.busqueda()" (input)="tabla.buscar(b.value)" />
          </div>
          <label class="ayuda" style="display: flex; gap: 6px; align-items: center; cursor: pointer">
            <input type="checkbox" [checked]="verInactivos()" (change)="verInactivos.set(!verInactivos()); tabla.pagina.set(1)" /> Ver desactivados
          </label>
        </div>

        @if (cargando()) {
          <div class="card-cuerpo pila">
            @for (i of [1, 2, 3, 4]; track i) { <div class="skeleton" style="height: 44px"></div> }
          </div>
        } @else if (tabla.filtradas().length) {
          <div class="tabla-contenedor">
            <table class="tabla">
              <thead>
                <tr>
                  <th class="ordenable" (click)="tabla.ordenarPor('codigo')">Código {{ tabla.flecha('codigo') }}</th>
                  <th class="ordenable" (click)="tabla.ordenarPor('descripcion')">Descripción {{ tabla.flecha('descripcion') }}</th>
                  <th>Unidad</th>
                  <th class="right">Stock</th>
                  <th class="right ordenable" (click)="tabla.ordenarPor('valorUnitario')">Precio sin IGV {{ tabla.flecha('valorUnitario') }}</th>
                  <th class="right">Con IGV</th>
                  @if (puedeEditar) { <th class="right">Acciones</th> }
                </tr>
              </thead>
              <tbody>
                @for (p of tabla.visibles(); track p.id; let i = $index) {
                  <tr [style.--i]="i" [class.inactivo]="!p.activo">
                    <td class="mono">{{ p.codigo }}</td>
                    <td><strong>{{ p.descripcion }}</strong> @if (!p.activo) { <span class="badge">Desactivado</span> }</td>
                    <td><span class="badge" [class.badge-info]="!p.manejaStock">{{ unidades()[p.unidad] ?? p.unidad }}</span></td>
                    <td class="right num">
                      @if (p.manejaStock) {
                        <strong [class.text-danger]="p.stock <= 0" [class.text-alerta]="p.stock > 0 && p.stock <= p.stockMinimo">{{ cantidad(p.stock) }}</strong>
                        @if (p.stock <= 0) { <small class="text-danger" style="display: block">Sin stock</small> }
                        @else if (p.stock <= p.stockMinimo) { <small class="text-alerta" style="display: block">Stock bajo</small> }
                      } @else {
                        <span class="muted" title="Los servicios no manejan stock">—</span>
                      }
                    </td>
                    <td class="right num">{{ soles(p.valorUnitario) }}</td>
                    <td class="right num"><strong>{{ soles(conIgv(p.valorUnitario)) }}</strong></td>
                    @if (puedeEditar) {
                      <td>
                        <div class="acciones" style="opacity: 1">
                          <button type="button" class="btn btn-fantasma btn-icono btn-sm" (click)="abrir(p)" aria-label="Editar"><app-icon name="editar" [size]="16" /></button>
                          <button type="button" class="switch" [class.on]="p.activo" role="switch" [attr.aria-checked]="p.activo"
                            [attr.aria-label]="(p.activo ? 'Desactivar ' : 'Activar ') + p.descripcion" (click)="alternar(p)"></button>
                        </div>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-paginador [pagina]="tabla.pagina()" [paginas]="tabla.paginas()" [total]="tabla.filtradas().length"
            [tamano]="tabla.tamano" (cambiar)="tabla.pagina.set($event)" />
        } @else {
          <app-vacio icono="bandeja" [titulo]="productos().length ? 'Sin coincidencias' : 'El catálogo está vacío'"
            [texto]="productos().length ? 'Prueba con otro término.' : 'Agrega tus productos y servicios para facturarlos con detalle.'" />
        }
      </article>
    </div>

    <app-panel [abierto]="panelAbierto()" (cerrar)="panelAbierto.set(false)" etiqueta="Comercial"
      [titulo]="editando() ? 'Editar producto' : 'Nuevo producto'"
      descripcion="Los cambios no alteran las facturas ya emitidas.">
      <form id="form-producto" class="form-grid" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <div class="campo">
          <label for="p-codigo">Código</label>
          <input id="p-codigo" class="control mono" formControlName="codigo" maxlength="30" placeholder="Ej. LAP-001" />
          <app-error-campo [control]="form.controls.codigo" [mensajes]="{ pattern: 'Solo letras, números, punto o guion.' }" />
        </div>
        <div class="campo">
          <label for="p-unidad">Unidad</label>
          <select id="p-unidad" class="control" formControlName="unidad">
            @for (u of listaUnidades(); track u.codigo) { <option [value]="u.codigo">{{ u.nombre }} ({{ u.codigo }})</option> }
          </select>
        </div>
        <div class="campo completo">
          <label for="p-desc">Descripción</label>
          <input id="p-desc" class="control" formControlName="descripcion" maxlength="250" placeholder="Así aparecerá en la factura" />
          <app-error-campo [control]="form.controls.descripcion" />
        </div>
        <div class="campo">
          <label for="p-precio">Precio sin IGV (S/)</label>
          <input id="p-precio" type="number" step="0.01" min="0" class="control num" formControlName="valorUnitario" />
          <app-error-campo [control]="form.controls.valorUnitario" />
        </div>
        <div class="campo">
          <label for="p-con">Precio con IGV (S/)</label>
          <input id="p-con" #con type="number" step="0.01" min="0" class="control num" [value]="precioConIgv()"
            (change)="desdeConIgv(con.value)" />
          <span class="ayuda">Si escribes el precio final, se calcula el valor sin IGV.</span>
        </div>
        @if (!esServicio()) {
          <div class="campo completo">
            <label for="p-minimo">Stock mínimo</label>
            <input id="p-minimo" type="number" step="any" min="0" class="control num" formControlName="stockMinimo" />
            <span class="ayuda">
              Se marca «stock bajo» al llegar a esta cantidad (0 = sin alerta).
              @if (editando()?.manejaStock) { Stock actual: <strong>{{ cantidad(editando()!.stock) }}</strong>. }
              El stock se mueve en <a routerLink="/inventario">Inventario</a> y con las ventas.
            </span>
            <app-error-campo [control]="form.controls.stockMinimo" />
          </div>
        } @else {
          <p class="ayuda completo">Los servicios no manejan stock: se facturan sin pasar por el almacén.</p>
        }
      </form>
      <ng-container ngProjectAs="[pie]">
        <button type="button" class="btn" (click)="panelAbierto.set(false)">Cancelar</button>
        <button type="submit" form="form-producto" class="btn btn-primario" [disabled]="guardando()">
          @if (guardando()) { <span class="spinner"></span> Guardando… } @else { <app-icon name="check" [size]="17" /> Guardar }
        </button>
      </ng-container>
    </app-panel>
  `,
  styles: `tr.inactivo td { opacity: 0.55; }`
})
export class Productos {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly puedeEditar = inject(AuthService).puede('productos.editar');
  protected readonly soles = soles;

  protected readonly cargando = signal(true);
  protected readonly productos = signal<Producto[]>([]);
  protected readonly unidades = signal<Partial<Record<string, string>>>({});
  protected readonly listaUnidades = computed(() =>
    Object.entries(this.unidades()).map(([codigo, nombre]) => ({ codigo, nombre })));
  protected readonly verInactivos = signal(false);

  protected readonly activos = computed(() => this.productos().filter((p) => p.activo).length);
  protected readonly servicios = computed(() => this.productos().filter((p) => p.activo && !p.manejaStock).length);
  protected readonly promedio = computed(() => {
    const lista = this.productos().filter((p) => p.activo);
    return lista.length ? this.conIgv(lista.reduce((s, p) => s + p.valorUnitario, 0) / lista.length) : 0;
  });

  protected readonly tabla = new TablaEstado(this.productos, (p) => `${p.codigo} ${p.descripcion}`, 10,
    computed(() => {
      const todos = this.verInactivos();
      return (p: Producto) => todos || p.activo;
    }));

  protected readonly panelAbierto = signal(false);
  protected readonly editando = signal<Producto | null>(null);
  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    codigo: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9._-]{1,30}$/)]],
    descripcion: ['', [Validators.required, Validators.maxLength(250)]],
    unidad: ['NIU', Validators.required],
    valorUnitario: [0, [Validators.required, Validators.min(0)]],
    stockMinimo: [0, [Validators.min(0)]]
  });
  // Los servicios (ZZ, HUR) no manejan stock
  private readonly unidadActual = signal('NIU');
  protected readonly esServicio = computed(() => ['ZZ', 'HUR'].includes(this.unidadActual()));
  private readonly valorActual = signal(0);
  protected readonly precioConIgv = computed(() => this.conIgv(this.valorActual()).toFixed(2));

  constructor() {
    this.form.controls.valorUnitario.valueChanges.subscribe((v) => this.valorActual.set(Number(v) || 0));
    this.form.controls.unidad.valueChanges.subscribe((u) => this.unidadActual.set(u));
    forkJoin({ productos: this.api.productos.listar(), unidades: this.api.productos.unidades() }).subscribe({
      next: ({ productos, unidades }) => {
        this.productos.set(productos);
        this.unidades.set(unidades);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected cantidad(valor: number): string {
    return CANTIDAD.format(valor);
  }

  protected conIgv(valor: number): number {
    return Math.round(valor * (1 + TASA_IGV_REFERENCIAL) * 100) / 100;
  }

  protected desdeConIgv(texto: string): void {
    const conIgv = Number(texto);
    if (!isNaN(conIgv) && conIgv >= 0) {
      this.form.controls.valorUnitario.setValue(Math.round((conIgv / (1 + TASA_IGV_REFERENCIAL)) * 100) / 100);
    }
  }

  protected abrir(p?: Producto): void {
    this.editando.set(p ?? null);
    this.form.reset(p
      ? { codigo: p.codigo, descripcion: p.descripcion, unidad: p.unidad, valorUnitario: p.valorUnitario, stockMinimo: p.stockMinimo }
      : { codigo: '', descripcion: '', unidad: 'NIU', valorUnitario: 0, stockMinimo: 0 });
    this.valorActual.set(p?.valorUnitario ?? 0);
    this.unidadActual.set(p?.unidad ?? 'NIU');
    this.panelAbierto.set(true);
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const crudo = this.form.getRawValue();
    const datos = { ...crudo, valorUnitario: Number(crudo.valorUnitario), stockMinimo: this.esServicio() ? 0 : Number(crudo.stockMinimo) || 0 };
    const actual = this.editando();
    this.guardando.set(true);
    (actual ? this.api.productos.actualizar(actual.id, datos) : this.api.productos.crear(datos)).subscribe({
      next: (guardado) => {
        this.productos.update((lista) => actual ? lista.map((x) => (x.id === guardado.id ? guardado : x)) : [guardado, ...lista]);
        this.toast.exito(`${guardado.descripcion} ${actual ? 'actualizado' : 'agregado al catálogo'}.`);
        this.guardando.set(false);
        this.panelAbierto.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected alternar(p: Producto): void {
    this.api.productos.cambiarEstado(p.id, !p.activo).subscribe({
      next: (cambiado) => {
        this.productos.update((lista) => lista.map((x) => (x.id === cambiado.id ? cambiado : x)));
        this.toast.exito(cambiado.activo ? `${cambiado.descripcion} vuelve al catálogo.` : `${cambiado.descripcion} desactivado.`);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }
}
