import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../config/constantes';
import { Rol, Sesion } from '../models';
import { Permiso, rolPuede } from './permisos';

const CLAVE_SESION = 'nexo-sesion';

/* Hoy el backend usa HTTP Basic: el "token" son las credenciales en Base64.
   Al pasar a JWT solo cambia iniciarSesion(); el resto de la app no se entera. */
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
    const token = base64(`${usuario}:${clave}`);
    const datos = await firstValueFrom(
      this.http.get<{ usuario: string; rol: Rol; trabajadorId: number | null }>(`${API_URL}/api/auth/me`, {
        headers: new HttpHeaders({ Authorization: `Basic ${token}` })
      })
    );
    const sesion: Sesion = { usuario: datos.usuario, rol: datos.rol, token, trabajadorId: datos.trabajadorId ?? null };
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    } catch {
      /* sin almacenamiento la sesión dura hasta recargar */
    }
    this.sesionActual.set(sesion);
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

function leerSesion(): Sesion | null {
  try {
    const guardada = sessionStorage.getItem(CLAVE_SESION);
    return guardada ? (JSON.parse(guardada) as Sesion) : null;
  } catch {
    return null;
  }
}

function base64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  return btoa(String.fromCharCode(...bytes));
}
