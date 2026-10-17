import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Vacio } from '../../shared/bloques';

/* Destino seguro cuando la cuenta no tiene ningún módulo (evita redirecciones en bucle) */
@Component({
  selector: 'app-sin-acceso',
  imports: [Vacio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card">
      <app-vacio icono="candado" titulo="Tu cuenta aún no tiene módulos"
        texto="Pídele al administrador que vincule tu cuenta a tu ficha de trabajador o que te asigne un rol de área.">
        <button type="button" class="btn" (click)="auth.cerrarSesion()">Cerrar sesión</button>
      </app-vacio>
    </article>
  `
})
export class SinAcceso {
  protected readonly auth = inject(AuthService);
}
