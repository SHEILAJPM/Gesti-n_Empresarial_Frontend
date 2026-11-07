import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../config/constantes';
import { Rol, Sesion } from '../models';
import { Permiso, rolPuede } from './permisos';

const CLAVE_SESION = 'nexo-sesion';

export interface RespuestaLogin {
  usuario: string;
  rol: Rol;
  trabajadorId: number | null;
  token: string;
  expiraEn: string;
}

/* La sesión es un JWT que entrega POST /api/auth/login. La contraseña solo viaja al iniciar sesión:
   el navegador guarda el token (que vence), nunca la clave. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly sesionActual = signal<Sesion | null>(leerSesion());

  readonly sesion = this.sesionActual.asReadonly();
  readonly autenticado = computed(() => this.sesionActual() !== null);
  readonly rol = computed(() => this.sesionActual()?.rol ?? null);
  /* La cuenta pertenece a un trabajador: tiene "Mi espacio" (marcar asistencia, boletas) */
  readonly tieneFicha = computed(() => !!this.sesionActual()?.trabajadorId);

  async iniciarSesion(usuario: string, clave: string): Promise<void> {
    const datos = await firstValueFrom(
      this.http.post<RespuestaLogin>(`${API_URL}/api/auth/login`, { usuario, clave })
    );
    this.guardar(datos);
  }

  /* Tras cambiar la contraseña el backend entrega un token nuevo (los anteriores dejan de servir) */
  renovar(datos: RespuestaLogin): void {
    this.guardar(datos);
  }

  private guardar(datos: RespuestaLogin): void {
    const sesion: Sesion = {
      usuario: datos.usuario,
      rol: datos.rol,
      token: datos.token,
      expiraEn: datos.expiraEn,
      trabajadorId: datos.trabajadorId ?? null
    };
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    } catch {
      /* sin almacenamiento la sesión dura hasta recargar */
    }
    this.sesionActual.set(sesion);
  }

  /* Token vigente o null si ya venció (entonces se cierra la sesión) */
  tokenVigente(): string | null {
    const sesion = this.sesionActual();
    if (!sesion) return null;
    if (vencida(sesion)) {
      this.cerrarSesion('expirada');
      return null;
    }
    return sesion.token;
  }

  cerrarSesion(motivo?: 'expirada'): void {
    try {
      sessionStorage.removeItem(CLAVE_SESION);
    } catch {
      /* nada que limpiar */
    }
    this.sesionActual.set(null);
    this.router.navigate(['/login'], { queryParams: motivo ? { motivo } : {} });
  }

  puede(permiso: Permiso): boolean {
    return rolPuede(this.rol(), permiso);
  }
}

function vencida(sesion: Sesion): boolean {
  return !sesion.expiraEn || Date.parse(sesion.expiraEn) <= Date.now();
}

/* Una sesión guardada sin vencimiento es de la versión anterior (HTTP Basic): se descarta */
function leerSesion(): Sesion | null {
  try {
    const guardada = sessionStorage.getItem(CLAVE_SESION);
    const sesion = guardada ? (JSON.parse(guardada) as Sesion) : null;
    if (sesion && vencida(sesion)) {
      sessionStorage.removeItem(CLAVE_SESION);
      return null;
    }
    return sesion;
  } catch {
    return null;
  }
}
