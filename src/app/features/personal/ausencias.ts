import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Ausencia, EstadoAusencia, EstadoPeriodo, ResumenVacaciones, TIPOS_AUSENCIA, TipoAusencia, Trabajador } from '../../core/models';
import { leerArchivo } from '../../shared/rostro';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo, PageHeader, Paginador, Vacio } from '../../shared/bloques';
import { colorAvatar, hoyIso, iniciales } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { TablaEstado } from '../../shared/tabla';

export const ESTADO_AUSENCIA: Record<EstadoAusencia, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Por aprobar', clase: 'badge-alerta' },
  APROBADA: { texto: 'Aprobada', clase: 'badge-exito' },
  RECHAZADA: { texto: 'Rechazada', clase: 'badge-peligro' },
  ANULADA: { texto: 'Anulada', clase: '' }
};

/* Estado de cada periodo vacacional (D. Leg. 713) */
export const ESTADO_PERIODO: Record<EstadoPeriodo, { texto: string; clase: string }> = {
  EN_CURSO: { texto: 'Acumulando', clase: '' },
  SIN_RECORD: { texto: 'Sin récord', clase: 'badge-alerta' },
  DISPONIBLE: { texto: 'Disponible', clase: 'badge-info' },
  POR_VENCER: { texto: 'Por vencer', clase: 'badge-peligro' },
  VENCIDO: { texto: 'Vencido · indemnización', clase: 'badge-peligro' },
  PROGRAMADO: { texto: 'Programado', clase: 'badge-exito' },
  GOZADO: { texto: 'Gozado', clase: 'badge-exito' }
};

type Pestana = 'pendientes' | 'aprobadas' | 'todas' | 'rol';

