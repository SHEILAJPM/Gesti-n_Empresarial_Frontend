import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Ausencia, ResumenVacaciones, TIPOS_AUSENCIA, TipoAusencia } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Vacio } from '../../shared/bloques';
import { hoyIso } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { leerArchivo } from '../../shared/rostro';
import { StatCard } from '../../shared/stat-card';
import { ESTADO_AUSENCIA, ESTADO_PERIODO } from '../personal/ausencias';

const MAX_DOCUMENTO = 5 * 1024 * 1024;

/* El trabajador ve sus vacaciones según ley (periodos ganados y plazos), pide vacaciones o permisos
   y adjunta el certificado del descanso médico */
@Component({
  selector: 'app-mis-ausencias',
  imports: [DatePipe, ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Mi espacio" titulo="Vacaciones y permisos"
        descripcion="Por cada año completo de trabajo ganas 30 días de vacaciones (D. Leg. 713). Los días aprobados no cuentan como falta.">
        <button type="button" class="btn btn-primario" (click)="abrir()"><app-icon name="mas" [size]="17" /> Nueva solicitud</button>
      </app-page-header>

      @if (vacaciones()?.alerta; as alerta) {
        <div class="aviso-vac" [class.peligro]="vacaciones()!.nivel === 'peligro'" role="status">
          <app-icon name="alerta" [size]="18" /> {{ alerta }}
        </div>
      }

      <section class="grid-kpi escalonado">
        <app-stat-card style="--i: 0" titulo="Vacaciones disponibles" [valor]="vacaciones()?.disponibles ?? 0" icono="maleta"
          [cargando]="cargando()" detalle="días ganados por gozar" />
        <app-stat-card style="--i: 1" titulo="Solicitados" [valor]="vacaciones()?.solicitados ?? 0" icono="reloj" tono="alerta"
          [cargando]="cargando()" detalle="días esperando a RRHH" />
        <app-stat-card style="--i: 2" titulo="Por aprobar" [valor]="pendientes()" icono="documento" tono="info" [cargando]="cargando()"
          detalle="solicitudes en total" />
      </section>

      @if (vacaciones()?.periodos?.length) {
        <article class="card entrada">
          <header class="card-cabecera"><h3 style="margin: 0">Mis periodos vacacionales</h3></header>
          <div class="tabla-contenedor">
            <table class="tabla">
              <thead><tr><th>Periodo</th><th>Derecho desde</th><th>Gozar hasta</th><th class="right">Gozados</th>
                <th class="right">Programados</th><th class="right">Saldo</th><th>Estado</th></tr></thead>
              <tbody>
                @for (p of vacaciones()!.periodos; track p.numero) {
                  <tr>
                    <td class="nowrap">{{ p.desde | date: 'd MMM y' }} – {{ p.hasta | date: 'd MMM y' }}</td>
                    <td class="nowrap">{{ p.derechoDesde | date: 'd MMM y' }}</td>
                    <td class="nowrap">{{ p.estado === 'EN_CURSO' ? '—' : (p.venceEl | date: 'd MMM y') }}</td>
                    <td class="right num">{{ p.gozados }}</td>
                    <td class="right num">{{ p.programados + p.solicitados }}</td>
                    <td class="right num"><strong>{{ p.saldo }}</strong></td>
                    <td><span class="badge punto" [class]="estadosPeriodo[p.estado].clase">{{ estadosPeriodo[p.estado].texto }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="muted nota">Hasta 15 días puedes tomarlos en partes de 1 a 6 días; el resto, en bloques de 7 días seguidos o más.</p>
        </article>
      }

      <article class="card entrada">
        <header class="card-cabecera"><h3 style="margin: 0">Mis solicitudes</h3></header>
        @if (cargando()) {
          <div class="card-cuerpo pila">@for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 44px"></div> }</div>
        } @else if (ausencias().length) {
          <div class="tabla-contenedor">
            <table class="tabla">
              <thead><tr><th>Tipo</th><th>Fechas</th><th class="right">Días</th><th>Estado</th><th class="right"></th></tr></thead>
              <tbody>
                @for (a of ausencias(); track a.id; let i = $index) {
                  <tr [style.--i]="i">
                    <td><strong>{{ a.tipoTexto }}</strong>@if (a.motivo) { <small class="muted" style="display: block">{{ a.motivo }}</small> }
                      @if (a.documentoNombre) {
                        <button type="button" class="enlace" (click)="verDocumento(a)"><app-icon name="documento" [size]="13" /> {{ a.documentoNombre }}</button>
                      }</td>
                    <td class="nowrap">{{ a.desde | date: 'd MMM' }} – {{ a.hasta | date: 'd MMM y' }}</td>
                    <td class="right num">{{ a.dias }}</td>
                    <td>
                      <span class="badge punto" [class]="estados[a.estado].clase">{{ estados[a.estado].texto }}</span>
                      @if (a.comentario) { <small class="muted" style="display: block">RRHH: {{ a.comentario }}</small> }
                    </td>
                    <td class="right">
                      @if (a.estado === 'PENDIENTE') {
                        <button type="button" class="btn btn-sm btn-fantasma" (click)="retirar(a)">Retirar</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <app-vacio icono="maleta" titulo="Sin solicitudes" texto="Cuando pidas vacaciones o un permiso aparecerá aquí." />
        }
      </article>
    </div>

    <app-panel [abierto]="panelAbierto()" (cerrar)="panelAbierto.set(false)" etiqueta="Mi espacio" titulo="Nueva solicitud"
      descripcion="RRHH la revisará. Te llegará un aviso cuando la respondan.">
      <form id="form-ausencia" class="form-grid" [formGroup]="form" (ngSubmit)="enviar()" novalidate>
        <div class="campo completo">
          <label for="a-tipo">Tipo</label>
          <select id="a-tipo" class="control" formControlName="tipo">
            @for (t of tipos; track t.valor) { <option [value]="t.valor">{{ t.texto }}</option> }
          </select>
          <small class="muted">{{ ayuda() }}</small>
        </div>
        <div class="campo">
          <label for="a-desde">Desde</label>
          <input id="a-desde" type="date" class="control" formControlName="desde" />
        </div>
        <div class="campo">
          <label for="a-hasta">Hasta</label>
          <input id="a-hasta" type="date" class="control" formControlName="hasta" [min]="form.controls.desde.value" />
        </div>
        @if (tipoElegido() === 'DESCANSO_MEDICO') {
          <div class="campo completo">
            <label for="a-doc">Certificado médico o CITT de EsSalud <span style="color: var(--danger)">*</span></label>
            <input id="a-doc" type="file" class="control" accept="application/pdf,image/jpeg,image/png" (change)="elegirDocumento($event)" />
            <small class="muted">{{ documentoNombre() || 'PDF o foto (JPG, PNG), hasta 5 MB. RRHH lo revisa antes de aprobar.' }}</small>
          </div>
        }
        <div class="campo completo">
          <label for="a-motivo">Motivo <span class="muted">(opcional)</span></label>
          <textarea id="a-motivo" class="control" rows="2" maxlength="300" formControlName="motivo"></textarea>
        </div>
      </form>
      <ng-container ngProjectAs="[pie]">
        <button type="button" class="btn" (click)="panelAbierto.set(false)">Cancelar</button>
        <button type="submit" form="form-ausencia" class="btn btn-primario" [disabled]="enviando()">
          @if (enviando()) { <span class="spinner"></span> Enviando… } @else { <app-icon name="check" [size]="17" /> Enviar a RRHH }
        </button>
      </ng-container>
    </app-panel>
  `,
  styles: `
    .aviso-vac { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-radius: var(--radius);
      background: var(--accent-soft); color: var(--ink); font-size: 14px; }
    .aviso-vac.peligro { background: var(--danger-soft); }
    .nota { margin: 0; padding: 10px 20px 16px; font-size: 12.5px; }
    .enlace { display: inline-flex; gap: 4px; align-items: center; margin-top: 4px; background: none; border: 0; padding: 0;
      font: inherit; font-size: 12.5px; color: var(--brand); cursor: pointer; }
  `
})
export class MisAusencias {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly tipos = TIPOS_AUSENCIA;
  protected readonly estados = ESTADO_AUSENCIA;
  protected readonly estadosPeriodo = ESTADO_PERIODO;

  protected readonly cargando = signal(true);
  protected readonly ausencias = signal<Ausencia[]>([]);
  protected readonly vacaciones = signal<ResumenVacaciones | null>(null);
  protected readonly pendientes = computed(() => this.ausencias().filter((a) => a.estado === 'PENDIENTE').length);

  protected readonly panelAbierto = signal(false);
  protected readonly enviando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    tipo: ['VACACIONES' as TipoAusencia],
    desde: [hoyIso(), Validators.required],
    hasta: [hoyIso(), Validators.required],
    motivo: ['', Validators.maxLength(300)]
  });
  protected readonly tipoElegido = signal<TipoAusencia>('VACACIONES');
  protected readonly ayuda = computed(() => this.tipos.find((t) => t.valor === this.tipoElegido())?.ayuda ?? '');
  private readonly documento = signal<string | null>(null);
  protected readonly documentoNombre = signal('');

  constructor() {
    this.form.controls.tipo.valueChanges.subscribe((t) => this.tipoElegido.set(t));
    this.cargar();
  }

  private cargar(): void {
    forkJoin({ ausencias: this.api.portal.misAusencias(), vacaciones: this.api.portal.misVacaciones() }).subscribe({
      next: ({ ausencias, vacaciones }) => {
        this.ausencias.set(ausencias);
        this.vacaciones.set(vacaciones);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected abrir(): void {
    this.form.reset({ tipo: 'VACACIONES', desde: hoyIso(), hasta: hoyIso(), motivo: '' });
    this.documento.set(null);
    this.documentoNombre.set('');
    this.panelAbierto.set(true);
  }

  protected async elegirDocumento(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    if (archivo.size > MAX_DOCUMENTO) {
      this.toast.error('El documento pesa más de 5 MB.');
      (evento.target as HTMLInputElement).value = '';
      return;
    }
    this.documento.set(await leerArchivo(archivo));
    this.documentoNombre.set(archivo.name);
  }

  protected enviar(): void {
    const v = this.form.getRawValue();
    if (this.form.invalid || v.hasta < v.desde) {
      this.toast.error('Revisa las fechas: la final no puede ser anterior a la inicial.');
      return;
    }
    if (v.tipo === 'DESCANSO_MEDICO' && !this.documento()) {
      this.toast.error('Adjunta el certificado médico o el CITT de EsSalud.');
      return;
    }
    this.enviando.set(true);
    this.api.portal
      .solicitarAusencia({
        tipo: v.tipo, desde: v.desde, hasta: v.hasta, motivo: v.motivo.trim() || null,
        documento: v.tipo === 'DESCANSO_MEDICO' ? this.documento() : null,
        documentoNombre: v.tipo === 'DESCANSO_MEDICO' ? this.documentoNombre() : null
      })
      .subscribe({
        next: () => {
          this.toast.exito('Solicitud enviada a RRHH.');
          this.panelAbierto.set(false);
          this.enviando.set(false);
          this.cargar();
        },
        error: (e) => {
          this.toast.error(mensajeDeError(e));
          this.enviando.set(false);
        }
      });
  }

  protected verDocumento(a: Ausencia): void {
    this.api.portal.miDocumento(a.id).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }

  protected async retirar(a: Ausencia): Promise<void> {
    const ok = await this.confirm.preguntar({
      titulo: 'Retirar solicitud',
      mensaje: `Se retirará tu pedido de ${a.tipoTexto.toLowerCase()} (${a.dias} días).`,
      accion: 'Retirar',
      peligro: true
    });
    if (!ok) return;
    this.api.portal.retirarAusencia(a.id).subscribe({
      next: () => {
        this.toast.exito('Solicitud retirada.');
        this.cargar();
      },
      error: (e) => this.toast.error(mensajeDeError(e))
    });
  }
}
