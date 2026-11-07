import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { CuentaPorCobrar, EstadoCuenta, EstadoDeCuenta, EstadoTramo, MedioPago, ResumenCobranza } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, hoyIso, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

type Filtro = 'pendientes' | 'vencidas' | 'todas';

export const MEDIOS: Record<MedioPago, string> = {
  TRANSFERENCIA: 'Transferencia',
  DEPOSITO: 'Depósito',
  EFECTIVO: 'Efectivo',
  YAPE_PLIN: 'Yape / Plin',
  TARJETA: 'Tarjeta'
};

/* Cuentas por cobrar: lo que deben los clientes por las ventas al crédito, sus cuotas y los cobros */
@Component({
  selector: 'app-cobranzas',
  imports: [DatePipe, PageHeader, StatCard, Icon, Panel, Paginador, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cobranzas.html',
  styleUrl: './cobranzas.scss'
})
export class Cobranzas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly puedeRegistrar = inject(AuthService).puede('cobranzas.registrar');
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly hoy = hoyIso();
  protected readonly medios = Object.entries(MEDIOS).map(([codigo, texto]) => ({ codigo: codigo as MedioPago, texto }));
  protected readonly nombreMedio = MEDIOS;

  protected readonly cargando = signal(true);
  protected readonly cuentas = signal<CuentaPorCobrar[]>([]);
  protected readonly resumen = signal<ResumenCobranza | null>(null);
  protected readonly filtro = signal<Filtro>('pendientes');

  protected readonly tabla = new TablaEstado(this.cuentas, (c) => `${c.numeroComprobante} ${c.nombreCliente} ${c.documentoCliente}`, 10,
    computed(() => {
      const f = this.filtro();
      return (c: CuentaPorCobrar) => f === 'todas' || (f === 'vencidas' ? c.estado === 'VENCIDA' : c.estado !== 'PAGADA');
    }));

  // Estado de cuenta y registro de cobro
  protected readonly detalle = signal<EstadoDeCuenta | null>(null);
  protected readonly cargandoDetalle = signal(false);
  protected readonly monto = signal(0);
  protected readonly fecha = signal(this.hoy);
  protected readonly medio = signal<MedioPago>('TRANSFERENCIA');
  protected readonly referencia = signal('');
  protected readonly guardando = signal(false);

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({ cuentas: this.api.cobranzas.listar(true), resumen: this.api.cobranzas.resumen() }).subscribe({
      next: ({ cuentas, resumen }) => {
        this.cuentas.set(cuentas);
        this.resumen.set(resumen);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected abrir(c: CuentaPorCobrar): void {
    this.cargandoDetalle.set(true);
    this.detalle.set(null);
    this.api.cobranzas.estadoDeCuenta(c.ventaId).subscribe({
      next: (d) => {
        this.detalle.set(d);
        this.prepararCobro(d);
        this.cargandoDetalle.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargandoDetalle.set(false);
      }
    });
  }

  /* Propone cobrar lo vencido o, si no hay, la próxima cuota pendiente */
  private prepararCobro(d: EstadoDeCuenta): void {
    const siguiente = d.tramos.find((t) => t.pendiente > 0);
    this.monto.set(d.cuenta.vencido > 0 ? d.cuenta.vencido : siguiente?.pendiente ?? 0);
    this.fecha.set(this.hoy);
    this.referencia.set('');
  }

  protected registrar(): void {
    const d = this.detalle();
    if (!d || this.guardando()) return;
    if (!(this.monto() > 0) || this.monto() > d.cuenta.saldo + 0.001) {
      this.toast.error(`El monto debe estar entre S/ 0.01 y el saldo (${soles(d.cuenta.saldo)}).`);
      return;
    }
    this.guardando.set(true);
    this.api.cobranzas.registrar({
      ventaId: d.cuenta.ventaId, monto: Number(this.monto()), fecha: this.fecha(), medio: this.medio(),
      referencia: this.referencia().trim() || null
    }).subscribe({
      next: (nuevo) => {
        this.toast.exito(`Cobro de ${soles(this.monto())} registrado en ${nuevo.cuenta.numeroComprobante}.`);
        this.detalle.set(nuevo);
        this.prepararCobro(nuevo);
        this.guardando.set(false);
        this.cargar();
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected etiquetaCuenta(e: EstadoCuenta): { texto: string; clase: string } {
    return e === 'VENCIDA' ? { texto: 'Vencida', clase: 'badge-peligro' }
      : e === 'PAGADA' ? { texto: 'Pagada', clase: 'badge-exito' } : { texto: 'Al día', clase: 'badge-info' };
  }

  protected etiquetaTramo(e: EstadoTramo): { texto: string; clase: string } {
    switch (e) {
      case 'PAGADA': return { texto: 'Pagada', clase: 'badge-exito' };
      case 'PARCIAL': return { texto: 'Parcial', clase: 'badge-alerta' };
      case 'VENCIDA': return { texto: 'Vencida', clase: 'badge-peligro' };
      default: return { texto: 'Pendiente', clase: '' };
    }
  }
}
