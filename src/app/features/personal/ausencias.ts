import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Ausencia, EstadoAusencia, TIPOS_AUSENCIA, TipoAusencia, Trabajador } from '../../core/models';
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

type Pestana = 'pendientes' | 'aprobadas' | 'todas';

/* RRHH: aprueba o rechaza lo que piden los trabajadores y registra ausencias ya aprobadas (justificar faltas) */
@Component({
  selector: 'app-ausencias',
  imports: [DatePipe, ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Paginador, Vacio, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    { id: 'todas', titulo: 'Todas' }
  ];

  protected readonly conteo = computed(() => ({
    pendientes: this.ausencias().filter((a) => a.estado === 'PENDIENTE').length,
    aprobadas: this.ausencias().filter((a) => a.estado === 'APROBADA').length,
    todas: this.ausencias().length
  }));
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
    forkJoin({ ausencias: this.api.ausencias.listar(), trabajadores: this.api.personal.listar() }).subscribe({
      next: ({ ausencias, trabajadores }) => {
        this.ausencias.set(ausencias);
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

  protected abrir(): void {
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
      .registrar({ trabajadorId: Number(v.trabajadorId), tipo: v.tipo, desde: v.desde, hasta: v.hasta, motivo: v.motivo.trim() || null })
      .subscribe({
        next: (a) => {
          this.ausencias.update((lista) => [a, ...lista]);
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
