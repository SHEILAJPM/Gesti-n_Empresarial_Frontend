import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Permiso } from './permisos';

export const autenticadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() || inject(Router).createUrlTree(['/login']);
};

export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.autenticado() || inject(Router).createUrlTree(['/']);
};

/* Usa data: { permiso: 'ventas.ver' } de la ruta */
export const permisoGuard: CanActivateFn = (ruta) => {
  const permiso = ruta.data['permiso'] as Permiso | undefined;
  return !permiso || inject(AuthService).puede(permiso) || inject(Router).createUrlTree(['/']);
};

/* Solo para cuentas ligadas a un trabajador */
export const fichaGuard: CanActivateFn = () => {
  return inject(AuthService).tieneFicha() || inject(Router).createUrlTree(['/']);
};

/* Inicio según el rol: las áreas van al panel; el personal, a marcar su asistencia */
export function rutaInicio(): string {
  const auth = inject(AuthService);
  return auth.puede('panel.ver') ? 'panel' : auth.tieneFicha() ? 'mi-asistencia' : 'sin-acceso';
}
