import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MENU } from '../config/navegacion';
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

/* Inicio según el rol: las áreas van al panel; Almacén y Vendedor, a su módulo; el personal, a marcar su asistencia.
   Si no encaja en ninguno, el primer módulo del menú al que tenga acceso. */
export function rutaInicio(): string {
  const auth = inject(AuthService);
  if (auth.puede('panel.ver')) return 'panel';
  if (auth.puede('inventario.mover')) return 'inventario';
  if (auth.puede('ventas.editar')) return 'ventas';
  if (auth.tieneFicha()) return 'mi-asistencia';
  const primero = MENU.flatMap((g) => g.items).find((i) => i.permiso && auth.puede(i.permiso));
  return primero ? primero.ruta.slice(1) : 'sin-acceso';
}
