import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, isDevMode, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';
import { SISTEMA } from '../../core/config/constantes';
import { ThemeService } from '../../core/ui/theme.service';
import { ErrorCampo } from '../../shared/bloques';
import { Icon } from '../../shared/icon';

/* Usuarios que crea UsuarioInicializador en el backend; solo se muestran en desarrollo */
const CUENTAS_DEMO = [
  { usuario: 'admin', clave: 'Admin123', rol: 'Administrador' },
  { usuario: 'rrhh1', clave: 'Rrhh123', rol: 'RR. HH.' },
  { usuario: 'contabilidad1', clave: 'Conta123', rol: 'Contabilidad' },
  { usuario: 'administracion1', clave: 'AdminArea123', rol: 'Administración' }
];

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Icon, ErrorCampo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly tema = inject(ThemeService);

  /* ?motivo=expirada cuando el interceptor cerró la sesión por un 401 */
  readonly motivo = input<string>();

  protected readonly sistema = SISTEMA;
  protected readonly cuentasDemo = isDevMode() ? CUENTAS_DEMO : [];
  protected readonly anio = new Date().getFullYear();

  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly temblar = signal(false);
  protected readonly verClave = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    usuario: ['', Validators.required],
    clave: ['', Validators.required]
  });

  protected usarCuenta(cuenta: (typeof CUENTAS_DEMO)[number]): void {
    this.form.setValue({ usuario: cuenta.usuario, clave: cuenta.clave });
    this.error.set('');
  }

  protected async ingresar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.sacudir();
      return;
    }
    this.enviando.set(true);
    this.error.set('');
    const { usuario, clave } = this.form.getRawValue();
    try {
      await this.auth.iniciarSesion(usuario.trim(), clave);
      // La raíz decide el inicio según el rol (panel, inventario, ventas o asistencia)
      await this.router.navigateByUrl('/');
    } catch (e) {
      const credenciales = e instanceof HttpErrorResponse && e.status === 401;
      this.error.set(credenciales ? 'Usuario o contraseña incorrectos.' : mensajeDeError(e));
      this.sacudir();
    } finally {
      this.enviando.set(false);
    }
  }

  private sacudir(): void {
    this.temblar.set(false);
    requestAnimationFrame(() => this.temblar.set(true));
  }
}
