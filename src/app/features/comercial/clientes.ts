import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { Cliente, Venta } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { ConsultaDocumento, EstadoConsulta } from '../../shared/consulta-documento';
import { colorAvatar, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

interface FilaCliente extends Cliente {
  compras: number;
  facturado: number;
}

@Component({
  selector: 'app-clientes',
  imports: [ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo, EstadoConsulta],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clientes.html'
})
export class Clientes {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly puedeEditar = inject(AuthService).puede('clientes.editar');
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  readonly nuevo = input<string>();

  protected readonly cargando = signal(true);
  protected readonly clientes = signal<Cliente[]>([]);
  private readonly ventas = signal<Venta[]>([]);
  protected readonly filtroTipo = signal('');

  /* Cada cliente con lo que se le ha facturado (solo ventas emitidas) */
  protected readonly filas = computed<FilaCliente[]>(() => {
    const totales = new Map<number, { compras: number; facturado: number }>();
    for (const v of this.ventas()) {
      if (v.estado !== 'EMITIDA') continue;
      const t = totales.get(v.clienteId) ?? { compras: 0, facturado: 0 };
      totales.set(v.clienteId, { compras: t.compras + 1, facturado: t.facturado + v.montoTotal });
    }
    return this.clientes().map((c) => ({ ...c, ...(totales.get(c.id) ?? { compras: 0, facturado: 0 }) }));
  });

  protected readonly tabla = new TablaEstado(
    this.filas,
    (c) => `${c.nombre} ${c.documento}`,
    10,
    computed(() => {
      const tipo = this.filtroTipo();
      return (c: FilaCliente) => !tipo || c.tipoDocumento === tipo;
    })
  );

  protected readonly empresas = computed(() => this.clientes().filter((c) => c.tipoDocumento === 'RUC').length);
  protected readonly mejorCliente = computed((): FilaCliente | null => [...this.filas()].sort((a, b) => b.facturado - a.facturado)[0] ?? null);

  protected readonly panelAbierto = signal(false);
  protected readonly editando = signal<Cliente | null>(null);
  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    documento: ['', [Validators.required, Validators.pattern(/^(\d{8}|\d{11})$/)]],
    nombre: ['', [Validators.required, Validators.maxLength(150)]]
  });
  private readonly documentoEscrito = toSignal(this.form.controls.documento.valueChanges, { initialValue: '' });
  protected readonly tipoDetectado = computed(() => {
    const d = this.documentoEscrito();
    return /^\d{11}$/.test(d) ? 'RUC' : /^\d{8}$/.test(d) ? 'DNI' : null;
  });

  /* Al terminar de escribir el DNI o RUC se completa el nombre, salvo que el usuario ya lo haya escrito a mano */
  protected readonly consulta = new ConsultaDocumento(/^(\d{8}|(10|15|17|20)\d{9})$/, (d) => {
    const nombre = this.form.controls.nombre;
    if (!nombre.dirty || !nombre.value.trim()) {
      nombre.setValue(d.nombre.slice(0, 150));
      nombre.markAsPristine();
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
    forkJoin({ clientes: this.api.clientes.listar(), ventas: this.api.ventas.listar() }).subscribe({
      next: ({ clientes, ventas }) => {
        this.clientes.set(clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
        this.ventas.set(ventas);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected abrir(cliente?: Cliente): void {
    this.editando.set(cliente ?? null);
    this.form.reset({ documento: cliente?.documento ?? '', nombre: cliente?.nombre ?? '' });
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
    const datos = this.form.getRawValue();
    const peticion = actual ? this.api.clientes.actualizar(actual.id, datos) : this.api.clientes.registrar(datos);
    peticion.subscribe({
      next: (c) => {
        this.clientes.update((lista) => (actual ? lista.map((x) => (x.id === c.id ? c : x)) : [c, ...lista]));
        this.toast.exito(actual ? 'Cliente actualizado.' : `${c.nombre} fue registrado como cliente.`);
        this.panelAbierto.set(false);
        this.guardando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected async eliminar(c: FilaCliente): Promise<void> {
    const ok = await this.confirm.preguntar({
      titulo: 'Eliminar cliente',
      mensaje: c.compras
        ? `${c.nombre} tiene ${c.compras} ventas registradas; el sistema podría impedir eliminarlo.`
        : `Se eliminará a ${c.nombre}. Esta acción no se puede deshacer.`,
      accion: 'Eliminar',
      peligro: true
    });
    if (!ok) {
      return;
    }
    this.api.clientes.eliminar(c.id).subscribe({
      next: () => {
        this.clientes.update((lista) => lista.filter((x) => x.id !== c.id));
        this.toast.exito('Cliente eliminado.');
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }
}
