import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEsPe from '@angular/common/locales/es-PE';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  NavigationError, provideRouter, withComponentInputBinding, withNavigationErrorHandler, withViewTransitions
} from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';

registerLocaleData(localeEsPe);

const CLAVE_RECARGA = 'nexo-recarga';

/* Cada pantalla se descarga al abrirla. Si se publicó una versión nueva mientras la pestaña seguía abierta,
   los archivos viejos ya no existen y el menú "no hace nada". En ese caso se recarga la página una vez
   (con un margen de 10 s para no entrar en un bucle si el problema es otro, como no tener internet). */
function recargarSiFaltaUnaPantalla(error: NavigationError): void {
  const mensaje = String((error.error as Error | undefined)?.message ?? error.error ?? '');
  const faltaArchivo = /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(mensaje);
  if (!faltaArchivo) return;
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE_RECARGA) ?? 0);
    if (Date.now() - ultima < 10_000) return;
    sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
  } catch {
    /* sin almacenamiento igual se recarga */
  }
  location.assign(error.url);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions(),
      withNavigationErrorHandler(recargarSiFaltaUnaPantalla)),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-PE' }
  ]
};
