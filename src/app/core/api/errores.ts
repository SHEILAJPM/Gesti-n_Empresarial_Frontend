import { HttpErrorResponse } from '@angular/common/http';

/* El backend responde ErrorResponse { mensaje, errores } o, en algunos controllers, un texto plano */
export function mensajeDeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Ocurrió un error inesperado.';
  }
  if (error.status === 0) {
    return 'No se pudo conectar con el servidor. ¿Está encendido el backend?';
  }
  const cuerpo = error.error;
  if (typeof cuerpo === 'string' && cuerpo.trim()) {
    return cuerpo;
  }
  if (cuerpo && typeof cuerpo === 'object') {
    const errores = cuerpo.errores as Record<string, string> | undefined;
    if (errores && Object.keys(errores).length) {
      return Object.values(errores).join(' · ');
    }
    if (cuerpo.mensaje) {
      return cuerpo.mensaje as string;
    }
  }
  return `Error ${error.status}: ${error.statusText || 'solicitud rechazada'}`;
}
