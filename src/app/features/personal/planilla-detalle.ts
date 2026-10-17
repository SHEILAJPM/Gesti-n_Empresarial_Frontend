import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { EMPRESA } from '../../core/config/constantes';
import { Planilla, PlanillaDetalle } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { Vacio } from '../../shared/bloques';
import { BoletaPago } from '../../shared/boleta-pago';
import { Contador } from '../../shared/contador';
import { colorAvatar, isoLocal, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { nombrePeriodo } from './planillas';

@Component({
  selector: 'app-planilla-detalle',
  imports: [DatePipe, RouterLink, Icon, Vacio, Contador, Panel, BoletaPago],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planilla-detalle.html',
  styleUrl: './planilla-detalle.scss',
  host: { '(document:keydown.escape)': 'boleta.set(null)' }
})
export class PlanillaDetalleVista {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly puedeGenerar = this.auth.puede('planillas.generar');
  protected readonly puedeAprobar = this.auth.puede('planillas.aprobar');
  protected readonly soles = soles;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly nombrePeriodo = nombrePeriodo;
  protected readonly empresa = EMPRESA;

  readonly id = input.required<string>();

  protected readonly cargando = signal(true);
  protected readonly planilla = signal<Planilla | null>(null);
  protected readonly procesando = signal(false);
  protected readonly boleta = signal<PlanillaDetalle | null>(null);

  protected readonly aprobarAbierto = signal(false);
  protected readonly fechaPago = signal('');

  protected readonly costoEmpresa = computed(() => {
    const p = this.planilla();
    return p ? p.totalBruto + p.totalEssalud : 0;
  });

  constructor() {
    effect(() => this.cargar(Number(this.id())));
  }

  private cargar(id: number): void {
    this.cargando.set(true);
    this.api.planillas.obtener(id).subscribe({
      next: (p) => {
        this.planilla.set(p);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected abrirAprobacion(): void {
    const p = this.planilla();
    if (!p) return;
    // Por defecto se paga el último día del mes de la planilla
    this.fechaPago.set(isoLocal(new Date(p.anio, p.mes, 0)));
    this.aprobarAbierto.set(true);
  }

  protected aprobar(): void {
    const p = this.planilla();
    if (!p || !this.fechaPago()) return;
    this.procesando.set(true);
    this.api.planillas.aprobar(p.id, this.fechaPago()).subscribe({
      next: (aprobada) => {
        this.planilla.set(aprobada);
        this.toast.exito(`Planilla aprobada: se programaron ${aprobada.cantidadTrabajadores} pagos por ${soles(aprobada.totalNeto)}.`);
        this.aprobarAbierto.set(false);
        this.procesando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.procesando.set(false);
      }
    });
  }

  protected async regenerar(): Promise<void> {
    const p = this.planilla();
    if (!p) return;
    const ok = await this.confirm.preguntar({
      titulo: 'Recalcular planilla',
      mensaje: 'Se vuelve a calcular con los sueldos y fichas actuales. Útil si corregiste datos de algún trabajador.',
      accion: 'Recalcular'
    });
    if (!ok) return;
    this.procesando.set(true);
    this.api.planillas.generar(p.anio, p.mes).subscribe({
      next: (nueva) => {
        this.toast.exito('Planilla recalculada.');
        this.procesando.set(false);
        this.router.navigate(['/planillas', nueva.id], { replaceUrl: true });
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.procesando.set(false);
      }
    });
  }

  protected async eliminar(): Promise<void> {
    const p = this.planilla();
    if (!p) return;
    const ok = await this.confirm.preguntar({
      titulo: `Eliminar planilla de ${nombrePeriodo(p)}`,
      mensaje: 'El borrador se descarta. Podrás generarla de nuevo cuando quieras.',
      accion: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    this.api.planillas.eliminar(p.id).subscribe({
      next: () => {
        this.toast.exito('Borrador eliminado.');
        this.router.navigate(['/planillas']);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected porcentaje(tasa: number): string {
    return `${(tasa * 100).toFixed(2)} %`;
  }

  protected imprimir(): void {
    const raiz = document.documentElement;
    raiz.classList.add('imprimiendo-boleta');
    window.addEventListener('afterprint', () => raiz.classList.remove('imprimiendo-boleta'), { once: true });
    window.print();
  }
}