/* RRHH: aprueba o rechaza lo que piden los trabajadores y registra ausencias ya aprobadas (justificar faltas) */
@Component({
  selector: 'app-ausencias',
  imports: [DatePipe, ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.enlace { display: inline-flex; gap: 4px; align-items: center; margin-top: 4px; background: none; border: 0; padding: 0;
    font: inherit; font-size: 12.5px; color: var(--brand); cursor: pointer; }`,
  template: `
    <div class="pila">
      <app-page-header seccion="Recursos humanos" titulo="Vacaciones y permisos"
        descripcion="Los días aprobados no son faltas. Los permisos sin goce se descuentan en la planilla.">
        <button type="button" class="btn btn-primario" (click)="abrir()"><app-icon name="mas" [size]="17" /> Registrar ausencia</button>
      </app-page-header>

      <section class="grid-kpi escalonado">
        <app-stat-card style="--i: 0" titulo="Por aprobar" [valor]="conteo().pendientes" icono="reloj" tono="alerta" [cargando]="cargando()" />
        <app-stat-card style="--i: 1" titulo="Ausentes hoy" [valor]="ausentesHoy()" icono="maleta" tono="info" [cargando]="cargando()"
          detalle="con ausencia aprobada" />
        <app-stat-card style="--i: 2" titulo="Aprobadas" [valor]="conteo().aprobadas" icono="checkCirculo" tono="exito" [cargando]="cargando()" />
      </section>

      <article class="card entrada">
        <nav class="pestanas" aria-label="Estado">
          @for (p of pestanas; track p.id) {
            <button type="button" [class.activa]="pestana() === p.id" (click)="pestana.set(p.id); tabla.pagina.set(1)">
              {{ p.titulo }} <span class="contador num">{{ conteo()[p.id] }}</span>
            </button>
          }
        </nav>
        @if (pestana() === 'rol') {
          <p class="muted" style="margin: 0; padding: 12px 20px 0; font-size: 13px">
            30 días por cada año completo de servicio. Deben gozarse dentro del año siguiente; si no, se paga una indemnización
            (D. Leg. 713). Pulsa un trabajador para ver sus periodos.</p>
          <div class="tabla-contenedor">
            <table class="tabla">
              <thead><tr><th>Trabajador</th><th>Ingreso</th><th class="right">Disponibles</th><th class="right">Solicitados</th><th>Situación</th><th class="right"></th></tr></thead>
              <tbody>
                @for (r of rol(); track r.trabajadorId) {
                  <tr (click)="abiertoRol.set(abiertoRol() === r.trabajadorId ? null : r.trabajadorId)" style="cursor: pointer">
                    <td>
                      <div class="celda-persona">
                        <span class="avatar" [style.background]="colorAvatar(r.nombres)">{{ iniciales(r.nombres) }}</span>
                        <div><strong>{{ r.nombres }}</strong><small>{{ r.area || '—' }} · {{ r.diasPorSemana }} días/semana</small></div>
                      </div>
                    </td>
                    <td class="nowrap">{{ r.fechaIngreso | date: 'd MMM y' }}</td>
                    <td class="right num"><strong>{{ r.disponibles }}</strong></td>
                    <td class="right num">{{ r.solicitados }}</td>
                    <td>
                      @if (r.alerta) {
                        <span class="badge punto" [class.badge-peligro]="r.nivel === 'peligro'" [class.badge-alerta]="r.nivel === 'alerta'"
                          [class.badge-info]="r.nivel === 'info'">{{ r.alerta }}</span>
                      } @else { <span class="muted">Al día</span> }
                    </td>
                    <td class="right">
                      @if (r.disponibles > 0) {
                        <button type="button" class="btn btn-sm" (click)="$event.stopPropagation(); programar(r)">Programar</button>
                      }
                    </td>
                  </tr>
                  @if (abiertoRol() === r.trabajadorId) {
                    <tr><td colspan="6" style="background: var(--surface-2)">
                      <table class="tabla" style="margin: 4px 0">
                        <thead><tr><th>Periodo</th><th>Derecho desde</th><th>Gozar hasta</th><th class="right">Gozados</th><th class="right">Programados</th>
                          <th class="right">Saldo</th><th class="right">Días efectivos</th><th>Estado</th></tr></thead>
                        <tbody>
                          @for (p of r.periodos; track p.numero) {
                            <tr>
                              <td class="nowrap">{{ p.numero }} · {{ p.desde | date: 'd/MM/yy' }} – {{ p.hasta | date: 'd/MM/yy' }}</td>
                              <td class="nowrap">{{ p.derechoDesde | date: 'd MMM y' }}</td>
                              <td class="nowrap">{{ p.estado === 'EN_CURSO' ? '—' : (p.venceEl | date: 'd MMM y') }}</td>
                              <td class="right num">{{ p.gozados }}</td>
                              <td class="right num">{{ p.programados + p.solicitados }}</td>
                              <td class="right num"><strong>{{ p.saldo }}</strong></td>
                              <td class="right num" [title]="'Récord requerido: ' + p.recordRequerido">{{ p.diasEfectivos }}/{{ p.recordRequerido }}</td>
                              <td><span class="badge punto" [class]="estadosPeriodo[p.estado].clase">{{ estadosPeriodo[p.estado].texto }}</span></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </td></tr>
                  }
                } @empty {
                  <tr><td colspan="6" class="muted">No hay trabajadores activos con fecha de ingreso.</td></tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
        <div class="filtros">
          <div class="control-icono busqueda">
            <app-icon name="buscar" [size]="16" />
            <input #b class="control" placeholder="Trabajador, tipo o motivo…" [value]="tabla.busqueda()" (input)="tabla.buscar(b.value)" />
          </div>
        </div>

        @if (cargando()) {
          <div class="card-cuerpo pila">@for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 44px"></div> }</div>
        } @else if (tabla.filtradas().length) {
          <div class="tabla-contenedor">
            <table class="tabla">
              <thead>
                <tr><th>Trabajador</th><th>Tipo</th><th>Fechas</th><th class="right">Días</th><th>Estado</th><th class="right">Acciones</th></tr>
              </thead>
              <tbody>
                @for (a of tabla.visibles(); track a.id; let i = $index) {
                  <tr [style.--i]="i">
                    <td>
                      <div class="celda-persona">
                        <span class="avatar" [style.background]="colorAvatar(a.trabajador)">{{ iniciales(a.trabajador) }}</span>
                        <div><strong>{{ a.trabajador }}</strong><small>{{ a.area || '—' }}</small></div>
                      </div>
                    </td>
                    <td>
                      {{ a.tipoTexto }} @if (!a.conGoce) { <span class="badge badge-alerta">sin goce</span> }
                      @if (a.subsidioEssalud) { <span class="badge badge-info" title="Pasa de 20 días en el año: desde el día 21 lo subsidia EsSalud">subsidio EsSalud</span> }
                      @if (a.documentoNombre) {
                        <button type="button" class="enlace" (click)="verDocumento(a)"><app-icon name="documento" [size]="13" /> {{ a.documentoNombre }}</button>
                      } @else if (a.tipo === 'DESCANSO_MEDICO') { <small style="display: block; color: var(--danger)">Sin certificado adjunto</small> }
                      @if (a.motivo) { <small class="muted" style="display: block">{{ a.motivo }}</small> }
                    </td>
                    <td class="nowrap">{{ a.desde | date: 'd MMM' }} – {{ a.hasta | date: 'd MMM y' }}
                      <small class="muted" style="display: block">Pedida por {{ a.solicitadaPor }}</small></td>
                    <td class="right num">{{ a.dias }}</td>
                    <td>
                      <span class="badge punto" [class]="estados[a.estado].clase">{{ estados[a.estado].texto }}</span>
                      @if (a.resueltaPor && a.estado !== 'PENDIENTE') { <small class="muted" style="display: block">{{ a.resueltaPor }}{{ a.comentario ? ': ' + a.comentario : '' }}</small> }
                    </td>
                    <td>
                      <div class="acciones" style="opacity: 1">
                        @if (a.estado === 'PENDIENTE') {
                          <button type="button" class="btn btn-sm btn-primario" (click)="aprobar(a)"><app-icon name="check" [size]="15" /> Aprobar</button>
                          <button type="button" class="btn btn-sm" (click)="rechazando.set(a); comentario.set('')">Rechazar</button>
                        } @else if (a.estado === 'APROBADA') {
                          <button type="button" class="btn btn-sm btn-fantasma" (click)="anular(a)">Anular</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-paginador [pagina]="tabla.pagina()" [paginas]="tabla.paginas()" [total]="tabla.filtradas().length"
            [tamano]="tabla.tamano" (cambiar)="tabla.pagina.set($event)" />
        } @else {
          <app-vacio icono="maleta" [titulo]="pestana() === 'pendientes' ? 'Nada por aprobar' : 'Sin ausencias'"
            texto="Las solicitudes de los trabajadores llegan aquí." />
        }
        }
      </article>
    </div>

    <app-panel [abierto]="!!rechazando()" (cerrar)="rechazando.set(null)" etiqueta="Vacaciones y permisos" titulo="Rechazar solicitud"
      [descripcion]="rechazando() ? rechazando()!.trabajador + ' · ' + rechazando()!.tipoTexto + ' (' + rechazando()!.dias + ' días)' : ''">
      <div class="campo">
        <label for="r-coment">Motivo del rechazo</label>
        <textarea id="r-coment" class="control" rows="3" maxlength="300" [value]="comentario()" (input)="comentario.set($any($event.target).value)"
          placeholder="El trabajador lo verá en su solicitud"></textarea>
      </div>
      <ng-container ngProjectAs="[pie]">
        <button type="button" class="btn" (click)="rechazando.set(null)">Volver</button>
        <button type="button" class="btn btn-peligro" [disabled]="!comentario().trim()" (click)="rechazar()">Rechazar</button>
      </ng-container>
    </app-panel>

    <app-panel [abierto]="panelAbierto()" (cerrar)="panelAbierto.set(false)" etiqueta="Vacaciones y permisos" titulo="Registrar ausencia"
      descripcion="Queda aprobada al guardarla. Úsala también para justificar una falta.">
      <form id="form-aus" class="form-grid" [formGroup]="form" (ngSubmit)="registrar()" novalidate>
        <div class="campo completo">
          <label for="ra-trab">Trabajador</label>
          <select id="ra-trab" class="control" formControlName="trabajadorId">
            <option [ngValue]="0" disabled>Elige…</option>
            @for (t of trabajadores(); track t.id) { <option [ngValue]="t.id">{{ t.nombres }}</option> }
          </select>
          <app-error-campo [control]="form.controls.trabajadorId" [mensajes]="{ min: 'Elige al trabajador.' }" />
        </div>
        <div class="campo completo">
          <label for="ra-tipo">Tipo</label>
          <select id="ra-tipo" class="control" formControlName="tipo">
            @for (t of tipos; track t.valor) { <option [value]="t.valor">{{ t.texto }} — {{ t.ayuda }}</option> }
          </select>
        </div>
        @if (form.controls.tipo.value === 'DESCANSO_MEDICO') {
          <div class="campo completo">
            <label for="ra-doc">Certificado médico o CITT <span style="color: var(--danger)">*</span></label>
            <input id="ra-doc" type="file" class="control" accept="application/pdf,image/jpeg,image/png" (change)="elegirDocumento($event)" />
            <small class="muted">{{ documentoNombre() || 'PDF o foto, hasta 5 MB' }}</small>
          </div>
        }
        <div class="campo"><label for="ra-desde">Desde</label><input id="ra-desde" type="date" class="control" formControlName="desde" /></div>
        <div class="campo"><label for="ra-hasta">Hasta</label><input id="ra-hasta" type="date" class="control" formControlName="hasta" /></div>
        <div class="campo completo">
          <label for="ra-motivo">Motivo <span class="muted">(opcional)</span></label>
          <textarea id="ra-motivo" class="control" rows="2" maxlength="300" formControlName="motivo"></textarea>
        </div>
      </form>
      <ng-container ngProjectAs="[pie]">
        <button type="button" class="btn" (click)="panelAbierto.set(false)">Cancelar</button>
        <button type="submit" form="form-aus" class="btn btn-primario" [disabled]="guardando()">
          @if (guardando()) { <span class="spinner"></span> Guardando… } @else { <app-icon name="check" [size]="17" /> Registrar }
        </button>
      </ng-container>
    </app-panel>
  `
})
export class Ausencias {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly estados = ESTADO_AUSENCIA;
  protected readonly tipos = TIPOS_AUSENCIA;
  protected readonly iniciales = iniciales;
  protected readonly colorAvatar = colorAvatar;

  protected readonly cargando = signal(true);
  protected readonly ausencias = signal<Ausencia[]>([]);
  protected readonly trabajadores = signal<Trabajador[]>([]);
  protected readonly pestana = signal<Pestana>('pendientes');
  protected readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'pendientes', titulo: 'Por aprobar' },
    { id: 'aprobadas', titulo: 'Aprobadas' },
    { id: 'todas', titulo: 'Todas' },
    { id: 'rol', titulo: 'Rol vacacional' }
  ];

  protected readonly conteo = computed(() => ({
    pendientes: this.ausencias().filter((a) => a.estado === 'PENDIENTE').length,
    aprobadas: this.ausencias().filter((a) => a.estado === 'APROBADA').length,
    todas: this.ausencias().length,
    rol: this.rol().filter((r) => r.nivel === 'peligro' || r.nivel === 'alerta').length
  }));
  protected readonly rol = signal<ResumenVacaciones[]>([]);
  protected readonly estadosPeriodo = ESTADO_PERIODO;
  protected readonly abiertoRol = signal<number | null>(null);
  protected readonly ausentesHoy = computed(() => {
    const hoy = hoyIso();
    return this.ausencias().filter((a) => a.estado === 'APROBADA' && a.desde <= hoy && a.hasta >= hoy).length;
  });

  private readonly filtro = computed(() => {
    const p = this.pestana();
    return (a: Ausencia) => p === 'todas' || (p === 'pendientes' && a.estado === 'PENDIENTE') || (p === 'aprobadas' && a.estado === 'APROBADA');
  });
  protected readonly tabla = new TablaEstado(this.ausencias, (a) => `${a.trabajador} ${a.tipoTexto} ${a.motivo ?? ''}`, 10, this.filtro);

  protected readonly rechazando = signal<Ausencia | null>(null);
  protected readonly comentario = signal('');

  protected readonly panelAbierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    trabajadorId: [0, Validators.min(1)],
    tipo: ['DESCANSO_MEDICO' as TipoAusencia],
    desde: [hoyIso(), Validators.required],
    hasta: [hoyIso(), Validators.required],
    motivo: ['']
  });

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    forkJoin({ ausencias: this.api.ausencias.listar(), trabajadores: this.api.personal.listar(), rol: this.api.ausencias.rolVacacional() }).subscribe({
      next: ({ ausencias, trabajadores, rol }) => {
        this.ausencias.set(ausencias);
        this.rol.set(rol);
        if (rol.some((r) => r.nivel === 'peligro') && !ausencias.some((a) => a.estado === 'PENDIENTE')) this.pestana.set('rol');
        this.trabajadores.set(trabajadores.filter((t) => t.estado === 'ACTIVO').sort((a, b) => a.nombres.localeCompare(b.nombres, 'es')));
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  private reemplazar(a: Ausencia): void {
    this.ausencias.update((lista) => lista.map((x) => (x.id === a.id ? a : x)));
  }

  protected aprobar(a: Ausencia): void {
    this.api.ausencias.resolver(a.id, true, null).subscribe({
      next: (r) => {
        this.reemplazar(r);
        this.toast.exito(`${r.tipoTexto} de ${r.trabajador} aprobada.`);
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected rechazar(): void {
    const a = this.rechazando();
    if (!a) return;
    this.api.ausencias.resolver(a.id, false, this.comentario().trim()).subscribe({
      next: (r) => {
        this.reemplazar(r);
        this.rechazando.set(null);
        this.toast.exito('Solicitud rechazada.');
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected async anular(a: Ausencia): Promise<void> {
    const ok = await this.confirm.preguntar({
      titulo: 'Anular ausencia',
      mensaje: `Los días del ${a.desde} al ${a.hasta} volverán a contar como laborables para ${a.trabajador}.`,
      accion: 'Anular',
      peligro: true
    });
    if (!ok) return;
    this.api.ausencias.anular(a.id).subscribe({
      next: (r) => {
        this.reemplazar(r);
        this.toast.exito('Ausencia anulada.');
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  private readonly documento = signal<string | null>(null);
  protected readonly documentoNombre = signal('');

  protected async elegirDocumento(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) {
      this.toast.error('El documento pesa más de 5 MB.');
      return;
    }
    this.documento.set(await leerArchivo(archivo));
    this.documentoNombre.set(archivo.name);
  }

  protected verDocumento(a: Ausencia): void {
    this.api.ausencias.documento(a.id).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  /* Abre el registro de vacaciones para ese trabajador */
  protected programar(r: ResumenVacaciones): void {
    this.abrir();
    this.form.patchValue({ trabajadorId: r.trabajadorId, tipo: 'VACACIONES' });
  }

  protected abrir(): void {
    this.documento.set(null);
    this.documentoNombre.set('');
    this.form.reset({ trabajadorId: 0, tipo: 'DESCANSO_MEDICO', desde: hoyIso(), hasta: hoyIso(), motivo: '' });
    this.panelAbierto.set(true);
  }

  protected registrar(): void {
    const v = this.form.getRawValue();
    if (this.form.invalid || v.hasta < v.desde) {
      this.form.markAllAsTouched();
      if (v.hasta < v.desde) this.toast.error('La fecha final no puede ser anterior a la inicial.');
      return;
    }
    this.guardando.set(true);
    this.api.ausencias
      .registrar({ trabajadorId: Number(v.trabajadorId), tipo: v.tipo, desde: v.desde, hasta: v.hasta, motivo: v.motivo.trim() || null,
        documento: v.tipo === 'DESCANSO_MEDICO' ? this.documento() : null,
        documentoNombre: v.tipo === 'DESCANSO_MEDICO' ? this.documentoNombre() : null })
      .subscribe({
        next: (a) => {
          this.ausencias.update((lista) => [a, ...lista]);
          this.api.ausencias.rolVacacional().subscribe((rol) => this.rol.set(rol));
          this.toast.exito(`${a.tipoTexto} registrada para ${a.trabajador}.`);
          this.panelAbierto.set(false);
          this.guardando.set(false);
        },
        error: (e) => {
          this.toast.error(mensajeDeError(e));
          this.guardando.set(false);
        }
      });
  }
}
