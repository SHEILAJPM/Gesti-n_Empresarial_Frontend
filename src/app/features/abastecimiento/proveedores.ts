import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { Compra, Proveedor } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { ConsultaDocumento, EstadoConsulta } from '../../shared/consulta-documento';
import { colorAvatar, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

interface FilaProveedor extends Proveedor {
  facturas: number;
  comprado: number;
}

@Component({
  selector: 'app-proveedores',
  imports: [ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo, EstadoConsulta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './proveedores.html'
})
export class Proveedores {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly puedeEditar = inject(AuthService).puede('proveedores.editar');
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  readonly nuevo = input<string>();

  protected readonly cargando = signal(true);
  protected readonly proveedores = signal<Proveedor[]>([]);
  private readonly compras = signal<Compra[]>([]);

  protected readonly filas = computed<FilaProveedor[]>(() => {
    const totales = new Map<number, { facturas: number; comprado: number }>();
    for (const c of this.compras()) {
      const t = totales.get(c.proveedorId) ?? { facturas: 0, comprado: 0 };
      totales.set(c.proveedorId, { facturas: t.facturas + 1, comprado: t.comprado + c.montoTotal });
    }
    return this.proveedores().map((p) => ({ ...p, ...(totales.get(p.id) ?? { facturas: 0, comprado: 0 }) }));
  });

  protected readonly tabla = new TablaEstado(this.filas, (p) => `${p.razonSocial} ${p.ruc} ${p.direccion ?? ''}`, 10);
  protected readonly totalComprado = computed(() => this.filas().reduce((s, p) => s + p.comprado, 0));
  protected readonly principal = computed((): FilaProveedor | null => [...this.filas()].sort((a, b) => b.comprado - a.comprado)[0] ?? null);

  protected readonly panelAbierto = signal(false);
  protected readonly editando = signal<Proveedor | null>(null);
  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    ruc: ['', [Validators.required, Validators.pattern(/^(10|15|17|20)\d{9}$/)]],
    razonSocial: ['', [Validators.required, Validators.maxLength(150)]],
    direccion: ['', Validators.maxLength(200)]
  });

  /* Con el RUC completo se traen la razón social y la dirección de SUNAT, sin pisar lo que el usuario escribió */
  protected readonly consulta = new ConsultaDocumento(/^(10|15|17|20)\d{9}$/, (d) => {
    const razon = this.form.controls.razonSocial;
    if (!razon.dirty || !razon.value.trim()) {
      razon.setValue(d.nombre.slice(0, 150));
      razon.markAsPristine();
    }
    const direccion = this.form.controls.direccion;
    if (d.direccion && (!direccion.dirty || !direccion.value.trim())) {
      direccion.setValue(d.direccion.slice(0, 200));
      direccion.markAsPristine();
    }
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
    forkJoin({ proveedores: this.api.proveedores.listar(), compras: this.api.compras.listar() }).subscribe({
      next: ({ proveedores, compras }) => {
        this.proveedores.set(proveedores.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es')));
        this.compras.set(compras);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected abrir(p?: Proveedor): void {
    this.editando.set(p ?? null);
    this.form.reset({ ruc: p?.ruc ?? '', razonSocial: p?.razonSocial ?? '', direccion: p?.direccion ?? '' });
    this.consulta.reiniciar();
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
    const datos = { ...valores, direccion: valores.direccion.trim() || null };
    const peticion = actual ? this.api.proveedores.actualizar(actual.id, datos) : this.api.proveedores.registrar(datos);
    peticion.subscribe({
      next: (p) => {
        this.proveedores.update((lista) => (actual ? lista.map((x) => (x.id === p.id ? p : x)) : [p, ...lista]));
        this.toast.exito(actual ? 'Proveedor actualizado.' : `${p.razonSocial} fue registrado.`);
        this.panelAbierto.set(false);
        this.guardando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected async eliminar(p: FilaProveedor): Promise<void> {
    const ok = await this.confirm.preguntar({
      titulo: 'Eliminar proveedor',
      mensaje: p.facturas
        ? `${p.razonSocial} tiene ${p.facturas} compras registradas; el sistema podría impedir eliminarlo.`
        : `Se eliminará a ${p.razonSocial}. Esta acción no se puede deshacer.`,
      accion: 'Eliminar',
      peligro: true
    });
    if (!ok) {
      return;
    }
    this.api.proveedores.eliminar(p.id).subscribe({
      next: () => {
        this.proveedores.update((lista) => lista.filter((x) => x.id !== p.id));
        this.toast.exito('Proveedor eliminado.');
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }
}
