import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Ausencia, SaldoVacaciones, TIPOS_AUSENCIA, TipoAusencia } from '../../core/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader, Vacio } from '../../shared/bloques';
import { hoyIso } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';
import { StatCard } from '../../shared/stat-card';
import { ESTADO_AUSENCIA } from '../personal/ausencias';

/* El trabajador pide vacaciones o permisos y ve si RRHH los aprobó */
@Component({
  selector: 'app-mis-ausencias',
  imports: [DatePipe, ReactiveFormsModule, PageHeader, StatCard, Icon, Panel, Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila">
      <app-page-header seccion="Mi espacio" titulo="Vacaciones y permisos"
        descripcion="Pide tus días a RRHH. Los días aprobados no cuentan como falta.">
        <button type="button" class="btn btn-primario" (click)="abrir()"><app-icon name="mas" [size]="17" /> Nueva solicitud</button>
      </app-page-header>

      <section class="grid-kpi escalonado">
        <app-stat-card style="--i: 0" [titulo]="'Vacaciones disponibles ' + anio" [valor]="saldo()?.disponibles ?? 0" icono="maleta"
          [cargando]="cargando()" [detalle]="'de ' + (saldo()?.diasAnuales ?? 30) + ' días al año'" />
        <app-stat-card style="--i: 1" titulo="Vacaciones tomadas" [valor]="saldo()?.usados ?? 0" icono="checkCirculo" tono="exito"
          [cargando]="cargando()" detalle="aprobadas este año" />
        <app-stat-card style="--i: 2" titulo="Por aprobar" [valor]="pendientes()" icono="reloj" tono="alerta" [cargando]="cargando()"
          detalle="solicitudes esperando a RRHH" />
      </section>

      <article class="card entrada">
        @if (cargando()) {
          <div class="card-cuerpo pila">@for (i of [1, 2, 3]; track i) { <div class="skeleton" style="height: 44px"></div> }</div>
        } @else if (ausencias().length) {
          <div class="tabla-contenedor">
            <table class="tabla">
              <thead><tr><th>Tipo</th><th>Fechas</th><th class="right">Días</th><th>Estado</th><th class="right"></th></tr></thead>
              <tbody>
                @for (a of ausencias(); track a.id; let i = $index) {
                  <tr [style.--i]="i">
                    <td><strong>{{ a.tipoTexto }}</strong>@if (a.motivo) { <small class="muted" style="display: block">{{ a.motivo }}</small> }</td>
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
  `
})
export class MisAusencias {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly tipos = TIPOS_AUSENCIA;
  protected readonly estados = ESTADO_AUSENCIA;
  protected readonly anio = new Date().getFullYear();

  protected readonly cargando = signal(true);
  protected readonly ausencias = signal<Ausencia[]>([]);
  protected readonly saldo = signal<SaldoVacaciones | null>(null);
  protected readonly pendientes = computed(() => this.ausencias().filter((a) => a.estado === 'PENDIENTE').length);

  protected readonly panelAbierto = signal(false);
  protected readonly enviando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    tipo: ['VACACIONES' as TipoAusencia],
    desde: [hoyIso(), Validators.required],
    hasta: [hoyIso(), Validators.required],
    motivo: ['', Validators.maxLength(300)]
  });
  private readonly tipoElegido = signal<TipoAusencia>('VACACIONES');
  protected readonly ayuda = computed(() => this.tipos.find((t) => t.valor === this.tipoElegido())?.ayuda ?? '');

  constructor() {
    this.form.controls.tipo.valueChanges.subscribe((t) => this.tipoElegido.set(t));
    this.cargar();
  }

  private cargar(): void {
    forkJoin({ ausencias: this.api.portal.misAusencias(), saldo: this.api.portal.miSaldoVacaciones(this.anio) }).subscribe({
      next: ({ ausencias, saldo }) => {
        this.ausencias.set(ausencias);
        this.saldo.set(saldo);
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
    this.panelAbierto.set(true);
  }

  protected enviar(): void {
    const v = this.form.getRawValue();
    if (this.form.invalid || v.hasta < v.desde) {
      this.toast.error('Revisa las fechas: la final no puede ser anterior a la inicial.');
      return;
    }
    this.enviando.set(true);
    this.api.portal.solicitarAusencia({ tipo: v.tipo, desde: v.desde, hasta: v.hasta, motivo: v.motivo.trim() || null }).subscribe({
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
