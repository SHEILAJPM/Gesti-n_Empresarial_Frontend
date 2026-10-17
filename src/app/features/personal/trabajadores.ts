import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { Trabajador } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { antiguedad, colorAvatar, iniciales, soles } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';
import { CeseTrabajador } from './cese-trabajador';
import { FormTrabajador } from './form-trabajador';

@Component({
  selector: 'app-trabajadores',
  imports: [RouterLink, PageHeader, StatCard, Icon, Paginador, Vacio, FormTrabajador, CeseTrabajador],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trabajadores.html'
})
export class Trabajadores {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  protected readonly puedeEditar = inject(AuthService).puede('personal.editar');
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly antiguedad = antiguedad;
  protected readonly soles = soles;

  protected readonly cargando = signal(true);
  protected readonly trabajadores = signal<Trabajador[]>([]);
  protected readonly filtroArea = signal('');
  protected readonly filtroEstado = signal('ACTIVO');

  protected readonly tabla = new TablaEstado(
    this.trabajadores,
    (t) => `${t.nombres} ${t.documentoIdentidad} ${t.cargo} ${t.area}`,
    8,
    computed(() => {
      const area = this.filtroArea();
      const estado = this.filtroEstado();
      return (t: Trabajador) => (!area || t.area === area) && (!estado || t.estado === estado);
    })
  );

  protected readonly areas = computed(() =>
    [...new Set(this.trabajadores().map((t) => t.area).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b, 'es'))
  );
  private readonly activos = computed(() => this.trabajadores().filter((t) => t.estado === 'ACTIVO'));
  protected readonly cantidadActivos = computed(() => this.activos().length);
  protected readonly planilla = computed(() => this.activos().reduce((s, t) => s + (t.sueldo ?? 0), 0));
  protected readonly fichasIncompletas = computed(
    () => this.activos().filter((t) => !t.fechaIngreso || t.sueldo === null || !t.sistemaPension).length
  );

  protected readonly formAbierto = signal(false);
  protected readonly editando = signal<Trabajador | null>(null);
  protected readonly ceseAbierto = signal(false);
  protected readonly cesando = signal<Trabajador | null>(null);

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    this.api.personal.listar().subscribe({
      next: (lista) => {
        this.trabajadores.set(lista.sort((a, b) => a.nombres.localeCompare(b.nombres, 'es')));
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected cambiarEstado(estado: string): void {
    this.filtroEstado.set(estado);
    this.tabla.pagina.set(1);
  }

  protected nuevo(): void {
    this.editando.set(null);
    this.formAbierto.set(true);
  }

  protected editar(t: Trabajador, evento: Event): void {
    evento.stopPropagation();
    this.editando.set(t);
    this.formAbierto.set(true);
  }

  protected alGuardar(t: Trabajador): void {
    const existia = this.trabajadores().some((x) => x.id === t.id);
    this.trabajadores.update((lista) => (existia ? lista.map((x) => (x.id === t.id ? t : x)) : [t, ...lista]));
    this.formAbierto.set(false);
  }

  protected darDeBaja(t: Trabajador, evento: Event): void {
    evento.stopPropagation();
    this.cesando.set(t);
    this.ceseAbierto.set(true);
  }

  protected alCesar(t: Trabajador): void {
    this.trabajadores.update((lista) => lista.map((x) => (x.id === t.id ? t : x)));
    this.ceseAbierto.set(false);
  }

  protected async reactivar(t: Trabajador, evento: Event): Promise<void> {
    evento.stopPropagation();
    const ok = await this.confirm.preguntar({
      titulo: `Reactivar a ${t.nombres}`,
      mensaje: 'Volverá a figurar como activo y podrá registrar asistencia. Se borran la fecha y el motivo del cese.',
      accion: 'Reactivar'
    });
    if (!ok) {
      return;
    }
    this.api.personal.reactivar(t.id).subscribe({
      next: (reactivado) => {
        this.trabajadores.update((lista) => lista.map((x) => (x.id === t.id ? reactivado : x)));
        this.toast.exito(`${t.nombres} fue reactivado.`);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected verFicha(t: Trabajador): void {
    this.router.navigate(['/personal', t.id]);
  }
}
