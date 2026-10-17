import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Pago, Proveedor, TipoBeneficiario, Trabajador } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, diasHasta, hoyIso, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

type Pestana = 'pendientes' | 'vencidos' | 'pagados' | 'todos';

interface FilaPago extends Pago {
  beneficiario: string;
  identificacion: string;
  dias: number;
}

@Component({
  selector: 'app-pagos',
  imports: [DatePipe, ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagos.html'
})
export class Pagos {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  readonly nuevo = input<string>();

  protected readonly cargando = signal(true);
  protected readonly pagos = signal<Pago[]>([]);
  protected readonly trabajadores = signal<Trabajador[]>([]);
  protected readonly proveedores = signal<Proveedor[]>([]);
  protected readonly pestana = signal<Pestana>('pendientes');
  protected readonly pagandoId = signal<number | null>(null);

  protected readonly filas = computed<FilaPago[]>(() => {
    const trabajadores = new Map(this.trabajadores().map((t) => [t.id, t]));
    const proveedores = new Map(this.proveedores().map((p) => [p.id, p]));
    return this.pagos()
      .map((p) => {
        const t = p.trabajadorId !== null ? trabajadores.get(p.trabajadorId) : undefined;
        const pr = p.proveedorId !== null ? proveedores.get(p.proveedorId) : undefined;
        return {
          ...p,
          beneficiario: t?.nombres ?? pr?.razonSocial ?? '—',
          identificacion: t ? `DNI ${t.documentoIdentidad}` : pr ? `RUC ${pr.ruc}` : '',
          dias: diasHasta(p.fechaProgramada)
        };
      })
      .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));
  });

  protected readonly conteo = computed(() => {
    const f = this.filas();
    return {
      pendientes: f.filter((p) => p.estado === 'PENDIENTE').length,
      vencidos: f.filter((p) => p.estado === 'PENDIENTE' && p.dias < 0).length,
      pagados: f.filter((p) => p.estado === 'PAGADO').length,
      todos: f.length
    };
  });

  protected readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'pendientes', titulo: 'Pendientes' },
    { id: 'vencidos', titulo: 'Vencidos' },
    { id: 'pagados', titulo: 'Pagados' },
    { id: 'todos', titulo: 'Todos' }
  ];

  protected readonly tabla = new TablaEstado(
    this.filas,
    (p) => `${p.beneficiario} ${p.identificacion} ${p.concepto}`,
    10,
    computed(() => {
      const pestana = this.pestana();
      return (p: FilaPago) =>
        pestana === 'todos' ||
        (pestana === 'pendientes' && p.estado === 'PENDIENTE') ||
        (pestana === 'vencidos' && p.estado === 'PENDIENTE' && p.dias < 0) ||
        (pestana === 'pagados' && p.estado === 'PAGADO');
    })
  );

  private readonly pendientes = computed(() => this.filas().filter((p) => p.estado === 'PENDIENTE'));
  protected readonly porPagar = computed(() => this.pendientes().reduce((s, p) => s + p.monto, 0));
  protected readonly vencido = computed(() => this.pendientes().filter((p) => p.dias < 0).reduce((s, p) => s + p.monto, 0));
  protected readonly proximaSemana = computed(() =>
    this.pendientes().filter((p) => p.dias >= 0 && p.dias <= 7).reduce((s, p) => s + p.monto, 0)
  );
  protected readonly pagado = computed(() => this.filas().filter((p) => p.estado === 'PAGADO').reduce((s, p) => s + p.monto, 0));

  // ---------- Formulario ----------
  protected readonly panelAbierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly tipo = signal<TipoBeneficiario>('TRABAJADOR');
  protected readonly form = inject(NonNullableFormBuilder).group({
    beneficiario: ['', Validators.required],
    concepto: ['', [Validators.required, Validators.maxLength(250)]],
    monto: [0, [Validators.required, Validators.min(0.01)]],
    fechaProgramada: [hoyIso(), Validators.required]
  });

  constructor() {
    this.cargar();
    effect(() => {
      if (this.nuevo()) {
        this.abrir();
      }
    });
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({
      pagos: this.api.pagos.listar(),
      trabajadores: this.api.personal.listar(),
      proveedores: this.api.proveedores.listar()
    }).subscribe({
      next: ({ pagos, trabajadores, proveedores }) => {
        this.pagos.set(pagos);
        this.trabajadores.set(trabajadores.sort((a, b) => a.nombres.localeCompare(b.nombres, 'es')));
        this.proveedores.set(proveedores.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es')));
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected cambiarPestana(p: Pestana): void {
    this.pestana.set(p);
    this.tabla.pagina.set(1);
  }

  protected abrir(): void {
    this.tipo.set('TRABAJADOR');
    this.form.reset({ beneficiario: '', concepto: '', monto: 0, fechaProgramada: hoyIso() });
    this.panelAbierto.set(true);
  }

  protected cambiarTipo(tipo: TipoBeneficiario): void {
    this.tipo.set(tipo);
    this.form.controls.beneficiario.reset('');
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    const { beneficiario, concepto, monto, fechaProgramada } = this.form.getRawValue();
    const tipo = this.tipo();
    this.api.pagos.registrar({
      tipoBeneficiario: tipo,
      documentoIdentidad: tipo === 'TRABAJADOR' ? beneficiario : null,
      rucProveedor: tipo === 'PROVEEDOR' ? beneficiario : null,
      concepto,
      monto: Number(monto),
      fechaProgramada
    }).subscribe({
      next: (pago) => {
        this.pagos.update((lista) => [pago, ...lista]);
        this.toast.exito(`Pago de ${soles(pago.monto)} programado.`);
        this.panelAbierto.set(false);
        this.guardando.set(false);
        this.pestana.set('pendientes');
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected async pagar(p: FilaPago): Promise<void> {
    const ok = await this.confirm.preguntar({
      titulo: 'Confirmar pago',
      mensaje: `Se registrará como pagado ${soles(p.monto)} a ${p.beneficiario} por «${p.concepto}».`,
      accion: 'Marcar como pagado'
    });
    if (!ok) {
      return;
    }
    this.pagandoId.set(p.id);
    this.api.pagos.pagar(p.id).subscribe({
      next: (pagado) => {
        this.pagos.update((lista) => lista.map((x) => (x.id === pagado.id ? pagado : x)));
        this.toast.exito(`Pago a ${p.beneficiario} registrado.`);
        this.pagandoId.set(null);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.pagandoId.set(null);
      }
    });
  }

  protected vencimiento(p: FilaPago): { texto: string; clase: string } {
    if (p.estado === 'PAGADO') {
      return { texto: 'Pagado', clase: 'badge-exito' };
    }
    if (p.dias < 0) {
      return { texto: `Vencido hace ${Math.abs(p.dias)} d`, clase: 'badge-peligro' };
    }
    if (p.dias === 0) {
      return { texto: 'Vence hoy', clase: 'badge-alerta' };
    }
    return { texto: p.dias <= 7 ? `En ${p.dias} días` : 'Programado', clase: p.dias <= 7 ? 'badge-alerta' : 'badge-info' };
  }
}
