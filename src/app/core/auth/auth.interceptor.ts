import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_URL } from '../config/constantes';
import { ToastService } from '../ui/toast.service';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_URL)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const toast = inject(ToastService);
  // El login no lleva token: un 401 ahí significa usuario o contraseña incorrectos, no sesión vencida
  const esLogin = req.url.endsWith('/api/auth/login');
  const token = esLogin ? null : auth.tokenVigente();

  // X-Requested-With evita que el navegador abra su ventana nativa de login ante un 401
  let headers = req.headers.set('X-Requested-With', 'XMLHttpRequest');
  if (token && !headers.has('Authorization')) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  return next(req.clone({ headers })).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !esLogin) {
        auth.cerrarSesion('expirada');
      } else if (error.status === 403) {
        toast.error('No tienes permiso para realizar esta acción.');
      }
      return throwError(() => error);
    })
  );
};
