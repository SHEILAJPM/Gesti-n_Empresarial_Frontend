import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { IntentoMarcacion, Marcacion, ResumenAsistencia, TipoMarcacion, Trabajador } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { FotoAsistencia } from '../../shared/foto-asistencia';
import { colorAvatar, hoyIso, iniciales } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

interface FilaMarcacion extends Marcacion {
  nombre: string;
  documento: string;
}

/* Lo que se ve al abrir la foto: la imagen y, al lado, los datos que registró el servidor */
interface Evidencia {
  nombre: string;
  tipo: TipoMarcacion;
  fechaHora: string;
  fotoId: number;
  latitud: number | null;
  longitud: number | null;
  precision: number | null;
  distancia: number | null;
  motivo: string | null;
}

type Pestana = 'marcaciones' | 'intentos' | 'resumen';

@Component({
  selector: 'app-asistencia',
  imports: [DatePipe, DecimalPipe, PageHeader, StatCard, Icon, Paginador, Vacio, Panel, FotoAsistencia],
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
  protected readonly intentos = signal<IntentoMarcacion[]>([]);
  protected readonly pestana = signal<Pestana>('marcaciones');
  protected readonly evidencia = signal<Evidencia | null>(null);

  /* Resumen mensual (pestaña «Resumen del mes») */
  protected readonly mesActual = hoyIso().slice(0, 7);
  protected readonly mesResumen = signal(this.mesActual);
  protected readonly resumen = signal<ResumenAsistencia | null>(null);
  protected readonly cargandoResumen = signal(false);

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

  /* Marcaciones rechazadas en el portal (fuera del radio o GPS impreciso), con su foto */
  protected readonly tablaIntentos = new TablaEstado(
    this.intentos,
    (i) => i.nombres,
    10,
    computed(() => {
      const fecha = this.filtroFecha();
      const tipo = this.filtroTipo();
      return (i: IntentoMarcacion) => (!fecha || i.fechaHora.startsWith(fecha)) && (!tipo || i.tipo === tipo);
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
    forkJoin({
      trabajadores: this.api.personal.listar(),
      marcaciones: this.api.asistencia.listar(),
      intentos: this.api.asistencia.intentos()
    }).subscribe({
      next: ({ trabajadores, marcaciones, intentos }) => {
        this.trabajadores.set(trabajadores);
        this.marcaciones.set(marcaciones);
        this.intentos.set(intentos);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected cambiarPestana(p: Pestana): void {
    if (p === 'resumen' && !this.resumen()) this.cargarResumen(this.mesResumen());
    this.pestana.set(p);
    this.tabla.pagina.set(1);
    this.tablaIntentos.pagina.set(1);
  }

  protected cargarResumen(mes: string): void {
    const [anio, numero] = mes.split('-').map(Number);
    this.mesResumen.set(mes);
    this.cargandoResumen.set(true);
    this.api.asistencia.resumen(anio, numero).subscribe({
      next: (r) => {
        this.resumen.set(r);
        this.cargandoResumen.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargandoResumen.set(false);
      }
    });
  }

  /* CSV con punto y coma y BOM: Excel en español lo abre con columnas y tildes correctas */
  protected descargarCsv(): void {
    const r = this.resumen();
    if (!r) return;
    const celda = (v: string | number) => {
      const texto = String(v);
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const filas = [
      ['Trabajador', 'DNI', 'Área', 'Días laborables', 'Días asistidos', 'Faltas', 'Tardanzas',
        'Minutos de tardanza', 'Horas trabajadas', 'Días sin salida'],
      ...r.trabajadores.map((f) => [f.nombres, f.documento, f.area, f.diasLaborables, f.diasAsistidos, f.faltas,
        f.tardanzas, f.minutosTardanza, String(f.horasTrabajadas).replace('.', ','), f.diasSinSalida])
    ];
    const contenido = '﻿' + filas.map((fila) => fila.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `asistencia-${this.mesResumen()}.csv`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected verMarcacion(f: FilaMarcacion): void {
    if (!f.fotoId) return;
    this.evidencia.set({
      nombre: f.nombre, tipo: f.tipo, fechaHora: f.fechaHora, fotoId: f.fotoId, latitud: f.latitud, longitud: f.longitud,
      precision: f.precisionMetros, distancia: f.distanciaMetros, motivo: null
    });
  }

  protected verIntento(i: IntentoMarcacion): void {
    if (!i.fotoId) return;
    this.evidencia.set({
      nombre: i.nombres, tipo: i.tipo, fechaHora: i.fechaHora, fotoId: i.fotoId, latitud: i.latitud, longitud: i.longitud,
      precision: i.precisionMetros, distancia: i.distanciaMetros, motivo: i.motivo
    });
  }

  protected enMapa(e: Evidencia): string {
    return `https://www.openstreetmap.org/?mlat=${e.latitud}&mlon=${e.longitud}#map=19/${e.latitud}/${e.longitud}`;
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
