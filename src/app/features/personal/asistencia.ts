import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Marcacion, TipoMarcacion, Trabajador } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, hoyIso, iniciales } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

interface FilaMarcacion extends Marcacion {
  nombre: string;
  documento: string;
}

@Component({
  selector: 'app-asistencia',
  imports: [DatePipe, PageHeader, StatCard, Icon, Paginador, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './asistencia.html',
  styleUrl: './asistencia.scss'
})
export class Asistencia {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  protected readonly ahora = signal(new Date());
  protected readonly cargando = signal(true);
  protected readonly trabajadores = signal<Trabajador[]>([]);
  protected readonly marcaciones = signal<Marcacion[]>([]);

  protected readonly documento = signal('');
  protected readonly tipo = signal<TipoMarcacion>('ENTRADA');
  protected readonly marcando = signal(false);
  protected readonly ultimaMarcada = signal<FilaMarcacion | null>(null);

  protected readonly filtroFecha = signal(hoyIso());
  protected readonly filtroTipo = signal('');

  private readonly activos = computed(() => this.trabajadores().filter((t) => t.estado?.toUpperCase() === 'ACTIVO'));
  protected readonly opciones = computed(() => [...this.activos()].sort((a, b) => a.nombres.localeCompare(b.nombres, 'es')));

  protected readonly filas = computed<FilaMarcacion[]>(() => {
    const mapa = new Map(this.trabajadores().map((t) => [t.id, t]));
    return [...this.marcaciones()]
      .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora))
      .map((m) => ({
        ...m,
        nombre: mapa.get(m.trabajadorId)?.nombres ?? `Trabajador #${m.trabajadorId}`,
        documento: mapa.get(m.trabajadorId)?.documentoIdentidad ?? ''
      }));
  });

  protected readonly tabla = new TablaEstado(
    this.filas,
    (f) => `${f.nombre} ${f.documento}`,
    10,
    computed(() => {
      const fecha = this.filtroFecha();
      const tipo = this.filtroTipo();
      return (f: FilaMarcacion) => (!fecha || f.fechaHora.startsWith(fecha)) && (!tipo || f.tipo === tipo);
    })
  );

  private readonly deHoy = computed(() => this.filas().filter((f) => f.fechaHora.startsWith(hoyIso())));
  protected readonly presentes = computed(() => {
    // Presente = su última marcación de hoy es una ENTRADA
    const ultimas = new Map<number, TipoMarcacion>();
    for (const f of [...this.deHoy()].reverse()) {
      ultimas.set(f.trabajadorId, f.tipo);
    }
    return [...ultimas.values()].filter((t) => t === 'ENTRADA').length;
  });
  protected readonly entradasHoy = computed(() => this.deHoy().filter((f) => f.tipo === 'ENTRADA').length);
  protected readonly sinMarcar = computed(() => {
    const marcaron = new Set(this.deHoy().map((f) => f.trabajadorId));
    return this.activos().filter((t) => !marcaron.has(t.id)).length;
  });

  protected readonly seleccionado = computed(() => this.trabajadores().find((t) => t.documentoIdentidad === this.documento()) ?? null);

  constructor() {
    const reloj = setInterval(() => this.ahora.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({ trabajadores: this.api.personal.listar(), marcaciones: this.api.asistencia.listar() }).subscribe({
      next: ({ trabajadores, marcaciones }) => {
        this.trabajadores.set(trabajadores);
        this.marcaciones.set(marcaciones);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  /* Al elegir a alguien, sugiere SALIDA si su última marcación de hoy fue una ENTRADA */
  protected elegir(documento: string): void {
    this.documento.set(documento);
    this.ultimaMarcada.set(null);
    const t = this.trabajadores().find((x) => x.documentoIdentidad === documento);
    const ultima = this.deHoy().find((f) => f.trabajadorId === t?.id);
    this.tipo.set(ultima?.tipo === 'ENTRADA' ? 'SALIDA' : 'ENTRADA');
  }

  protected marcar(): void {
    const documento = this.documento();
    if (!documento) {
      this.toast.info('Elige al trabajador que va a marcar.');
      return;
    }
    this.marcando.set(true);
    this.api.asistencia.marcar({ documentoIdentidad: documento, tipo: this.tipo() }).subscribe({
      next: (m) => {
        this.marcaciones.update((lista) => [m, ...lista]);
        const t = this.seleccionado();
        this.ultimaMarcada.set({ ...m, nombre: t?.nombres ?? '', documento });
        this.toast.exito(`${this.tipo() === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada para ${t?.nombres ?? documento}.`);
        this.marcando.set(false);
        this.documento.set('');
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.marcando.set(false);
      }
    });
  }
}
