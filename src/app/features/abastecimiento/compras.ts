import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { TASA_IGV_REFERENCIAL } from '../../core/config/constantes';
import { Compra, Proveedor } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, hoyIso, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

@Component({
  selector: 'app-compras',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './compras.html'
})
export class Compras {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly puedeEditar = inject(AuthService).puede('compras.editar');
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly hoy = hoyIso();

  readonly nuevo = input<string>();

  protected readonly cargando = signal(true);
  protected readonly compras = signal<Compra[]>([]);
  protected readonly proveedores = signal<Proveedor[]>([]);

  protected readonly filtroProveedor = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  protected readonly tabla = new TablaEstado(
    this.compras,
    (c) => `${c.numeroComprobante} ${c.razonSocialProveedor} ${c.rucProveedor}`,
    10,
    computed(() => {
      const proveedor = this.filtroProveedor();
      const desde = this.desde();
      const hasta = this.hasta();
      return (c: Compra) =>
        (!proveedor || c.rucProveedor === proveedor) && (!desde || c.fecha >= desde) && (!hasta || c.fecha <= hasta);
    })
  );

  protected readonly total = computed(() => this.tabla.filtradas().reduce((s, c) => s + c.montoTotal, 0));
  protected readonly creditoFiscal = computed(() => this.tabla.filtradas().reduce((s, c) => s + c.igv, 0));
  protected readonly proveedoresActivos = computed(() => new Set(this.tabla.filtradas().map((c) => c.proveedorId)).size);
  protected readonly hayFiltros = computed(() => !!(this.filtroProveedor() || this.desde() || this.hasta()));

  protected readonly panelAbierto = signal(false);
  protected readonly editando = signal<Compra | null>(null);
  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    ruc: ['', Validators.required],
    numeroComprobante: ['', [Validators.required, Validators.pattern(/^F\d{3}-\d{1,10}$/)]],
    montoSinIgv: [0, [Validators.required, Validators.min(0.01)]],
    fecha: [hoyIso(), Validators.required]
  });
  private readonly valores = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly vistaPrevia = computed(() => {
    const base = Number(this.valores().montoSinIgv) || 0;
    const igv = Math.round(base * TASA_IGV_REFERENCIAL * 100) / 100;
    return { base, igv, total: base + igv };
  });

  constructor() {
    this.cargar();
    effect(() => {
      if (this.nuevo() && this.puedeEditar) {
        this.abrir();
      }
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({ compras: this.api.compras.listar(), proveedores: this.api.proveedores.listar() }).subscribe({
      next: ({ compras, proveedores }) => {
        this.compras.set(compras.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
        this.proveedores.set(proveedores.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es')));
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected limpiarFiltros(): void {
    this.filtroProveedor.set('');
    this.desde.set('');
    this.hasta.set('');
    this.tabla.buscar('');
  }

  protected abrir(compra?: Compra): void {
    this.editando.set(compra ?? null);
    this.form.reset({
      ruc: compra?.rucProveedor ?? '',
      numeroComprobante: compra?.numeroComprobante ?? '',
      montoSinIgv: compra?.montoSinIgv ?? 0,
      fecha: compra?.fecha ?? hoyIso()
    });
    this.panelAbierto.set(true);
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    const actual = this.editando();
    const valores = this.form.getRawValue();
    const datos = { ...valores, montoSinIgv: Number(valores.montoSinIgv) };
    const peticion = actual ? this.api.compras.actualizar(actual.id, datos) : this.api.compras.registrar(datos);
    peticion.subscribe({
      next: (c) => {
        this.compras.update((lista) => (actual ? lista.map((x) => (x.id === c.id ? c : x)) : [c, ...lista]));
        this.toast.exito(actual ? `Compra ${c.numeroComprobante} actualizada.` : `Compra ${c.numeroComprobante} registrada por ${soles(c.montoTotal)}.`);
        this.panelAbierto.set(false);
        this.guardando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected async eliminar(c: Compra): Promise<void> {
    const ok = await this.confirm.preguntar({
      titulo: `Eliminar ${c.numeroComprobante}`,
      mensaje: `La compra a ${c.razonSocialProveedor} por ${soles(c.montoTotal)} dejará de sumar al crédito fiscal.`,
      accion: 'Eliminar',
      peligro: true
    });
    if (!ok) {
      return;
    }
    this.api.compras.eliminar(c.id).subscribe({
      next: () => {
        this.compras.update((lista) => lista.filter((x) => x.id !== c.id));
        this.toast.exito('Compra eliminada.');
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }
}
