import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { mensajeDeError } from '../../core/api/errores';
import { Trabajador } from '../../core/models';
import { ToastService } from '../../core/ui/toast.service';
import { ErrorCampo } from '../../shared/bloques';
import { hoyIso } from '../../shared/formato';
import { Icon } from '../../shared/icon';
import { Panel } from '../../shared/panel';

const AFPS = ['Habitat', 'Integra', 'Prima', 'Profuturo'];
const BANCOS = ['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'Banco de la Nación', 'BanBif', 'Banco Pichincha'];

/* Panel con la ficha completa del trabajador; sirve para registrar y para editar */
@Component({
  selector: 'app-form-trabajador',
  imports: [ReactiveFormsModule, Panel, Icon, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel [abierto]="abierto()" (cerrar)="cerrar.emit()" etiqueta="Recursos humanos"
      [titulo]="trabajador() ? 'Editar ficha' : 'Nuevo trabajador'"
      [descripcion]="trabajador() ? 'El documento de identidad no se puede cambiar.' : 'El trabajador queda activo al registrarlo.'">
      <form id="form-trabajador" class="form-grid" [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <h4 class="form-seccion completo"><app-icon name="usuario" [size]="15" /> Datos personales</h4>
        <div class="campo completo">
          <label for="t-nombres">Nombres y apellidos</label>
          <input id="t-nombres" class="control" formControlName="nombres" placeholder="Ej. María López Torres" />
          <app-error-campo [control]="form.controls.nombres" />
        </div>
        <div class="campo">
          <label for="t-doc">DNI o carné de extranjería</label>
          <input id="t-doc" class="control mono" formControlName="documentoIdentidad" maxlength="12" placeholder="12345678" />
          <app-error-campo [control]="form.controls.documentoIdentidad" [mensajes]="{ pattern: 'DNI de 8 dígitos o CE de 9 a 12 caracteres.' }" />
        </div>
        <div class="campo">
          <label for="t-nac">Fecha de nacimiento <span class="muted">(opcional)</span></label>
          <input id="t-nac" type="date" class="control" formControlName="fechaNacimiento" [max]="hoy" />
        </div>
        <div class="campo">
          <label for="t-tel">Teléfono <span class="muted">(opcional)</span></label>
          <input id="t-tel" class="control" formControlName="telefono" inputmode="tel" placeholder="987 654 321" />
          <app-error-campo [control]="form.controls.telefono" [mensajes]="{ pattern: 'Solo números, espacios y +.' }" />
        </div>
        <div class="campo">
          <label for="t-correo">Correo <span class="muted">(opcional)</span></label>
          <input id="t-correo" type="email" class="control" formControlName="correo" placeholder="nombre@empresa.pe" />
          <app-error-campo [control]="form.controls.correo" [mensajes]="{ email: 'El correo no es válido.' }" />
        </div>
        <div class="campo completo">
          <label for="t-dir">Dirección <span class="muted">(opcional)</span></label>
          <input id="t-dir" class="control" formControlName="direccion" placeholder="Av. Arequipa 1234, Lince" />
          <app-error-campo [control]="form.controls.direccion" />
        </div>

        <h4 class="form-seccion completo"><app-icon name="edificio" [size]="15" /> Datos laborales</h4>
        <div class="campo">
          <label for="t-cargo">Cargo</label>
          <input id="t-cargo" class="control" formControlName="cargo" placeholder="Ej. Analista contable" />
          <app-error-campo [control]="form.controls.cargo" />
        </div>
        <div class="campo">
          <label for="t-area">Área</label>
          <input id="t-area" class="control" formControlName="area" list="lista-areas" placeholder="Ej. Contabilidad" />
          <datalist id="lista-areas">
            @for (area of areas(); track area) { <option [value]="area"></option> }
          </datalist>
          <app-error-campo [control]="form.controls.area" />
        </div>
        <div class="campo">
          <label for="t-ingreso">Fecha de ingreso</label>
          <input id="t-ingreso" type="date" class="control" formControlName="fechaIngreso" />
          <app-error-campo [control]="form.controls.fechaIngreso" />
        </div>
        <div class="campo">
          <label for="t-sueldo">Sueldo mensual (S/)</label>
          <input id="t-sueldo" type="number" min="0" step="0.01" class="control num" formControlName="sueldo" />
          <app-error-campo [control]="form.controls.sueldo" [mensajes]="{ min: 'El sueldo no puede ser negativo.' }" />
        </div>

        <h4 class="form-seccion completo"><app-icon name="billetera" [size]="15" /> Pensión y pago</h4>
        <div class="campo">
          <label for="t-pension">Sistema de pensiones</label>
          <select id="t-pension" class="control" formControlName="sistemaPension">
            <option value="">Sin registrar</option>
            <option value="ONP">ONP</option>
            <option value="AFP">AFP</option>
          </select>
        </div>
        <div class="campo">
          <label for="t-afp">AFP</label>
          <select id="t-afp" class="control" formControlName="afp">
            <option value="">{{ esAfp() ? 'Selecciona la AFP…' : 'No aplica' }}</option>
            @for (a of afps; track a) { <option [value]="a">{{ a }}</option> }
          </select>
          <app-error-campo [control]="form.controls.afp" [mensajes]="{ required: 'Indica a qué AFP aporta.' }" />
        </div>
        <div class="campo">
          <label for="t-banco">Banco para el pago</label>
          <input id="t-banco" class="control" formControlName="banco" list="lista-bancos" placeholder="Ej. BCP" />
          <datalist id="lista-bancos">
            @for (b of bancos; track b) { <option [value]="b"></option> }
          </datalist>
        </div>
        <div class="campo">
          <label for="t-cuenta">N.° de cuenta</label>
          <input id="t-cuenta" class="control mono" formControlName="numeroCuenta" placeholder="191-12345678-0-12" />
          <app-error-campo [control]="form.controls.numeroCuenta" [mensajes]="{ pattern: 'Solo dígitos y guiones.' }" />
        </div>
      </form>
      <ng-container ngProjectAs="[pie]">
        <button type="button" class="btn" (click)="cerrar.emit()">Cancelar</button>
        <button type="submit" form="form-trabajador" class="btn btn-primario" [disabled]="guardando()">
          @if (guardando()) { <span class="spinner"></span> Guardando… } @else { <app-icon name="check" [size]="17" /> Guardar ficha }
        </button>
      </ng-container>
    </app-panel>
  `
})
export class FormTrabajador {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly afps = AFPS;
  protected readonly bancos = BANCOS;
  protected readonly hoy = hoyIso();

  readonly abierto = input.required<boolean>();
  readonly trabajador = input<Trabajador | null>(null);
  readonly areas = input<string[]>([]);
  readonly cerrar = output<void>();
  readonly guardado = output<Trabajador>();

  protected readonly guardando = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    nombres: ['', [Validators.required, Validators.maxLength(150)]],
    documentoIdentidad: ['', [Validators.required, Validators.pattern(/^(\d{8}|[A-Za-z0-9]{9,12})$/)]],
    fechaNacimiento: [''],
    telefono: ['', Validators.pattern(/^\+?[0-9 ]{6,20}$/)],
    correo: ['', [Validators.email, Validators.maxLength(120)]],
    direccion: ['', Validators.maxLength(200)],
    cargo: ['', [Validators.required, Validators.maxLength(100)]],
    area: ['', [Validators.required, Validators.maxLength(100)]],
    fechaIngreso: [hoyIso(), Validators.required],
    sueldo: [0, [Validators.required, Validators.min(0)]],
    sistemaPension: [''],
    afp: [''],
    banco: ['', Validators.maxLength(60)],
    numeroCuenta: ['', Validators.pattern(/^[0-9-]{6,30}$/)]
  });

  private readonly sistema = toSignal(this.form.controls.sistemaPension.valueChanges, { initialValue: '' });
  protected readonly esAfp = () => this.sistema() === 'AFP';

  constructor() {
    // Carga los datos al abrir el panel
    effect(() => {
      if (!this.abierto()) {
        return;
      }
      const t = this.trabajador();
      this.form.reset({
        nombres: t?.nombres ?? '',
        documentoIdentidad: t?.documentoIdentidad ?? '',
        fechaNacimiento: t?.fechaNacimiento ?? '',
        telefono: t?.telefono ?? '',
        correo: t?.correo ?? '',
        direccion: t?.direccion ?? '',
        cargo: t?.cargo ?? '',
        area: t?.area ?? '',
        fechaIngreso: t?.fechaIngreso ?? hoyIso(),
        sueldo: t?.sueldo ?? 0,
        sistemaPension: t?.sistemaPension ?? '',
        afp: t?.afp ?? '',
        banco: t?.banco ?? '',
        numeroCuenta: t?.numeroCuenta ?? ''
      });
      if (t) {
        this.form.controls.documentoIdentidad.disable();
      } else {
        this.form.controls.documentoIdentidad.enable();
      }
    });

    // La AFP solo se pide (y se habilita) si el sistema es AFP
    effect(() => {
      const afp = this.form.controls.afp;
      if (this.sistema() === 'AFP') {
        afp.enable({ emitEvent: false });
        afp.setValidators(Validators.required);
      } else {
        afp.setValue('', { emitEvent: false });
        afp.disable({ emitEvent: false });
        afp.clearValidators();
      }
      afp.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.info('Revisa los campos marcados en rojo.');
      return;
    }
    this.guardando.set(true);
    const v = this.form.getRawValue();
    const datos = { ...v, sueldo: Number(v.sueldo), fechaNacimiento: v.fechaNacimiento || null };
    const actual = this.trabajador();
    const peticion = actual ? this.api.personal.actualizar(actual.id, datos) : this.api.personal.registrar(datos);
    peticion.subscribe({
      next: (t) => {
        this.toast.exito(actual ? 'Ficha actualizada.' : `${t.nombres} fue registrado.`);
        this.guardando.set(false);
        this.guardado.emit(t);
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }
}
