import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ApiService } from '../core/api/api.service';
import { mensajeDeError } from '../core/api/errores';
import { AuthService, RespuestaLogin } from '../core/auth/auth.service';
import { Observable } from 'rxjs';
import { Usuario } from '../core/models';
import { ToastService } from '../core/ui/toast.service';
import { Icon } from './icon';
import { Panel } from './panel';

/* Cambiar contraseña. Sin "cuenta": el usuario cambia la suya (debe escribir la actual y sus otras sesiones se cierran).
   Con "cuenta": el administrador le pone una nueva a otra persona. Las reglas las vuelve a validar el backend. */
@Component({
  selector: 'app-cambiar-clave',
  imports: [Panel, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-panel [abierto]="abierto()" (cerrar)="cerrar.emit()" etiqueta="Seguridad"
      [titulo]="cuenta() ? 'Restablecer contraseña' : 'Cambiar mi contraseña'"
      [descripcion]="cuenta() ? 'Nueva contraseña para ' + cuenta()!.username + '. Compártela con esa persona por un medio seguro.'
                              : 'Al cambiarla se cierran tus sesiones abiertas en otros dispositivos.'">
      <form id="form-clave" class="pila" style="gap: 16px" (submit)="$event.preventDefault(); guardar()" novalidate>
        @if (!cuenta()) {
          <div class="campo">
            <label for="clave-actual">Contraseña actual</label>
            <input id="clave-actual" class="control" [type]="ver() ? 'text' : 'password'" autocomplete="current-password"
              [value]="actual()" (input)="actual.set($any($event.target).value)" />
          </div>
        }
        <div class="campo">
          <label for="clave-nueva">Nueva contraseña</label>
          <input id="clave-nueva" class="control" [type]="ver() ? 'text' : 'password'" autocomplete="new-password"
            [value]="nueva()" (input)="nueva.set($any($event.target).value)" />
        </div>
        <div class="campo">
          <label for="clave-repetir">Repite la nueva contraseña</label>
          <input id="clave-repetir" class="control" [type]="ver() ? 'text' : 'password'" autocomplete="new-password"
            [value]="repetir()" (input)="repetir.set($any($event.target).value)" />
        </div>
        <label class="ver"><input type="checkbox" [checked]="ver()" (change)="ver.set(!ver())" /> Mostrar contraseñas</label>

        <ul class="reglas">
          @for (r of reglas(); track r.texto) {
            <li [class.ok]="r.ok"><app-icon [name]="r.ok ? 'checkCirculo' : 'info'" [size]="15" /> {{ r.texto }}</li>
          }
        </ul>
      </form>
      <ng-container ngProjectAs="[pie]">
        <button type="button" class="btn" (click)="cerrar.emit()">Cancelar</button>
        <button type="submit" form="form-clave" class="btn btn-primario" [disabled]="!valida() || guardando()">
          @if (guardando()) { <span class="spinner"></span> Guardando… } @else { <app-icon name="candado" [size]="16" /> Guardar }
        </button>
      </ng-container>
    </app-panel>
  `,
  styles: `
    .ver { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); cursor: pointer; }
    .reglas { display: grid; gap: 6px; margin: 0; padding: 12px 14px; list-style: none; border-radius: 12px; background: var(--surface-2); }
    .reglas li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-3); }
    .reglas li.ok { color: var(--success); }
  `
})
export class CambiarClave {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly abierto = input(false);
  /* null = la propia cuenta */
  readonly cuenta = input<Usuario | null>(null);
  readonly cerrar = output<void>();

  protected readonly actual = signal('');
  protected readonly nueva = signal('');
  protected readonly repetir = signal('');
  protected readonly ver = signal(false);
  protected readonly guardando = signal(false);

  protected readonly reglas = computed(() => {
    const n = this.nueva();
    const usuario = this.cuenta()?.username ?? this.auth.sesion()?.usuario ?? '';
    return [
      { texto: 'Al menos 8 caracteres', ok: n.length >= 8 },
      { texto: 'Combina letras y números', ok: /\p{L}/u.test(n) && /\d/.test(n) },
      { texto: 'Distinta de tu nombre de usuario', ok: !!n && n.toLowerCase() !== usuario.toLowerCase() },
      { texto: 'Las dos contraseñas coinciden', ok: !!n && n === this.repetir() }
    ];
  });
  protected readonly valida = computed(() => this.reglas().every((r) => r.ok) && (!!this.cuenta() || !!this.actual()));

  constructor() {
    // Cada vez que se abre, el formulario empieza vacío
    effect(() => {
      if (this.abierto()) {
        this.actual.set('');
        this.nueva.set('');
        this.repetir.set('');
        this.ver.set(false);
      }
    });
  }

  protected guardar(): void {
    if (!this.valida() || this.guardando()) return;
    this.guardando.set(true);
    const cuenta = this.cuenta();
    const peticion: Observable<unknown> = cuenta
      ? this.api.usuarios.restablecerClave(cuenta.id, this.nueva())
      : this.api.cuenta.cambiarClave(this.actual(), this.nueva());
    peticion.subscribe({
      next: (respuesta) => {
        if (!cuenta) {
          this.auth.renovar(respuesta as RespuestaLogin);
        }
        this.toast.exito(cuenta ? `Contraseña de ${cuenta.username} actualizada.` : 'Tu contraseña se cambió.');
        this.guardando.set(false);
        this.cerrar.emit();
      },
      error: (e) => {
        this.toast.error(mensajeDeError(e));
        this.guardando.set(false);
      }
    });
  }
}
