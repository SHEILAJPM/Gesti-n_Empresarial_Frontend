import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { EstadoTarea, PrioridadTarea, Tarea, TrabajadorAsignable } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, hoyIso, iniciales } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

type Pestana = 'abiertas' | 'vencidas' | 'hechas' | 'todas';

export const TEXTO_ESTADO_TAREA: Record<EstadoTarea, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente', clase: 'badge-alerta' },
  EN_PROCESO: { texto: 'En proceso', clase: 'badge-info' },
  HECHA: { texto: 'Terminada', clase: 'badge-exito' },
  CANCELADA: { texto: 'Cancelada', clase: '' }
};

export const TEXTO_PRIORIDAD: Record<PrioridadTarea, { texto: string; clase: string }> = {
  ALTA: { texto: 'Alta', clase: 'badge-peligro' },
  MEDIA: { texto: 'Media', clase: 'badge-alerta' },
  BAJA: { texto: 'Baja', clase: '' }
};

/* Tareas asignadas por RRHH y los jefes de área; el trabajador las ve en "Mis tareas" */
@Component({
  selector: 'app-tareas',
  imports: [DatePipe, ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tareas.html'
})
export class Tareas {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly estados = TEXTO_ESTADO_TAREA;
  protected readonly prioridades = TEXTO_PRIORIDAD;
  protected readonly hoy = hoyIso();

  protected readonly cargando = signal(true);
  protected readonly tareas = signal<Tarea[]>([]);
  protected readonly asignables = signal<TrabajadorAsignable[]>([]);
  protected readonly pestana = signal<Pestana>('abiertas');

  private readonly abierta = (t: Tarea) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROCESO';

  protected readonly conteo = computed(() => {
    const lista = this.tareas();
    return {
      abiertas: lista.filter(this.abierta).length,
      vencidas: lista.filter((t) => t.vencida).length,
      hechas: lista.filter((t) => t.estado === 'HECHA').length,
      todas: lista.length,
      enProceso: lista.filter((t) => t.estado === 'EN_PROCESO').length
    };
  });

  protected readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'abiertas', titulo: 'Abiertas' },
    { id: 'vencidas', titulo: 'Vencidas' },
    { id: 'hechas', titulo: 'Terminadas' },
    { id: 'todas', titulo: 'Todas' }
  ];

  private readonly filtro = computed(() => {
    const p = this.pestana();
    return (t: Tarea) =>
      p === 'todas' || (p === 'abiertas' && this.abierta(t)) || (p === 'vencidas' && t.vencida) || (p === 'hechas' && t.estado === 'HECHA');
  });

  protected readonly tabla = new TablaEstado(this.tareas, (t) => `${t.titulo} ${t.trabajador ?? ''} ${t.area ?? ''} ${t.creadaPor}`, 10, this.filtro);

  protected readonly panelAbierto = signal(false);
  protected readonly editando = signal<Tarea | null>(null);
  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    titulo: ['', [Validators.required, Validators.maxLength(150)]],
    descripcion: ['', Validators.maxLength(1000)],
    trabajadorId: [0, Validators.min(1)],
    prioridad: ['MEDIA' as PrioridadTarea],
    fechaLimite: ['']
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({ tareas: this.api.tareas.listar(), asignables: this.api.tareas.asignables() }).subscribe({
      next: ({ tareas, asignables }) => {
        this.tareas.set(tareas);
        this.asignables.set(asignables);
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

  protected abrir(t?: Tarea): void {
    this.editando.set(t ?? null);
    this.form.reset({
      titulo: t?.titulo ?? '',
      descripcion: t?.descripcion ?? '',
      trabajadorId: t?.trabajadorId ?? 0,
      prioridad: t?.prioridad ?? 'MEDIA',
      fechaLimite: t?.fechaLimite ?? ''
    });
    this.panelAbierto.set(true);
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const datos = {
      titulo: v.titulo.trim(),
      descripcion: v.descripcion.trim() || null,
      trabajadorId: Number(v.trabajadorId),
      prioridad: v.prioridad,
      fechaLimite: v.fechaLimite || null
    };
    const actual = this.editando();
    this.guardando.set(true);
    (actual ? this.api.tareas.actualizar(actual.id, datos) : this.api.tareas.crear(datos)).subscribe({
      next: (t) => {
        this.tareas.update((lista) => (actual ? lista.map((x) => (x.id === t.id ? t : x)) : [t, ...lista]));
        this.toast.exito(actual ? 'Tarea actualizada.' : `Tarea asignada a ${t.trabajador}.`);
        this.panelAbierto.set(false);
        this.guardando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected async cancelar(t: Tarea): Promise<void> {
    const ok = await this.confirm.preguntar({
      titulo: 'Cancelar tarea',
      mensaje: `«${t.titulo}» dejará de aparecerle a ${t.trabajador}.`,
      accion: 'Cancelar tarea',
      peligro: true
    });
    if (!ok) return;
    this.api.tareas.cancelar(t.id).subscribe({
      next: (r) => {
        this.tareas.update((lista) => lista.map((x) => (x.id === r.id ? r : x)));
        this.toast.exito('Tarea cancelada.');
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }
}
