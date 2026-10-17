import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Trabajador } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo } from '../../shared/bloques';
import { antiguedad, hoyIso } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';

const MOTIVOS = ['Renuncia voluntaria', 'Término de contrato', 'Despido', 'Mutuo acuerdo', 'Jubilación', 'Fallecimiento', 'Otro'];

/* Dar de baja a un trabajador: conserva su historial y le impide marcar asistencia */
@Component({
  selector: 'app-cese-trabajador',
  imports: [ReactiveFormsModule, Panel, Icon, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel [abierto]="abierto()" (cerrar)="cerrar.emit()" etiqueta="Recursos humanos" titulo="Dar de baja"
      descripcion="Su historial de asistencia, documentos y pagos se conserva. Podrás reactivarlo después.">
      @if (trabajador(); as t) {
        <div class="resumen-cese">
          <strong>{{ t.nombres }}</strong>
          <span class="muted">{{ t.cargo }} · {{ t.area }} · {{ antiguedad(t.fechaIngreso) }} en la empresa</span>
        </div>
      }
      <form id="form-cese" class="form-grid" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <div class="campo">
          <label for="c-fecha">Fecha de cese</label>
          <input id="c-fecha" type="date" class="control" formControlName="fechaCese" [min]="trabajador()?.fechaIngreso ?? ''" />
          <app-error-campo [control]="form.controls.fechaCese" />
        </div>
        <div class="campo">
          <label for="c-motivo">Motivo</label>
          <select id="c-motivo" class="control" formControlName="motivo">
            <option value="">Selecciona…</option>
            @for (m of motivos; track m) { <option [value]="m">{{ m }}</option> }
          </select>
          <app-error-campo [control]="form.controls.motivo" />
        </div>
        <div class="campo completo">
          <label for="c-detalle">Detalle <span class="muted">(opcional)</span></label>
          <textarea id="c-detalle" class="control" formControlName="detalle" maxlength="200"
            placeholder="Información adicional para el legajo"></textarea>
        </div>
      </form>
      <ng-container ngProjectAs="[pie]">
        <button type="button" class="btn" (click)="cerrar.emit()">Cancelar</button>
        <button type="submit" form="form-cese" class="btn btn-peligro" [disabled]="guardando()">
          @if (guardando()) { <span class="spinner"></span> Procesando… } @else { <app-icon name="salir" [size]="17" /> Dar de baja }
        </button>
      </ng-container>
    </app-panel>
  `,
  styles: `
    .resumen-cese {
      display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; margin-bottom: 20px;
      border-radius: 12px; background: var(--danger-soft); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
    }
    .resumen-cese strong { color: var(--ink); }
    .resumen-cese span { font-size: 13px; }
  `
})
export class CeseTrabajador {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly motivos = MOTIVOS;
  protected readonly antiguedad = antiguedad;

  readonly abierto = input.required<boolean>();
  readonly trabajador = input<Trabajador | null>(null);
  readonly cerrar = output<void>();
  readonly guardado = output<Trabajador>();

  protected readonly guardando = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    fechaCese: [hoyIso(), Validators.required],
    motivo: ['', Validators.required],
    detalle: ['', Validators.maxLength(200)]
  });

  constructor() {
    effect(() => {
      if (this.abierto()) {
        this.form.reset({ fechaCese: hoyIso(), motivo: '', detalle: '' });
      }
    });
  }

  protected guardar(): void {
    const t = this.trabajador();
    if (!t || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { fechaCese, motivo, detalle } = this.form.getRawValue();
    this.guardando.set(true);
    this.api.personal.cesar(t.id, { fechaCese, motivo: detalle.trim() ? `${motivo}: ${detalle.trim()}` : motivo }).subscribe({
      next: (cesado) => {
        this.toast.exito(`${cesado.nombres} fue dado de baja.`);
        this.guardando.set(false);
        this.guardado.emit(cesado);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }
}
