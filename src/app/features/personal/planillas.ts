import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { Planilla } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Vacio } from '../../shared/bloques';
import { soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre',
  'Noviembre', 'Diciembre'];

export function nombrePeriodo(p: { anio: number; mes: number }): string {
  return `${MESES[p.mes - 1]} ${p.anio}`;
}

@Component({
  selector: 'app-planillas',
  imports: [DatePipe, RouterLink, PageHeader, StatCard, Icon, Panel, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planillas.html'
})
export class Planillas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly puedeGenerar = inject(AuthService).puede('planillas.generar');
  protected readonly soles = soles;
  protected readonly nombrePeriodo = nombrePeriodo;
  protected readonly meses = MESES;

  protected readonly cargando = signal(true);
  protected readonly planillas = signal<Planilla[]>([]);

  protected readonly ultima = computed((): Planilla | null => this.planillas()[0] ?? null);
  protected readonly porAprobar = computed(() => this.planillas().filter((p) => p.estado === 'BORRADOR').length);
  protected readonly costoAnual = computed(() => {
    const anio = new Date().getFullYear();
    return this.planillas()
      .filter((p) => p.anio === anio && p.estado === 'APROBADA')
      .reduce((s, p) => s + p.totalBruto + p.totalEssalud, 0);
  });

  // Generar
  private readonly hoy = new Date();
  protected readonly panelAbierto = signal(false);
  protected readonly generando = signal(false);
  protected readonly anio = signal(this.hoy.getFullYear());
  protected readonly mes = signal(this.hoy.getMonth() + 1);
  protected readonly anios = [this.hoy.getFullYear() - 1, this.hoy.getFullYear()];
  protected readonly existente = computed(
    () => this.planillas().find((p) => p.anio === this.anio() && p.mes === this.mes()) ?? null
  );
  protected readonly esFuturo = computed(
    () => this.anio() > this.hoy.getFullYear() || (this.anio() === this.hoy.getFullYear() && this.mes() > this.hoy.getMonth() + 1)
  );

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.planillas.listar().subscribe({
      next: (lista) => {
        this.planillas.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected generar(): void {
    this.generando.set(true);
    this.api.planillas.generar(this.anio(), this.mes()).subscribe({
      next: (p) => {
        this.toast.exito(`Planilla de ${nombrePeriodo(p)} generada con ${p.cantidadTrabajadores} trabajadores.`);
        this.generando.set(false);
        this.panelAbierto.set(false);
        this.router.navigate(['/planillas', p.id]);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.generando.set(false);
      }
    });
  }

  protected abrir(p: Planilla): void {
    this.router.navigate(['/planillas', p.id]);
  }
}
