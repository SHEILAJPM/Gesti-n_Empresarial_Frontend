import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Documento, Trabajador } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, diasHasta, hoyIso, iniciales } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { TablaEstado } from '../../shared/tabla';

type Pestana = 'todos' | 'proximos' | 'vencidos' | 'vigentes';

interface FilaDocumento extends Documento {
  nombre: string;
  dni: string;
  dias: number;
}

const TIPOS_SUGERIDOS = ['Contrato de trabajo', 'Examen médico ocupacional', 'Certificado de antecedentes', 'SCTR',
  'Licencia de conducir', 'Carné de extranjería', 'Constancia de capacitación'];

@Component({
  selector: 'app-documentos',
  imports: [DatePipe, ReactiveFormsModule, PageHeader, Icon, Panel, Paginador, Vacio, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documentos.html'
})
export class Documentos {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;
  protected readonly tiposSugeridos = TIPOS_SUGERIDOS;
  protected readonly hoy = hoyIso();

  protected readonly cargando = signal(true);
  protected readonly documentos = signal<Documento[]>([]);
  protected readonly trabajadores = signal<Trabajador[]>([]);
  protected readonly pestana = signal<Pestana>('todos');

  protected readonly filas = computed<FilaDocumento[]>(() => {
    const mapa = new Map(this.trabajadores().map((t) => [t.id, t]));
    return this.documentos()
      .map((d) => ({
        ...d,
        nombre: mapa.get(d.trabajadorId)?.nombres ?? `Trabajador #${d.trabajadorId}`,
        dni: mapa.get(d.trabajadorId)?.documentoIdentidad ?? '',
        dias: diasHasta(d.fechaVencimiento)
      }))
      .sort((a, b) => a.dias - b.dias);
  });

  protected readonly conteo = computed(() => {
    const f = this.filas();
    return {
      todos: f.length,
      vencidos: f.filter((d) => d.dias < 0).length,
      proximos: f.filter((d) => d.dias >= 0 && d.dias <= 30).length,
      vigentes: f.filter((d) => d.dias > 30).length
    };
  });

  protected readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'todos', titulo: 'Todos' },
    { id: 'vencidos', titulo: 'Vencidos' },
    { id: 'proximos', titulo: 'Por vencer (30 días)' },
    { id: 'vigentes', titulo: 'Vigentes' }
  ];

  protected readonly tabla = new TablaEstado(
    this.filas,
    (d) => `${d.nombre} ${d.dni} ${d.tipo}`,
    10,
    computed(() => {
      const p = this.pestana();
      return (d: FilaDocumento) =>
        p === 'todos' || (p === 'vencidos' && d.dias < 0) || (p === 'proximos' && d.dias >= 0 && d.dias <= 30) || (p === 'vigentes' && d.dias > 30);
    })
  );

  protected readonly panelAbierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    documentoIdentidad: ['', Validators.required],
    tipo: ['', [Validators.required, Validators.maxLength(120)]],
    fechaVencimiento: ['', Validators.required]
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.cargando.set(true);
    forkJoin({ documentos: this.api.documentos.listar(), trabajadores: this.api.personal.listar() }).subscribe({
      next: ({ documentos, trabajadores }) => {
        this.documentos.set(documentos);
        this.trabajadores.set(trabajadores);
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

  protected nuevo(): void {
    this.form.reset();
    this.panelAbierto.set(true);
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.api.documentos.registrar(this.form.getRawValue()).subscribe({
      next: (doc) => {
        this.documentos.update((lista) => [doc, ...lista]);
        this.toast.exito('Documento registrado.');
        this.panelAbierto.set(false);
        this.guardando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }

  protected estado(d: FilaDocumento): { texto: string; clase: string } {
    if (d.dias < 0) {
      return { texto: `Vencido hace ${Math.abs(d.dias)} d`, clase: 'badge-peligro' };
    }
    if (d.dias === 0) {
      return { texto: 'Vence hoy', clase: 'badge-peligro' };
    }
    if (d.dias <= 30) {
      return { texto: `Vence en ${d.dias} d`, clase: 'badge-alerta' };
    }
    return { texto: 'Vigente', clase: 'badge-exito' };
  }

  /* Porcentaje de "vida" restante para la barrita (100 % = 90 días o más) */
  protected vida(d: FilaDocumento): number {
    return Math.max(0, Math.min(100, (d.dias / 90) * 100));
  }
}
